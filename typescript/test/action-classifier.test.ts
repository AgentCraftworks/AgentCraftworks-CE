/**
 * Action Classifier + Autonomy Dial — Tests (5-level engagement model)
 *
 * Uses node:test and node:assert/strict.
 * Tests covering classification, tiers, permissions, dial, and engagement levels.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAction,
  getRequiredDialLevel,
  isActionPermitted,
  getActionsByTier,
  getAllActions,
  getTierSummary,
  isValidActionType,
} from "../src/services/action-classifier.js";
import {
  getDialLevel,
  setDialLevel,
  isActionPermitted as dialIsActionPermitted,
  getEffectiveLevel,
  clearAllDials,
  DEFAULT_DIAL_LEVEL,
} from "../src/services/autonomy-dial.js";
import {
  mapLegacyDialLevel,
  resolveEngagementLevel,
  ENGAGEMENT_LEVEL_NAMES,
} from "../src/types/autonomy.js";

// ─── Action Classifier Tests ────────────────────────────────────────────────

describe("classifyAction", () => {
  it("should classify T1 read-only actions", () => {
    const result = classifyAction("view_file");
    assert.equal(result.tier, "T1");
    assert.equal(result.isKnownAction, true);
    assert.equal(result.actionType, "view_file");
    assert.equal(result.tierDetails.name, "Read-Only");
  });

  it("should classify T2 informational actions", () => {
    const result = classifyAction("post_comment");
    assert.equal(result.tier, "T2");
    assert.equal(result.isKnownAction, true);
  });

  it("should classify T3 modify actions", () => {
    const result = classifyAction("edit_file");
    assert.equal(result.tier, "T3");
  });

  it("should classify T4 commit actions", () => {
    const result = classifyAction("push_commit");
    assert.equal(result.tier, "T4");
  });

  it("should classify T5 merge/deploy actions", () => {
    const result = classifyAction("merge_pr");
    assert.equal(result.tier, "T5");
    assert.equal(result.tierDetails.requiredDialLevel, 5);
  });

  it("should default unknown actions to T3 (conservative)", () => {
    const result = classifyAction("unknown_action_xyz");
    assert.equal(result.tier, "T3");
    assert.equal(result.isKnownAction, false);
  });

  it("should normalize action types to lowercase", () => {
    const result = classifyAction("VIEW_FILE");
    assert.equal(result.tier, "T1");
    assert.equal(result.actionType, "view_file");
  });

  it("should throw on empty action type", () => {
    assert.throws(() => classifyAction(""), /non-empty string/);
  });
});

describe("getRequiredDialLevel", () => {
  it("should return dial level 1 for T1 actions", () => {
    assert.equal(getRequiredDialLevel("view_file"), 1);
  });

  it("should return dial level 5 for T5 actions", () => {
    assert.equal(getRequiredDialLevel("merge_pr"), 5);
  });

  it("should return dial level 2 for T2 actions", () => {
    assert.equal(getRequiredDialLevel("post_comment"), 2);
  });

  it("should return dial level 3 for T3 actions", () => {
    assert.equal(getRequiredDialLevel("edit_file"), 3);
  });

  it("should return dial level 4 for T4 actions", () => {
    assert.equal(getRequiredDialLevel("push_commit"), 4);
  });
});

describe("isActionPermitted (classifier)", () => {
  it("should permit T1 action at dial level 1", () => {
    const result = isActionPermitted(1, "view_file");
    assert.equal(result.permitted, true);
  });

  it("should deny T5 action at dial level 3", () => {
    const result = isActionPermitted(3, "merge_pr");
    assert.equal(result.permitted, false);
    assert.equal(result.requiredLevel, 5);
  });

  it("should permit T5 action at dial level 5", () => {
    const result = isActionPermitted(5, "merge_pr");
    assert.equal(result.permitted, true);
  });

  it("should deny T2 action at dial level 1", () => {
    const result = isActionPermitted(1, "post_comment");
    assert.equal(result.permitted, false);
  });

  it("should permit T2 action at dial level 2", () => {
    const result = isActionPermitted(2, "post_comment");
    assert.equal(result.permitted, true);
  });

  it("should throw on invalid dial level", () => {
    assert.throws(() => isActionPermitted(0, "view_file"), /between 1 and 5/);
    assert.throws(() => isActionPermitted(6, "view_file"), /between 1 and 5/);
  });
});

describe("getActionsByTier", () => {
  it("should return all T1 actions", () => {
    const actions = getActionsByTier("T1");
    assert.ok(actions.length >= 14);
    assert.ok(actions.includes("view_file"));
    assert.ok(actions.includes("get_pr"));
  });

  it("should throw on invalid tier", () => {
    assert.throws(
      () => getActionsByTier("T99" as any),
      /Invalid tier/,
    );
  });
});

describe("getAllActions", () => {
  it("should return 53+ action types", () => {
    const all = getAllActions();
    const count = Object.keys(all).length;
    assert.ok(count >= 53, `Expected >= 53 actions, got ${count}`);
  });
});

describe("getTierSummary", () => {
  it("should return summary for all tiers", () => {
    const summary = getTierSummary();
    assert.ok(summary["T1"]);
    assert.ok(summary["T5"]);
    assert.ok(summary["T1"]!.actionCount >= 14);
    assert.ok(summary["T1"]!.sampleActions.length <= 5);
  });
});

describe("isValidActionType", () => {
  it("should return true for known actions", () => {
    assert.equal(isValidActionType("view_file"), true);
    assert.equal(isValidActionType("merge_pr"), true);
  });

  it("should return false for unknown actions", () => {
    assert.equal(isValidActionType("unknown_xyz"), false);
  });

  it("should return false for empty/invalid input", () => {
    assert.equal(isValidActionType(""), false);
  });
});

// ─── CI Action Types Tests ──────────────────────────────────────────────────

describe("CI Action Types", () => {
  it("should classify ci_lint_fix as T2", () => {
    const result = classifyAction("ci_lint_fix");
    assert.equal(result.tier, "T2");
    assert.equal(result.isKnownAction, true);
    assert.equal(result.tierDetails.requiredDialLevel, 2);
  });

  it("should classify ci_issue_file as T2", () => {
    const result = classifyAction("ci_issue_file");
    assert.equal(result.tier, "T2");
    assert.equal(result.isKnownAction, true);
  });

  it("should classify ci_type_fix as T3", () => {
    const result = classifyAction("ci_type_fix");
    assert.equal(result.tier, "T3");
    assert.equal(result.isKnownAction, true);
    assert.equal(result.tierDetails.requiredDialLevel, 3);
  });

  it("should classify ci_test_fix as T3", () => {
    const result = classifyAction("ci_test_fix");
    assert.equal(result.tier, "T3");
    assert.equal(result.isKnownAction, true);
  });

  it("should classify ci_build_fix as T3", () => {
    const result = classifyAction("ci_build_fix");
    assert.equal(result.tier, "T3");
    assert.equal(result.isKnownAction, true);
  });

  it("should classify ci_security_escalate as T4", () => {
    const result = classifyAction("ci_security_escalate");
    assert.equal(result.tier, "T4");
    assert.equal(result.isKnownAction, true);
    assert.equal(result.tierDetails.requiredDialLevel, 4);
  });

  it("should permit ci_lint_fix at dial level 2", () => {
    const result = isActionPermitted(2, "ci_lint_fix");
    assert.equal(result.permitted, true);
  });

  it("should deny ci_type_fix at dial level 2", () => {
    const result = isActionPermitted(2, "ci_type_fix");
    assert.equal(result.permitted, false);
    assert.equal(result.requiredLevel, 3);
  });

  it("should permit ci_security_escalate at dial level 4", () => {
    const result = isActionPermitted(4, "ci_security_escalate");
    assert.equal(result.permitted, true);
  });
});

// ─── Autonomy Dial Tests ────────────────────────────────────────────────────

describe("Autonomy Dial", () => {
  beforeEach(() => {
    clearAllDials();
  });

  it("should return default level when not configured", () => {
    const config = getDialLevel("owner", "repo");
    assert.equal(config.dialLevel, DEFAULT_DIAL_LEVEL);
    assert.equal(config.isDefault, true);
  });

  it("should set and get dial level", () => {
    setDialLevel("owner", "repo", 4, "admin-user");
    const config = getDialLevel("owner", "repo");
    assert.equal(config.dialLevel, 4);
    assert.equal(config.isDefault, false);
    assert.equal(config.updatedBy, "admin-user");
    assert.ok(config.updatedAt);
  });

  it("should validate dial level range 1-5", () => {
    assert.throws(
      () => setDialLevel("o", "r", 0, "user"),
      /between 1 and 5/,
    );
    assert.throws(
      () => setDialLevel("o", "r", 6, "user"),
      /between 1 and 5/,
    );
    // Valid extremes
    setDialLevel("o", "r", 1, "user");
    assert.equal(getDialLevel("o", "r").dialLevel, 1);
    setDialLevel("o", "r", 5, "user");
    assert.equal(getDialLevel("o", "r").dialLevel, 5);
  });

  it("should require updatedBy", () => {
    assert.throws(
      () => setDialLevel("o", "r", 3, ""),
      /updatedBy/,
    );
  });

  it("should require owner and repo", () => {
    assert.throws(() => getDialLevel("", "repo"), /required/);
    assert.throws(() => getDialLevel("owner", ""), /required/);
  });

  it("should check action permission with dial level", () => {
    setDialLevel("owner", "repo", 3, "admin");
    const result = dialIsActionPermitted("owner", "repo", "view_file");
    assert.equal(result.permitted, true);
  });

  it("should deny action when dial level insufficient", () => {
    setDialLevel("owner", "repo", 2, "admin");
    const result = dialIsActionPermitted("owner", "repo", "merge_pr");
    assert.equal(result.permitted, false);
    assert.equal(result.requiredLevel, 5);
  });

  it("should apply environment tier cap", () => {
    setDialLevel("owner", "repo", 5, "admin");
    // Production caps at 3
    const effective = getEffectiveLevel("owner", "repo", "production");
    assert.equal(effective, 3);
    // Staging caps at 4
    const effectiveStaging = getEffectiveLevel("owner", "repo", "staging");
    assert.equal(effectiveStaging, 4);
    // Local has no cap (5)
    const effectiveLocal = getEffectiveLevel("owner", "repo", "local");
    assert.equal(effectiveLocal, 5);
  });

  it("should factor env tier into permission check", () => {
    setDialLevel("owner", "repo", 5, "admin");
    // Without env tier, merge_pr (requires 5) should be allowed at level 5
    const allowed = dialIsActionPermitted("owner", "repo", "merge_pr");
    assert.equal(allowed.permitted, true);
    // With production cap (3), merge_pr should be denied
    const denied = dialIsActionPermitted(
      "owner",
      "repo",
      "merge_pr",
      "production",
    );
    assert.equal(denied.permitted, false);
  });

  it("should clear all dials", () => {
    setDialLevel("o1", "r1", 3, "user");
    setDialLevel("o2", "r2", 4, "user");
    clearAllDials();
    assert.equal(getDialLevel("o1", "r1").isDefault, true);
    assert.equal(getDialLevel("o2", "r2").isDefault, true);
  });
});

// ─── Engagement Level Tests ─────────────────────────────────────────────────

describe("mapLegacyDialLevel", () => {
  it("should map old levels 1-2 to level 1 (Observer)", () => {
    assert.equal(mapLegacyDialLevel(1), 1);
    assert.equal(mapLegacyDialLevel(2), 1);
  });

  it("should map old levels 3-4 to level 2 (Advisor)", () => {
    assert.equal(mapLegacyDialLevel(3), 2);
    assert.equal(mapLegacyDialLevel(4), 2);
  });

  it("should map old levels 5-6 to level 3 (Collaborator)", () => {
    assert.equal(mapLegacyDialLevel(5), 3);
    assert.equal(mapLegacyDialLevel(6), 3);
  });

  it("should map old levels 7-8 to level 4 (Delegated)", () => {
    assert.equal(mapLegacyDialLevel(7), 4);
    assert.equal(mapLegacyDialLevel(8), 4);
  });

  it("should map old levels 9-11 to level 5 (Autonomous)", () => {
    assert.equal(mapLegacyDialLevel(9), 5);
    assert.equal(mapLegacyDialLevel(10), 5);
    assert.equal(mapLegacyDialLevel(11), 5);
  });
});

describe("resolveEngagementLevel", () => {
  it("should resolve numeric levels 1-5 directly", () => {
    assert.equal(resolveEngagementLevel(1), 1);
    assert.equal(resolveEngagementLevel(5), 5);
  });

  it("should resolve legacy numeric levels via mapping", () => {
    assert.equal(resolveEngagementLevel(7), 4);
    assert.equal(resolveEngagementLevel(11), 5);
  });

  it("should resolve engagement level names", () => {
    assert.equal(resolveEngagementLevel("observer"), 1);
    assert.equal(resolveEngagementLevel("advisor"), 2);
    assert.equal(resolveEngagementLevel("collaborator"), 3);
    assert.equal(resolveEngagementLevel("delegated"), 4);
    assert.equal(resolveEngagementLevel("autonomous"), 5);
  });

  it("should still resolve superseded engagement level names", () => {
    assert.equal(resolveEngagementLevel("peer-programmer"), 3);
    assert.equal(resolveEngagementLevel("agent-team"), 4);
    assert.equal(resolveEngagementLevel("full-agent-team"), 5);
  });

  it("should be case-insensitive for names", () => {
    assert.equal(resolveEngagementLevel("Observer"), 1);
    assert.equal(resolveEngagementLevel("ADVISOR"), 2);
  });

  it("should throw for unknown names", () => {
    assert.throws(
      () => resolveEngagementLevel("unknown-level"),
      /Unknown engagement level/,
    );
  });
});

describe("ENGAGEMENT_LEVEL_NAMES", () => {
  it("should map all 5 levels to names", () => {
    assert.equal(ENGAGEMENT_LEVEL_NAMES[1], "observer");
    assert.equal(ENGAGEMENT_LEVEL_NAMES[2], "advisor");
    assert.equal(ENGAGEMENT_LEVEL_NAMES[3], "collaborator");
    assert.equal(ENGAGEMENT_LEVEL_NAMES[4], "delegated");
    assert.equal(ENGAGEMENT_LEVEL_NAMES[5], "autonomous");
  });
});
