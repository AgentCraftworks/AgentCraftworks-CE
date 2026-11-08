import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadRuntimePolicy } from "../src/config/runtime.js";
import { clearAllDials, setDialLevel } from "../src/services/autonomy-dial.js";
import { actionGate } from "../src/services/action-gate.js";
import { PROTECTED_ACTIONS } from "../src/config/protected-actions.js";

describe("actionGate", () => {
  beforeEach(() => {
    clearAllDials();
  });

  it("denies unknown actions with UNKNOWN_ACTION at every level", () => {
    setDialLevel("owner", "repo", 5, "admin");
    const policy = loadRuntimePolicy(
      {
        GH_CE_ENVIRONMENT: "local",
        GH_CE_REPO_CEILINGS: "owner/repo=5",
      },
      () => {},
    );
    const decision = actionGate.check(
      { owner: "owner", repo: "repo", action: "unknown_write" },
      policy,
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, "UNKNOWN_ACTION");
  });

  it("denies protected actions unless both allow-lists include them", () => {
    setDialLevel("owner", "repo", 5, "admin");
    const operatorOnly = loadRuntimePolicy(
      {
        GH_CE_ENVIRONMENT: "local",
        GH_CE_REPO_CEILINGS: "owner/repo=5",
        GH_CE_ALLOW_PROTECTED_ACTIONS: "force_push",
      },
      () => {},
    );

    const decision = actionGate.check(
      {
        owner: "owner",
        repo: "repo",
        action: "force_push",
        repoProtectedActions: [],
      },
      operatorOnly,
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, "PROTECTED_ACTION_DENIED");
  });

  it("denies every protected action by default, even at level 5", () => {
    setDialLevel("owner", "repo", 5, "admin");
    const policy = loadRuntimePolicy(
      {
        GH_CE_ENVIRONMENT: "local",
        GH_CE_REPO_CEILINGS: "owner/repo=5",
      },
      () => {},
    );

    for (const action of PROTECTED_ACTIONS) {
      const decision = actionGate.check(
        { owner: "owner", repo: "repo", action },
        policy,
      );
      assert.equal(decision.allowed, false, `${action} must be denied`);
      assert.equal(decision.code, "PROTECTED_ACTION_DENIED");
    }
  });

  it("allows a protected action only when both allow-lists include it", () => {
    setDialLevel("owner", "repo", 5, "admin");
    const policy = loadRuntimePolicy(
      {
        GH_CE_ENVIRONMENT: "local",
        GH_CE_REPO_CEILINGS: "owner/repo=5",
        GH_CE_ALLOW_PROTECTED_ACTIONS: "force_push",
      },
      () => {},
    );

    const decision = actionGate.check(
      {
        owner: "owner",
        repo: "repo",
        action: "force_push",
        repoProtectedActions: ["force_push"],
      },
      policy,
    );
    assert.equal(decision.allowed, true);
  });

  it("requires file and branch proposals to target an agent branch", () => {
    setDialLevel("owner", "repo", 5, "admin");
    const policy = loadRuntimePolicy(
      {
        GH_CE_ENVIRONMENT: "local",
        GH_CE_REPO_CEILINGS: "owner/repo=5",
      },
      () => {},
    );
    const blocked = actionGate.check(
      { owner: "owner", repo: "repo", action: "edit_file", branchName: "main" },
      policy,
    );
    const allowed = actionGate.check(
      {
        owner: "owner",
        repo: "repo",
        action: "edit_file",
        branchName: "agent/fix",
      },
      policy,
    );
    assert.equal(blocked.code, "AGENT_BRANCH_REQUIRED");
    assert.equal(allowed.allowed, true);
  });
});
