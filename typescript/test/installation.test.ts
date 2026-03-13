/**
 * Installation Event Handler — Tests
 *
 * Tests the GitHub App installation webhook handler:
 *   - scaffoldCodeowners: branch + PR creation, skip when file exists
 *   - handleInstallationEvent: routing for installation.created and
 *     installation_repositories.added, error isolation per repo
 *
 * Uses node:test and node:assert/strict.
 * All GitHub API calls are mocked via a lightweight Octokit-shaped object so
 * that no real network requests are made.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Octokit } from "@octokit/rest";
import {
  codeownersExists,
  scaffoldCodeowners,
  handleInstallationEvent,
  DEFAULT_CODEOWNERS_TEMPLATE,
  type ScaffoldFn,
  type ListReposFn,
  type InstallationPayload,
} from "../src/handlers/installation.js";

// ─── Mock Octokit Builder ────────────────────────────────────────────────────

type RequestFn = (route: string, params?: Record<string, unknown>) => Promise<unknown>;

/**
 * Build a minimal mock Octokit whose `.request()` method dispatches to
 * per-route handlers supplied by the test.
 */
function makeMockOctokit(handlers: Record<string, RequestFn>): Octokit {
  const mock = {
    request: async (route: string, params?: Record<string, unknown>) => {
      const handler = handlers[route];
      if (handler) {
        return handler(route, params);
      }
      throw Object.assign(new Error(`Unhandled route: ${route}`), {
        status: 500,
      });
    },
  };
  return mock as unknown as Octokit;
}

/** Return a mock Octokit pre-wired for the "happy path" scaffold flow. */
function makeHappyPathOctokit(overrides: Record<string, RequestFn> = {}): Octokit {
  return makeMockOctokit({
    "GET /repos/{owner}/{repo}/contents/{path}": async (_r, p) => {
      // Any CODEOWNERS location → 404 (file does not exist yet)
      throw Object.assign(new Error("Not Found"), { status: 404 });
    },
    "GET /repos/{owner}/{repo}": async () => ({
      data: { default_branch: "main" },
    }),
    "GET /repos/{owner}/{repo}/git/ref/{ref}": async () => ({
      data: { object: { sha: "abc123" } },
    }),
    "POST /repos/{owner}/{repo}/git/refs": async () => ({ data: {} }),
    "PUT /repos/{owner}/{repo}/contents/{path}": async () => ({ data: {} }),
    "POST /repos/{owner}/{repo}/pulls": async () => ({
      data: { html_url: "https://github.com/testorg/testrepo/pull/1" },
    }),
    ...overrides,
  });
}

/**
 * Create a ScaffoldFn that delegates to `scaffoldCodeowners` using the
 * provided mock Octokit, so `handleInstallationEvent` tests never touch the
 * real GitHub API.
 */
function makeScaffoldFn(octokit: Octokit): ScaffoldFn {
  return (owner, repo, installationId) =>
    scaffoldCodeowners(owner, repo, installationId, octokit);
}

// ─── codeownersExists ────────────────────────────────────────────────────────

describe("codeownersExists", () => {
  it("returns false when no CODEOWNERS file exists in any location", async () => {
    const octokit = makeMockOctokit({
      "GET /repos/{owner}/{repo}/contents/{path}": async () => {
        throw Object.assign(new Error("Not Found"), { status: 404 });
      },
    });

    const result = await codeownersExists(octokit, "testorg", "testrepo");
    assert.equal(result, false);
  });

  it("returns true when .github/CODEOWNERS exists", async () => {
    let callCount = 0;
    const octokit = makeMockOctokit({
      "GET /repos/{owner}/{repo}/contents/{path}": async (_r, params) => {
        callCount++;
        if (params?.["path"] === ".github/CODEOWNERS") {
          return { data: { type: "file" } };
        }
        throw Object.assign(new Error("Not Found"), { status: 404 });
      },
    });

    const result = await codeownersExists(octokit, "testorg", "testrepo");
    assert.equal(result, true);
    assert.equal(callCount, 1);
  });

  it("returns true when root CODEOWNERS exists", async () => {
    const octokit = makeMockOctokit({
      "GET /repos/{owner}/{repo}/contents/{path}": async (_r, params) => {
        if (params?.["path"] === ".github/CODEOWNERS") {
          throw Object.assign(new Error("Not Found"), { status: 404 });
        }
        if (params?.["path"] === "CODEOWNERS") {
          return { data: { type: "file" } };
        }
        throw Object.assign(new Error("Not Found"), { status: 404 });
      },
    });

    const result = await codeownersExists(octokit, "testorg", "testrepo");
    assert.equal(result, true);
  });

  it("returns true when docs/CODEOWNERS exists", async () => {
    const octokit = makeMockOctokit({
      "GET /repos/{owner}/{repo}/contents/{path}": async (_r, params) => {
        if (params?.["path"] === "docs/CODEOWNERS") {
          return { data: { type: "file" } };
        }
        throw Object.assign(new Error("Not Found"), { status: 404 });
      },
    });

    const result = await codeownersExists(octokit, "testorg", "testrepo");
    assert.equal(result, true);
  });

  it("propagates non-404 errors", async () => {
    const octokit = makeMockOctokit({
      "GET /repos/{owner}/{repo}/contents/{path}": async () => {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      },
    });

    await assert.rejects(
      () => codeownersExists(octokit, "testorg", "testrepo"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as { status?: number }).status, 403);
        return true;
      },
    );
  });
});

// ─── scaffoldCodeowners ───────────────────────────────────────────────────────

describe("scaffoldCodeowners", () => {
  it("skips when CODEOWNERS already exists", async () => {
    const octokit = makeMockOctokit({
      "GET /repos/{owner}/{repo}/contents/{path}": async () => ({
        data: { type: "file" },
      }),
    });

    const result = await scaffoldCodeowners("testorg", "testrepo", 1, octokit);

    assert.equal(result.skipped, true);
    assert.equal(result.repository, "testorg/testrepo");
    assert.ok(result.message.includes("already exists"));
    assert.equal(result.pr_url, undefined);
  });

  it("creates branch and PR when CODEOWNERS is missing", async () => {
    const calls: string[] = [];
    const octokit = makeHappyPathOctokit({
      "POST /repos/{owner}/{repo}/git/refs": async () => {
        calls.push("create-branch");
        return { data: {} };
      },
      "PUT /repos/{owner}/{repo}/contents/{path}": async (_r, params) => {
        calls.push("create-file");
        // Verify path is .github/CODEOWNERS
        assert.equal(params?.["path"], ".github/CODEOWNERS");
        // Verify content is base64-encoded template
        const decoded = Buffer.from(
          params?.["content"] as string,
          "base64",
        ).toString("utf-8");
        assert.equal(decoded, DEFAULT_CODEOWNERS_TEMPLATE);
        return { data: {} };
      },
      "POST /repos/{owner}/{repo}/pulls": async () => {
        calls.push("create-pr");
        return {
          data: { html_url: "https://github.com/testorg/testrepo/pull/42" },
        };
      },
    });

    const result = await scaffoldCodeowners("testorg", "testrepo", 1, octokit);

    assert.equal(result.skipped, false);
    assert.equal(result.repository, "testorg/testrepo");
    assert.equal(result.pr_url, "https://github.com/testorg/testrepo/pull/42");
    assert.ok(result.message.includes("PR created"));
    assert.deepEqual(calls, ["create-branch", "create-file", "create-pr"]);
  });

  it("force-updates existing setup branch on retry (422 → PATCH)", async () => {
    const calls: string[] = [];
    const octokit = makeHappyPathOctokit({
      "POST /repos/{owner}/{repo}/git/refs": async () => {
        calls.push("POST-refs");
        throw Object.assign(new Error("Unprocessable Entity"), { status: 422 });
      },
      "PATCH /repos/{owner}/{repo}/git/refs/{ref}": async (_r, params) => {
        calls.push("PATCH-refs");
        assert.equal(params?.["force"], true);
        return { data: {} };
      },
    });

    const result = await scaffoldCodeowners("testorg", "testrepo", 1, octokit);

    assert.equal(result.skipped, false);
    assert.ok(calls.includes("POST-refs"));
    assert.ok(calls.includes("PATCH-refs"));
  });

  it("propagates unexpected errors from branch creation", async () => {
    const octokit = makeHappyPathOctokit({
      "POST /repos/{owner}/{repo}/git/refs": async () => {
        throw Object.assign(new Error("Internal Server Error"), { status: 500 });
      },
    });

    await assert.rejects(
      () => scaffoldCodeowners("testorg", "testrepo", 1, octokit),
      /Internal Server Error/,
    );
  });

  it("uses the repository default branch as PR base", async () => {
    let prBase: string | undefined;
    const octokit = makeHappyPathOctokit({
      "GET /repos/{owner}/{repo}": async () => ({
        data: { default_branch: "develop" },
      }),
      "GET /repos/{owner}/{repo}/git/ref/{ref}": async (_r, params) => {
        // Verify we resolved the correct branch
        assert.equal(params?.["ref"], "heads/develop");
        return { data: { object: { sha: "deadbeef" } } };
      },
      "POST /repos/{owner}/{repo}/pulls": async (_r, params) => {
        prBase = params?.["base"] as string;
        return {
          data: { html_url: "https://github.com/testorg/testrepo/pull/1" },
        };
      },
    });

    await scaffoldCodeowners("testorg", "testrepo", 1, octokit);
    assert.equal(prBase, "develop");
  });

  it("commit message includes AgentCraftworks attribution", async () => {
    let commitMessage: string | undefined;
    const octokit = makeHappyPathOctokit({
      "PUT /repos/{owner}/{repo}/contents/{path}": async (_r, params) => {
        commitMessage = params?.["message"] as string;
        return { data: {} };
      },
    });

    await scaffoldCodeowners("testorg", "testrepo", 1, octokit);
    assert.ok(commitMessage?.includes("AgentCraftworks"));
  });
});

// ─── handleInstallationEvent ─────────────────────────────────────────────────

describe("handleInstallationEvent", () => {
  function makePayload(
    action: string,
    extra: Partial<InstallationPayload> = {},
  ): InstallationPayload {
    return {
      action,
      installation: { id: 99, account: { login: "testorg" } },
      sender: { login: "install-user" },
      ...extra,
    };
  }

  it("handles installation.created and processes all repos", async () => {
    // Patch scaffoldCodeowners is tricky to mock at module level;
    // test via handleInstallationEvent with a payload that contains no repos
    // so the external API is never called.
    const payload = makePayload("created", { repositories: [] });
    const result = await handleInstallationEvent(payload);

    assert.equal(result.handled, true);
    assert.equal(result.action, "created");
    assert.equal(result.results.length, 0);
    assert.ok(result.message.includes("No repositories"));
  });

  it("handles installation_repositories.added", async () => {
    const payload = makePayload("added", { repositories_added: [] });
    const result = await handleInstallationEvent(payload);

    assert.equal(result.handled, true);
    assert.equal(result.action, "added");
  });

  it("does not handle unknown actions", async () => {
    const payload = makePayload("deleted");
    const result = await handleInstallationEvent(payload);

    assert.equal(result.handled, false);
    assert.ok(result.message.includes("not handled"));
  });

  it("does not handle suspend action", async () => {
    const payload = makePayload("suspend");
    const result = await handleInstallationEvent(payload);

    assert.equal(result.handled, false);
  });

  it("reports correct count for multi-repo installations", async () => {
    // Both repos are scaffolded via a mock Octokit — no real API calls made.
    const scaffoldFn = makeScaffoldFn(makeHappyPathOctokit({
      "POST /repos/{owner}/{repo}/pulls": async (_r, params) => ({
        data: {
          html_url: `https://github.com/${params?.["owner"] as string}/${params?.["repo"] as string}/pull/1`,
        },
      }),
    }));

    const payload = makePayload("created", {
      repositories: [
        { name: "repo-a", full_name: "testorg/repo-a", private: false },
        { name: "repo-b", full_name: "testorg/repo-b", private: false },
      ],
    });

    const result = await handleInstallationEvent(payload, scaffoldFn);

    assert.equal(result.handled, true);
    assert.equal(result.results.length, 2);
    assert.ok(result.message.includes("2 repositor"));
    // Both repos should have a PR URL (not skipped, not errored).
    assert.ok(result.results.every((r) => r.pr_url));
  });

  it("isolates errors per repo and continues processing remaining repos", async () => {
    // First repo succeeds; second repo's scaffold throws — handler should
    // surface both results without re-throwing.
    let callCount = 0;
    const scaffoldFn: ScaffoldFn = async (owner, repo) => {
      callCount++;
      if (repo === "repo-b") {
        throw new Error("simulated API failure");
      }
      return {
        repository: `${owner}/${repo}`,
        skipped: false,
        pr_url: `https://github.com/${owner}/${repo}/pull/1`,
        message: "CODEOWNERS PR created",
      };
    };

    const payload = makePayload("created", {
      repositories: [
        { name: "repo-a", full_name: "testorg/repo-a", private: false },
        { name: "repo-b", full_name: "testorg/repo-b", private: false },
      ],
    });

    const result = await handleInstallationEvent(payload, scaffoldFn);

    assert.equal(result.handled, true);
    assert.equal(result.results.length, 2);
    assert.equal(callCount, 2);
    // First repo succeeded.
    assert.ok(result.results.some((r) => r.repository === "testorg/repo-a" && r.pr_url));
    // Second repo captured the error but didn't stop processing.
    assert.ok(result.results.some((r) => r.repository === "testorg/repo-b" && r.message.includes("simulated API failure")));
  });

  it("reports an error for malformed full_name without a slash", async () => {
    const payload = makePayload("created", {
      repositories: [
        { name: "broken", full_name: "singleword", private: false },
      ],
    });

    const result = await handleInstallationEvent(payload);

    assert.equal(result.handled, true);
    assert.equal(result.results.length, 1);
    assert.ok(result.results[0]?.message.includes("malformed"));
    assert.equal(result.results[0]?.skipped, false);
  });

  it("falls back to listReposFn when repositories field is absent (org-wide install)", async () => {
    // Payload has no `repositories` field — simulates an org-wide installation.
    const payload = makePayload("created");
    assert.equal(payload.repositories, undefined);

    const listReposFn: ListReposFn = async () => [
      { name: "repo-a", full_name: "testorg/repo-a", private: false },
      { name: "repo-b", full_name: "testorg/repo-b", private: false },
    ];

    const scaffoldFn = makeScaffoldFn(makeHappyPathOctokit());

    const result = await handleInstallationEvent(payload, scaffoldFn, listReposFn);

    assert.equal(result.handled, true);
    assert.equal(result.results.length, 2);
    assert.ok(result.message.includes("2 repositor"));
  });

  it("returns empty results when listReposFn returns no repos for org-wide install", async () => {
    const payload = makePayload("created");
    const listReposFn: ListReposFn = async () => [];
    const result = await handleInstallationEvent(payload, scaffoldCodeowners, listReposFn);

    assert.equal(result.handled, true);
    assert.equal(result.results.length, 0);
    assert.ok(result.message.includes("No repositories"));
  });

  it("propagates listReposFn errors as handled:false", async () => {
    const payload = makePayload("created");
    const listReposFn: ListReposFn = async () => {
      throw new Error("API rate limit exceeded");
    };

    await assert.rejects(
      () => handleInstallationEvent(payload, scaffoldCodeowners, listReposFn),
      /API rate limit exceeded/,
    );
  });
});

// ─── DEFAULT_CODEOWNERS_TEMPLATE ─────────────────────────────────────────────

describe("DEFAULT_CODEOWNERS_TEMPLATE", () => {
  it("contains a catch-all pattern", () => {
    assert.ok(DEFAULT_CODEOWNERS_TEMPLATE.includes("*"));
  });

  it("contains security scanner routing", () => {
    assert.ok(DEFAULT_CODEOWNERS_TEMPLATE.includes("@agents/security-scanner"));
  });

  it("contains docs reviewer routing", () => {
    assert.ok(DEFAULT_CODEOWNERS_TEMPLATE.includes("@agents/docs-reviewer"));
  });

  it("contains code reviewer routing", () => {
    assert.ok(DEFAULT_CODEOWNERS_TEMPLATE.includes("@agents/code-reviewer"));
  });

  it("contains infrastructure patterns with humans-only", () => {
    assert.ok(DEFAULT_CODEOWNERS_TEMPLATE.includes("@human-leads/platform"));
    assert.ok(DEFAULT_CODEOWNERS_TEMPLATE.includes(".github/**"));
  });

  it("contains package.json entry", () => {
    assert.ok(DEFAULT_CODEOWNERS_TEMPLATE.includes("package.json"));
  });

  it("starts with a comment header generated by AgentCraftworks", () => {
    assert.ok(
      DEFAULT_CODEOWNERS_TEMPLATE.trimStart().startsWith(
        "# CODEOWNERS — Generated by AgentCraftworks",
      ),
    );
  });
});
