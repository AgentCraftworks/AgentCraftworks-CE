/**
 * Action Gate
 *
 * Single entry point the webhook path uses before performing any write
 * against GitHub (label, comment, review request, assignment, ...).
 *
 * Resolves the repository's engagement dial, applies the environment cap
 * derived from NODE_ENV, and asks the permission checker whether the action's
 * tier is permitted. Callers must not perform the write when `allowed` is false.
 */

import type {
  ActionTier,
  DialLevel,
  EngagementLevelName,
  EnvironmentTier,
} from "../types/autonomy.js";
import { ENGAGEMENT_LEVEL_NAMES, ENV_MAX_LEVELS } from "../types/autonomy.js";
import { checkActionPermission } from "../middleware/permission-checker.js";
import { getEffectiveLevel } from "./autonomy-dial.js";

// ─── Types ────────────────────────────────────────────────────────────────────────────

/** Write actions the PR webhook path gates, plus any catalog action type. */
export type ActionType =
  | "add_label"
  | "remove_label"
  | "post_comment"
  | "assign_user"
  | "request_review"
  | (string & {});

export interface GateDecision {
  allowed: boolean;
  action: string;
  /** Configured dial level for the repository (before environment cap). */
  level: DialLevel;
  /** Dial level after applying the environment cap. */
  effectiveLevel: DialLevel;
  /** Engagement level name for `effectiveLevel`. */
  levelName: EngagementLevelName;
  requiredLevel: DialLevel;
  tier: ActionTier;
  env: EnvironmentTier;
  reason: string;
}

// ─── Environment ──────────────────────────────────────────────────────────────────────

/**
 * Map NODE_ENV to an environment tier.
 * `production` → production, `staging` → staging, anything else → dev.
 */
export function resolveEnvironmentTier(
  nodeEnv: string | undefined = process.env["NODE_ENV"],
): EnvironmentTier {
  const normalized = (nodeEnv ?? "").trim().toLowerCase();
  if (normalized === "production") return "production";
  if (normalized === "staging") return "staging";
  return "dev";
}

// ─── Gate ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide whether `action` may be performed against `owner/repo` in `env`.
 */
export function gateAction(
  owner: string,
  repo: string,
  action: ActionType,
  env: EnvironmentTier = resolveEnvironmentTier(),
  agentSlug = "@pull-request-handler",
): GateDecision {
  const result = checkActionPermission({
    repoOwner: owner,
    repoName: repo,
    agentSlug,
    actionType: action,
    envTier: env,
  });

  const effectiveLevel = getEffectiveLevel(owner, repo, env);

  return {
    allowed: result.permitted,
    action: result.actionType,
    level: result.dialLevel,
    effectiveLevel,
    levelName: ENGAGEMENT_LEVEL_NAMES[effectiveLevel],
    requiredLevel: result.requiredLevel,
    tier: result.tier,
    env,
    reason: result.reason,
  };
}

/**
 * Whether the repository may post comments (T2+) in the given environment.
 * Used to decide if a denial can be explained on the PR itself.
 */
export function canComment(
  owner: string,
  repo: string,
  env: EnvironmentTier = resolveEnvironmentTier(),
): boolean {
  return gateAction(owner, repo, "post_comment", env).allowed;
}

/**
 * Human-readable guidance appended to denial comments.
 */
export function describeDenial(decision: GateDecision): string {
  const envCap = ENV_MAX_LEVELS[decision.env];
  const capNote =
    decision.effectiveLevel < decision.level
      ? ` (capped from ${decision.level} by the \`${decision.env}\` environment, max ${envCap})`
      : "";
  return (
    `\`${decision.action}\` is a ${decision.tier} action and requires engagement level ` +
    `${decision.requiredLevel}. This repository is at level ${decision.effectiveLevel} ` +
    `(${decision.levelName})${capNote}.`
  );
}
