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

type Params = Record<string, unknown>;

interface MockOctokit {
  issues: Record<string, (params: Params) => Promise<void>>;
  pulls: Record<string, (params: Params) => Promise<void>>;
  repos: Record<string, (params: Params) => Promise<void>>;
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
      issues: {
        create: method("issues.create"),
        createComment: method("issues.createComment"),
        updateComment: method("issues.updateComment"),
        addLabels: method("issues.addLabels"),
        removeLabel: method("issues.removeLabel"),
        update: method("issues.update"),
      },
      pulls: {
        create: method("pulls.create"),
        createReview: method("pulls.createReview"),
      },
      repos: {
        createOrUpdateFileContents: method("repos.createOrUpdateFileContents"),
      },
      git: {
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

beforeEach(() => clearAllDials());

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
      assert.deepEqual(calls, [], `${job.name} must not reach Octokit`);
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
    const writes: Array<() => Promise<void>> = [
      () => gated.issues.createComment({}),
      () => gated.issues.updateComment({}),
      () => gated.issues.addLabels({}),
      () => gated.issues.removeLabel({}),
      () => gated.issues.update({ state: "closed" }),
      () => gated.issues.update({ state: "open" }),
      () => gated.issues.create({}),
      () => gated.pulls.create({ draft: true }),
      () => gated.pulls.create({ draft: false }),
      () => gated.pulls.createReview({ event: "APPROVE" }),
      () => gated.pulls.createReview({ event: "REQUEST_CHANGES" }),
      () => gated.repos.createOrUpdateFileContents({ branch: "agent/test" }),
      () => gated.git.createRef({ ref: "refs/heads/agent/test" }),
    ];

    for (const write of writes) {
      await assert.rejects(async () => write(), ActionGateDeniedError);
    }
    assert.deepEqual(calls, []);
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

  it("blocks an actual Octokit mutation before a request is sent", async () => {
    const gated = createGatedOctokit(new Octokit(), {
      owner: "owner",
      repo: "repo",
      job: "real-octokit-test",
      policy,
      log: () => {},
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

    assert.deepEqual(calls, [
      "git.createRef",
      "repos.createOrUpdateFileContents",
      "pulls.create",
    ]);
  });

  it("wires every C-10a GH-AW job through the gated Octokit", async () => {
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
  });
});
