import type {
  ActionBudgetLimits,
  ActionBudgetTier,
} from "../config/runtime.js";

const HOUR_MS = 60 * 60 * 1000;

export interface ActionBudgetResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class ActionBudgetTracker {
  private readonly buckets = new Map<string, Bucket>();

  consume(
    owner: string,
    repo: string,
    tier: ActionBudgetTier,
    limit: number,
    now = Date.now(),
  ): ActionBudgetResult {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error("Action budget limit must be a positive safe integer.");
    }

    const key = `${owner}/${repo}`.toLowerCase() + `:${tier}`;
    const previous = this.buckets.get(key);
    const updatedAt = Math.max(now, previous?.updatedAt ?? now);
    const elapsed = Math.max(0, updatedAt - (previous?.updatedAt ?? now));
    const tokens = Math.min(
      limit,
      (previous?.tokens ?? limit) + (elapsed * limit) / HOUR_MS,
    );

    if (tokens >= 1) {
      const remaining = tokens - 1;
      this.buckets.set(key, { tokens: remaining, updatedAt });
      return { allowed: true, remaining };
    }

    this.buckets.set(key, { tokens, updatedAt });
    return {
      allowed: false,
      remaining: tokens,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(((1 - tokens) * HOUR_MS) / limit / 1000),
      ),
    };
  }

  clear(): void {
    this.buckets.clear();
  }
}

export function getEffectiveActionBudgetLimit(
  tier: ActionBudgetTier,
  operatorBudgets: ActionBudgetLimits,
  repoBudgets?: Partial<ActionBudgetLimits>,
): number {
  const repoLimit = repoBudgets?.[tier];
  return repoLimit === undefined
    ? operatorBudgets[tier]
    : Math.min(operatorBudgets[tier], repoLimit);
}

export const actionBudgetTracker = new ActionBudgetTracker();

export function clearActionBudgets(): void {
  actionBudgetTracker.clear();
}
