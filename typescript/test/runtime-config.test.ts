import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REPO_CEILING,
  loadRuntimePolicy,
  resolveEnvironmentTier,
  summarizeRuntimePolicy,
} from "../src/config/runtime.js";

describe("resolveEnvironmentTier", () => {
  it("defaults an unset environment to production and warns", () => {
    const warnings: string[] = [];
    const environment = resolveEnvironmentTier({}, (message) =>
      warnings.push(message),
    );
    assert.equal(environment, "production");
    assert.match(warnings[0] ?? "", /defaulting to production/);
  });

  it("accepts configured environments case-insensitively", () => {
    assert.equal(resolveEnvironmentTier({ GH_CE_ENVIRONMENT: "Staging" }), "staging");
  });

  it("rejects unknown environments rather than falling back", () => {
    assert.throws(
      () => resolveEnvironmentTier({ GH_CE_ENVIRONMENT: "preview" }, () => {}),
      /Invalid GH_CE_ENVIRONMENT/,
    );
  });
});

describe("loadRuntimePolicy", () => {
  it("applies safe defaults and summarizes only policy bounds", () => {
    const policy = loadRuntimePolicy(
      { GH_CE_ENVIRONMENT: "production" },
      () => {},
    );
    assert.equal(policy.environmentMaxLevels.production, 3);
    assert.equal(policy.globalMaxLevel, 5);
    assert.equal(policy.agentsPaused, false);
    assert.deepEqual(policy.actionBudgets, { T4: 30, T5: 5 });
    assert.equal(DEFAULT_REPO_CEILING, 3);
    assert.deepEqual(summarizeRuntimePolicy(policy), {
      environment: "production",
      environmentCeiling: 3,
      globalCeiling: 5,
      defaultRepositoryCeiling: 3,
      agentsPaused: false,
      actionBudgets: { T4: 30, T5: 5 },
    });
  });

  it("supports operator ceilings and interim per-repository ceilings", () => {
    const policy = loadRuntimePolicy(
      {
        GH_CE_ENVIRONMENT: "production",
        GH_CE_ENV_MAX_LEVELS: "production=5,staging=5",
        GH_CE_MAX_LEVEL: "4",
        GH_CE_REPO_CEILINGS: "owner/repo=5",
        GH_CE_ACTION_BUDGETS: "T4=20/h,T5=3/h",
      },
      () => {},
    );
    assert.equal(policy.environmentMaxLevels.production, 5);
    assert.equal(policy.environmentMaxLevels.staging, 5);
    assert.equal(policy.globalMaxLevel, 4);
    assert.equal(policy.repoCeilings.get("owner/repo"), 5);
    assert.deepEqual(policy.actionBudgets, { T4: 20, T5: 3 });
  });

  it("rejects invalid limits, duplicate environment entries, and invalid pause values", () => {
    assert.throws(
      () =>
        loadRuntimePolicy(
          {
            GH_CE_ENVIRONMENT: "local",
            GH_CE_MAX_LEVEL: "6",
          },
          () => {},
        ),
      /GH_CE_MAX_LEVEL must be an integer between 1 and 5/,
    );
    assert.throws(
      () =>
        loadRuntimePolicy(
          {
            GH_CE_ENVIRONMENT: "local",
            GH_CE_ENV_MAX_LEVELS: "local=4,local=5",
          },
          () => {},
        ),
      /Duplicate environment/,
    );
    assert.throws(
      () =>
        loadRuntimePolicy(
          {
            GH_CE_ENVIRONMENT: "local",
            GH_CE_AGENTS_PAUSED: "yes",
          },
          () => {},
        ),
      /GH_CE_AGENTS_PAUSED must be true or false/,
    );
    assert.throws(
      () =>
        loadRuntimePolicy(
          {
            GH_CE_ENVIRONMENT: "local",
            GH_CE_ALLOW_PROTECTED_ACTIONS: "unknown_action",
          },
          () => {},
        ),
      /Invalid GH_CE_ALLOW_PROTECTED_ACTIONS/,
    );
    assert.throws(
      () =>
        loadRuntimePolicy(
          {
            GH_CE_ENVIRONMENT: "local",
            GH_CE_ACTION_BUDGETS: "T4=0/h",
          },
          () => {},
        ),
      /positive integer/,
    );
    assert.throws(
      () =>
        loadRuntimePolicy(
          {
            GH_CE_ENVIRONMENT: "local",
            GH_CE_ACTION_BUDGETS: "T4=10/h,T4=20/h",
          },
          () => {},
        ),
      /Duplicate T4/,
    );
  });
});
