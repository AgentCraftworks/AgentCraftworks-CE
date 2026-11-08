import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import type { Request, Response } from "express";
import { webhookHandler } from "../src/handlers/pull-request.js";
import {
  clearRepositoryConfigCache,
  getRepositoryConfig,
} from "../src/services/repo-config.js";
import type { RepositoryConfigClient } from "../src/types/repo-config.js";

function configClient(ceiling: number): RepositoryConfigClient {
  return {
    repos: {
      async get() {
        return { data: { default_branch: "main" } };
      },
      async getContent() {
        return {
          data: {
            type: "file",
            encoding: "base64",
            content: Buffer.from(
              `version: "1"\nagents:\n  ceiling: ${ceiling}\n`,
              "utf8",
            ).toString("base64"),
          },
          headers: { etag: `"config-${ceiling}"` },
        };
      },
    },
  };
}

describe("repository policy push invalidation", () => {
  beforeEach(clearRepositoryConfigCache);

  it("invalidates policy only for a push to the default branch", async () => {
    const initial = await getRepositoryConfig(
      configClient(4),
      "owner",
      "repo",
    );
    assert.equal(initial.agents.ceiling, 4);

    let responseBody: Record<string, unknown> = {};
    let responseStatus = 0;
    const req = {
      headers: { "x-github-event": "push" },
      body: {
        ref: "refs/heads/main",
        repository: {
          full_name: "owner/repo",
          default_branch: "main",
        },
      },
    } as unknown as Request;
    const res = {
      status(status: number) {
        responseStatus = status;
        return this;
      },
      json(body: Record<string, unknown>) {
        responseBody = body;
        return this;
      },
    } as unknown as Response;

    await webhookHandler(req, res);
    assert.equal(responseStatus, 200);
    assert.equal(responseBody["configInvalidated"], true);

    const refreshed = await getRepositoryConfig(
      configClient(2),
      "owner",
      "repo",
    );
    assert.equal(refreshed.agents.ceiling, 2);
  });

  it("does not invalidate policy for a non-default branch push", async () => {
    const initial = await getRepositoryConfig(
      configClient(4),
      "owner",
      "repo",
    );

    let responseBody: Record<string, unknown> = {};
    const req = {
      headers: { "x-github-event": "push" },
      body: {
        ref: "refs/heads/feature",
        repository: {
          full_name: "owner/repo",
          default_branch: "main",
        },
      },
    } as unknown as Request;
    const res = {
      status() {
        return this;
      },
      json(body: Record<string, unknown>) {
        responseBody = body;
        return this;
      },
    } as unknown as Response;

    await webhookHandler(req, res);
    assert.equal(responseBody["configInvalidated"], false);
    const cached = await getRepositoryConfig(
      configClient(2),
      "owner",
      "repo",
    );
    assert.equal(cached.agents.ceiling, initial.agents.ceiling);
  });
});
