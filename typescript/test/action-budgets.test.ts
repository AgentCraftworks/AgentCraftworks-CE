import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ActionBudgetTracker,
  getEffectiveActionBudgetLimit,
} from "../src/services/action-budgets.js";

describe("ActionBudgetTracker", () => {
  it("uses a per-repository, per-tier token bucket and returns retry timing", () => {
    const tracker = new ActionBudgetTracker();

    assert.deepEqual(tracker.consume("Owner", "Repo", "T4", 2, 0), {
      allowed: true,
      remaining: 1,
    });
    assert.deepEqual(tracker.consume("owner", "repo", "T4", 2, 0), {
      allowed: true,
      remaining: 0,
    });
    assert.deepEqual(tracker.consume("owner", "repo", "T4", 2, 0), {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1800,
    });

    assert.equal(
      tracker.consume("owner", "repo", "T4", 2, 1_800_000).allowed,
      true,
    );
    assert.equal(
      tracker.consume("owner", "other", "T4", 2, 0).allowed,
      true,
    );
    assert.equal(tracker.consume("owner", "repo", "T5", 1, 0).allowed, true);
  });

  it("uses the stricter repository budget when one is configured", () => {
    const operatorBudgets = { T4: 30, T5: 5 } as const;

    assert.equal(
      getEffectiveActionBudgetLimit("T4", operatorBudgets, { T4: 12 }),
      12,
    );
    assert.equal(
      getEffectiveActionBudgetLimit("T4", operatorBudgets, { T4: 40 }),
      30,
    );
    assert.equal(
      getEffectiveActionBudgetLimit("T5", operatorBudgets),
      5,
    );
  });
});
