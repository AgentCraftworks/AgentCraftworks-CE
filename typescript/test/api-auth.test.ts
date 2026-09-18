/**
 * REST API Guards — Integration Tests
 *
 * Covers bearer-token auth and per-IP rate limiting for the non-webhook
 * REST surface (`/api/handoffs`, `/api/dial`) as mounted in `src/index.ts`.
 *
 * Strategy: build a minimal Express app with the same middleware chain as
 * production (rate limiter → auth → router), using injected env objects so
 * each scenario is isolated from `process.env`.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import dialRouter from "../src/handlers/autonomy-dial-routes.js";
import handoffRouter from "../src/handlers/handoff-api.js";
import {
  API_RATE_LIMIT_ENV,
  API_TOKEN_ENV,
  DEFAULT_API_RATE_LIMIT,
  createApiAuthMiddleware,
  createApiRateLimiter,
  extractBearerToken,
  getApiRateLimitFromEnv,
  tokensMatch,
} from "../src/middleware/api-auth.js";
import { clearAllDials } from "../src/services/autonomy-dial.js";
import { clearAllHandoffs, initHandoffService } from "../src/services/handoff-service.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────

const TOKEN = "ce-test-token-0123456789abcdef";

type Env = Record<string, string | undefined>;

interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
  warnings: Record<string, unknown>[];
}

/** Build an app wired exactly like index.ts, with an injectable env. */
async function startApp(env: Env): Promise<TestServer> {
  const warnings: Record<string, unknown>[] = [];
  const app = express();
  app.use(express.json());
  const limiter = createApiRateLimiter(env);
  const auth = createApiAuthMiddleware({ env, warn: (e) => warnings.push(e) });
  app.use("/api/handoffs", limiter, auth, handoffRouter);
  app.use("/api/dial", limiter, auth, dialRouter);

  return new Promise((resolve) => {
    const server: http.Server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        warnings,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

interface FetchResult {
  status: number;
  headers: Headers;
  body: Record<string, unknown>;
}

async function request(
  baseUrl: string,
  method: string,
  path: string,
  opts: { token?: string; rawAuth?: string; body?: Record<string, unknown> } = {},
): Promise<FetchResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.rawAuth !== undefined) headers["Authorization"] = opts.rawAuth;
  else if (opts.token !== undefined) headers["Authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, headers: res.headers, body };
}

before(() => {
  initHandoffService();
});

beforeEach(() => {
  clearAllHandoffs();
  clearAllDials();
});

// ─── Unit: helpers ──────────────────────────────────────────────────────────

describe("api-auth helpers", () => {
  it("tokensMatch: equal strings match, unequal do not", () => {
    assert.equal(tokensMatch("abc", "abc"), true);
    assert.equal(tokensMatch("abc", "abd"), false);
    assert.equal(tokensMatch("abc", "abcd"), false);
    assert.equal(tokensMatch("", "abc"), false);
  });

  it("extractBearerToken: parses scheme case-insensitively and rejects other schemes", () => {
    assert.equal(extractBearerToken("Bearer xyz"), "xyz");
    assert.equal(extractBearerToken("bearer xyz"), "xyz");
    assert.equal(extractBearerToken("Bearer   xyz  "), "xyz");
    assert.equal(extractBearerToken("Basic xyz"), null);
    assert.equal(extractBearerToken("Bearer"), null);
    assert.equal(extractBearerToken(undefined), null);
    assert.equal(extractBearerToken(["Bearer first", "Bearer second"]), "first");
  });

  it("getApiRateLimitFromEnv: default, valid, and invalid values", () => {
    assert.equal(getApiRateLimitFromEnv({}), DEFAULT_API_RATE_LIMIT);
    assert.equal(DEFAULT_API_RATE_LIMIT, 60);
    assert.equal(getApiRateLimitFromEnv({ [API_RATE_LIMIT_ENV]: "120" }), 120);
    assert.equal(getApiRateLimitFromEnv({ [API_RATE_LIMIT_ENV]: "0" }), DEFAULT_API_RATE_LIMIT);
    assert.equal(getApiRateLimitFromEnv({ [API_RATE_LIMIT_ENV]: "-5" }), DEFAULT_API_RATE_LIMIT);
    assert.equal(getApiRateLimitFromEnv({ [API_RATE_LIMIT_ENV]: "abc" }), DEFAULT_API_RATE_LIMIT);
  });
});

// ─── Integration: token configured ──────────────────────────────────────────

describe("REST API auth — token configured", () => {
  let srv: TestServer;

  before(async () => {
    srv = await startApp({ [API_TOKEN_ENV]: TOKEN, NODE_ENV: "production" });
  });
  after(async () => {
    await srv.close();
  });

  it("rejects /api/handoffs without a token (401)", async () => {
    const r = await request(srv.baseUrl, "GET", "/api/handoffs");
    assert.equal(r.status, 401);
    assert.equal(r.body["error"], "Unauthorized");
    assert.match(String(r.body["message"]), /missing/i);
    assert.match(r.headers.get("www-authenticate") ?? "", /^Bearer/);
  });

  it("rejects /api/dial without a token (401)", async () => {
    const r = await request(srv.baseUrl, "GET", "/api/dial/acme/widgets");
    assert.equal(r.status, 401);
  });

  it("rejects POST /api/dial/:owner/:repo without a token and does not mutate state (401)", async () => {
    const r = await request(srv.baseUrl, "POST", "/api/dial/acme/widgets", {
      body: { level: 5 },
    });
    assert.equal(r.status, 401);

    const check = await request(srv.baseUrl, "GET", "/api/dial/acme/widgets", { token: TOKEN });
    assert.equal(check.status, 200);
    assert.notEqual(check.body["level"], 5);
  });

  it("rejects a wrong token (401)", async () => {
    const r = await request(srv.baseUrl, "GET", "/api/handoffs", { token: "wrong-token" });
    assert.equal(r.status, 401);
    assert.match(String(r.body["message"]), /invalid/i);
    assert.match(r.headers.get("www-authenticate") ?? "", /invalid_token/);
  });

  it("rejects a token that is a prefix of the real one (401)", async () => {
    const r = await request(srv.baseUrl, "GET", "/api/handoffs", {
      token: TOKEN.slice(0, TOKEN.length - 1),
    });
    assert.equal(r.status, 401);
  });

  it("rejects a non-Bearer scheme (401)", async () => {
    const r = await request(srv.baseUrl, "GET", "/api/handoffs", {
      rawAuth: `Basic ${Buffer.from(`user:${TOKEN}`).toString("base64")}`,
    });
    assert.equal(r.status, 401);
  });

  it("allows /api/handoffs with the correct token (200)", async () => {
    const r = await request(srv.baseUrl, "GET", "/api/handoffs", { token: TOKEN });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body["handoffs"]));
  });

  it("allows /api/dial with the correct token (200) and scheme is case-insensitive", async () => {
    const r = await request(srv.baseUrl, "GET", "/api/dial/acme/widgets", {
      rawAuth: `bearer ${TOKEN}`,
    });
    assert.equal(r.status, 200);
  });

  it("allows creating a handoff with the correct token (201)", async () => {
    const r = await request(srv.baseUrl, "POST", "/api/handoffs", {
      token: TOKEN,
      body: {
        task: "implement the thing",
        to_agent: "coder",
        from_agent: "planner",
        repository: "acme/widgets",
      },
    });
    assert.equal(r.status, 201);
    assert.equal(typeof r.body["handoff_id"], "string");
  });
});

// ─── Integration: token NOT configured ──────────────────────────────────────

describe("REST API auth — token not configured", () => {
  it("fails closed in production (503) with an operator hint", async () => {
    const srv = await startApp({ NODE_ENV: "production" });
    try {
      const r = await request(srv.baseUrl, "GET", "/api/handoffs");
      assert.equal(r.status, 503);
      assert.equal(r.body["error"], "Service Unavailable");
      assert.equal(r.body["code"], "api_token_not_configured");
      assert.match(String(r.body["message"]), new RegExp(API_TOKEN_ENV));

      const dial = await request(srv.baseUrl, "POST", "/api/dial/acme/widgets", {
        body: { level: 5 },
      });
      assert.equal(dial.status, 503);
      assert.equal(srv.warnings.length, 0);
    } finally {
      await srv.close();
    }
  });

  it("treats an empty-string token as unset in production (503)", async () => {
    const srv = await startApp({ NODE_ENV: "production", [API_TOKEN_ENV]: "" });
    try {
      const r = await request(srv.baseUrl, "GET", "/api/handoffs", { token: "" });
      assert.equal(r.status, 503);
    } finally {
      await srv.close();
    }
  });

  it("allows requests in development and warns exactly once", async () => {
    const srv = await startApp({ NODE_ENV: "development" });
    try {
      const a = await request(srv.baseUrl, "GET", "/api/handoffs");
      const b = await request(srv.baseUrl, "GET", "/api/dial/acme/widgets");
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.equal(srv.warnings.length, 1);
      const w = srv.warnings[0] ?? {};
      assert.equal(typeof w["msg"], "string");
      assert.match(String(w["reason"]), new RegExp(API_TOKEN_ENV));
    } finally {
      await srv.close();
    }
  });

  it("allows requests in test env", async () => {
    const srv = await startApp({ NODE_ENV: "test" });
    try {
      const r = await request(srv.baseUrl, "GET", "/api/handoffs");
      assert.equal(r.status, 200);
    } finally {
      await srv.close();
    }
  });

  it("allows requests when NODE_ENV is undefined (treated as non-production)", async () => {
    const srv = await startApp({});
    try {
      const r = await request(srv.baseUrl, "GET", "/api/handoffs");
      assert.equal(r.status, 200);
    } finally {
      await srv.close();
    }
  });
});

// ─── Integration: rate limiting ─────────────────────────────────────────────

describe("REST API rate limiting", () => {
  it("returns 429 once API_RATE_LIMIT is exceeded, before auth runs", async () => {
    const limit = 3;
    const srv = await startApp({
      [API_TOKEN_ENV]: TOKEN,
      NODE_ENV: "production",
      [API_RATE_LIMIT_ENV]: String(limit),
    });
    try {
      for (let i = 0; i < limit; i++) {
        const r = await request(srv.baseUrl, "GET", "/api/handoffs", { token: TOKEN });
        assert.equal(r.status, 200, `request ${i + 1} should succeed`);
        assert.equal(r.headers.get("ratelimit-limit"), String(limit));
      }

      // Limiter is shared across both mounts and runs before auth (no token here).
      const blocked = await request(srv.baseUrl, "GET", "/api/dial/acme/widgets");
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body["error"], "Too Many Requests");
    } finally {
      await srv.close();
    }
  });

  it("uses the default of 60/min when API_RATE_LIMIT is unset", async () => {
    const srv = await startApp({ [API_TOKEN_ENV]: TOKEN });
    try {
      const r = await request(srv.baseUrl, "GET", "/api/handoffs", { token: TOKEN });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("ratelimit-limit"), String(DEFAULT_API_RATE_LIMIT));
    } finally {
      await srv.close();
    }
  });
});
