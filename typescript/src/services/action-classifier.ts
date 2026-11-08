/**
 * Action Classification Engine
 *
 * Classifies agent actions into tiers (T1-T5) based on their potential impact.
 * Part of the Autonomy Dial system for dynamic AI agent permission control.
 *
 * Ported from the reference JS codebase (action-classifier.js).
 */

import type {
  ActionTier,
  DialLevel,
} from "../types/autonomy.js";
import actionTierManifest from "../../../standards/action-tiers.json" with {
  type: "json",
};

function isActionTier(value: unknown): value is ActionTier {
  return value === "T1" || value === "T2" || value === "T3" || value === "T4" || value === "T5";
}

// ─── Tier Definitions ───────────────────────────────────────────────────────────────

export interface TierDetails {
  readonly level: number;
  readonly name: string;
  readonly description: string;
  readonly requiredDialLevel: DialLevel;
}

export const ACTION_TIERS: Record<string, TierDetails> = {
  T1: {
    level: 1,
    name: "Read-Only",
    description: "View files, read comments, inspect repository state",
    requiredDialLevel: 1,
  },
  T2: {
    level: 2,
    name: "Informational",
    description: "Post comments, create discussions, add reactions",
    requiredDialLevel: 2,
  },
  T3: {
    level: 3,
    name: "Modify",
    description: "Edit files, create branches, update issues/PRs",
    requiredDialLevel: 3,
  },
  T4: {
    level: 4,
    name: "Commit",
    description: "Push commits, create PRs, request reviews",
    requiredDialLevel: 4,
  },
  T5: {
    level: 5,
    name: "Merge/Deploy",
    description: "Merge PRs, deploy code, delete branches",
    requiredDialLevel: 5,
  },
} as const;

// ─── Action Catalog ─────────────────────────────────────────────────────────────────

/** Maps specific action types to their corresponding tier */
function validateActionTypeMap(
  value: unknown,
): Readonly<Record<string, ActionTier>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Action tier manifest must contain an action map");
  }

  const actions: Record<string, ActionTier> = {};
  for (const [action, tier] of Object.entries(value)) {
    if (!action || !isActionTier(tier)) {
      throw new Error(`Invalid action tier manifest entry "${action}"`);
    }
    actions[action] = tier;
  }
  return Object.freeze(actions);
}

const ACTION_TYPE_MAP = validateActionTypeMap(actionTierManifest.actions);

// ─── Public API ─────────────────────────────────────────────────────────────────────

/** Result of classifying an action */
export interface ClassifyResult {
  tier: ActionTier;
  tierDetails: TierDetails;
  actionType: string;
  isKnownAction: boolean;
}

/**
 * Classify an action into its appropriate tier.
 * Unknown actions retain a T3 display tier for compatibility, but are never permitted.
 */
export function classifyAction(actionType: string): ClassifyResult {
  if (!actionType || typeof actionType !== "string") {
    throw new Error("Action type must be a non-empty string");
  }

  const normalized = actionType.toLowerCase().trim();
  const tier = ACTION_TYPE_MAP[normalized];

  if (!tier) {
    // Keep an informational fallback tier; permission checks must honor isKnownAction.
    const t3Details = ACTION_TIERS["T3"];
    if (!t3Details) {
      throw new Error("Internal error: T3 tier not found");
    }
    return {
      tier: "T3",
      tierDetails: t3Details,
      actionType: normalized,
      isKnownAction: false,
    };
  }

  const tierDetails = ACTION_TIERS[tier];
  if (!tierDetails) {
    throw new Error(`Internal error: tier ${tier} not found`);
  }

  return {
    tier,
    tierDetails,
    actionType: normalized,
    isKnownAction: true,
  };
}

/**
 * Get the minimum dial level required for an action type.
 */
export function getRequiredDialLevel(actionType: string): DialLevel {
  const classification = classifyAction(actionType);
  return classification.tierDetails.requiredDialLevel;
}

/**
 * Check if a dial level permits an action.
 */
export function isActionPermitted(
  dialLevel: number,
  actionType: string,
): {
  permitted: boolean;
  code?: "UNKNOWN_ACTION";
  dialLevel: number;
  requiredLevel: DialLevel;
  tier: ActionTier;
  tierDetails: TierDetails;
  actionType: string;
} {
  if (!Number.isInteger(dialLevel) || dialLevel < 1 || dialLevel > 5) {
    throw new Error("Dial level must be an integer between 1 and 5");
  }

  const classification = classifyAction(actionType);
  const requiredLevel = classification.tierDetails.requiredDialLevel;
  const permitted =
    classification.isKnownAction && dialLevel >= requiredLevel;

  return {
    permitted,
    ...(classification.isKnownAction ? {} : { code: "UNKNOWN_ACTION" as const }),
    dialLevel,
    requiredLevel,
    tier: classification.tier,
    tierDetails: classification.tierDetails,
    actionType: classification.actionType,
  };
}

/**
 * Get all action types for a specific tier.
 */
export function getActionsByTier(tier: ActionTier): string[] {
  if (!ACTION_TIERS[tier]) {
    throw new Error(
      `Invalid tier: ${tier}. Must be one of T1, T2, T3, T4, T5`,
    );
  }

  return Object.entries(ACTION_TYPE_MAP)
    .filter(([, actionTier]) => actionTier === tier)
    .map(([actionType]) => actionType);
}

/**
 * Get all actions in the catalog.
 */
export function getAllActions(): Record<string, ActionTier> {
  return { ...ACTION_TYPE_MAP };
}

/**
 * Get a summary of all tiers and their action counts.
 */
export function getTierSummary(): Record<
  string,
  TierDetails & { actionCount: number; sampleActions: string[] }
> {
  const summary: Record<
    string,
    TierDetails & { actionCount: number; sampleActions: string[] }
  > = {};

  for (const [tier, details] of Object.entries(ACTION_TIERS)) {
    const actions = getActionsByTier(tier as ActionTier);
    summary[tier] = {
      ...details,
      actionCount: actions.length,
      sampleActions: actions.slice(0, 5),
    };
  }

  return summary;
}

/**
 * Validate action type exists in the classification system.
 */
export function isValidActionType(actionType: string): boolean {
  if (!actionType || typeof actionType !== "string") {
    return false;
  }
  const normalized = actionType.toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(ACTION_TYPE_MAP, normalized);
}
