/**
 * Handoff API Endpoints — Tests
 *
 * Tests the REST API endpoints for handoff lifecycle management.
 * Uses node:test and node:assert/strict.
 *
 * Strategy: Create a minimal Express app with the handoff router,
 * then use `http.request` to test endpoints.
 */

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import handoffRouter from "../src/handlers/handoff-api.js";
import {
  initHandoffService,
  clearAllHandoffs,
  createHandoff,
  acceptHandoff,
  completeHandoff,
} from "../src/services/handoff-service.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use("/api/handoffs", handoffRouter);

let server: http.Server;
let baseUrl: string;

async function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
}

async function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

interface FetchResult {
  status: number;
  body: Record<string, unknown>;
}

async function request(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<FetchResult> {
  const url = `${baseUrl}${path}`;
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const resp = await fetch(url, options);
  const json = (await resp.json()) as Record<string, unknown>;
  return { status: resp.status, body: json };
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

// Start server once before all tests
await startServer();

beforeEach(() => {
  clearAllHandoffs();
  initHandoffService({ forceInMemory: true });
});

after(async () => {
  await stopServer();
});

// ─── POST /api/handoffs — Create ────────────────────────────────────────────

describe("POST /api/handoffs", () => {
  it("should create a handoff with required fields", async () => {
    const res = await request("POST", "/api/handoffs", {
      task: "Review PR #10",
      to_agent: "@code-reviewer",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body["task"], "Review PR #10");
    assert.equal(res.body["to_agent"], "@code-reviewer");
    assert.equal(res.body["status"], "recorded");
    assert.equal(res.body["handoff_status"], "pending");
    assert.equal(res.body["message"], "Handoff recorded; no agent was dispatched.");
    assert.ok(res.body["handoff_id"]);
  });

  it("should create a handoff with all optional fields", async () => {
    const res = await request("POST", "/api/handoffs", {
      task: "Deploy feature",
      to_agent: "@deploy-bot",
      context: "Feature X ready for staging",
      priority: "high",
      repository: "org/repo",
      from_agent: "@orchestrator",
      issue_number: 42,
      sla_hours: 4,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body["priority"], "high");
    assert.equal(res.body["repository_full_name"], "org/repo");
    assert.equal(res.body["from_agent"], "@orchestrator");
    assert.equal(res.body["issue_number"], 42);
    assert.equal(res.body["sla_hours"], 4);
    assert.ok(res.body["sla_deadline"]);
  });

  it("should return 400 when task is missing", async () => {
    const res = await request("POST", "/api/handoffs", {
      to_agent: "@bot",
    });
    assert.equal(res.status, 400);
    assert.ok((res.body["message"] as string).includes("task is required"));
  });

  it("should return 400 when task is not a string", async () => {
    const res = await request("POST", "/api/handoffs", {
      task: 12345,
    });
    assert.equal(res.status, 400);
  });
});

// ─── GET /api/handoffs/:id — Get by ID ────────────────────────────────────────

describe("GET /api/handoffs/:id", () => {
  it("should return a handoff by ID", async () => {
    const created = createHandoff({ task: "test", to: "@bot" });
    const res = await request("GET", `/api/handoffs/${created.handoff_id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body["handoff_id"], created.handoff_id);
    assert.equal(res.body["task"], "test");
  });

  it("should return 404 for non-existent ID", async () => {
    const res = await request("GET", "/api/handoffs/nonexistent-id");
    assert.equal(res.status, 404);
    assert.ok((res.body["message"] as string).includes("not found"));
  });
});

// ─── POST /api/handoffs/:id/accept — Accept ──────────────────────────────────

describe("POST /api/handoffs/:id/accept", () => {
  it("should accept a handoff", async () => {
    const created = createHandoff({ task: "review", to: "@bot" });
    const res = await request("POST", `/api/handoffs/${created.handoff_id}/accept`, {
      agent_name: "@reviewer",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body["status"], "active");
    assert.ok(res.body["in_progress_at"]);
  });

  it("should return 404 for non-existent handoff", async () => {
    const res = await request("POST", "/api/handoffs/no-such-id/accept", {
      agent_name: "@bot",
    });
    assert.equal(res.status, 404);
  });

  it("should return 409 when trying to accept a completed handoff", async () => {
    const created = createHandoff({ task: "done", to: "@bot" });
    completeHandoff(created.handoff_id);
    const res = await request("POST", `/api/handoffs/${created.handoff_id}/accept`, {
      agent_name: "@bot",
    });
    assert.equal(res.status, 409);
  });
});

// ─── POST /api/handoffs/:id/complete — Complete ────────────────────────────────

describe("POST /api/handoffs/:id/complete", () => {
  it("should complete a handoff", async () => {
    const created = createHandoff({ task: "finish", to: "@bot" });
    const res = await request("POST", `/api/handoffs/${created.handoff_id}/complete`, {
      outputs: { summary: "All done" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body["status"], "completed");
    assert.ok(res.body["completed_at"]);
  });

  it("should complete a handoff without outputs", async () => {
    const created = createHandoff({ task: "finish", to: "@bot" });
    const res = await request("POST", `/api/handoffs/${created.handoff_id}/complete`);
    assert.equal(res.status, 200);
    assert.equal(res.body["status"], "completed");
  });

  it("should return 404 for non-existent handoff", async () => {
    const res = await request("POST", "/api/handoffs/no-such-id/complete", {});
    assert.equal(res.status, 404);
  });

  it("should return 409 when trying to complete an already-completed handoff", async () => {
    const created = createHandoff({ task: "done", to: "@bot" });
    completeHandoff(created.handoff_id);
    const res = await request("POST", `/api/handoffs/${created.handoff_id}/complete`, {});
    assert.equal(res.status, 409);
  });
});

// ─── GET /api/handoffs — List ───────────────────────────────────────────────

describe("GET /api/handoffs", () => {
  it("should list all handoffs", async () => {
    createHandoff({ task: "a", to: "@a" });
    createHandoff({ task: "b", to: "@b" });
    const res = await request("GET", "/api/handoffs");
    assert.equal(res.status, 200);
    assert.equal(res.body["count"], 2);
    assert.ok(Array.isArray(res.body["handoffs"]));
  });

  it("should filter by status", async () => {
    const h = createHandoff({ task: "a", to: "@a" });
    createHandoff({ task: "b", to: "@b" });
    acceptHandoff(h.handoff_id);
    const res = await request("GET", "/api/handoffs?status=active");
    assert.equal(res.status, 200);
    assert.equal(res.body["count"], 1);
  });

  it("should filter by to_agent", async () => {
    createHandoff({ task: "a", to: "@alice" });
    createHandoff({ task: "b", to: "@bob" });
    const res = await request("GET", "/api/handoffs?to_agent=@alice");
    assert.equal(res.status, 200);
    assert.equal(res.body["count"], 1);
  });

  it("should filter by repo", async () => {
    createHandoff(
      { task: "a", to: "@a" },
      { repository_full_name: "org/repo1" },
    );
    createHandoff(
      { task: "b", to: "@b" },
      { repository_full_name: "org/repo2" },
    );
    const res = await request("GET", "/api/handoffs?repo=org/repo1");
    assert.equal(res.status, 200);
    assert.equal(res.body["count"], 1);
  });

  it("should return empty list when no handoffs match", async () => {
    const res = await request("GET", "/api/handoffs?status=completed");
    assert.equal(res.status, 200);
    assert.equal(res.body["count"], 0);
  });
});

// ─── GET /api/handoffs/stats — Statistics ─────────────────────────────────────

describe("GET /api/handoffs/stats", () => {
  it("should return statistics for empty store", async () => {
    const res = await request("GET", "/api/handoffs/stats");
    assert.equal(res.status, 200);
    assert.equal(res.body["total"], 0);
    assert.ok(res.body["byStatus"] !== undefined);
    assert.ok(res.body["byPriority"] !== undefined);
  });

  it("should return correct statistics", async () => {
    createHandoff({ task: "a", to: "@a", priority: "high" });
    createHandoff({ task: "b", to: "@b", priority: "low" });
    const h3 = createHandoff({ task: "c", to: "@c" });
    completeHandoff(h3.handoff_id);

    const res = await request("GET", "/api/handoffs/stats");
    assert.equal(res.status, 200);
    assert.equal(res.body["total"], 3);
    const byStatus = res.body["byStatus"] as Record<string, number>;
    assert.equal(byStatus["pending"], 2);
    assert.equal(byStatus["completed"], 1);
  });
});
