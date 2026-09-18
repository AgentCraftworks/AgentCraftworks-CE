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
  type HandleInstallationOptions,
  type Repository,
  type ScaffoldRunSummary,
} from "../src/handlers/installation.js";
import {
  ScaffoldQueue,
  type Logger,
  type LogFields,
} from "../src/services/scaffold-queue.js";

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
      "GET /repos/{owner}/{repo}": async () => ({
        data: { default_branch: "main", archived: false, fork: false },
      }),
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

  it("skips archived repositories without probing CODEOWNERS", async () => {
    let contentsCalls = 0;
    const octokit = makeHappyPathOctokit({
      "GET /repos/{owner}/{repo}": async () => ({
        data: { default_branch: "main", archived: true, fork: false },
      }),
      "GET /repos/{owner}/{repo}/contents/{path}": async () => {
        contentsCalls++;
        throw Object.assign(new Error("Not Found"), { status: 404 });
      },
    });

    const result = await scaffoldCodeowners("testorg", "old", 1, octokit);

    assert.equal(result.skipped, true);
    assert.ok(result.message.includes("archived"));
    assert.equal(contentsCalls, 0);
  });

  it("skips forked repositories", async () => {
    const octokit = makeHappyPathOctokit({
      "GET /repos/{owner}/{repo}": async () => ({
        data: { default_branch: "main", archived: false, fork: true },
      }),
    });

    const result = await scaffoldCodeowners("testorg", "forked", 1, octokit);

    assert.equal(result.skipped, true);
    assert.ok(result.message.includes("fork"));
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
  const silentLogger: Logger = () => {};

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

  function makeRepos(count: number, prefix = "repo"): Repository[] {
    return Array.from({ length: count }, (_, i) => ({
      name: `${prefix}-${i + 1}`,
      full_name: `testorg/${prefix}-${i + 1}`,
      private: false,
    }));
  }

  /**
   * Build a mock Octokit that records scaffold calls per repo and optionally
   * pretends the org has a `.github` repository for tracking issues.
   */
  function makeInstallOctokit(opts: {
    hasDotGithub?: boolean;
    trackingIssues?: Array<{ repo: string; title: string; body: string }>;
    perRepoOverrides?: Record<string, RequestFn>;
  } = {}): Octokit {
    const trackingIssues = opts.trackingIssues ?? [];
    return makeHappyPathOctokit({
      "GET /repos/{owner}/{repo}": async (_r, p) => {
        if (p?.["repo"] === ".github") {
          if (opts.hasDotGithub) return { data: { default_branch: "main" } };
          throw Object.assign(new Error("Not Found"), { status: 404 });
        }
        return { data: { default_branch: "main", archived: false, fork: false } };
      },
      "POST /repos/{owner}/{repo}/pulls": async (_r, p) => ({
        data: {
          html_url: `https://github.com/${p?.["owner"] as string}/${p?.["repo"] as string}/pull/1`,
        },
      }),
      "POST /repos/{owner}/{repo}/issues": async (_r, p) => {
        trackingIssues.push({
          repo: p?.["repo"] as string,
          title: p?.["title"] as string,
          body: p?.["body"] as string,
        });
        return {
          data: {
            html_url: `https://github.com/testorg/${p?.["repo"] as string}/issues/7`,
          },
        };
      },
      ...opts.perRepoOverrides,
    });
  }

  /** Run the handler with an isolated queue and wait for the background job. */
  async function runToCompletion(
    payload: InstallationPayload,
    options: Omit<HandleInstallationOptions, "queue" | "onComplete" | "logger"> & {
      concurrency?: number;
    } = {},
  ) {
    const queue = new ScaffoldQueue({
      concurrency: options.concurrency ?? 3,
      logger: silentLogger,
    });
    let summary: ScaffoldRunSummary | undefined;
    const response = await handleInstallationEvent(payload, {
      ...options,
      queue,
      logger: silentLogger,
      sleep: options.sleep ?? (async () => {}),
      onComplete: (s) => {
        summary = s;
      },
    });
    await queue.onIdle();
    assert.ok(summary, "background job should have completed");
    return { response, summary, queue };
  }

  it("returns 'No repositories' for installation.created with an empty list", async () => {
    const payload = makePayload("created", { repositories: [] });
    const result = await handleInstallationEvent(payload, {
      queue: new ScaffoldQueue({ concurrency: 1, logger: silentLogger }),
    });

    assert.equal(result.handled, true);
    assert.equal(result.action, "created");
    assert.equal(result.queued, 0);
    assert.ok(result.message.includes("No repositories"));
  });

  it("handles installation_repositories.added with an empty list", async () => {
    const payload = makePayload("added", { repositories_added: [] });
    const result = await handleInstallationEvent(payload, {
      queue: new ScaffoldQueue({ concurrency: 1, logger: silentLogger }),
    });

    assert.equal(result.handled, true);
    assert.equal(result.action, "added");
  });

  it("does not handle unknown actions", async () => {
    const result = await handleInstallationEvent(makePayload("deleted"));
    assert.equal(result.handled, false);
    assert.ok(result.message.includes("not handled"));
  });

  it("does not handle suspend action", async () => {
    const result = await handleInstallationEvent(makePayload("suspend"));
    assert.equal(result.handled, false);
  });

  it("returns before scaffolding completes (webhook is not blocked)", async () => {
    let releaseScaffold: () => void = () => {};
    const scaffoldStarted = new Promise<void>((resolve) => {
      releaseScaffold = resolve;
    });
    let scaffoldCalls = 0;
    const scaffoldFn: ScaffoldFn = async (owner, repo) => {
      scaffoldCalls++;
      await scaffoldStarted;
      return {
        repository: `${owner}/${repo}`,
        skipped: false,
        pr_url: `https://github.com/${owner}/${repo}/pull/1`,
        message: "ok",
      };
    };
    const queue = new ScaffoldQueue({ concurrency: 3, logger: silentLogger });
    let completed = false;

    const result = await handleInstallationEvent(
      makePayload("created", { repositories: makeRepos(3) }),
      {
        queue,
        scaffoldFn,
        octokitFactory: async () => makeInstallOctokit(),
        logger: silentLogger,
        onComplete: () => {
          completed = true;
        },
      },
    );

    // Response is available immediately; nothing has run yet.
    assert.equal(result.handled, true);
    assert.equal(result.queued, 3);
    assert.ok(result.message.startsWith("Accepted"));
    assert.equal(scaffoldCalls, 0);
    assert.equal(completed, false);

    releaseScaffold();
    await queue.onIdle();
    assert.equal(scaffoldCalls, 3);
    assert.equal(completed, true);
  });

  it("scaffolds a single repository and opens no tracking issue", async () => {
    const trackingIssues: Array<{ repo: string; title: string; body: string }> = [];
    const octokit = makeInstallOctokit({ trackingIssues });

    const { response, summary } = await runToCompletion(
      makePayload("created", { repositories: makeRepos(1) }),
      { octokitFactory: async () => octokit },
    );

    assert.equal(response.queued, 1);
    assert.equal(response.deferred, 0);
    assert.ok(response.message.includes("1 repository"));
    assert.equal(summary.results.length, 1);
    assert.equal(summary.results[0]?.pr_url, "https://github.com/testorg/repo-1/pull/1");
    assert.equal(summary.deferred.length, 0);
    assert.equal(summary.trackingIssueUrl, undefined);
    assert.equal(trackingIssues.length, 0);
  });

  it("scaffolds exactly 25 repositories at the default cap without deferring", async () => {
    const trackingIssues: Array<{ repo: string; title: string; body: string }> = [];
    const octokit = makeInstallOctokit({ trackingIssues });

    const { response, summary } = await runToCompletion(
      makePayload("created", { repositories: makeRepos(25) }),
      { octokitFactory: async () => octokit },
    );

    assert.equal(response.queued, 25);
    assert.equal(response.deferred, 0);
    assert.equal(summary.results.length, 25);
    assert.ok(summary.results.every((r) => r.pr_url));
    assert.equal(trackingIssues.length, 0);
  });

  it("caps at 25 of 60 repositories and opens ONE tracking issue in .github", async () => {
    const trackingIssues: Array<{ repo: string; title: string; body: string }> = [];
    const octokit = makeInstallOctokit({ hasDotGithub: true, trackingIssues });

    const { response, summary } = await runToCompletion(
      makePayload("created", { repositories: makeRepos(60) }),
      { octokitFactory: async () => octokit },
    );

    assert.equal(response.queued, 25);
    assert.equal(response.deferred, 35);
    assert.equal(summary.results.length, 25);
    assert.equal(summary.deferred.length, 35);
    assert.equal(summary.deferred[0], "testorg/repo-26");
    assert.equal(summary.deferred[34], "testorg/repo-60");

    assert.equal(trackingIssues.length, 1);
    const issue = trackingIssues[0]!;
    assert.equal(issue.repo, ".github");
    assert.equal(
      issue.title,
      "AgentCraftworks CE: CODEOWNERS setup pending for 35 repositories",
    );
    assert.ok(issue.body.includes("- [ ] testorg/repo-26"));
    assert.ok(issue.body.includes("- [ ] testorg/repo-60"));
    assert.ok(!issue.body.includes("- [ ] testorg/repo-25"));
    assert.equal(summary.trackingIssueUrl, "https://github.com/testorg/.github/issues/7");
  });

  it("falls back to the first processed repo for the tracking issue when .github is absent", async () => {
    const trackingIssues: Array<{ repo: string; title: string; body: string }> = [];
    const octokit = makeInstallOctokit({ hasDotGithub: false, trackingIssues });

    const { summary } = await runToCompletion(
      makePayload("created", { repositories: makeRepos(4) }),
      { octokitFactory: async () => octokit, maxRepos: 2 },
    );

    assert.equal(summary.results.length, 2);
    assert.equal(summary.deferred.length, 2);
    assert.equal(trackingIssues.length, 1);
    assert.equal(trackingIssues[0]?.repo, "repo-1");
    assert.ok(trackingIssues[0]?.title.endsWith("2 repositories"));
  });

  it("honours SCAFFOLD_MAX_REPOS from the environment", async () => {
    const previous = process.env["SCAFFOLD_MAX_REPOS"];
    process.env["SCAFFOLD_MAX_REPOS"] = "2";
    try {
      const octokit = makeInstallOctokit({ hasDotGithub: true });
      const { response } = await runToCompletion(
        makePayload("created", { repositories: makeRepos(5) }),
        { octokitFactory: async () => octokit },
      );
      assert.equal(response.queued, 2);
      assert.equal(response.deferred, 3);
    } finally {
      if (previous === undefined) delete process.env["SCAFFOLD_MAX_REPOS"];
      else process.env["SCAFFOLD_MAX_REPOS"] = previous;
    }
  });

  it("skips archived and fork repositories from payload flags without API calls", async () => {
    const seen: string[] = [];
    const scaffoldFn: ScaffoldFn = async (owner, repo) => {
      seen.push(repo);
      return {
        repository: `${owner}/${repo}`,
        skipped: false,
        pr_url: `https://github.com/${owner}/${repo}/pull/1`,
        message: "ok",
      };
    };

    const { response, summary } = await runToCompletion(
      makePayload("added", {
        repositories_added: [
          { name: "active", full_name: "testorg/active", private: false },
          { name: "old", full_name: "testorg/old", private: false, archived: true },
          { name: "forked", full_name: "testorg/forked", private: false, fork: true },
        ],
      }),
      { scaffoldFn, octokitFactory: async () => makeInstallOctokit() },
    );

    assert.equal(response.queued, 1);
    assert.deepEqual(seen, ["active"]);
    assert.equal(summary.skipped.length, 2);
    assert.ok(summary.skipped.some((s) => s.repository === "testorg/old" && s.message.includes("archived")));
    assert.ok(summary.skipped.some((s) => s.repository === "testorg/forked" && s.message.includes("fork")));
    // Skipped repos do not count toward the cap.
    assert.equal(summary.deferred.length, 0);
  });

  it("skips archived and fork repositories discovered via repository metadata", async () => {
    const octokit = makeInstallOctokit({
      perRepoOverrides: {
        "GET /repos/{owner}/{repo}": async (_r, p) => ({
          data: {
            default_branch: "main",
            archived: p?.["repo"] === "old",
            fork: p?.["repo"] === "forked",
          },
        }),
      },
    });

    const { summary } = await runToCompletion(
      makePayload("created", {
        repositories: [
          { name: "active", full_name: "testorg/active", private: false },
          { name: "old", full_name: "testorg/old", private: false },
          { name: "forked", full_name: "testorg/forked", private: false },
        ],
      }),
      { octokitFactory: async () => octokit },
    );

    assert.equal(summary.results.length, 3);
    assert.ok(summary.results.find((r) => r.repository === "testorg/active")?.pr_url);
    assert.equal(summary.results.find((r) => r.repository === "testorg/old")?.skipped, true);
    assert.equal(summary.results.find((r) => r.repository === "testorg/forked")?.skipped, true);
  });

  it("retries after a 403 with retry-after and then succeeds", async () => {
    const sleeps: number[] = [];
    let pullAttempts = 0;
    const octokit = makeInstallOctokit({
      perRepoOverrides: {
        "POST /repos/{owner}/{repo}/pulls": async () => {
          pullAttempts++;
          if (pullAttempts === 1) {
            throw Object.assign(new Error("secondary rate limit"), {
              status: 403,
              response: { headers: { "retry-after": "7" } },
            });
          }
          return { data: { html_url: "https://github.com/testorg/repo-1/pull/9" } };
        },
      },
    });

    const { summary } = await runToCompletion(
      makePayload("created", { repositories: makeRepos(1) }),
      {
        octokitFactory: async () => octokit,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
    );

    assert.equal(pullAttempts, 2);
    assert.deepEqual(sleeps, [7000]);
    assert.equal(summary.results[0]?.pr_url, "https://github.com/testorg/repo-1/pull/9");
  });

  it("gives up after 3 rate-limited attempts and records the error", async () => {
    let attempts = 0;
    const octokit = makeInstallOctokit({
      perRepoOverrides: {
        "POST /repos/{owner}/{repo}/git/refs": async () => {
          attempts++;
          throw Object.assign(new Error("rate limited"), { status: 429 });
        },
      },
    });

    const { summary } = await runToCompletion(
      makePayload("created", { repositories: makeRepos(1) }),
      { octokitFactory: async () => octokit },
    );

    assert.equal(attempts, 3);
    assert.equal(summary.results[0]?.skipped, false);
    assert.equal(summary.results[0]?.pr_url, undefined);
    assert.ok(summary.results[0]?.message.includes("rate limited"));
  });

  it("bounds concurrency across repositories to the queue limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const scaffoldFn: ScaffoldFn = async (owner, repo) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { repository: `${owner}/${repo}`, skipped: false, pr_url: "u", message: "ok" };
    };

    const { summary } = await runToCompletion(
      makePayload("created", { repositories: makeRepos(10) }),
      { scaffoldFn, octokitFactory: async () => makeInstallOctokit(), concurrency: 2 },
    );

    assert.equal(summary.results.length, 10);
    assert.ok(peak <= 2, `peak concurrency was ${peak}`);
    assert.ok(peak >= 2, "expected the queue to actually run jobs in parallel");
  });

  it("isolates errors per repo and continues processing remaining repos", async () => {
    let callCount = 0;
    const scaffoldFn: ScaffoldFn = async (owner, repo) => {
      callCount++;
      if (repo === "repo-2") {
        throw new Error("simulated API failure");
      }
      return {
        repository: `${owner}/${repo}`,
        skipped: false,
        pr_url: `https://github.com/${owner}/${repo}/pull/1`,
        message: "CODEOWNERS PR created",
      };
    };

    const { summary } = await runToCompletion(
      makePayload("created", { repositories: makeRepos(2) }),
      { scaffoldFn, octokitFactory: async () => makeInstallOctokit() },
    );

    assert.equal(callCount, 2);
    assert.equal(summary.results.length, 2);
    assert.ok(summary.results.some((r) => r.repository === "testorg/repo-1" && r.pr_url));
    assert.ok(
      summary.results.some(
        (r) => r.repository === "testorg/repo-2" && r.message.includes("simulated API failure"),
      ),
    );
  });

  it("reports an error for malformed full_name without a slash", async () => {
    const { response, summary } = await runToCompletion(
      makePayload("created", {
        repositories: [{ name: "broken", full_name: "singleword", private: false }],
      }),
      { octokitFactory: async () => makeInstallOctokit() },
    );

    assert.equal(response.queued, 0);
    assert.equal(summary.results.length, 0);
    assert.equal(summary.skipped.length, 1);
    assert.ok(summary.skipped[0]?.message.includes("malformed"));
    assert.equal(summary.skipped[0]?.skipped, false);
  });

  it("defers listing to the background for org-wide installs (repositories absent)", async () => {
    const payload = makePayload("created");
    assert.equal(payload.repositories, undefined);
    let listed = false;
    const listReposFn: ListReposFn = async () => {
      listed = true;
      return makeRepos(2);
    };

    const queue = new ScaffoldQueue({ concurrency: 3, logger: silentLogger });
    let summary: ScaffoldRunSummary | undefined;
    const response = await handleInstallationEvent(payload, {
      queue,
      listReposFn,
      octokitFactory: async () => makeInstallOctokit(),
      logger: silentLogger,
      onComplete: (s) => {
        summary = s;
      },
    });

    assert.equal(response.handled, true);
    assert.equal(listed, false, "listing must not block the webhook response");
    assert.ok(response.message.includes("listing"));

    await queue.onIdle();
    assert.equal(listed, true);
    assert.equal(summary?.results.length, 2);
  });

  it("completes with an empty summary when listReposFn returns no repos", async () => {
    const { summary } = await runToCompletion(makePayload("created"), {
      listReposFn: async () => [],
      octokitFactory: async () => makeInstallOctokit(),
    });

    assert.equal(summary.results.length, 0);
    assert.equal(summary.deferred.length, 0);
  });

  it("logs listReposFn errors instead of crashing the queue", async () => {
    const errors: LogFields[] = [];
    const queue = new ScaffoldQueue({ concurrency: 1, logger: silentLogger });
    let summary: ScaffoldRunSummary | undefined;

    await handleInstallationEvent(makePayload("created"), {
      queue,
      listReposFn: async () => {
        throw new Error("API rate limit exceeded");
      },
      octokitFactory: async () => makeInstallOctokit(),
      logger: (level, fields) => {
        if (level === "error") errors.push(fields);
      },
      onComplete: (s) => {
        summary = s;
      },
    });
    await queue.onIdle();

    assert.ok(summary);
    assert.equal(summary.results.length, 0);
    assert.ok(errors.some((e) => String(e["error"]).includes("API rate limit exceeded")));
    assert.ok(errors.every((e) => e["correlationId"] === "installation:99"));
  });

  it("includes installation and repo correlation ids in structured logs", async () => {
    const infos: LogFields[] = [];
    const queue = new ScaffoldQueue({ concurrency: 1, logger: silentLogger });

    await handleInstallationEvent(
      makePayload("created", { repositories: makeRepos(1) }),
      {
        queue,
        octokitFactory: async () => makeInstallOctokit(),
        logger: (_level, fields) => infos.push(fields),
      },
    );
    await queue.onIdle();

    assert.ok(infos.some((f) => f["correlationId"] === "installation:99"));
    assert.ok(
      infos.some(
        (f) => f["correlationId"] === "installation:99:testorg/repo-1" && f["msg"] === "CODEOWNERS PR created",
      ),
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
