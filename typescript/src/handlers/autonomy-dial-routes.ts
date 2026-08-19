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
import type { EnvironmentTier } from "../types/autonomy.js";
import {
  ENGAGEMENT_LEVEL_NAMES,
  VALID_ENGAGEMENT_LEVEL_NAMES,
  resolveEngagementLevel,
} from "../types/autonomy.js";
import {
  getDialLevel,
  setDialLevel,
  isActionPermitted,
} from "../services/autonomy-dial.js";
import {
  getAllActions,
  classifyAction,
  getTierSummary,
} from "../services/action-classifier.js";

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

router.post("/check", (req: Request, res: Response): void => {
  try {
    const body = req.body as Record<string, unknown>;

    const action = body["action"] as string | undefined;
    const owner = body["owner"] as string | undefined;
    const repo = body["repo"] as string | undefined;
    const environment = body["environment"] as EnvironmentTier | undefined;

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

    // Classify the action and check permission
    const classification = classifyAction(action);
    const permissionResult = isActionPermitted(
      owner,
      repo,
      action,
      environment,
    );

    res.json({
      action: classification.actionType,
      tier: classification.tier,
      tierName: classification.tierDetails.name,
      isKnownAction: classification.isKnownAction,
      permitted: permissionResult.permitted,
      dialLevel: permissionResult.dialLevel,
      effectiveLevel: permissionResult.effectiveLevel,
      requiredLevel: permissionResult.requiredLevel,
      reason: permissionResult.reason,
      environment: environment ?? null,
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

router.post("/:owner/:repo", (req: Request, res: Response): void => {
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

    const config = setDialLevel(owner, repo, dialLevel, updatedBy);

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
});

export default router;
