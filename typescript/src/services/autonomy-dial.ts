/**
 * Autonomy Dial Service
 *
 * In-memory implementation of per-repository autonomy dial settings.
 * Part of the Autonomy Dial system for dynamic AI agent permission control.
 *
 * Ported from the reference JS codebase (autonomy-dial.js).
 * The JS version uses PostgreSQL; this Community Edition version uses an in-memory Map.
 */

import type {
  DialLevel,
  EnvironmentTier,
  ActionTier,
} from "../types/autonomy.js";
import { ENV_MAX_LEVELS } from "../types/autonomy.js";
import { classifyAction } from "./action-classifier.js";

// ─── Constants ──────────────────────────────────────────────────────────────────────

export const DEFAULT_DIAL_LEVEL: DialLevel = 1;

// ─── In-memory storage ──────────────────────────────────────────────────────────────

interface DialRecord {
  repoOwner: string;
  repoName: string;
  dialLevel: DialLevel;
  updatedBy: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

/**
 * Key format: "owner/repo" -> DialRecord
 */
const dialStore = new Map<string, DialRecord>();

function makeKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────────────

export interface DialConfig {
  repoOwner: string;
  repoName: string;
  dialLevel: DialLevel;
  updatedBy: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  isDefault: boolean;
}

/**
 * Get autonomy dial level for a repository.
 * Returns DEFAULT_DIAL_LEVEL if not configured.
 */
export function getDialLevel(
  repoOwner: string,
  repoName: string,
): DialConfig {
  if (!repoOwner || !repoName) {
    throw new Error("Repository owner and name are required");
  }

  const key = makeKey(repoOwner, repoName);
  const record = dialStore.get(key);

  if (!record) {
    return {
      repoOwner,
      repoName,
      dialLevel: DEFAULT_DIAL_LEVEL,
      updatedBy: null,
      updatedAt: null,
      createdAt: null,
      isDefault: true,
    };
  }

  return {
    repoOwner: record.repoOwner,
    repoName: record.repoName,
    dialLevel: record.dialLevel,
    updatedBy: record.updatedBy,
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
    isDefault: false,
  };
}

/**
 * Set autonomy dial level for a repository.
 * Validates range 1-5.
 */
export function setDialLevel(
  repoOwner: string,
  repoName: string,
  dialLevel: number,
  updatedBy: string,
): DialConfig {
  if (!repoOwner || !repoName) {
    throw new Error("Repository owner and name are required");
  }

  if (!Number.isInteger(dialLevel) || dialLevel < 1 || dialLevel > 5) {
    throw new Error("Dial level must be an integer between 1 and 5");
  }

  if (!updatedBy) {
    throw new Error("updatedBy (GitHub user) is required");
  }

  const key = makeKey(repoOwner, repoName);
  const existing = dialStore.get(key);
  const now = new Date().toISOString();

  const record: DialRecord = {
    repoOwner,
    repoName,
    dialLevel: dialLevel as DialLevel,
    updatedBy,
    updatedAt: now,
    createdAt: existing?.createdAt ?? now,
  };

  dialStore.set(key, record);

  return {
    ...record,
    isDefault: false,
  };
}

/**
 * Check whether an action is permitted for a given repo,
 * factoring in the autonomy dial and optional environment tier cap.
 */
export function isActionPermitted(
  owner: string,
  repo: string,
  actionType: string,
  envTier?: EnvironmentTier,
): {
  permitted: boolean;
  dialLevel: DialLevel;
  effectiveLevel: DialLevel;
  requiredLevel: DialLevel;
  tier: ActionTier;
  reason: string;
} {
  const config = getDialLevel(owner, repo);
  const effectiveLevel = getEffectiveLevel(owner, repo, envTier);
  const classification = classifyAction(actionType);
  const requiredLevel = classification.tierDetails.requiredDialLevel;
  const permitted = effectiveLevel >= requiredLevel;

  const reason = permitted
    ? `Action permitted: effective level ${effectiveLevel} meets requirement ${requiredLevel} for ${classification.tier}`
    : `Action blocked: effective level ${effectiveLevel} insufficient for ${classification.tier}, requires ${requiredLevel}`;

  return {
    permitted,
    dialLevel: config.dialLevel,
    effectiveLevel,
    requiredLevel,
    tier: classification.tier,
    reason,
  };
}

/**
 * Get the effective dial level, applying environment tier cap.
 */
export function getEffectiveLevel(
  owner: string,
  repo: string,
  envTier?: EnvironmentTier,
): DialLevel {
  const config = getDialLevel(owner, repo);
  if (!envTier) return config.dialLevel;

  const envCap = ENV_MAX_LEVELS[envTier];
  return Math.min(config.dialLevel, envCap) as DialLevel;
}

/**
 * Clear all dial configurations (for testing).
 */
export function clearAllDials(): void {
  dialStore.clear();
}
