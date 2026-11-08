import type {
  ActionTier,
  DialLevel,
  EnvironmentTier,
} from "../types/autonomy.js";
import { ENGAGEMENT_LEVEL_NAMES } from "../types/autonomy.js";
import {
  type ActionBudgetLimits,
  getRuntimePolicy,
  type RuntimePolicy,
} from "../config/runtime.js";
import { isProtectedAction } from "../config/protected-actions.js";
import { classifyAction } from "./action-classifier.js";
import {
  actionBudgetTracker,
  getEffectiveActionBudgetLimit,
} from "./action-budgets.js";
import { isActionPermitted } from "./autonomy-dial.js";

export interface ActionGateRequest {
  owner: string;
  repo: string;
  action: string;
  branchName?: string;
  repoProtectedActions?: readonly string[];
  repoBudgets?: Partial<ActionBudgetLimits>;
}

export interface ActionGateDecision {
  allowed: boolean;
  code?:
    | "UNKNOWN_ACTION"
    | "PROTECTED_ACTION_DENIED"
    | "INSUFFICIENT_LEVEL"
    | "AGENT_BRANCH_REQUIRED"
    | "BUDGET_EXHAUSTED";
  action: string;
  tier: ActionTier;
  dialLevel: DialLevel;
  requiredLevel: DialLevel;
  effectiveLevel: DialLevel;
  bounds: ReturnType<typeof isActionPermitted>["bounds"];
  reason: string;
  retryAfterSeconds?: number;
}

export interface ActionGateCheckOptions {
  consumeBudget?: boolean;
  now?: number;
  audit?: (event: Record<string, unknown>) => void;
}

export const actionGate = {
  check(
    request: ActionGateRequest,
    policy: RuntimePolicy = getRuntimePolicy(),
    options: ActionGateCheckOptions = {},
  ): ActionGateDecision {
    const classification = classifyAction(request.action);
    const permission = isActionPermitted(
      request.owner,
      request.repo,
      request.action,
      policy,
    );

    if (!classification.isKnownAction) {
      return {
        allowed: false,
        code: "UNKNOWN_ACTION",
        action: classification.actionType,
        tier: classification.tier,
        dialLevel: permission.dialLevel,
        requiredLevel: permission.requiredLevel,
        effectiveLevel: permission.effectiveLevel,
        bounds: permission.bounds,
        reason: `Unknown action "${classification.actionType}" is denied (UNKNOWN_ACTION).`,
      };
    }

    if (
      [
        "create_branch",
        "create_agent_branch",
        "push_agent_commit",
        "edit_file",
        "create_file",
        "delete_file",
      ].includes(classification.actionType) &&
      !request.branchName?.startsWith("agent/")
    ) {
      return {
        allowed: false,
        code: "AGENT_BRANCH_REQUIRED",
        action: classification.actionType,
        tier: classification.tier,
        dialLevel: permission.dialLevel,
        requiredLevel: permission.requiredLevel,
        effectiveLevel: permission.effectiveLevel,
        bounds: permission.bounds,
        reason: `Action "${classification.actionType}" is permitted only on an agent/* branch.`,
      };
    }

    if (
      isProtectedAction(classification.actionType) &&
      (!policy.allowedProtectedActions.has(classification.actionType) ||
        !request.repoProtectedActions?.includes(classification.actionType))
    ) {
      return {
        allowed: false,
        code: "PROTECTED_ACTION_DENIED",
        action: classification.actionType,
        tier: classification.tier,
        dialLevel: permission.dialLevel,
        requiredLevel: permission.requiredLevel,
        effectiveLevel: permission.effectiveLevel,
        bounds: permission.bounds,
        reason: `Protected action "${classification.actionType}" requires both the repository and operator allow-lists.`,
      };
    }

    if (!permission.permitted) {
      return {
        allowed: false,
        code: permission.code ?? "INSUFFICIENT_LEVEL",
        action: classification.actionType,
        tier: classification.tier,
        dialLevel: permission.dialLevel,
        requiredLevel: permission.requiredLevel,
        effectiveLevel: permission.effectiveLevel,
        bounds: permission.bounds,
        reason: permission.reason,
      };
    }

    if (
      options.consumeBudget !== false &&
      (classification.tier === "T4" || classification.tier === "T5")
    ) {
      const tier = classification.tier;
      const limit = getEffectiveActionBudgetLimit(
        tier,
        policy.actionBudgets,
        request.repoBudgets,
      );
      const budget = actionBudgetTracker.consume(
        request.owner,
        request.repo,
        tier,
        limit,
        options.now,
      );
      if (!budget.allowed) {
        const retryAfterSeconds = budget.retryAfterSeconds ?? 1;
        const event = {
          msg: "action budget exhausted",
          event: "budget.exhausted",
          actor: "operator",
          owner: request.owner,
          repo: request.repo,
          action: classification.actionType,
          tier,
          limit,
          retryAfterSeconds,
          timestamp: new Date(options.now ?? Date.now()).toISOString(),
          bounds: permission.bounds,
        };
        (options.audit ?? ((entry) => console.log(JSON.stringify(entry))))(event);
        return {
          allowed: false,
          code: "BUDGET_EXHAUSTED",
          action: classification.actionType,
          tier: classification.tier,
          dialLevel: permission.dialLevel,
          requiredLevel: permission.requiredLevel,
          effectiveLevel: permission.effectiveLevel,
          bounds: permission.bounds,
          retryAfterSeconds,
          reason: `Action budget exhausted for ${tier}; retry after ${retryAfterSeconds} seconds.`,
        };
      }
    }

    return {
      allowed: true,
      action: classification.actionType,
      tier: classification.tier,
      dialLevel: permission.dialLevel,
      requiredLevel: permission.requiredLevel,
      effectiveLevel: permission.effectiveLevel,
      bounds: permission.bounds,
      reason: permission.reason,
    };
  },
};

/** Compatibility shape for the PR webhook's denial summary. */
export interface GateDecision extends ActionGateDecision {
  level: DialLevel;
  levelName: string;
  env: EnvironmentTier;
}

export type ActionType = string;

export function gateAction(
  owner: string,
  repo: string,
  action: ActionType,
  policy: RuntimePolicy = getRuntimePolicy(),
): GateDecision {
  const decision = actionGate.check({ owner, repo, action }, policy);
  return {
    ...decision,
    level: decision.dialLevel,
    levelName: ENGAGEMENT_LEVEL_NAMES[decision.effectiveLevel],
    env: policy.environment,
  };
}

export function canComment(
  owner: string,
  repo: string,
  policy: RuntimePolicy = getRuntimePolicy(),
): boolean {
  return gateAction(owner, repo, "post_comment", policy).allowed;
}

export function describeDenial(decision: GateDecision): string {
  const environmentLimit =
    decision.bounds.environmentCeiling === decision.effectiveLevel &&
    decision.effectiveLevel < decision.level
      ? ` (capped from ${decision.level} by the \`${decision.env}\` environment, max ${decision.bounds.environmentCeiling})`
      : "";
  return (
    `\`${decision.action}\` is a ${decision.tier} action and requires engagement level ` +
    `${decision.requiredLevel}. This repository is at level ${decision.effectiveLevel} ` +
    `(${decision.levelName})${environmentLimit}.`
  );
}
