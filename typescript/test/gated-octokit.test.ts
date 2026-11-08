import { readFile } from "node:fs/promises";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Octokit } from "@octokit/rest";
import {
  clearAllDials,
  setDialLevel,
} from "../src/services/autonomy-dial.js";
import {
  ActionGateDeniedError,
  createGatedOctokit,
} from "../src/services/gated-octokit.js";
import { loadRuntimePolicy } from "../src/config/runtime.js";
import { clearRepositoryConfigCache } from "../src/services/repo-config.js";
import type { RepositoryConfigClient } from "../src/types/repo-config.js";

type Params = Record<string, unknown>;

interface MockOctokit {
  actions: Record<string, (params: Params) => Promise<void>>;
  checks: Record<string, (params: Params) => Promise<void>>;
  issues: Record<string, (params: Params) => Promise<void>>;
  pulls: Record<string, (params: Params) => Promise<void>>;
  repos: Record<string, (params: Params) => Promise<unknown>>;
  git: Record<string, (params: Params) => Promise<void>>;
  request: (...args: unknown[]) => Promise<void>;
  graphql: (...args: unknown[]) => Promise<void>;
}

function makeOctokit(): { client: MockOctokit; calls: string[] } {
  const calls: string[] = [];
  const method = (name: string) => async (_params: Params): Promise<void> => {
    calls.push(name);
  };
  return {
    client: {
      actions: {
        downloadJobLogsForWorkflowRun: method("actions.downloadJobLogsForWorkflowRun"),
        downloadWorkflowRunLogs: method("actions.downloadWorkflowRunLogs"),
        getWorkflowRun: method("actions.getWorkflowRun"),
        listJobsForWorkflowRun: method("actions.listJobsForWorkflowRun"),
        listRepoWorkflows: method("actions.listRepoWorkflows"),
        listWorkflowRuns: method("actions.listWorkflowRuns"),
      },
      checks: {
        listForRef: method("checks.listForRef"),
      },
      issues: {
        get: method("issues.get"),
        listForRepo: method("issues.listForRepo"),
        create: method("issues.create"),
        createComment: method("issues.createComment"),
        updateComment: method("issues.updateComment"),
        addLabels: method("issues.addLabels"),
        removeLabel: method("issues.removeLabel"),
        update: method("issues.update"),
      },
      pulls: {
        get: method("pulls.get"),
        list: method("pulls.list"),
        listFiles: method("pulls.listFiles"),
        create: method("pulls.create"),
        createReview: method("pulls.createReview"),
      },
      repos: {
        get: async () => {
          calls.push("repo-config:metadata");
          return { data: { default_branch: "main" } };
        },
        getCommit: method("repos.getCommit"),
        getContent: async (params: Params) => {
          if (params["path"] === "agentcraftworks.config.yml") {
            calls.push("repo-config:content");
            return {
              data: {
                type: "file",
                encoding: "base64",
                content: Buffer.from(
                  'version: "1"\nagents:\n  ceiling: 5\n',
                  "utf8",
                ).toString("base64"),
              },
              headers: { etag: '"test-config"' },
            };
          }
          calls.push("repos.getContent");
          return undefined;
        },
        getLatestRelease: method("repos.getLatestRelease"),
        listCommits: method("repos.listCommits"),
        createOrUpdateFileContents: method("repos.createOrUpdateFileContents"),
      },
      git: {
        getRef: method("git.getRef"),
        getTree: method("git.getTree"),
        createRef: method("git.createRef"),
      },
      request: async () => {
        calls.push("request");
      },
      graphql: async () => {
        calls.push("graphql");
      },
    },
    calls,
  };
}

const policy = loadRuntimePolicy(
  {
    GH_CE_ENVIRONMENT: "local",
    GH_CE_REPO_CEILINGS: "owner/repo=5",
  },
  () => {},
);

beforeEach(() => {
  clearAllDials();
  clearRepositoryConfigCache();
});

describe("createGatedOctokit", () => {
  it("denies writes from every C-10a job before reaching Octokit", async () => {
    const jobs: Array<{
      name: string;
      invoke: (client: MockOctokit) => Promise<void>;
    }> = [
      {
        name: "ci-coach",
        invoke: (client) => client.issues.createComment({}),
      },
      {
        name: "workflow-health-manager",
        invoke: (client) => client.issues.create({}),
      },
      {
        name: "daily-test-improver",
        invoke: (client) => client.issues.create({}),
      },
      {
        name: "issue-triage",
        invoke: (client) => client.issues.addLabels({}),
      },
      {
        name: "cli-consistency-checker",
        invoke: (client) => client.issues.createComment({}),
      },
      {
        name: "pr-fix",
        invoke: (client) => client.issues.createComment({}),
      },
      {
        name: "ci-doctor",
        invoke: (client) => client.issues.create({}),
      },
    ];

    for (const job of jobs) {
      const { client, calls } = makeOctokit();
      const gated = createGatedOctokit(client, {
        owner: "owner",
        repo: "repo",
        job: job.name,
        policy,
      });

      await assert.rejects(
        async () => job.invoke(gated),
        ActionGateDeniedError,
      );
      assert.deepEqual(
        calls.filter((call) => !call.startsWith("repo-config:")),
        [],
        `${job.name} must not send a mutation to Octokit`,
      );
    }
  });

  it("denies all mapped write methods before calling the underlying client", async () => {
    const { client, calls } = makeOctokit();
    const gated = createGatedOctokit(client, {
      owner: "owner",
      repo: "repo",
      job: "mapping-test",
      policy,
    });
    const writes: Array<{
      action: string;
      tier: string;
      invoke: () => Promise<void>;
    }> = [
      {
        action: "post_comment",
        tier: "T2",
        invoke: () => gated.issues.createComment({}),
      },
      {
        action: "update_comment",
        tier: "T2",
        invoke: () => gated.issues.updateComment({}),
      },
      {
        action: "add_label",
        tier: "T2",
        invoke: () => gated.issues.addLabels({}),
      },
      {
        action: "remove_label",
        tier: "T2",
        invoke: () => gated.issues.removeLabel({}),
      },
      {
        action: "close_issue",
        tier: "T4",
        invoke: () => gated.issues.update({ state: "closed" }),
      },
      {
        action: "reopen_issue",
        tier: "T4",
        invoke: () => gated.issues.update({ state: "open" }),
      },
      {
        action: "create_issue",
        tier: "T3",
        invoke: () => gated.issues.create({}),
      },
      {
        action: "create_draft_pr",
        tier: "T3",
        invoke: () => gated.pulls.create({ draft: true }),
      },
      {
        action: "create_pr",
        tier: "T4",
        invoke: () => gated.pulls.create({ draft: false }),
      },
      {
        action: "approve_pr",
        tier: "T4",
        invoke: () => gated.pulls.createReview({ event: "APPROVE" }),
      },
      {
        action: "request_changes",
        tier: "T3",
        invoke: () => gated.pulls.createReview({ event: "REQUEST_CHANGES" }),
      },
      {
        action: "post_review_comment",
        tier: "T2",
        invoke: () => gated.pulls.createReview({ event: "COMMENT" }),
      },
      {
        action: "create_file",
        tier: "T3",
        invoke: () => gated.repos.createOrUpdateFileContents({ branch: "agent/test" }),
      },
      {
        action: "create_branch",
        tier: "T3",
        invoke: () => gated.git.createRef({ ref: "refs/heads/agent/test" }),
      },
    ];

    for (const write of writes) {
      await assert.rejects(
        async () => write.invoke(),
        (error: unknown) =>
          error instanceof ActionGateDeniedError &&
          error.decision.action === write.action &&
          error.decision.tier === write.tier,
      );
    }
    assert.deepEqual(
      calls.filter((call) => !call.startsWith("repo-config:")),
      [],
    );
  });

  it("fails closed for unknown endpoint methods and raw requests", async () => {
    const { client, calls } = makeOctokit();
    client.issues["delete"] = async () => {
      calls.push("issues.delete");
    };
    const gated = createGatedOctokit(client, {
      owner: "owner",
      repo: "repo",
      job: "unknown-action-test",
      policy,
    });

    await assert.rejects(
      async () => gated.issues["delete"]({}),
      (error: unknown) =>
        error instanceof ActionGateDeniedError &&
        error.decision.code === "UNKNOWN_ACTION",
    );
    await assert.rejects(
      async () => gated.request("POST", "/repos/owner/repo"),
      ActionGateDeniedError,
    );
    await assert.rejects(
      async () => gated.graphql("mutation { ... }"),
      ActionGateDeniedError,
    );
    assert.deepEqual(calls, []);
  });

  it("allows only explicitly classified read methods without gate elevation", async () => {
    const { client, calls } = makeOctokit();
    const gated = createGatedOctokit(client, {
      owner: "owner",
      repo: "repo",
      job: "read-only-test",
      policy,
    });

    await gated.actions.getWorkflowRun({});
    await gated.checks.listForRef({});
    await gated.issues.listForRepo({});
    await gated.pulls.listFiles({});
    await gated.repos.getContent({});
    await gated.git.getRef({});

    assert.deepEqual(calls, [
      "actions.getWorkflowRun",
      "checks.listForRef",
      "issues.listForRepo",
      "pulls.listFiles",
      "repos.getContent",
      "git.getRef",
    ]);
  });

  it("blocks an actual Octokit mutation before a request is sent", async () => {
    const repositoryConfigClient: RepositoryConfigClient = {
      repos: {
        async get() {
          return { data: { default_branch: "main" } };
        },
        async getContent() {
          return {
            data: {
              type: "file",
              encoding: "base64",
              content: Buffer.from('version: "1"\n', "utf8").toString("base64"),
            },
            headers: {},
          };
        },
      },
    };
    const gated = createGatedOctokit(new Octokit(), {
      owner: "owner",
      repo: "repo",
      job: "real-octokit-test",
      policy,
      log: () => {},
      repositoryConfigClient,
    });

    await assert.rejects(
      async () =>
        gated.issues.create({
          owner: "owner",
          repo: "repo",
          title: "must not send",
        }),
      ActionGateDeniedError,
    );
  });

  it("allows an agent-branch proposal when the configured policy permits it", async () => {
    setDialLevel("owner", "repo", 5, "admin");
    const { client, calls } = makeOctokit();
    const gated = createGatedOctokit(client, {
      owner: "owner",
      repo: "repo",
      job: "proposal-test",
      policy,
    });

    await gated.git.createRef({ ref: "refs/heads/agent/update" });
    await gated.repos.createOrUpdateFileContents({ branch: "agent/update" });
    await gated.pulls.create({ draft: true });

    assert.deepEqual(calls.filter((call) => !call.startsWith("repo-config:")), [
      "git.createRef",
      "repos.createOrUpdateFileContents",
      "pulls.create",
    ]);
  });

  it("wires every write-capable GH-AW job through the gated Octokit", async () => {
    const jobs = [
      {
        source: "ci-coach.ts",
        workflow: "ghaw-ci-coach.yml",
        tier: "T2",
      },
      {
        source: "workflow-health-manager.ts",
        workflow: "ghaw-workflow-health.yml",
        tier: "T3",
      },
      {
        source: "daily-test-improver.ts",
        workflow: "ghaw-daily-test-improver.yml",
        tier: "T3",
      },
      {
        source: "issue-triage.ts",
        workflow: "ghaw-issue-triage.yml",
        tier: "T2",
      },
      {
        source: "cli-consistency-checker.ts",
        workflow: "ghaw-cli-consistency.yml",
        tier: "T2",
      },
      {
        source: "pr-fix.ts",
        workflow: "ghaw-pr-fix.yml",
        tier: "T2",
      },
      {
        source: "ci-doctor.ts",
        workflow: "ghaw-ci-doctor.yml",
        tier: "T3",
      },
      {
        source: "plan-command.ts",
        workflow: "ghaw-plan.yml",
        tier: "T3",
      },
      {
        source: "sub-issue-closer.ts",
        workflow: "ghaw-sub-issue-closer.yml",
        tier: "T4",
      },
      {
        source: "daily-doc-updater.ts",
        workflow: "ghaw-daily-doc-updater.yml",
        tier: "T3",
        createsDraftPr: true,
      },
      {
        source: "link-checker.ts",
        workflow: "ghaw-link-checker.yml",
        tier: "T3",
        createsDraftPr: true,
      },
      {
        source: "code-simplifier.ts",
        workflow: "ghaw-code-simplifier.yml",
        tier: "T3",
        createsDraftPr: true,
      },
      {
        source: "grumpy-reviewer.ts",
        workflow: "ghaw-grumpy-reviewer.yml",
        tier: "T4",
      },
    ];

    for (const job of jobs) {
      const source = await readFile(
        new URL(`../src/jobs/${job.source}`, import.meta.url),
        "utf8",
      );
      assert.match(
        source,
        /createGatedOctokit/,
        `${job.source} must use the gate`,
      );
      assert.match(
        source,
        new RegExp(`Engagement Level: ${job.tier}`),
        `${job.source} must declare the correct tier`,
      );
      if (job.source === "grumpy-reviewer.ts") {
        assert.match(
          source,
          /selectGrumpyReviewEvent\(inspectedFiles,\s*errors,\s*total\)/,
          "Grumpy Reviewer must base its review event on inspected files",
        );
      }
      if ("createsDraftPr" in job) {
        assert.match(
          source,
          /branchName = `agent\//,
          `${job.source} must create its branch under agent/*`,
        );
        assert.match(
          source,
          /draft:\s*true/,
          `${job.source} must create draft pull requests`,
        );
      }
      const workflow = await readFile(
        new URL(`../../.github/workflows/${job.workflow}`, import.meta.url),
        "utf8",
      );
      assert.match(
        workflow,
        new RegExp(`Engagement Level: ${job.tier}`),
        `${job.workflow} must declare the correct tier`,
      );
    }

    const changeset = await readFile(
      new URL("../src/jobs/changeset.ts", import.meta.url),
      "utf8",
    );
    assert.match(changeset, /Engagement Level: T1/);
    assert.doesNotMatch(
      changeset,
      /octokit\.(?:issues\.(?:create|createComment|update)|pulls\.create|git\.createRef|repos\.createOrUpdateFileContents)\(/,
      "changeset.ts is read-only and currently has no mutation to gate",
    );
    const changesetWorkflow = await readFile(
      new URL("../../.github/workflows/ghaw-changeset.yml", import.meta.url),
      "utf8",
    );
    assert.match(changesetWorkflow, /Engagement Level: T1/);
  });
});
