/**
 * Permission Checker Middleware
 *
 * Express middleware that validates agent actions against autonomy dial settings.
 * Ported from the reference JS codebase (permission-checker.js).
 */

import type { Request, Response, NextFunction } from "express";
import type { ActionTier, DialLevel } from "../types/autonomy.js";
import {
  isActionPermitted as dialIsActionPermitted,
} from "../services/autonomy-dial.js";
import {
  classifyAction,
  type TierDetails,
} from "../services/action-classifier.js";

// ─── Types ────────────────────────────────────────────────────────────────────────────

export interface ActionRequest {
  repoOwner: string;
  repoName: string;
  agentSlug: string;
  actionType: string;
  actionDetails?: Record<string, unknown>;
  prNumber?: number | null;
  issueNumber?: number | null;
  userLogin?: string | null;
}

export interface PermissionResult {
  permitted: boolean;
  dialLevel: DialLevel;
  requiredLevel: DialLevel;
  tier: ActionTier;
  tierDetails: TierDetails;
  actionType: string;
  reason: string;
}

// ─── Core permission check ────────────────────────────────────────────────────────

export function checkActionPermission(
  actionRequest: ActionRequest,
): PermissionResult {
  const {
    repoOwner,
    repoName,
    agentSlug,
    actionType,
  } = actionRequest;

  if (!repoOwner || !repoName || !agentSlug || !actionType) {
    throw new Error(
      "repoOwner, repoName, agentSlug, and actionType are required",
    );
  }

  const result = dialIsActionPermitted(
    repoOwner,
    repoName,
    actionType,
  );

  const classification = classifyAction(actionType);

  return {
    permitted: result.permitted,
    dialLevel: result.dialLevel,
    requiredLevel: result.requiredLevel,
    tier: result.tier,
    tierDetails: classification.tierDetails,
    actionType: classification.actionType,
    reason: result.reason,
  };
}

// ─── Express Middleware ───────────────────────────────────────────────────────────

export type ContextExtractor = (req: Request) => Partial<ActionRequest>;

export function requirePermission(
  actionType: string,
  extractContext?: ContextExtractor,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const context: Partial<ActionRequest> = extractContext
        ? extractContext(req)
        : {};

      const repoOwner =
        context.repoOwner ??
        (req.params as Record<string, string>)["owner"] ??
        (req.query as Record<string, string>)["owner"];

      const repoName =
        context.repoName ??
        (req.params as Record<string, string>)["repo"] ??
        (req.query as Record<string, string>)["repo"];

      const agentSlug =
        context.agentSlug ??
        (req.body as Record<string, unknown>)?.["agentSlug"] as string | undefined ??
        (req.query as Record<string, string>)["agentSlug"] ??
        "@unknown";

      if (!repoOwner || !repoName) {
        res.status(400).json({
          error: "Bad Request",
          message: "Repository owner and name are required",
        });
        return;
      }

      const result = checkActionPermission({
        repoOwner,
        repoName,
        agentSlug,
        actionType,
      });

      (req as unknown as Record<string, unknown>)["permissionCheck"] = result;

      if (!result.permitted) {
        res.status(403).json({
          error: "Forbidden",
          message: result.reason,
          dialLevel: result.dialLevel,
          requiredLevel: result.requiredLevel,
          tier: result.tier,
        });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to check permissions",
      });
    }
  };
}
