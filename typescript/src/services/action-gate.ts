import type { ActionTier, DialLevel } from "../types/autonomy.js";
import {
  getRuntimePolicy,
  type RuntimePolicy,
} from "../config/runtime.js";
import { isProtectedAction } from "../config/protected-actions.js";
import { classifyAction } from "./action-classifier.js";
import { isActionPermitted } from "./autonomy-dial.js";

export interface ActionGateRequest {
  owner: string;
  repo: string;
  action: string;
  branchName?: string;
  repoProtectedActions?: readonly string[];
}

export interface ActionGateDecision {
  allowed: boolean;
  code?:
    | "UNKNOWN_ACTION"
    | "PROTECTED_ACTION_DENIED"
    | "INSUFFICIENT_LEVEL"
    | "AGENT_BRANCH_REQUIRED";
  action: string;
  tier: ActionTier;
  dialLevel: DialLevel;
  requiredLevel: DialLevel;
  effectiveLevel: DialLevel;
  bounds: ReturnType<typeof isActionPermitted>["bounds"];
  reason: string;
}

export const actionGate = {
  check(
    request: ActionGateRequest,
    policy: RuntimePolicy = getRuntimePolicy(),
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
      ["create_branch", "create_agent_branch", "push_agent_commit", "edit_file", "create_file", "delete_file"].includes(
        classification.actionType,
      ) &&
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
        code: "INSUFFICIENT_LEVEL",
        action: classification.actionType,
        tier: classification.tier,
        dialLevel: permission.dialLevel,
        requiredLevel: permission.requiredLevel,
        effectiveLevel: permission.effectiveLevel,
        bounds: permission.bounds,
        reason: permission.reason,
      };
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
