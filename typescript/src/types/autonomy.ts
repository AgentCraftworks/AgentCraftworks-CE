/**
 * Autonomy / Engagement Level domain types
 *
 * 5-level Agent Engagement model:
 *   1 = Observer     (T1 — read-only)
 *   2 = Advisor      (T2 — informational)
 *   3 = Collaborator (T3 — modify)
 *   4 = Delegated    (T4 — commit)        — Enterprise only
 *   5 = Autonomous   (T5 — merge/deploy)  — Enterprise only
 *
 * Community Edition permits levels 1–3 in every environment (ADR-CE-001,
 * mirroring paid ADR-077). Levels 4–5 are retained in the type system so
 * that error messages, classification tables, and Enterprise builds can
 * reference them, but the CE setter rejects them.
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

/**
 * Highest engagement level available in Community Edition (ADR-CE-001).
 * Levels above this require AgentCraftworks Enterprise.
 */
export const CE_MAX_LEVEL: DialLevel = 3;

/** Public URL surfaced in Enterprise-required error messages */
export const ENTERPRISE_UPGRADE_URL = "https://agentcraftworks.com";

/** Machine-readable code carried by Enterprise-required errors */
export const ENTERPRISE_REQUIRED_CODE = "ENTERPRISE_REQUIRED";

/** Human-readable message for level 4–5 requests in CE */
export const ENTERPRISE_REQUIRED_MESSAGE =
  `Engagement levels 4–5 (Delegated, Autonomous) require AgentCraftworks Enterprise — ${ENTERPRISE_UPGRADE_URL}`;

/**
 * Maximum autonomy level per environment tier.
 *
 * CE caps every environment at CE_MAX_LEVEL. The per-environment mechanism
 * is retained so Enterprise can raise individual caps (its defaults are
 * local 5 / dev 5 / staging 4 / production 3).
 */
export const ENV_MAX_LEVELS: Record<EnvironmentTier, DialLevel> = {
  local: CE_MAX_LEVEL,
  dev: CE_MAX_LEVEL,
  staging: CE_MAX_LEVEL,
  production: CE_MAX_LEVEL,
} as const;

/** True when the level is valid (1–5) but above the CE cap. */
export function isEnterpriseOnlyLevel(level: number): boolean {
  return Number.isInteger(level) && level > CE_MAX_LEVEL && level <= 5;
}

/**
 * Thrown when a caller requests an engagement level that requires Enterprise.
 * Carries structured fields so HTTP handlers can map it to 422 without
 * string-matching the message.
 */
export class EnterpriseLevelError extends Error {
  readonly code = ENTERPRISE_REQUIRED_CODE;
  readonly requestedLevel: number;
  readonly requestedLevelName: EngagementLevelName | null;
  readonly maxLevel: DialLevel = CE_MAX_LEVEL;
  readonly upgradeUrl = ENTERPRISE_UPGRADE_URL;

  constructor(requestedLevel: number) {
    super(ENTERPRISE_REQUIRED_MESSAGE);
    this.name = "EnterpriseLevelError";
    this.requestedLevel = requestedLevel;
    this.requestedLevelName =
      requestedLevel >= 1 && requestedLevel <= 5
        ? ENGAGEMENT_LEVEL_NAMES[requestedLevel as DialLevel]
        : null;
  }

  /** JSON-serialisable shape for API error bodies */
  toJSON(): {
    code: string;
    message: string;
    requestedLevel: number;
    requestedLevelName: EngagementLevelName | null;
    maxLevel: DialLevel;
    upgradeUrl: string;
  } {
    return {
      code: this.code,
      message: this.message,
      requestedLevel: this.requestedLevel,
      requestedLevelName: this.requestedLevelName,
      maxLevel: this.maxLevel,
      upgradeUrl: this.upgradeUrl,
    };
  }
}

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
    // Superseded names kept as API aliases (decision D-1)
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
