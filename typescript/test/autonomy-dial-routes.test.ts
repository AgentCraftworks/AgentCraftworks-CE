/**
 * Autonomy Dial API Routes — Tests
 *
 * Tests the REST API endpoints for autonomy dial management.
 * Uses node:test and node:assert/strict.
 *
 * Strategy: Create a minimal Express app with the dial router,
 * then use fetch() to test endpoints.
 */

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import dialRouter from "../src/handlers/autonomy-dial-routes.js";
import { createApiAuthMiddleware } from "../src/middleware/api-auth.js";
import { authorizeApiRequest } from "../src/middleware/api-principal.js";
import {
  clearAllDials,
  setDialLevel,
} from "../src/services/autonomy-dial.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use("/api/dial", createApiAuthMiddleware({
  env: { GH_CE_API_TOKEN: "route-test-token" },
}), authorizeApiRequest, dialRouter);

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
    headers: { "Content-Type": "application/json", Authorization: "Bearer route-test-token" },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const resp = await fetch(url, options);
  const json = (await resp.json()) as Record<string, unknown>;
  return { status: resp.status, body: json };
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

await startServer();

beforeEach(() => {
  clearAllDials();
});

after(async () => {
  await stopServer();
});

// ─── GET /api/dial/:owner/:repo — Get dial level ───────────────────────────

describe("GET /api/dial/:owner/:repo", () => {
  it("should return default dial level for unconfigured repo", async () => {
    const res = await request("GET", "/api/dial/myorg/myrepo");
    assert.equal(res.status, 200);
    assert.equal(res.body["dialLevel"], 1);
    assert.equal(res.body["isDefault"], true);
    assert.equal(res.body["repoOwner"], "myorg");
    assert.equal(res.body["repoName"], "myrepo");
  });

  it("should return configured dial level", async () => {
    setDialLevel("myorg", "myrepo", 4, "admin");
    const res = await request("GET", "/api/dial/myorg/myrepo");
    assert.equal(res.status, 200);
    assert.equal(res.body["dialLevel"], 4);
    assert.equal(res.body["isDefault"], false);
    assert.equal(res.body["updatedBy"], "admin");
  });
});

// ─── POST /api/dial/:owner/:repo — Set dial level ──────────────────────────

describe("POST /api/dial/:owner/:repo", () => {
  it("should set dial level for a repo", async () => {
    const res = await request("POST", "/api/dial/testorg/testrepo", {
      dialLevel: 5,
      updatedBy: "admin-user",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body["dialLevel"], 5);
    assert.equal(res.body["updatedBy"], "operator");
    assert.equal(res.body["isDefault"], false);
  });

  it("should update existing dial level", async () => {
    setDialLevel("org", "repo", 3, "user1");
    const res = await request("POST", "/api/dial/org/repo", {
      dialLevel: 5,
      updatedBy: "user2",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body["dialLevel"], 5);
    assert.equal(res.body["updatedBy"], "operator");
  });

  it("should accept level 1 (minimum)", async () => {
    const res = await request("POST", "/api/dial/org/repo", {
      dialLevel: 1,
      updatedBy: "admin",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body["dialLevel"], 1);
  });

  it("should accept level 5 (maximum)", async () => {
    const res = await request("POST", "/api/dial/org/repo", {
      dialLevel: 5,
      updatedBy: "admin",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body["dialLevel"], 5);
  });

  it("should return 400 for dialLevel below 1", async () => {
    const res = await request("POST", "/api/dial/org/repo", {
      dialLevel: 0,
      updatedBy: "admin",
    });
    assert.equal(res.status, 400);
    assert.ok((res.body["message"] as string).includes("between 1 and 5"));
  });

  it("should return 400 for dialLevel above 5", async () => {
    const res = await request("POST", "/api/dial/org/repo", {
      dialLevel: 6,
      updatedBy: "admin",
    });
    assert.equal(res.status, 400);
    assert.ok((res.body["message"] as string).includes("between 1 and 5"));
  });

  it("should return 400 for non-integer dialLevel", async () => {
    const res = await request("POST", "/api/dial/org/repo", {
      dialLevel: 3.5,
      updatedBy: "admin",
    });
    assert.equal(res.status, 400);
  });

  it("should return 400 when dialLevel is missing", async () => {
    const res = await request("POST", "/api/dial/org/repo", {
      updatedBy: "admin",
    });
    assert.equal(res.status, 400);
    assert.ok((res.body["message"] as string).includes("dialLevel or engagement is required"));
  });

  it("should derive updatedBy when the caller omits it", async () => {
    const res = await request("POST", "/api/dial/org/repo", {
      dialLevel: 5,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body["updatedBy"], "operator");
  });
});

// ─── POST /api/dial/check — Check action permission ────────────────────────

describe("POST /api/dial/check", () => {
  it("should allow T1 action at default level 1", async () => {
    const res = await request("POST", "/api/dial/check", {
      action: "view_file",
      owner: "org",
      repo: "repo",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body["permitted"], true);
    assert.equal(res.body["tier"], "T1");
    assert.equal(res.body["dialLevel"], 1);
  });

  it("should deny T3 action at default level 1", async () => {
    const res = await request("POST", "/api/dial/check", {
      action: "edit_file",
      owner: "org",
      repo: "repo",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body["permitted"], false);
    assert.equal(res.body["tier"], "T3");
    assert.equal(res.body["requiredLevel"], 3);
  });

  it("should allow T3 action when dial level is sufficient", async () => {
    setDialLevel("org", "repo", 5, "admin");
    const res = await request("POST", "/api/dial/check", {
      action: "edit_file",
      owner: "org",
      repo: "repo",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body["permitted"], true);
  });

  it("should deny T5 action when dial level is insufficient", async () => {
    setDialLevel("org", "repo", 4, "admin");
    const res = await request("POST", "/api/dial/check", {
      action: "merge_pr",
      owner: "org",
      repo: "repo",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body["permitted"], false);
    assert.equal(res.body["requiredLevel"], 5);
  });

  it("should apply environment tier cap", async () => {
    setDialLevel("org", "repo", 5, "admin");
    const res = await request("POST", "/api/dial/check", {
      action: "merge_pr",
      owner: "org",
      repo: "repo",
      environment: "production",
    });
    assert.equal(res.status, 200);
    // production caps at 3, merge_pr requires 5
    assert.equal(res.body["permitted"], false);
    assert.equal(res.body["effectiveLevel"], 3);
  });

  it("should report unknown actions as T3", async () => {
    setDialLevel("org", "repo", 5, "admin");
    const res = await request("POST", "/api/dial/check", {
      action: "unknown_action_xyz",
      owner: "org",
      repo: "repo",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body["tier"], "T3");
    assert.equal(res.body["isKnownAction"], false);
    assert.equal(res.body["permitted"], true);
  });

  it("should return 400 when action is missing", async () => {
    const res = await request("POST", "/api/dial/check", {
      owner: "org",
      repo: "repo",
    });
    assert.equal(res.status, 400);
    assert.ok((res.body["message"] as string).includes("action is required"));
  });

  it("should return 400 when owner/repo is missing", async () => {
    const res = await request("POST", "/api/dial/check", {
      action: "view_file",
    });
    assert.equal(res.status, 400);
    assert.ok((res.body["message"] as string).includes("owner and repo are required"));
  });
});

// ─── GET /api/dial/actions — List all classified actions ────────────────────

describe("GET /api/dial/actions", () => {
  it("should return all classified actions", async () => {
    const res = await request("GET", "/api/dial/actions");
    assert.equal(res.status, 200);
    const actions = res.body["actions"] as Record<string, string>;
    assert.ok(actions);
    assert.ok(Object.keys(actions).length > 0);
    assert.equal(actions["view_file"], "T1");
    assert.equal(actions["post_comment"], "T2");
    assert.equal(actions["edit_file"], "T3");
    assert.equal(actions["push_commit"], "T4");
    assert.equal(actions["merge_pr"], "T5");
  });

  it("should include tier summary", async () => {
    const res = await request("GET", "/api/dial/actions");
    assert.equal(res.status, 200);
    const tiers = res.body["tiers"] as Record<string, unknown>;
    assert.ok(tiers);
    assert.ok(tiers["T1"]);
    assert.ok(tiers["T2"]);
    assert.ok(tiers["T3"]);
    assert.ok(tiers["T4"]);
    assert.ok(tiers["T5"]);
  });

  it("should include total action count", async () => {
    const res = await request("GET", "/api/dial/actions");
    assert.equal(res.status, 200);
    assert.ok(typeof res.body["totalActions"] === "number");
    assert.ok((res.body["totalActions"] as number) > 0);
  });
});

// ─── Permission Decision Assertions ───────────────────────────────────────

describe("Permission decision scenarios", () => {
  it("should allow all T1 actions at level 1", async () => {
    const t1Actions = ["view_file", "read_comment", "list_files", "get_pr"];
    for (const action of t1Actions) {
      const res = await request("POST", "/api/dial/check", {
        action,
        owner: "org",
        repo: "repo",
      });
      assert.equal(res.body["permitted"], true, `${action} should be permitted at level 1`);
    }
  });

  it("should deny all T5 actions at level 4", async () => {
    setDialLevel("org", "repo", 4, "admin");
    const t5Actions = ["merge_pr", "deploy", "delete_branch"];
    for (const action of t5Actions) {
      const res = await request("POST", "/api/dial/check", {
        action,
        owner: "org",
        repo: "repo",
      });
      assert.equal(res.body["permitted"], false, `${action} should be denied at level 4`);
    }
  });

  it("should allow T4 actions at level 4", async () => {
    setDialLevel("org", "repo", 4, "admin");
    const t4Actions = ["push_commit", "create_pr", "approve_pr"];
    for (const action of t4Actions) {
      const res = await request("POST", "/api/dial/check", {
        action,
        owner: "org",
        repo: "repo",
      });
      assert.equal(res.body["permitted"], true, `${action} should be permitted at level 4`);
    }
  });

  it("should cap production environment at level 3", async () => {
    setDialLevel("org", "repo", 5, "admin");
    // T3 action (requires 3) should be allowed in production (capped at 3)
    const t3 = await request("POST", "/api/dial/check", {
      action: "edit_file",
      owner: "org",
      repo: "repo",
      environment: "production",
    });
    assert.equal(t3.body["permitted"], true);
    assert.equal(t3.body["effectiveLevel"], 3);

    // T5 action (requires 5) should be denied in production
    const t5 = await request("POST", "/api/dial/check", {
      action: "merge_pr",
      owner: "org",
      repo: "repo",
      environment: "production",
    });
    assert.equal(t5.body["permitted"], false);
  });

  it("should cap staging environment at level 4", async () => {
    setDialLevel("org", "repo", 5, "admin");
    const res = await request("POST", "/api/dial/check", {
      action: "push_commit",
      owner: "org",
      repo: "repo",
      environment: "staging",
    });
    assert.equal(res.body["permitted"], true);
    assert.equal(res.body["effectiveLevel"], 4);
  });
});
