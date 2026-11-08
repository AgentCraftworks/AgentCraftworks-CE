import { parseDocument } from "yaml";
import { DEFAULT_REPO_CEILING, type ActionBudgetTier } from "../config/runtime.js";
import {
  PROTECTED_ACTIONS,
  type ProtectedAction,
} from "../config/protected-actions.js";
import type { DialLevel } from "../types/autonomy.js";
import type {
  LoadedRepositoryConfig,
  ParsedRepositoryConfig,
  RepositoryAgentPolicy,
} from "../types/repo-config.js";

const CONFIG_PATH = "agentcraftworks.config.yml";
const CONFIG_TTL_MS = 60_000;
const MAX_CONFIG_BYTES = 64 * 1024;
const DEFAULT_AGENT_POLICY: RepositoryAgentPolicy = Object.freeze({
  ceiling: DEFAULT_REPO_CEILING,
  protectedActions: Object.freeze([]),
  budgets: Object.freeze({}),
});
const DEFAULT_CONFIG: ParsedRepositoryConfig = Object.freeze({
  agents: DEFAULT_AGENT_POLICY,
});

interface GitHubResponse<T> {
  data: T;
  headers?: {
    etag?: string;
  };
  status?: number;
}

export interface RepositoryConfigClient {
  repos: {
    get(parameters: {
      owner: string;
      repo: string;
    }): Promise<GitHubResponse<{ default_branch: string }>>;
    getContent(parameters: {
      owner: string;
      repo: string;
      path: string;
      ref: string;
      headers?: Record<string, string>;
    }): Promise<GitHubResponse<unknown>>;
  };
}

interface CacheEntry extends ParsedRepositoryConfig {
  defaultBranch: string;
  etag: string | null;
  expiresAt: number;
}

const configCache = new Map<string, CacheEntry>();
const inFlightLoads = new Map<string, Promise<LoadedRepositoryConfig>>();
const cacheGenerations = new Map<string, number>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function warnUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  warn: (message: string) => void,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) warn(`Unknown ${path} key "${key}" in ${CONFIG_PATH}.`);
  }
}

function parseLevel(value: unknown): DialLevel {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 5
  ) {
    throw new Error(`${CONFIG_PATH} agents.ceiling must be an integer from 1 to 5.`);
  }
  return value as DialLevel;
}

function parseProtectedActions(value: unknown): readonly ProtectedAction[] {
  if (value === undefined) return DEFAULT_AGENT_POLICY.protectedActions;
  if (
    !Array.isArray(value) ||
    value.some(
      (action) =>
        typeof action !== "string" ||
        !PROTECTED_ACTIONS.includes(action as ProtectedAction),
    )
  ) {
    throw new Error(
      `${CONFIG_PATH} agents.protected_actions must contain only protected action names.`,
    );
  }
  return Object.freeze([...new Set(value as ProtectedAction[])]);
}

function parseBudgets(value: unknown): Partial<Record<ActionBudgetTier, number>> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error(`${CONFIG_PATH} agents.budgets must be a mapping.`);
  }

  const budgets: Partial<Record<ActionBudgetTier, number>> = {};
  for (const [tier, rawLimit] of Object.entries(value)) {
    if (tier !== "T4" && tier !== "T5") continue;
    const match =
      typeof rawLimit === "string" ? /^([1-9]\d*)\/h$/.exec(rawLimit) : null;
    if (!match) {
      throw new Error(
        `${CONFIG_PATH} agents.budgets.${tier} must be a positive rate such as 20/h.`,
      );
    }
    const limit = Number(match[1]);
    if (!Number.isSafeInteger(limit)) {
      throw new Error(
        `${CONFIG_PATH} agents.budgets.${tier} must be a positive safe integer.`,
      );
    }
    budgets[tier] = limit;
  }
  return Object.freeze(budgets);
}

export function parseRepositoryConfig(
  source: string,
  warn: (message: string) => void = (message) => console.warn(message),
): ParsedRepositoryConfig {
  if (Buffer.byteLength(source, "utf8") > MAX_CONFIG_BYTES) {
    throw new Error(`${CONFIG_PATH} exceeds the 64 KiB size limit.`);
  }

  const document = parseDocument(source, { uniqueKeys: true, strict: true });
  if (document.errors.length > 0) {
    throw new Error(`${CONFIG_PATH} contains invalid YAML.`);
  }

  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 50 });
  } catch {
    throw new Error(`${CONFIG_PATH} contains invalid YAML values.`);
  }

  if (!isRecord(value)) {
    throw new Error(`${CONFIG_PATH} must contain a YAML mapping.`);
  }
  warnUnknownKeys(value, new Set(["version", "agents"]), "root", warn);
  if (value["version"] !== "1") {
    throw new Error(`${CONFIG_PATH} version must be the string "1".`);
  }

  const agents = value["agents"];
  if (agents === undefined) return DEFAULT_CONFIG;
  if (!isRecord(agents)) {
    throw new Error(`${CONFIG_PATH} agents must be a mapping.`);
  }

  warnUnknownKeys(
    agents,
    new Set(["ceiling", "protected_actions", "budgets"]),
    "agents",
    warn,
  );
  const policy: RepositoryAgentPolicy = Object.freeze({
    ceiling:
      agents["ceiling"] === undefined
        ? DEFAULT_REPO_CEILING
        : parseLevel(agents["ceiling"]),
    protectedActions: parseProtectedActions(agents["protected_actions"]),
    budgets: parseBudgetsWithWarning(agents["budgets"], warn),
  });
  return Object.freeze({ agents: policy });
}

function parseBudgetsWithWarning(
  value: unknown,
  warn: (message: string) => void,
): Partial<Record<ActionBudgetTier, number>> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error(`${CONFIG_PATH} agents.budgets must be a mapping.`);
  }
  warnUnknownKeys(value, new Set(["T4", "T5"]), "agents.budgets", warn);
  return parseBudgets(value);
}

function repositoryKey(owner: string, repo: string): string {
  if (!owner.trim() || !repo.trim()) {
    throw new Error("Repository owner and name are required.");
  }
  return `${owner}/${repo}`.toLowerCase();
}

function getStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
}

function loadedConfig(entry: CacheEntry): LoadedRepositoryConfig {
  return {
    agents: entry.agents,
    defaultBranch: entry.defaultBranch,
    etag: entry.etag,
  };
}

function cacheConfig(
  key: string,
  config: ParsedRepositoryConfig,
  defaultBranch: string,
  etag: string | null,
  now: number,
  generation: number,
): LoadedRepositoryConfig {
  const entry: CacheEntry = {
    ...config,
    defaultBranch,
    etag,
    expiresAt: now + CONFIG_TTL_MS,
  };
  if ((cacheGenerations.get(key) ?? 0) === generation) {
    configCache.set(key, entry);
  }
  return loadedConfig(entry);
}

async function loadRepositoryConfig(
  client: RepositoryConfigClient,
  owner: string,
  repo: string,
  key: string,
  now: number,
  warn: (message: string) => void,
  generation: number,
): Promise<LoadedRepositoryConfig> {
  const previous = configCache.get(key);
  const repository = await client.repos.get({ owner, repo });
  const defaultBranch = repository.data.default_branch;
  if (!defaultBranch) {
    throw new Error(`Could not resolve the default branch for ${owner}/${repo}.`);
  }

  const headers: Record<string, string> = {};
  if (previous?.etag && previous.defaultBranch === defaultBranch) {
    headers["If-None-Match"] = previous.etag;
  }

  let response: GitHubResponse<unknown>;
  try {
    response = await client.repos.getContent({
      owner,
      repo,
      path: CONFIG_PATH,
      ref: defaultBranch,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });
  } catch (error: unknown) {
    if (getStatus(error) === 304 && previous) {
      return cacheConfig(
        key,
        previous,
        defaultBranch,
        previous.etag,
        now,
        generation,
      );
    }
    if (getStatus(error) === 404) {
      return cacheConfig(
        key,
        DEFAULT_CONFIG,
        defaultBranch,
        null,
        now,
        generation,
      );
    }
    throw error;
  }

  if (response.status === 304 && previous) {
    return cacheConfig(
      key,
      previous,
      defaultBranch,
      previous.etag,
      now,
      generation,
    );
  }

  const content = response.data;
  if (
    !isRecord(content) ||
    content["type"] !== "file" ||
    content["encoding"] !== "base64" ||
    typeof content["content"] !== "string"
  ) {
    throw new Error(`${CONFIG_PATH} was not returned as a base64-encoded file.`);
  }
  const encoded = content["content"].replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error(`${CONFIG_PATH} contains invalid base64 content.`);
  }
  const source = Buffer.from(encoded, "base64").toString("utf8");
  const config = parseRepositoryConfig(source, warn);
  return cacheConfig(
    key,
    config,
    defaultBranch,
    response.headers?.etag ?? null,
    now,
    generation,
  );
}

export async function getRepositoryConfig(
  client: RepositoryConfigClient,
  owner: string,
  repo: string,
  options: {
    now?: number;
    warn?: (message: string) => void;
  } = {},
): Promise<LoadedRepositoryConfig> {
  const key = repositoryKey(owner, repo);
  const now = options.now ?? Date.now();
  const cached = configCache.get(key);
  if (cached && cached.expiresAt > now) return loadedConfig(cached);

  const existingLoad = inFlightLoads.get(key);
  if (existingLoad) return existingLoad;

  const load = (async (): Promise<LoadedRepositoryConfig> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const generation = cacheGenerations.get(key) ?? 0;
      const loaded = await loadRepositoryConfig(
        client,
        owner,
        repo,
        key,
        now,
        options.warn ?? ((message) => console.warn(message)),
        generation,
      );
      if ((cacheGenerations.get(key) ?? 0) === generation) return loaded;
    }
    throw new Error(
      `Repository policy for ${owner}/${repo} changed repeatedly while being loaded.`,
    );
  })();
  inFlightLoads.set(key, load);
  try {
    return await load;
  } finally {
    if (inFlightLoads.get(key) === load) inFlightLoads.delete(key);
  }
}

export function invalidateRepositoryConfig(owner: string, repo: string): void {
  const key = repositoryKey(owner, repo);
  configCache.delete(key);
  cacheGenerations.set(key, (cacheGenerations.get(key) ?? 0) + 1);
}

export function clearRepositoryConfigCache(): void {
  configCache.clear();
  inFlightLoads.clear();
  cacheGenerations.clear();
}

export const repositoryConfigCacheTtlMs = CONFIG_TTL_MS;
