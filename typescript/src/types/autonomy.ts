/**
 * Autonomy / Engagement Level domain types
 *
 * 5-level Agent Engagement model:
 *   1 = Observer     (T1 — read-only)
 *   2 = Advisor      (T2 — informational)
 *   3 = Collaborator (T3 — modify)
 *   4 = Delegated    (T4 — commit)
 *   5 = Autonomous   (T5 — merge/deploy)
 */

/** Action classification tiers (T1 = lowest risk, T5 = highest) */
export type ActionTier = "T1" | "T2" | "T3" | "T4" | "T5";

/** Engagement dial levels 1-5 */
export type DialLevel = 1 | 2 | 3 | 4 | 5;

/** Named engagement levels */
export type EngagementLevelName =
  | "observer"
  | "advisor"
  | "collaborator"
  | "delegated"
  | "autonomous";

/**
 * Superseded engagement level names, retained so existing API callers and
 * stored configuration keep working after the rename to the canonical
 * Observer / Advisor / Collaborator / Delegated / Autonomous scheme.
 */
export type LegacyEngagementLevelName =
  | "peer-programmer"
  | "agent-team"
  | "full-agent-team";

/** Environment tiers with increasing restriction */
export type EnvironmentTier = "local" | "dev" | "staging" | "production";

/** Permission decision result */
export type PermissionDecision = "allow" | "deny" | "queue_approval";

/** Engagement level name for each dial level */
export const ENGAGEMENT_LEVEL_NAMES: Record<DialLevel, EngagementLevelName> = {
  1: "observer",
  2: "advisor",
  3: "collaborator",
  4: "delegated",
  5: "autonomous",
} as const;

/** Superseded name → canonical name, for callers still using the old scheme */
export const LEGACY_ENGAGEMENT_LEVEL_ALIASES: Record<
  LegacyEngagementLevelName,
  EngagementLevelName
> = {
  "peer-programmer": "collaborator",
  "agent-team": "delegated",
  "full-agent-team": "autonomous",
} as const;

/** Per-repository autonomy dial configuration */
export interface AutonomyDial {
  readonly repo_owner: string;
  readonly repo_name: string;
  dial_level: DialLevel;
  model_preference: string | null;
  tier_restriction: EnvironmentTier | null;
  updated_by: string;
  updated_at: string;
}

/** Action classification entry */
export interface ActionClassification {
  readonly action_type: string;
  tier: ActionTier;
  required_dial_level: DialLevel;
  description: string;
  reversible: boolean;
}

/** Result of checking an action against the dial */
export interface PermissionCheckResult {
  decision: PermissionDecision;
  action_type: string;
  action_tier: ActionTier;
  required_level: DialLevel;
  current_level: DialLevel;
  engagement_level: EngagementLevelName;
  reason: string;
}

/** Minimum dial level required for each tier */
export const TIER_MIN_LEVELS: Record<ActionTier, DialLevel> = {
  T1: 1,
  T2: 2,
  T3: 3,
  T4: 4,
  T5: 5,
} as const;

/** Maximum autonomy level per environment tier */
export const ENV_MAX_LEVELS: Record<EnvironmentTier, DialLevel> = {
  local: 5,
  dev: 5,
  staging: 4,
  production: 3,
} as const;

/**
 * Map old 11-level dial values to new 5-level engagement levels.
 * 1-2 → 1, 3-4 → 2, 5-6 → 3, 7-8 → 4, 9-11 → 5
 */
export function mapLegacyDialLevel(oldLevel: number): DialLevel {
  if (oldLevel <= 2) return 1;
  if (oldLevel <= 4) return 2;
  if (oldLevel <= 6) return 3;
  if (oldLevel <= 8) return 4;
  return 5;
}

/**
 * Resolve a level from either a number or an engagement level name.
 *
 * Accepts both the canonical names and the superseded
 * peer-programmer / agent-team / full-agent-team aliases.
 */
export function resolveEngagementLevel(
  input: number | string,
): DialLevel {
  if (typeof input === "number") {
    if (input >= 1 && input <= 5) return input as DialLevel;
    // Legacy 1-11 mapping
    return mapLegacyDialLevel(input);
  }
  // String name lookup
  const nameMap: Record<string, DialLevel> = {
    observer: 1,
    advisor: 2,
    collaborator: 3,
    delegated: 4,
    autonomous: 5,
    // Superseded aliases
    "peer-programmer": 3,
    "agent-team": 4,
    "full-agent-team": 5,
  };
  const level = nameMap[input.toLowerCase()];
  if (level) return level;
  throw new Error(
    `Unknown engagement level: "${input}". Valid names: ${VALID_ENGAGEMENT_LEVEL_NAMES.join(", ")}`,
  );
}

/** Canonical engagement level names, in level order, for error messages. */
export const VALID_ENGAGEMENT_LEVEL_NAMES: readonly EngagementLevelName[] = [
  "observer",
  "advisor",
  "collaborator",
  "delegated",
  "autonomous",
] as const;
