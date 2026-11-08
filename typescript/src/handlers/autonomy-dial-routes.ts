/**
 * Autonomy Dial API Endpoints
 *
 * Express Router providing REST endpoints for autonomy dial management.
 *
 * Routes:
 *   GET  /api/dial/:owner/:repo  — Get dial level for a repo
 *   POST /api/dial/:owner/:repo  — Set dial level for a repo
 *   POST /api/dial/check         — Check action permission
 *   GET  /api/dial/actions       — List all classified actions
 */

import { Router } from "express";
import type { Request, Response } from "express";
import {
  type DialLevel,
  type ActionTier,
  ENGAGEMENT_LEVEL_NAMES,
  VALID_ENGAGEMENT_LEVEL_NAMES,
  resolveEngagementLevel,
} from "../types/autonomy.js";
import {
  getEffectiveBounds,
  getDialLevel,
  setDialLevel,
} from "../services/autonomy-dial.js";
import { getRuntimePolicy } from "../config/runtime.js";
import {
  getAllActions,
  classifyAction,
  getTierSummary,
} from "../services/action-classifier.js";
import { actionGate } from "../services/action-gate.js";
import { recordAuditEvent } from "../services/audit-log.js";
import {
  getRepositoryConfig,
} from "../services/repo-config.js";
import type {
  LoadedRepositoryConfig,
  RepositoryConfigClient,
} from "../types/repo-config.js";
import { getRepositoryInstallationOctokit } from "../utils/auth.js";

export type RepositoryConfigLoader = (
  owner: string,
  repo: string,
) => Promise<LoadedRepositoryConfig>;

async function loadRepositoryConfigFromGitHub(
  owner: string,
  repo: string,
): Promise<LoadedRepositoryConfig> {
  const client: RepositoryConfigClient =
    await getRepositoryInstallationOctokit(owner, repo);
  return getRepositoryConfig(client, owner, repo);
}

function getRepositoryCeiling(
  owner: string,
  repo: string,
  config: LoadedRepositoryConfig,
  policy: ReturnType<typeof getRuntimePolicy>,
): DialLevel {
  const operatorCeiling =
    policy.repoCeilings.get(`${owner}/${repo}`.toLowerCase()) ??
    config.agents.ceiling;
  return Math.min(config.agents.ceiling, operatorCeiling) as DialLevel;
}

export function createAutonomyDialRouter(
  loadRepositoryConfig: RepositoryConfigLoader =
    loadRepositoryConfigFromGitHub,
) {
  const router = Router();

/** Extract a single string from an Express 5 param (which may be string | string[]) */
function paramStr(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

// ─── GET /api/dial/actions — List all classified actions ────────────────────
// Note: This route must be registered BEFORE /:owner/:repo to avoid conflict.

router.get("/actions", (_req: Request, res: Response): void => {
  try {
    const actions = getAllActions();
    const tierSummary = getTierSummary();

    res.json({
      actions,
      tiers: tierSummary,
      totalActions: Object.keys(actions).length,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list actions";
    res.status(500).json({
      error: "Internal Server Error",
      message,
    });
  }
});

// ─── POST /api/dial/check — Check action permission ────────────────────────
// Note: This route must be registered BEFORE /:owner/:repo to avoid conflict.

router.post("/check", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;

    const action = body["action"] as string | undefined;
    const owner = body["owner"] as string | undefined;
    const repo = body["repo"] as string | undefined;
    const branchName = body["branchName"] as string | undefined;
    // Validate required fields
    if (!action) {
      res.status(400).json({
        error: "Bad Request",
        message: "action is required",
      });
      return;
    }

    if (!owner || !repo) {
      res.status(400).json({
        error: "Bad Request",
        message: "owner and repo are required",
      });
      return;
    }

    let repositoryConfig: LoadedRepositoryConfig;
    try {
      repositoryConfig = await loadRepositoryConfig(owner, repo);
    } catch {
      console.error(
        JSON.stringify({
          msg: "repository policy unavailable",
          repo: `${owner}/${repo}`,
        }),
      );
      res.status(503).json({
        error: "Service Unavailable",
        code: "REPO_CONFIG_UNAVAILABLE",
        message: "Repository policy could not be loaded; retry the request.",
      });
      return;
    }

    // Classify the action and check permission
    const classification = classifyAction(action);
    const policy = getRuntimePolicy();
    const permissionResult = actionGate.check(
      {
        owner,
        repo,
        action,
        branchName,
        repoCeiling: getRepositoryCeiling(owner, repo, repositoryConfig, policy),
        repoProtectedActions: repositoryConfig.agents.protectedActions,
        repoBudgets: repositoryConfig.agents.budgets,
      },
      policy,
      { consumeBudget: false },
    );

    res.json({
      action: classification.actionType,
      tier: classification.tier,
      tierName: classification.tierDetails.name,
      isKnownAction: classification.isKnownAction,
      permitted: permissionResult.allowed,
      code: permissionResult.code,
      dialLevel: permissionResult.dialLevel,
      effectiveLevel: permissionResult.effectiveLevel,
      requiredLevel: permissionResult.requiredLevel,
      retryAfterSeconds: permissionResult.retryAfterSeconds,
      reason: permissionResult.reason,
      bounds: permissionResult.bounds,
      environment: getRuntimePolicy().environment,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to check permission";
    res.status(500).json({
      error: "Internal Server Error",
      message,
    });
  }
});

// ─── GET /api/dial/:owner/:repo — Get dial level ───────────────────────────

router.get("/:owner/:repo", (req: Request, res: Response): void => {
  try {
    const owner = paramStr(req.params["owner"]);
    const repo = paramStr(req.params["repo"]);

    if (!owner || !repo) {
      res.status(400).json({
        error: "Bad Request",
        message: "owner and repo are required",
      });
      return;
    }

    const config = getDialLevel(owner, repo);

    res.json({
      ...config,
      engagementLevel: ENGAGEMENT_LEVEL_NAMES[config.dialLevel],
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to get dial level";
    res.status(500).json({
      error: "Internal Server Error",
      message,
    });
  }
});

// ─── POST /api/dial/:owner/:repo — Set dial level ──────────────────────────

router.post(
  "/:owner/:repo",
  async (req: Request, res: Response): Promise<void> => {
  try {
    const owner = paramStr(req.params["owner"]);
    const repo = paramStr(req.params["repo"]);

    if (!owner || !repo) {
      res.status(400).json({
        error: "Bad Request",
        message: "owner and repo are required",
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const rawDialLevel = body["dialLevel"] as number | undefined;
    const engagement = body["engagement"] as string | undefined;
    const updatedBy = body["updatedBy"] as string | undefined;

    // Resolve dial level from either dialLevel or engagement name
    let dialLevel: number | undefined;
    if (rawDialLevel !== undefined && rawDialLevel !== null) {
      dialLevel = rawDialLevel;
    } else if (engagement) {
      try {
        dialLevel = resolveEngagementLevel(engagement);
      } catch {
        res.status(400).json({
          error: "Bad Request",
          message: `Invalid engagement level: "${engagement}". Valid names: ${VALID_ENGAGEMENT_LEVEL_NAMES.join(", ")}`,
        });
        return;
      }
    }

    if (dialLevel === undefined || dialLevel === null) {
      res.status(400).json({
        error: "Bad Request",
        message: "dialLevel or engagement is required",
      });
      return;
    }

    if (
      typeof dialLevel !== "number" ||
      !Number.isInteger(dialLevel) ||
      dialLevel < 1 ||
      dialLevel > 5
    ) {
      res.status(400).json({
        error: "Bad Request",
        message: "dialLevel must be an integer between 1 and 5, or use engagement name",
      });
      return;
    }

    if (!updatedBy || typeof updatedBy !== "string") {
      res.status(400).json({
        error: "Bad Request",
        message: "updatedBy is required",
      });
      return;
    }

    let repositoryConfig: LoadedRepositoryConfig;
    try {
      repositoryConfig = await loadRepositoryConfig(owner, repo);
    } catch {
      console.error(
        JSON.stringify({
          msg: "repository policy unavailable",
          repo: `${owner}/${repo}`,
        }),
      );
      res.status(503).json({
        error: "Service Unavailable",
        code: "REPO_CONFIG_UNAVAILABLE",
        message: "Repository policy could not be loaded; the dial was not changed.",
      });
      return;
    }

    const policy = getRuntimePolicy();
    const repoCeiling = getRepositoryCeiling(
      owner,
      repo,
      repositoryConfig,
      policy,
    );
    if (dialLevel > repoCeiling) {
      const configUrl =
        `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/blob/${encodeURIComponent(repositoryConfig.defaultBranch)}/agentcraftworks.config.yml`;
      res.status(409).json({
        error: "Conflict",
        code: "REPO_CEILING",
        message:
          `Requested level ${dialLevel} exceeds this repository's ceiling of ${repoCeiling}. ` +
          `Update agents.ceiling in the default-branch config: ${configUrl}`,
        repoCeiling,
        configUrl,
      });
      return;
    }

    const previousLevel = getDialLevel(owner, repo).dialLevel;
    const config = setDialLevel(owner, repo, dialLevel, updatedBy);

    recordAuditEvent({
      event: "dial.changed",
      actor: "operator",
      repo: `${owner}/${repo}`,
      action: "set_dial_level",
      tier: `T${config.dialLevel}` as ActionTier,
      bounds: getEffectiveBounds(owner, repo, policy, repoCeiling),
      timestamp: new Date().toISOString(),
      details: {
        previousLevel,
        newLevel: config.dialLevel,
      },
    });

    res.json({
      ...config,
      engagementLevel: ENGAGEMENT_LEVEL_NAMES[config.dialLevel],
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to set dial level";

    // Validation errors from the service layer
    if (
      message.includes("must be an integer") ||
      message.includes("is required")
    ) {
      res.status(400).json({
        error: "Bad Request",
        message,
      });
      return;
    }

    res.status(500).json({
      error: "Internal Server Error",
      message,
    });
  }
  },
);

  return router;
}

export default createAutonomyDialRouter();
