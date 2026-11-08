/**
 * CODEOWNERS Routing + Action Gate — Tests
 *
 * Covers the webhook wiring added for issue #266:
 *   - CODEOWNERS parse → match → route, with label / none fallback
 *   - CODEOWNERS fetch caching (5 min TTL)
 *   - gateAction allow/deny at each environment tier
 *   - denied writes are never sent to GitHub (mocked Octokit)
 *   - denial explanation comment posted only when T2+ permits it
 *
 * Uses node:test and node:assert/strict.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  CODEOWNERS_CACHE_TTL_MS,
  clearCodeownersCache,
  decideRouting,
  fetchChangedFiles,
  loadCodeowners,
  resolveRouting,
  type OctokitLike,
} from "../src/services/codeowners-router.js";
import {
  canComment,
  describeDenial,
  gateAction,
} from "../src/services/action-gate.js";
import { loadRuntimePolicy } from "../src/config/runtime.js";
import {
  clearAllDials,
  setDialLevel,
} from "../src/services/autonomy-dial.js";
import { clearRepositoryConfigCache } from "../src/services/repo-config.js";
import { handlePullRequestEvent } from "../src/handlers/pull-request.js";
import {
  clearAllHandoffs,
  getHandoff,
  initHandoffService,
} from "../src/services/handoff-service.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const OWNER = "testorg";
const REPO = "testrepo";

const CODEOWNERS_SINGLE = `
# Frontend owned by one team
src/frontend/ @testorg/frontend-team
`;

const CODEOWNERS_MULTI = `
* @testorg/code-reviewer
src/frontend/ @testorg/frontend-team
src/backend/ @testorg/backend-team @octocat
*.md @testorg/docs-team
`;

interface RecordedCall {
  route: string;
  params: Record<string, unknown>;
}

interface MockOptions {
  codeowners?: string | null;
  codeownersPath?: string;
  files?: string[];
  /** Number of files to return per page (defaults to all in one page). */
  failWrites?: boolean;
  repositoryCeiling?: number;
}

function makeOctokit(options: MockOptions = {}): {
  octokit: OctokitLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const codeownersPath = options.codeownersPath ?? ".github/CODEOWNERS";
  const files = options.files ?? [];
  const repositoryPolicy = {
    type: "file",
    encoding: "base64",
    content: Buffer.from(
      `version: "1"\nagents:\n  ceiling: ${options.repositoryCeiling ?? 5}\n`,
      "utf-8",
    ).toString("base64"),
  };

  const octokit: OctokitLike = {
    repos: {
      async get() {
        return { data: { default_branch: "main" } };
      },
      async getContent() {
        return { data: repositoryPolicy, headers: { etag: '"test-policy"' } };
      },
    },
    async request(route, params = {}) {
      calls.push({ route, params });

      if (route === "GET /repos/{owner}/{repo}/contents/{path}") {
        if (options.codeowners != null && params["path"] === codeownersPath) {
          return {
            data: {
              type: "file",
              encoding: "base64",
              content: Buffer.from(options.codeowners, "utf-8").toString(
                "base64",
              ),
            },
          };
        }
        const err = new Error("Not Found") as Error & { status: number };
        err.status = 404;
        throw err;
      }

      if (route === "GET /repos/{owner}/{repo}/pulls/{pull_number}/files") {
        const perPage = Number(params["per_page"] ?? 100);
        const page = Number(params["page"] ?? 1);
        const start = (page - 1) * perPage;
        return {
          data: files
            .slice(start, start + perPage)
            .map((filename) => ({ filename })),
        };
      }

      if (options.failWrites && route.startsWith("POST ")) {
        throw new Error("write failed");
      }

      return { data: {} };
    },
  };

  return { octokit, calls };
}

function writeCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((c) => c.route.startsWith("POST "));
}

function makePrPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "opened",
    pull_request: {
      number: 7,
      title: "Change frontend",
      user: { login: "dev-user" },
      head: { ref: "feature/x", sha: "abc123" },
      base: { ref: "main" },
      draft: false,
      labels: [],
    },
    repository: {
      full_name: `${OWNER}/${REPO}`,
      name: REPO,
      owner: { login: OWNER },
    },
    installation: { id: 12345 },
    sender: { login: "dev-user" },
    ...overrides,
  };
}

const quiet = (): void => {};

function policyFor(
  environment: "dev" | "staging" | "production" | "local",
) {
  const environmentCeiling =
    environment === "production"
      ? 3
      : environment === "staging"
        ? 4
        : 5;
  return loadRuntimePolicy(
    {
      GH_CE_ENVIRONMENT: environment,
      GH_CE_ENV_MAX_LEVELS: `${environment}=${environmentCeiling}`,
      GH_CE_REPO_CEILINGS: `${OWNER}/${REPO}=5`,
    },
    quiet,
  );
}

function gateAtConfiguredCeiling(
  action: string,
  environment: "dev" | "staging" | "production" | "local",
) {
  return gateAction(
    OWNER,
    REPO,
    action,
    policyFor(environment),
    { repoCeiling: 5 },
  );
}

beforeEach(() => {
  clearCodeownersCache();
  clearRepositoryConfigCache();
  clearAllDials();
  clearAllHandoffs();
  initHandoffService({ forceInMemory: true });
});

// ─── decideRouting (pure) ───────────────────────────────────────────────────

describe("decideRouting", () => {
  it("routes to CODEOWNERS teams when any match", () => {
    const decision = decideRouting(
      ["frontend-team"],
      [{ name: "security-review" }],
      ["src/frontend/App.tsx"],
      new Set(["frontend-team"]),
    );
    assert.equal(decision.source, "codeowners");
    assert.deepEqual(decision.teams, ["frontend-team"]);
    assert.deepEqual(decision.agents, ["@frontend-team"]);
    assert.deepEqual(decision.teamSlugs, ["frontend-team"]);
  });

  it("falls back to label routing when no team matches", () => {
    const decision = decideRouting([], [{ name: "security-review" }]);
    assert.equal(decision.source, "labels");
    assert.deepEqual(decision.agents, ["@security-scanner"]);
    assert.deepEqual(decision.teams, []);
  });

  it("returns none with the default agent when neither matches", () => {
    const decision = decideRouting([], []);
    assert.equal(decision.source, "none");
    assert.deepEqual(decision.agents, ["@code-reviewer"]);
  });
});

// ─── resolveRouting (parse → match → route) ─────────────────────────────────

describe("resolveRouting", () => {
  it("single owner: routes changed frontend files to the frontend team", async () => {
    const { octokit } = makeOctokit({
      codeowners: CODEOWNERS_SINGLE,
      files: ["src/frontend/App.tsx", "src/frontend/index.css"],
    });
    const decision = await resolveRouting({
      octokit,
      owner: OWNER,
      repo: REPO,
      pullNumber: 7,
      labels: [{ name: "docs-review" }],
    });
    assert.equal(decision.source, "codeowners");
    assert.deepEqual(decision.teams, ["frontend-team"]);
    assert.deepEqual(decision.agents, ["@frontend-team"]);
    assert.equal(decision.files.length, 2);
  });

  it("multiple teams: unions owners across all changed files", async () => {
    const { octokit } = makeOctokit({
      codeowners: CODEOWNERS_MULTI,
      files: ["src/backend/api.ts", "README.md"],
    });
    const decision = await resolveRouting({
      octokit,
      owner: OWNER,
      repo: REPO,
      pullNumber: 7,
      labels: [],
    });
    assert.equal(decision.source, "codeowners");
    assert.deepEqual(
      [...decision.teams].sort(),
      ["backend-team", "docs-team", "octocat"],
    );
    // @octocat is a user, the rest are org teams
    assert.deepEqual(
      [...decision.teamSlugs].sort(),
      ["backend-team", "docs-team"],
    );
  });

  it("no CODEOWNERS match: falls back to label routing", async () => {
    const { octokit } = makeOctokit({
      codeowners: CODEOWNERS_SINGLE,
      files: ["infra/main.bicep"],
    });
    const decision = await resolveRouting({
      octokit,
      owner: OWNER,
      repo: REPO,
      pullNumber: 7,
      labels: [{ name: "accessibility-review" }],
    });
    assert.equal(decision.source, "labels");
    assert.deepEqual(decision.agents, ["@accessibility-lead"]);
  });

  it("missing CODEOWNERS: falls back to labels without fetching files", async () => {
    const { octokit, calls } = makeOctokit({ codeowners: null });
    const decision = await resolveRouting({
      octokit,
      owner: OWNER,
      repo: REPO,
      pullNumber: 7,
      labels: [{ name: "security" }],
    });
    assert.equal(decision.source, "labels");
    assert.deepEqual(decision.agents, ["@security-scanner"]);

    const contentCalls = calls.filter((c) => c.route.includes("/contents/"));
    assert.deepEqual(
      contentCalls.map((c) => c.params["path"]),
      [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"],
    );
    assert.equal(
      calls.some((c) => c.route.includes("/files")),
      false,
    );
  });

  it("finds CODEOWNERS in the docs/ fallback location", async () => {
    const { octokit } = makeOctokit({
      codeowners: CODEOWNERS_SINGLE,
      codeownersPath: "docs/CODEOWNERS",
      files: ["src/frontend/App.tsx"],
    });
    const decision = await resolveRouting({
      octokit,
      owner: OWNER,
      repo: REPO,
      pullNumber: 7,
      labels: [],
    });
    assert.equal(decision.source, "codeowners");
  });

  it("without an octokit routes by labels only", async () => {
    const decision = await resolveRouting({
      octokit: null,
      owner: OWNER,
      repo: REPO,
      pullNumber: 7,
      labels: [{ name: "docs-review" }],
    });
    assert.equal(decision.source, "labels");
    assert.deepEqual(decision.agents, ["@docs-reviewer"]);
  });
});

// ─── fetchChangedFiles ──────────────────────────────────────────────────────

describe("fetchChangedFiles", () => {
  it("paginates and caps at 300 files", async () => {
    const files = Array.from({ length: 350 }, (_, i) => `src/file-${i}.ts`);
    const { octokit, calls } = makeOctokit({ files });
    const result = await fetchChangedFiles(octokit, OWNER, REPO, 7);
    assert.equal(result.length, 300);
    assert.equal(calls.length, 3);
  });

  it("stops paginating on a short page", async () => {
    const { octokit, calls } = makeOctokit({ files: ["a.ts", "b.ts"] });
    const result = await fetchChangedFiles(octokit, OWNER, REPO, 7);
    assert.deepEqual(result, ["a.ts", "b.ts"]);
    assert.equal(calls.length, 1);
  });
});

// ─── CODEOWNERS cache ───────────────────────────────────────────────────────

describe("loadCodeowners cache", () => {
  it("cache hit avoids a second contents fetch", async () => {
    const { octokit, calls } = makeOctokit({ codeowners: CODEOWNERS_SINGLE });
    const first = await loadCodeowners(octokit, OWNER, REPO);
    const second = await loadCodeowners(octokit, OWNER, REPO);
    assert.ok(first);
    assert.equal(second, first);
    assert.equal(calls.length, 1);
  });

  it("caches a missing CODEOWNERS as well", async () => {
    const { octokit, calls } = makeOctokit({ codeowners: null });
    assert.equal(await loadCodeowners(octokit, OWNER, REPO), null);
    assert.equal(await loadCodeowners(octokit, OWNER, REPO), null);
    assert.equal(calls.length, 3);
  });

  it("refetches after the TTL expires", async () => {
    const { octokit, calls } = makeOctokit({ codeowners: CODEOWNERS_SINGLE });
    const t0 = 1_000_000;
    await loadCodeowners(octokit, OWNER, REPO, t0);
    await loadCodeowners(octokit, OWNER, REPO, t0 + CODEOWNERS_CACHE_TTL_MS - 1);
    assert.equal(calls.length, 1);
    await loadCodeowners(octokit, OWNER, REPO, t0 + CODEOWNERS_CACHE_TTL_MS);
    assert.equal(calls.length, 2);
  });

  it("is keyed per repository", async () => {
    const { octokit, calls } = makeOctokit({ codeowners: CODEOWNERS_SINGLE });
    await loadCodeowners(octokit, OWNER, REPO);
    await loadCodeowners(octokit, OWNER, "other-repo");
    assert.equal(calls.length, 2);
  });
});

// ─── gateAction ─────────────────────────────────────────────────────────────

describe("gateAction", () => {
  it("denies every write at the default observer level", () => {
    for (const action of ["add_label", "post_comment", "assign_user", "request_review"]) {
      const decision = gateAtConfiguredCeiling(action, "dev");
      assert.equal(decision.allowed, false, action);
      assert.equal(decision.level, 1);
      assert.equal(decision.levelName, "observer");
    }
  });

  it("allows T2 writes at level 2 but denies T3+", () => {
    setDialLevel(OWNER, REPO, 2, "admin");
    assert.equal(gateAtConfiguredCeiling("add_label", "dev").allowed, true);
    assert.equal(gateAtConfiguredCeiling("post_comment", "dev").allowed, true);
    assert.equal(gateAtConfiguredCeiling("assign_user", "dev").allowed, false);
    assert.equal(gateAtConfiguredCeiling("request_review", "dev").allowed, false);
  });

  it("allows T3 writes at level 3 and T4 at level 4 in dev", () => {
    setDialLevel(OWNER, REPO, 3, "admin");
    assert.equal(gateAtConfiguredCeiling("assign_user", "dev").allowed, true);
    assert.equal(gateAtConfiguredCeiling("request_review", "dev").allowed, false);

    setDialLevel(OWNER, REPO, 4, "admin");
    const decision = gateAtConfiguredCeiling("request_review", "dev");
    assert.equal(decision.allowed, true);
    assert.equal(decision.tier, "T4");
  });

  it("caps level 5 to 4 in staging", () => {
    setDialLevel(OWNER, REPO, 5, "admin");
    const merge = gateAtConfiguredCeiling("merge_pr", "staging");
    assert.equal(merge.allowed, false);
    assert.equal(merge.level, 5);
    assert.equal(merge.effectiveLevel, 4);
    assert.equal(gateAtConfiguredCeiling("request_review", "staging").allowed, true);
  });

  it("caps level 5 to 3 in production", () => {
    setDialLevel(OWNER, REPO, 5, "admin");
    const review = gateAtConfiguredCeiling("request_review", "production");
    assert.equal(review.allowed, false);
    assert.equal(review.effectiveLevel, 3);
    assert.equal(review.levelName, "collaborator");
    assert.equal(gateAtConfiguredCeiling("assign_user", "production").allowed, true);
    assert.ok(describeDenial(review).includes("capped from 5"));
  });

  it("does not cap in local", () => {
    setDialLevel(OWNER, REPO, 5, "admin");
    assert.equal(gateAtConfiguredCeiling("merge_pr", "local").allowed, true);
  });

  it("canComment reflects the T2 threshold", () => {
    assert.equal(canComment(OWNER, REPO, policyFor("dev")), false);
    setDialLevel(OWNER, REPO, 2, "admin");
    assert.equal(canComment(OWNER, REPO, policyFor("dev")), true);
  });
});

// ─── Webhook path: routing + gated writes ───────────────────────────────────

describe("handlePullRequestEvent with CODEOWNERS and action gate", () => {
  it("routes via CODEOWNERS and records teams on the handoff", async () => {
    const { octokit } = makeOctokit({
      codeowners: CODEOWNERS_SINGLE,
      files: ["src/frontend/App.tsx"],
    });
    const result = await handlePullRequestEvent(makePrPayload() as never, {
      octokit,
      policy: policyFor("dev"),
      log: quiet,
    });

    assert.equal(result.handled, true);
    assert.deepEqual(result.routing, {
      teams: ["frontend-team"],
      agents: ["@frontend-team"],
      source: "codeowners",
    });

    const handoff = getHandoff(result.handoff_id!);
    assert.ok(handoff);
    assert.equal(handoff.to_agent, "@frontend-team");
    assert.deepEqual(handoff.teams, ["frontend-team"]);
    const routing = (handoff.metadata as Record<string, unknown>)["routing"] as Record<string, unknown>;
    assert.equal(routing["source"], "codeowners");
  });

  it("denied writes are never sent at observer level and no comment is posted", async () => {
    const { octokit, calls } = makeOctokit({
      codeowners: CODEOWNERS_SINGLE,
      files: ["src/frontend/App.tsx"],
    });
    const logs: Array<Record<string, unknown>> = [];
    const result = await handlePullRequestEvent(makePrPayload() as never, {
      octokit,
      policy: policyFor("dev"),
      log: (e) => logs.push(e),
    });

    assert.deepEqual(writeCalls(calls), []);
    assert.ok(result.actions);
    assert.equal(result.actions.length, 3);
    assert.ok(result.actions.every((a) => !a.allowed && !a.performed));
    assert.deepEqual(
      result.actions.map((a) => a.action),
      ["add_label", "post_comment", "request_review"],
    );

    const denials = logs.filter((l) => l["msg"] === "action denied");
    assert.equal(denials.length, 3);
    assert.equal(denials[0]!["requiredLevel"], 2);
  });

  it("performs T2 writes at level 2, skips T4, and posts one denial comment", async () => {
    setDialLevel(OWNER, REPO, 2, "admin");
    const { octokit, calls } = makeOctokit({
      codeowners: CODEOWNERS_SINGLE,
      files: ["src/frontend/App.tsx"],
    });
    const result = await handlePullRequestEvent(makePrPayload() as never, {
      octokit,
      policy: policyFor("dev"),
      log: quiet,
    });

    const writes = writeCalls(calls);
    const routes = writes.map((w) => w.route);
    assert.deepEqual(routes, [
      "POST /repos/{owner}/{repo}/issues/{issue_number}/labels",
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    ]);
    assert.deepEqual(writes[0]!.params["labels"], ["agent:frontend-team"]);

    const denialComment = writes[2]!.params["body"] as string;
    assert.ok(denialComment.includes("blocked 1 action"));
    assert.ok(denialComment.includes("`request_review`"));
    assert.ok(denialComment.includes(`POST /api/dial/${OWNER}/${REPO}`));

    assert.equal(
      routes.some((r) => r.includes("requested_reviewers")),
      false,
    );

    const byAction = Object.fromEntries(
      result.actions!.map((a) => [a.action, a]),
    );
    assert.equal(byAction["add_label"]!.performed, true);
    assert.equal(byAction["post_comment"]!.performed, true);
    assert.equal(byAction["request_review"]!.allowed, false);
  });

  it("requests review from CODEOWNERS teams and users at level 4", async () => {
    setDialLevel(OWNER, REPO, 4, "admin");
    const { octokit, calls } = makeOctokit({
      codeowners: CODEOWNERS_MULTI,
      files: ["src/backend/api.ts"],
    });
    await handlePullRequestEvent(makePrPayload() as never, {
      octokit,
      policy: policyFor("dev"),
      log: quiet,
    });

    const review = writeCalls(calls).find((c) =>
      c.route.includes("requested_reviewers"),
    );
    assert.ok(review, "review request should be sent");
    assert.deepEqual(
      [...(review.params["team_reviewers"] as string[])].sort(),
      ["backend-team"],
    );
    assert.deepEqual(review.params["reviewers"], ["octocat"]);

    // No denials → no denial comment; only the routing summary comment
    const comments = writeCalls(calls).filter((c) => c.route.endsWith("/comments"));
    assert.equal(comments.length, 1);
  });

  it("production cap blocks request_review even at level 5", async () => {
    setDialLevel(OWNER, REPO, 5, "admin");
    const { octokit, calls } = makeOctokit({
      codeowners: CODEOWNERS_SINGLE,
      files: ["src/frontend/App.tsx"],
    });
    const result = await handlePullRequestEvent(makePrPayload() as never, {
      octokit,
      policy: policyFor("production"),
      log: quiet,
    });

    assert.equal(
      writeCalls(calls).some((c) => c.route.includes("requested_reviewers")),
      false,
    );
    const review = result.actions!.find((a) => a.action === "request_review");
    assert.ok(review);
    assert.equal(review.allowed, false);
  });

  it("does not request review when routing came from labels", async () => {
    setDialLevel(OWNER, REPO, 4, "admin");
    const { octokit, calls } = makeOctokit({ codeowners: null });
    const result = await handlePullRequestEvent(
      makePrPayload({
        pull_request: {
          number: 7,
          title: "Docs",
          user: { login: "dev-user" },
          head: { ref: "docs/x", sha: "abc123" },
          base: { ref: "main" },
          draft: false,
          labels: [{ name: "docs-review" }],
        },
      }) as never,
      { octokit, policy: policyFor("dev"), log: quiet },
    );

    assert.equal(result.routing?.source, "labels");
    assert.deepEqual(
      result.actions!.map((a) => a.action),
      ["add_label", "post_comment"],
    );
    assert.equal(
      writeCalls(calls).some((c) => c.route.includes("requested_reviewers")),
      false,
    );
  });

  it("falls back to labels when the GitHub read fails", async () => {
    const octokit: OctokitLike = {
      async request() {
        throw new Error("boom");
      },
    };
    const logs: Array<Record<string, unknown>> = [];
    const result = await handlePullRequestEvent(
      makePrPayload({
        pull_request: {
          number: 7,
          title: "Sec",
          user: { login: "dev-user" },
          head: { ref: "fix/x", sha: "abc123" },
          base: { ref: "main" },
          draft: false,
          labels: [{ name: "security-review" }],
        },
      }) as never,
      { octokit, policy: policyFor("dev"), log: (e) => logs.push(e) },
    );

    assert.equal(result.handled, true);
    assert.equal(result.routing?.source, "labels");
    assert.deepEqual(result.routing?.agents, ["@security-scanner"]);
    assert.ok(logs.some((l) => l["msg"] === "codeowners routing failed, falling back to labels"));
  });

  it("a failing write is logged and reported as not performed", async () => {
    setDialLevel(OWNER, REPO, 2, "admin");
    const { octokit } = makeOctokit({
      codeowners: CODEOWNERS_SINGLE,
      files: ["src/frontend/App.tsx"],
      failWrites: true,
    });
    const logs: Array<Record<string, unknown>> = [];
    const result = await handlePullRequestEvent(makePrPayload() as never, {
      octokit,
      policy: policyFor("dev"),
      log: (e) => logs.push(e),
    });

    const label = result.actions!.find((a) => a.action === "add_label");
    assert.ok(label);
    assert.equal(label.allowed, true);
    assert.equal(label.performed, false);
    assert.ok(logs.some((l) => l["msg"] === "action failed"));
  });

  it("uses the cached CODEOWNERS on a second PR event", async () => {
    const { octokit, calls } = makeOctokit({
      codeowners: CODEOWNERS_SINGLE,
      files: ["src/frontend/App.tsx"],
    });
    await handlePullRequestEvent(makePrPayload() as never, {
      octokit,
      policy: policyFor("dev"),
      log: quiet,
    });
    await handlePullRequestEvent(
      makePrPayload({
        pull_request: {
          number: 8,
          title: "Another",
          user: { login: "dev-user" },
          head: { ref: "feature/y", sha: "def456" },
          base: { ref: "main" },
          draft: false,
          labels: [],
        },
      }) as never,
      { octokit, policy: policyFor("dev"), log: quiet },
    );

    const contentCalls = calls.filter((c) => c.route.includes("/contents/"));
    assert.equal(contentCalls.length, 1);
    const fileCalls = calls.filter((c) => c.route.includes("/files"));
    assert.equal(fileCalls.length, 2);
  });
});
