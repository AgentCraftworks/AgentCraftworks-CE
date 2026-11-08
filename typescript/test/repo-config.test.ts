import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  clearRepositoryConfigCache,
  getRepositoryConfig,
  invalidateRepositoryConfig,
  parseRepositoryConfig,
  repositoryConfigCacheTtlMs,
} from "../src/services/repo-config.js";
import type { RepositoryConfigClient } from "../src/types/repo-config.js";
import {
  clearAuditEvents,
  listAuditEvents,
} from "../src/services/audit-log.js";

function encodedConfig(source: string): unknown {
  return {
    type: "file",
    encoding: "base64",
    content: Buffer.from(source, "utf8").toString("base64"),
  };
}

function createClient(options: {
  defaultBranch?: string;
  content?: unknown;
  etag?: string;
  status?: number;
  contentError?: unknown;
} = {}): RepositoryConfigClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    repos: {
      async get() {
        calls.push("repo");
        return {
          data: { default_branch: options.defaultBranch ?? "main" },
        };
      },
      async getContent(parameters) {
        calls.push(
          `content:${parameters.ref}:${parameters.headers?.["If-None-Match"] ?? ""}`,
        );
        if (options.contentError) throw options.contentError;
        return {
          data:
            options.content ??
            encodedConfig('version: "1"\nagents:\n  ceiling: 4\n'),
          headers: options.etag ? { etag: options.etag } : {},
          status: options.status,
        };
      },
    },
  };
}

describe("repository configuration", () => {
  beforeEach(() => {
    clearRepositoryConfigCache();
    clearAuditEvents();
  });

  it("uses the default repository ceiling when agents.ceiling is absent", () => {
    const config = parseRepositoryConfig('version: "1"\nagents: {}\n');
    assert.equal(config.agents.ceiling, 3);
    assert.deepEqual(config.agents.protectedActions, []);
    assert.deepEqual(config.agents.budgets, {});
  });

  it("parses protected actions and per-tier hourly budgets", () => {
    const config = parseRepositoryConfig(
      [
        'version: "1"',
        "agents:",
        "  ceiling: 5",
        "  protected_actions: [force_push, modify_ci]",
        "  budgets:",
        "    T4: 20/h",
        "    T5: 2/h",
      ].join("\n"),
    );
    assert.equal(config.agents.ceiling, 5);
    assert.deepEqual(config.agents.protectedActions, [
      "force_push",
      "modify_ci",
    ]);
    assert.deepEqual(config.agents.budgets, { T4: 20, T5: 2 });
  });

  it("warns for unknown keys without discarding supported policy", () => {
    const warnings: string[] = [];
    const config = parseRepositoryConfig(
      'version: "1"\nextra: true\nagents:\n  ceiling: 4\n  custom: yes\n',
      (message) => warnings.push(message),
    );
    assert.equal(config.agents.ceiling, 4);
    assert.equal(warnings.length, 2);
  });

  it("rejects invalid schema values and duplicate YAML keys", () => {
    assert.throws(() =>
      parseRepositoryConfig('version: "1"\nagents:\n  ceiling: 6\n'),
    );
    assert.throws(() =>
      parseRepositoryConfig('version: "1"\nversion: "1"\n'),
    );
    assert.throws(() =>
      parseRepositoryConfig(
        'version: "1"\nagents:\n  protected_actions: [unknown_action]\n',
      ),
    );
  });

  it("reads only from the repository default branch and caches for at most 60 seconds", async () => {
    const client = createClient({
      defaultBranch: "trunk",
      etag: '"config-v1"',
    });
    const first = await getRepositoryConfig(client, "Owner", "Repo", {
      now: 100,
    });
    const cached = await getRepositoryConfig(client, "owner", "repo", {
      now: 60_099,
    });
    assert.equal(first.defaultBranch, "trunk");
    assert.equal(first.etag, '"config-v1"');
    assert.equal(cached.agents.ceiling, 4);
    assert.deepEqual(client.calls, ["repo", "content:trunk:"]);
    assert.ok(repositoryConfigCacheTtlMs <= 60_000);
  });

  it("uses ETags after expiry and refreshes the cached policy on not-modified", async () => {
    const firstClient = createClient({ etag: '"config-v1"' });
    await getRepositoryConfig(firstClient, "owner", "repo", { now: 0 });

    const notModifiedClient = createClient({
      contentError: { status: 304 },
    });
    const refreshed = await getRepositoryConfig(
      notModifiedClient,
      "owner",
      "repo",
      { now: 60_000 },
    );
    assert.equal(refreshed.agents.ceiling, 4);
    assert.deepEqual(notModifiedClient.calls, [
      "repo",
      'content:main:"config-v1"',
    ]);
  });

  it("defaults to level 3 when the config file is absent", async () => {
    const config = await getRepositoryConfig(
      createClient({ contentError: { status: 404 } }),
      "owner",
      "repo",
    );
    assert.equal(config.agents.ceiling, 3);
  });

  it("invalidates cached policy when a default-branch push is observed", async () => {
    const firstClient = createClient();
    await getRepositoryConfig(firstClient, "owner", "repo", { now: 0 });
    invalidateRepositoryConfig("owner", "repo");

    const secondClient = createClient({
      content: encodedConfig('version: "1"\nagents:\n  ceiling: 2\n'),
    });
    const refreshed = await getRepositoryConfig(
      secondClient,
      "owner",
      "repo",
      { now: 1 },
    );
    assert.equal(refreshed.agents.ceiling, 2);
    assert.deepEqual(secondClient.calls, ["repo", "content:main:"]);
  });

  it("audits an observed repository ceiling change", async () => {
    await getRepositoryConfig(
      createClient({
        content: encodedConfig('version: "1"\nagents:\n  ceiling: 3\n'),
      }),
      "owner",
      "repo",
      { now: 0 },
    );
    await getRepositoryConfig(
      createClient({
        content: encodedConfig('version: "1"\nagents:\n  ceiling: 4\n'),
      }),
      "owner",
      "repo",
      { now: 60_000 },
    );

    const event = listAuditEvents("owner/repo").find(
      (entry) => entry.event === "ceiling.changed",
    );
    assert.ok(event);
    assert.equal(event.actor, "operator");
    assert.deepEqual(event.details, {
      previousCeiling: 3,
      newCeiling: 4,
    });
  });
});
