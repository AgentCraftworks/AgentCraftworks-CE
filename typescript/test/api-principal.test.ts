import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { createApiAuthMiddleware } from "../src/middleware/api-auth.js";
import {
  API_SCOPES, authorizeApiRequest, canAccessRepository, loadApiPrincipals,
} from "../src/middleware/api-principal.js";
import handoffRouter from "../src/handlers/handoff-api.js";
import dialRouter from "../src/handlers/autonomy-dial-routes.js";
import { clearAllHandoffs, createHandoff, getHandoff, initHandoffService } from "../src/services/handoff-service.js";
import { clearAllDials } from "../src/services/autonomy-dial.js";

const directory = mkdtempSync(join(tmpdir(), "ce-token-tests-"));
const file = join(directory, "tokens.json");
const hash = (token: string): string => createHash("sha256").update(token).digest("hex");
const env: Record<string, string | undefined> = { GH_CE_API_TOKENS_FILE: file, NODE_ENV: "production" };
let server: Server;
let baseUrl: string;
const warnings: Record<string, unknown>[] = [];

function tokenEntries(): unknown[] {
  return [
    { name: "reader", sha256: hash("read-token"), scopes: ["handoffs:read"], repos: ["acme/*"] },
    { name: "writer", sha256: hash("write-token"), scopes: ["handoffs:read", "handoffs:write", "dial:write"], repos: ["acme/widgets"] },
  ];
}

async function request(path: string, token: string, body?: Record<string, unknown>): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

before(async () => {
  initHandoffService();
  const app = express();
  app.use(express.json());
  const auth = createApiAuthMiddleware({ env, warn: (entry) => warnings.push(entry) });
  app.use("/api/handoffs", auth, authorizeApiRequest, handoffRouter);
  app.use("/api/dial", auth, authorizeApiRequest, dialRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

beforeEach(() => {
  writeFileSync(file, JSON.stringify(tokenEntries()));
  delete env["GH_CE_API_TOKEN"];
  env["NODE_ENV"] = "production";
  warnings.length = 0;
  clearAllHandoffs();
  clearAllDials();
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(file);
  rmdirSync(directory);
});

describe("scoped API principals", () => {
  it("rejects unknown credentials and wrong scopes", async () => {
    assert.equal((await request("/api/handoffs", "wrong")).status, 401);
    assert.equal((await request("/api/handoffs", "read-token", {
      task: "not allowed", repository: "acme/widgets",
    })).status, 403);
    assert.equal((await request("/api/dial/acme/widgets", "read-token", { dialLevel: 3 })).status, 403);
  });

  it("denies cross-repository reads, creates, mutations, and encoded handoff IDs", async () => {
    const hidden = createHandoff({ task: "hidden" }, { repository_full_name: "other/private" });
    for (const path of [
      `/api/handoffs/${hidden.handoff_id}`,
      `/api/handoffs/${hidden.handoff_id.replaceAll("-", "%2D")}`,
      "/api/handoffs?repo=other/private",
      "/api/handoffs?repo=acme/widgets&repository_full_name=other/private",
      "/api/dial/other/private",
    ]) {
      assert.equal((await request(path, "write-token")).status, 403, path);
    }
    assert.equal((await request(`/api/handoffs/${hidden.handoff_id}/accept`, "write-token", {
      agent_name: "spoofed",
    })).status, 403);
    assert.equal(getHandoff(hidden.handoff_id)?.status, "pending");
    assert.equal((await request("/api/handoffs", "write-token", {
      task: "wrong repo", repository: "other/private",
    })).status, 403);
    assert.equal((await request("/api/handoffs", "write-token", { task: "unscoped" })).status, 403);
    assert.equal((await request("/api/dial/check/", "write-token", {
      owner: "other", repo: "private", action: "view_file",
    })).status, 403);
  });

  it("filters unqualified lists and statistics to authorized repositories", async () => {
    createHandoff({ task: "visible" }, { repository_full_name: "acme/widgets" });
    createHandoff({ task: "hidden" }, { repository_full_name: "other/private" });
    const response = await request("/api/handoffs", "read-token");
    assert.equal(response.status, 200);
    const result = await response.json() as { count: number; handoffs: { task: string }[] };
    assert.equal(result.count, 1);
    assert.equal(result.handoffs[0]?.task, "visible");
    const stats = await (await request("/api/handoffs/stats", "read-token")).json() as Record<string, unknown>;
    assert.equal(stats["total"], 1);
  });

  it("allows an authorized handoff lifecycle and server-derived dial actor", async () => {
    const created = await request("/api/handoffs", "write-token", {
      task: "visible", repository: "acme/widgets", to_agent: "coder",
    });
    assert.equal(created.status, 201);
    const handoff = await created.json() as { handoff_id: string };
    assert.equal((await request(`/api/handoffs/${handoff.handoff_id}/accept`, "write-token", {
      agent_name: "coder",
    })).status, 200);
    assert.equal((await request(`/api/handoffs/${handoff.handoff_id}/complete`, "write-token", {
      outputs: { result: "done" },
    })).status, 200);
    const events: string[] = [];
    const originalLog = console.log;
    console.log = (entry: string): void => { events.push(entry); };
    try {
      const dial = await request("/api/dial/acme/widgets", "write-token", {
        dialLevel: 3, updatedBy: "forged-admin",
      });
      assert.equal(dial.status, 200);
      assert.equal((await dial.json() as Record<string, unknown>)["updatedBy"], "writer");
    } finally {
      console.log = originalLog;
    }
    const audit = events.map((event) => JSON.parse(event) as Record<string, unknown>);
    assert.ok(audit.some((event) => event["msg"] === "dial.changed" && event["actor"] === "writer"));
    assert.ok(events.every((event) => !event.includes("forged-admin") && !event.includes("write-token")));
  });

  it("rotates hash-only credentials on the next request and never logs credentials", async () => {
    assert.equal((await request("/api/handoffs", "read-token")).status, 200);
    writeFileSync(file, JSON.stringify([
      { name: "reader", sha256: hash("rotated-token"), scopes: ["handoffs:read"], repos: ["acme/*"] },
    ]));
    assert.equal((await request("/api/handoffs", "read-token")).status, 401);
    assert.equal((await request("/api/handoffs", "rotated-token")).status, 200);
    assert.ok(!JSON.stringify(warnings).includes("rotated-token"));
  });

  it("maps the compatibility token to operator with all scopes", async () => {
    env["GH_CE_API_TOKEN"] = "operator-test-token";
    const principals = loadApiPrincipals(env);
    assert.deepEqual(principals.find((principal) => principal.name === "operator")?.scopes, API_SCOPES);
    const response = await request("/api/dial/other/private", "operator-test-token", {
      dialLevel: 3, updatedBy: "forged",
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as Record<string, unknown>)["updatedBy"], "operator");
  });

  it("fails closed for invalid files even with an operator token or development mode", async () => {
    env["GH_CE_API_TOKEN"] = "operator-test-token";
    for (const entries of [
      { tokens: [] },
      [{ name: "reader", token: "plaintext-secret", scopes: [], repos: [] }],
      [{ name: "reader", sha256: hash("a"), scopes: ["unknown"], repos: ["acme/*"] }],
      [...tokenEntries(), tokenEntries()[0]],
    ]) {
      writeFileSync(file, JSON.stringify(entries));
      assert.equal((await request("/api/handoffs", "operator-test-token")).status, 503);
    }
    writeFileSync(file, "not-json plaintext-secret");
    env["NODE_ENV"] = "development";
    assert.equal((await request("/api/handoffs", "operator-test-token")).status, 503);
    assert.ok(!JSON.stringify(warnings).includes("plaintext-secret"));
    assert.throws(() => loadApiPrincipals({ GH_CE_API_TOKENS_FILE: join(directory, "missing.json") }));
    writeFileSync(file, "[]");
    delete env["GH_CE_API_TOKEN"];
    assert.equal((await request("/api/handoffs", "read-token")).status, 503);
  });

  it("matches owner globs and exact repository names without prefix confusion", () => {
    const principal = { name: "test", scopes: [], repos: ["acme/*", "other/widget"] };
    assert.equal(canAccessRepository(principal, "ACME/widgets"), true);
    assert.equal(canAccessRepository(principal, "acme-evil/widgets"), false);
    assert.equal(canAccessRepository(principal, "other/widget"), true);
    assert.equal(canAccessRepository(principal, "other/widget-extra"), false);
    assert.equal(canAccessRepository(principal, "acme/widgets/other"), false);
  });
});
