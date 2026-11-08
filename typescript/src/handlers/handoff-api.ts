/**
 * Handoff API Endpoints
 *
 * Express Router providing REST endpoints for handoff lifecycle management.
 *
 * Routes:
 *   POST   /api/handoffs              \u2014 Create handoff
 *   GET    /api/handoffs/stats         \u2014 Get statistics
 *   GET    /api/handoffs/:id           \u2014 Get handoff by ID
 *   POST   /api/handoffs/:id/accept   \u2014 Accept handoff
 *   POST   /api/handoffs/:id/complete \u2014 Complete handoff
 *   GET    /api/handoffs               \u2014 List handoffs (with filters)
 */

import { Router } from "express";
import type { Request, Response } from "express";
import type {
  HandoffState,
  HandoffFilters,
  CreateHandoffInput,
  HandoffMetadata,
  Priority,
} from "../types/handoff.js";
import {
  createHandoff,
  getHandoff,
  listHandoffs,
  acceptHandoff,
  completeHandoff,
  getHandoffStats,
} from "../services/handoff-service.js";

const router = Router();

const VALID_PRIORITIES: ReadonlySet<string> = new Set(["low", "medium", "high", "critical"]);

function paramStr(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

router.post("/", (req: Request, res: Response): void => {
  try {
    const body = req.body as Record<string, unknown>;

    if (!body["task"] || typeof body["task"] !== "string") {
      res.status(400).json({
        error: "Bad Request",
        message: "task is required and must be a string",
      });
      return;
    }

    const rawPriority = body["priority"];
    if (rawPriority != null && (typeof rawPriority !== "string" || !VALID_PRIORITIES.has(rawPriority))) {
      res.status(400).json({
        error: "Bad Request",
        message: "priority must be one of: low, medium, high, critical",
      });
      return;
    }

    const handoffData: CreateHandoffInput = {
      task: body["task"] as string,
      to_agent: (body["to_agent"] ?? body["to"]) as string | undefined,
      context: body["context"] as string | undefined,
      priority: rawPriority as Priority | undefined,
      completed_work: body["completed_work"] as readonly string[] | undefined,
      blockers: body["blockers"] as readonly string[] | undefined,
      outputs: body["outputs"] as Record<string, unknown> | undefined,
      dependencies: body["dependencies"] as readonly string[] | undefined,
      sla: body["sla"] as number | string | undefined,
    };

    const metadata: HandoffMetadata = {
      issue_number: body["issue_number"] as number | undefined,
      repository_full_name: body["repository"] as string | undefined,
      from_agent: body["from_agent"] as string | undefined,
      sla_hours: body["sla_hours"] as number | undefined,
    };

    const handoff = createHandoff(handoffData, metadata);
    res.status(201).json({
      ...handoff,
      status: "recorded",
      handoff_status: handoff.status,
      message: "Handoff recorded; no agent was dispatched.",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create handoff";
    res.status(500).json({ error: "Internal Server Error", message });
  }
});

router.get("/stats", (_req: Request, res: Response): void => {
  try {
    const stats = getHandoffStats();
    res.json(stats);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to get stats";
    res.status(500).json({ error: "Internal Server Error", message });
  }
});

router.get("/:id", (req: Request, res: Response): void => {
  try {
    const handoffId = paramStr(req.params["id"]);
    if (!handoffId) {
      res.status(400).json({ error: "Bad Request", message: "Handoff ID is required" });
      return;
    }
    const handoff = getHandoff(handoffId);
    if (!handoff) {
      res.status(404).json({ error: "Not Found", message: `Handoff not found: ${handoffId}` });
      return;
    }
    res.json(handoff);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get handoff";
    res.status(500).json({ error: "Internal Server Error", message });
  }
});

router.post("/:id/accept", (req: Request, res: Response): void => {
  try {
    const handoffId = paramStr(req.params["id"]);
    if (!handoffId) {
      res.status(400).json({ error: "Bad Request", message: "Handoff ID is required" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const acceptedBy = (body["agent_name"] ?? body["accepted_by"]) as string | undefined;
    const handoff = acceptHandoff(handoffId, acceptedBy);
    if (!handoff) {
      res.status(404).json({ error: "Not Found", message: `Handoff not found: ${handoffId}` });
      return;
    }
    res.json(handoff);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to accept handoff";
    if (message.includes("Invalid state transition")) {
      res.status(409).json({ error: "Conflict", message });
      return;
    }
    res.status(500).json({ error: "Internal Server Error", message });
  }
});

router.post("/:id/complete", (req: Request, res: Response): void => {
  try {
    const handoffId = paramStr(req.params["id"]);
    if (!handoffId) {
      res.status(400).json({ error: "Bad Request", message: "Handoff ID is required" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const outputs = body["outputs"] as Record<string, unknown> | undefined;
    const handoff = completeHandoff(handoffId, outputs);
    if (!handoff) {
      res.status(404).json({ error: "Not Found", message: `Handoff not found: ${handoffId}` });
      return;
    }
    res.json(handoff);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to complete handoff";
    if (message.includes("Invalid state transition")) {
      res.status(409).json({ error: "Conflict", message });
      return;
    }
    res.status(500).json({ error: "Internal Server Error", message });
  }
});

router.get("/", (req: Request, res: Response): void => {
  try {
    const filters: HandoffFilters = {};
    const status = paramStr(req.query["status"] as string | string[] | undefined);
    const toAgent = paramStr(req.query["to_agent"] as string | string[] | undefined);
    const fromAgent = paramStr(req.query["from_agent"] as string | string[] | undefined);
    const repo = paramStr(req.query["repo"] as string | string[] | undefined);
    const repoFullName = paramStr(req.query["repository_full_name"] as string | string[] | undefined);
    if (status) filters.status = status as HandoffState;
    if (toAgent) filters.to_agent = toAgent;
    if (fromAgent) filters.from_agent = fromAgent;
    if (repo) filters.repository_full_name = repo;
    if (repoFullName) filters.repository_full_name = repoFullName;
    const handoffs = listHandoffs(filters);
    res.json({ handoffs, count: handoffs.length, filters });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list handoffs";
    res.status(500).json({ error: "Internal Server Error", message });
  }
});

export default router;
