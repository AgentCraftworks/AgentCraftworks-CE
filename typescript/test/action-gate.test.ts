import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadRuntimePolicy } from "../src/config/runtime.js";
import { clearAllDials, setDialLevel } from "../src/services/autonomy-dial.js";
import { actionGate } from "../src/services/action-gate.js";
import type { AuditEvent } from "../src/services/audit-log.js";
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
    const auditEvents: AuditEvent[] = [];
    const decision = actionGate.check(
      { owner: "owner", repo: "repo", action: "unknown_write" },
      policy,
      { audit: (event) => auditEvents.push(event) },
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, "UNKNOWN_ACTION");
    assert.deepEqual(
      auditEvents.map(({ event, action, actor }) => ({ event, action, actor })),
      [{ event: "gate.denied", action: "UNKNOWN_ACTION", actor: "operator" }],
    );
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

    const auditEvents: AuditEvent[] = [];
    const decision = actionGate.check(
      {
        owner: "owner",
        repo: "repo",
        action: "force_push",
        repoProtectedActions: [],
      },
      operatorOnly,
      { audit: (event) => auditEvents.push(event) },
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, "PROTECTED_ACTION_DENIED");
    assert.deepEqual(
      auditEvents.map((event) => event.event),
      ["protected.denied", "gate.denied"],
    );
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
        repoCeiling: 5,
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
      {
        owner: "owner",
        repo: "repo",
        action: "edit_file",
        branchName: "main",
        repoCeiling: 5,
      },
      policy,
    );
    const allowed = actionGate.check(
      {
        owner: "owner",
        repo: "repo",
        action: "edit_file",
        branchName: "agent/fix",
        repoCeiling: 5,
      },
      policy,
    );
    assert.equal(blocked.code, "AGENT_BRANCH_REQUIRED");
    assert.equal(allowed.allowed, true);
  });

  it("uses the reviewed repository ceiling and fails closed on missing policy", () => {
    setDialLevel("owner", "repo", 5, "admin");
    const policy = loadRuntimePolicy(
      {
        GH_CE_ENVIRONMENT: "local",
        GH_CE_REPO_CEILINGS: "owner/repo=5",
      },
      () => {},
    );
    const capped = actionGate.check(
      {
        owner: "owner",
        repo: "repo",
        action: "close_issue",
        repoCeiling: 3,
      },
      policy,
    );
    assert.equal(capped.allowed, false);
    assert.equal(capped.effectiveLevel, 3);
    assert.equal(capped.bounds.repoCeiling, 3);

    const auditEvents: AuditEvent[] = [];
    const unavailable = actionGate.check(
      {
        owner: "owner",
        repo: "repo",
        action: "post_comment",
        repoConfigUnavailable: true,
      },
      policy,
      { audit: (event) => auditEvents.push(event) },
    );
    assert.equal(unavailable.allowed, false);
    assert.equal(unavailable.code, "REPO_CONFIG_UNAVAILABLE");
    assert.equal(auditEvents.at(-1)?.event, "gate.denied");
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
    const auditEvents: AuditEvent[] = [];
    const request = {
      owner: "owner",
      repo: "repo",
      action: "close_issue",
      repoCeiling: 5,
    };

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
    assert.ok(
      auditEvents.some((event) => event.event === "gate.allowed"),
      "allowed actions are audited",
    );
    const exhausted = auditEvents.find(
      (event) => event.event === "budget.exhausted",
    );
    assert.ok(exhausted);
    assert.equal(exhausted.actor, "operator");
    assert.equal(exhausted.repo, "owner/repo");
    assert.equal(exhausted.action, "close_issue");
    assert.equal(exhausted.tier, "T4");
    assert.equal(exhausted.timestamp, "1970-01-01T00:00:00.000Z");
    assert.ok(
      auditEvents.some((event) => event.event === "gate.denied"),
      "budget denial is also recorded as a gate denial",
    );
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
    const request = {
      owner: "owner",
      repo: "repo",
      action: "close_issue",
      repoCeiling: 5,
    };

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
