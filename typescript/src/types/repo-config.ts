import type { ActionBudgetLimits } from "../config/runtime.js";
import type { ProtectedAction } from "../config/protected-actions.js";
import type { DialLevel } from "./autonomy.js";

export interface RepositoryAgentPolicy {
  readonly ceiling: DialLevel;
  readonly protectedActions: readonly ProtectedAction[];
  readonly budgets: Partial<ActionBudgetLimits>;
}

export interface ParsedRepositoryConfig {
  readonly agents: RepositoryAgentPolicy;
}

export interface LoadedRepositoryConfig extends ParsedRepositoryConfig {
  readonly defaultBranch: string;
  readonly etag: string | null;
}

export interface RepositoryConfigClient {
  repos: {
    get(parameters: {
      owner: string;
      repo: string;
    }): Promise<{
      data: { default_branch: string };
    }>;
    getContent(parameters: {
      owner: string;
      repo: string;
      path: string;
      ref: string;
      headers?: Record<string, string>;
    }): Promise<{
      data: unknown;
      headers?: { etag?: string };
      status?: number;
    }>;
  };
}
