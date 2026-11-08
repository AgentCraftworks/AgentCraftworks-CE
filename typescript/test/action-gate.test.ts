import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadRuntimePolicy } from "../src/config/runtime.js";
import { clearAllDials, setDialLevel } from "../src/services/autonomy-dial.js";
import { actionGate } from "../src/services/action-gate.js";
import { clearActionBudgets } from "../src/services/action-budgets.js";
import { PROTECTED_ACTIONS } from "../src/config/protected-actions.js";

describe("actionGate", () => {
  beforeEach(() => {
    clearAllDials();
    clearActionBudgets();
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

  it("denies exhausted T4/T5 budgets with retry timing and audit context", () => {
    setDialLevel("owner", "repo", 5, "admin");
    const policy = loadRuntimePolicy(
      {
        GH_CE_ENVIRONMENT: "local",
        GH_CE_REPO_CEILINGS: "owner/repo=5",
        GH_CE_ACTION_BUDGETS: "T4=1/h,T5=1/h",
      },
      () => {},
    );
    const auditEvents: Array<Record<string, unknown>> = [];
    const request = { owner: "owner", repo: "repo", action: "close_issue" };

    assert.equal(
      actionGate.check(request, policy, {
        now: 0,
        audit: (event) => auditEvents.push(event),
      }).allowed,
      true,
    );
    const denied = actionGate.check(request, policy, {
      now: 0,
      audit: (event) => auditEvents.push(event),
    });

    assert.equal(denied.allowed, false);
    assert.equal(denied.code, "BUDGET_EXHAUSTED");
    assert.equal(denied.retryAfterSeconds, 3600);
    assert.equal(auditEvents[0]?.["event"], "budget.exhausted");
    assert.equal(auditEvents[0]?.["actor"], "operator");
    assert.equal(auditEvents[0]?.["action"], "close_issue");
    assert.equal(auditEvents[0]?.["tier"], "T4");
    assert.equal(auditEvents[0]?.["timestamp"], "1970-01-01T00:00:00.000Z");
  });

  it("does not consume action budgets for permission previews", () => {
    setDialLevel("owner", "repo", 5, "admin");
    const policy = loadRuntimePolicy(
      {
        GH_CE_ENVIRONMENT: "local",
        GH_CE_REPO_CEILINGS: "owner/repo=5",
        GH_CE_ACTION_BUDGETS: "T4=1/h",
      },
      () => {},
    );
    const request = { owner: "owner", repo: "repo", action: "close_issue" };

    for (let index = 0; index < 3; index++) {
      assert.equal(
        actionGate.check(request, policy, {
          consumeBudget: false,
          now: 0,
        }).allowed,
        true,
      );
    }

    assert.equal(actionGate.check(request, policy, { now: 0 }).allowed, true);
    assert.equal(
      actionGate.check(request, policy, { now: 0 }).code,
      "BUDGET_EXHAUSTED",
    );
  });
});
