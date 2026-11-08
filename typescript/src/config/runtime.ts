import type { DialLevel, EnvironmentTier } from "../types/autonomy.js";
import { ENV_MAX_LEVELS } from "../types/autonomy.js";
import {
  PROTECTED_ACTIONS,
  type ProtectedAction,
} from "./protected-actions.js";

export const DEFAULT_REPO_CEILING: DialLevel = 3;

const ENVIRONMENTS: readonly EnvironmentTier[] = [
  "local",
  "dev",
  "staging",
  "production",
];

export interface RuntimePolicy {
  readonly environment: EnvironmentTier;
  readonly environmentMaxLevels: Readonly<Record<EnvironmentTier, DialLevel>>;
  readonly globalMaxLevel: DialLevel;
  readonly agentsPaused: boolean;
  readonly repoCeilings: ReadonlyMap<string, DialLevel>;
  readonly allowedProtectedActions: ReadonlySet<ProtectedAction>;
}

let runtimePolicy: RuntimePolicy | undefined;

function isEnvironmentTier(value: string): value is EnvironmentTier {
  return ENVIRONMENTS.includes(value as EnvironmentTier);
}

function parseLevel(value: string, setting: string): DialLevel {
  if (!/^[1-5]$/.test(value)) {
    throw new Error(`${setting} must be an integer between 1 and 5`);
  }
  return Number(value) as DialLevel;
}

export function resolveEnvironmentTier(
  env: Record<string, string | undefined> = process.env,
  warn: (message: string) => void = (message) => console.warn(message),
): EnvironmentTier {
  const raw = env["GH_CE_ENVIRONMENT"];
  if (raw === undefined) {
    warn(
      "GH_CE_ENVIRONMENT is unset; defaulting to production environment policy.",
    );
    return "production";
  }

  const environment = raw.trim().toLowerCase();
  if (!isEnvironmentTier(environment)) {
    throw new Error(
      `Invalid GH_CE_ENVIRONMENT "${raw}". Expected local, dev, staging, or production.`,
    );
  }
  return environment;
}

function parseEnvironmentMaxLevels(
  raw: string | undefined,
): Record<EnvironmentTier, DialLevel> {
  const levels: Record<EnvironmentTier, DialLevel> = { ...ENV_MAX_LEVELS };
  if (raw === undefined) return levels;
  const seen = new Set<EnvironmentTier>();

  for (const entry of raw.split(",")) {
    const [name, value, ...extra] = entry.split("=").map((part) => part.trim());
    if (
      !name ||
      !value ||
      extra.length > 0 ||
      !isEnvironmentTier(name) ||
      Object.prototype.hasOwnProperty.call(levels, name) === false
    ) {
      throw new Error(
        `Invalid GH_CE_ENV_MAX_LEVELS entry "${entry}". Use tier=level entries for local, dev, staging, or production.`,
      );
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate environment "${name}" in GH_CE_ENV_MAX_LEVELS`);
    }
    seen.add(name);
    levels[name] = parseLevel(value, `GH_CE_ENV_MAX_LEVELS (${name})`);
  }
  return levels;
}

function parseRepoCeilings(
  raw: string | undefined,
): ReadonlyMap<string, DialLevel> {
  const ceilings = new Map<string, DialLevel>();
  if (raw === undefined) return ceilings;

  for (const entry of raw.split(",")) {
    const separator = entry.lastIndexOf("=");
    const repository = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (
      separator < 0 ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
      ceilings.has(repository.toLowerCase())
    ) {
      throw new Error(
        `Invalid GH_CE_REPO_CEILINGS entry "${entry}". Use unique owner/repo=level entries.`,
      );
    }
    ceilings.set(
      repository.toLowerCase(),
      parseLevel(value, `GH_CE_REPO_CEILINGS (${repository})`),
    );
  }
  return ceilings;
}

function parsePaused(raw: string | undefined): boolean {
  if (raw === undefined || raw.toLowerCase() === "false") return false;
  if (raw.toLowerCase() === "true") return true;
  throw new Error("GH_CE_AGENTS_PAUSED must be true or false");
}

function parseOperatorProtectedActions(
  raw: string | undefined,
): ReadonlySet<ProtectedAction> {
  const allowed = new Set<ProtectedAction>();
  if (raw === undefined || raw.trim() === "") return allowed;

  for (const entry of raw.split(",")) {
    const action = entry.trim().toLowerCase();
    if (!PROTECTED_ACTIONS.includes(action as ProtectedAction)) {
      throw new Error(
        `Invalid GH_CE_ALLOW_PROTECTED_ACTIONS entry "${entry}".`,
      );
    }
    allowed.add(action as ProtectedAction);
  }
  return allowed;
}

export function loadRuntimePolicy(
  env: Record<string, string | undefined> = process.env,
  warn?: (message: string) => void,
): RuntimePolicy {
  return {
    environment: resolveEnvironmentTier(env, warn),
    environmentMaxLevels: parseEnvironmentMaxLevels(
      env["GH_CE_ENV_MAX_LEVELS"],
    ),
    globalMaxLevel:
      env["GH_CE_MAX_LEVEL"] === undefined
        ? 5
        : parseLevel(env["GH_CE_MAX_LEVEL"], "GH_CE_MAX_LEVEL"),
    agentsPaused: parsePaused(env["GH_CE_AGENTS_PAUSED"]),
    repoCeilings: parseRepoCeilings(env["GH_CE_REPO_CEILINGS"]),
    allowedProtectedActions: parseOperatorProtectedActions(
      env["GH_CE_ALLOW_PROTECTED_ACTIONS"],
    ),
  };
}

export function configureRuntimePolicy(
  env: Record<string, string | undefined> = process.env,
): RuntimePolicy {
  runtimePolicy = loadRuntimePolicy(env);
  return runtimePolicy;
}

export function getRuntimePolicy(): RuntimePolicy {
  runtimePolicy ??= loadRuntimePolicy();
  return runtimePolicy;
}

export function summarizeRuntimePolicy(
  policy: RuntimePolicy = getRuntimePolicy(),
): {
  environment: EnvironmentTier;
  environmentCeiling: DialLevel;
  globalCeiling: DialLevel;
  defaultRepositoryCeiling: DialLevel;
  agentsPaused: boolean;
} {
  return {
    environment: policy.environment,
    environmentCeiling: policy.environmentMaxLevels[policy.environment],
    globalCeiling: policy.globalMaxLevel,
    defaultRepositoryCeiling: DEFAULT_REPO_CEILING,
    agentsPaused: policy.agentsPaused,
  };
}
