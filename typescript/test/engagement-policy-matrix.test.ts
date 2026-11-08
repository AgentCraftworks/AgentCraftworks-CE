import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { loadRuntimePolicy } from "../src/config/runtime.js";
import { actionGate } from "../src/services/action-gate.js";
import {
  clearAllDials,
  getEffectiveBounds,
  getEffectiveLevel,
  setDialLevel,
} from "../src/services/autonomy-dial.js";

const OWNER = "owner";
const REPO = "repo";

function policyFor(
  options: {
    environmentCeiling?: number;
    globalCeiling?: number;
    repoCeiling?: number;
    paused?: boolean;
    operatorProtectedActions?: string;
  } = {},
) {
  const env: Record<string, string> = {
    GH_CE_ENVIRONMENT: "local",
  };
  if (options.environmentCeiling !== undefined) {
    env["GH_CE_ENV_MAX_LEVELS"] = `local=${options.environmentCeiling}`;
  }
  if (options.globalCeiling !== undefined) {
    env["GH_CE_MAX_LEVEL"] = `${options.globalCeiling}`;
  }
  if (options.repoCeiling !== undefined) {
    env["GH_CE_REPO_CEILINGS"] = `${OWNER}/${REPO}=${options.repoCeiling}`;
  }
  if (options.paused !== undefined) {
    env["GH_CE_AGENTS_PAUSED"] = `${options.paused}`;
  }
  if (options.operatorProtectedActions !== undefined) {
    env["GH_CE_ALLOW_PROTECTED_ACTIONS"] =
      options.operatorProtectedActions;
  }
  return loadRuntimePolicy(env, () => {});
}

describe("engagement policy matrix", () => {
  beforeEach(() => {
    clearAllDials();
  });

  const cases = [
    {
      name: "allows a T1 read at the default level",
      dialLevel: 1,
      action: "view_file",
      allowed: true,
    },
    {
      name: "denies T2 when the dial is T1",
      dialLevel: 1,
      action: "post_comment",
      allowed: false,
    },
    {
      name: "allows a T3 proposal on an agent branch",
      dialLevel: 3,
      action: "edit_file",
      branchName: "agent/fix",
      allowed: true,
    },
    {
      name: "applies the environment ceiling to T4",
      dialLevel: 5,
      action: "close_issue",
      policy: { environmentCeiling: 3, repoCeiling: 5 },
      allowed: false,
    },
    {
      name: "applies the global ceiling to T5",
      dialLevel: 5,
      action: "merge_pr",
      policy: { globalCeiling: 4, repoCeiling: 5 },
      allowed: false,
    },
    {
      name: "applies the repository ceiling to T4",
      dialLevel: 5,
      action: "close_issue",
      policy: { repoCeiling: 3 },
      allowed: false,
    },
    {
      name: "pause permits T1 reads",
      dialLevel: 5,
      action: "view_file",
      policy: { paused: true },
      allowed: true,
    },
    {
      name: "pause denies T2 writes",
      dialLevel: 5,
      action: "post_comment",
      policy: { paused: true },
      allowed: false,
    },
    {
      name: "denies protected actions without both allow-lists",
      dialLevel: 5,
      action: "force_push",
      allowed: false,
    },
    {
      name: "allows a protected action only with both allow-lists",
      dialLevel: 5,
      action: "force_push",
      policy: {
        operatorProtectedActions: "force_push",
        repoCeiling: 5,
      },
      repoProtectedActions: ["force_push"],
      allowed: true,
    },
    {
      name: "denies unknown actions",
      dialLevel: 5,
      action: "unknown_action",
      allowed: false,
      code: "UNKNOWN_ACTION",
    },
  ] as const;

  for (const testCase of cases) {
    it(testCase.name, () => {
      setDialLevel(OWNER, REPO, testCase.dialLevel, "test");
      const decision = actionGate.check(
        {
          owner: OWNER,
          repo: REPO,
          action: testCase.action,
          ...(testCase.branchName ? { branchName: testCase.branchName } : {}),
          ...("repoProtectedActions" in testCase
            ? { repoProtectedActions: testCase.repoProtectedActions }
            : {}),
        },
        policyFor("policy" in testCase ? testCase.policy : {}),
        { consumeBudget: false, audit: () => {} },
      );

      assert.equal(decision.allowed, testCase.allowed);
      if ("code" in testCase) assert.equal(decision.code, testCase.code);
    });
  }

  it("never exceeds the minimum of the dial and configured bounds", () => {
    const levels = [1, 2, 3, 4, 5] as const;
    for (const dialLevel of levels) {
      for (const environmentCeiling of levels) {
        for (const globalCeiling of levels) {
          for (const repoCeiling of levels) {
            for (const paused of [false, true]) {
              const policy = policyFor({
                environmentCeiling,
                globalCeiling,
                repoCeiling,
                paused,
              });
              setDialLevel(OWNER, REPO, dialLevel, "test");
              const bounds = getEffectiveBounds(OWNER, REPO, policy);
              const effectiveLevel = getEffectiveLevel(OWNER, REPO, policy);
              const maximum = Math.min(
                dialLevel,
                bounds.repoCeiling,
                bounds.environmentCeiling,
                bounds.globalCeiling,
                bounds.agentsPaused ? 1 : 5,
              );

              assert.equal(effectiveLevel, maximum);
              assert.ok(effectiveLevel <= dialLevel);
              assert.ok(effectiveLevel <= bounds.repoCeiling);
              assert.ok(effectiveLevel <= bounds.environmentCeiling);
              assert.ok(effectiveLevel <= bounds.globalCeiling);
            }
          }
        }
      }
    }
  });
});
