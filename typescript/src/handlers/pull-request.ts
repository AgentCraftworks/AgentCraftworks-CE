/**
 * Pull Request Event Handler
 *
 * Handles GitHub webhook events for pull requests:
 *   - opened: Analyze changed files, create handoffs, route to teams
 *   - synchronize: Re-analyze on new commits
 *   - closed: Abandon active handoffs
 */

import type { Request, Response } from "express";
import {
  createHandoff,
  getHandoffByPR,
  abandonHandoff,
} from "../services/handoff-service.js";
import {
  adjustPriorityByLabel,
  hasAccessibilityReviewLabel,
  routeToAgentByLabel,
} from "../services/label-router.js";
import { isTerminalState } from "../utils/handoff-state-machine.js";
import {
  handleInstallationEvent,
  type InstallationPayload,
} from "./installation.js";

interface PullRequestPayload {
  action: string;
  pull_request: {
    number: number;
    title: string;
    user: { login: string };
    head: { ref: string; sha: string };
    base: { ref: string };
    draft: boolean;
    labels?: Array<{ name: string }>;
  };
  repository: {
    full_name: string;
    name: string;
    owner: { login: string };
  };
  installation?: { id: number };
  sender: { login: string };
}

const ACTIONABLE_EVENTS = new Set([
  "opened",
  "synchronize",
  "reopened",
  "ready_for_review",
]);

export async function handlePullRequestEvent(
  payload: PullRequestPayload,
): Promise<{
  action: string;
  handled: boolean;
  message: string;
  handoff_id?: string;
}> {
  const { action, pull_request: pr, repository: repo } = payload;

  if (action === "closed") {
    const existing = getHandoffByPR(repo.full_name, pr.number);
    if (existing) {
      if (!isTerminalState(existing.status)) {
        abandonHandoff(existing.handoff_id, "PR closed");
        return {
          action,
          handled: true,
          message: `Handoff ${existing.handoff_id} abandoned due to PR closure`,
          handoff_id: existing.handoff_id,
        };
      }
      return {
        action,
        handled: true,
        message: `Handoff ${existing.handoff_id} already in terminal state ${existing.status}`,
        handoff_id: existing.handoff_id,
      };
    }
    return {
      action,
      handled: true,
      message: "PR closed, no active handoff found",
    };
  }

  if (!ACTIONABLE_EVENTS.has(action)) {
    return {
      action,
      handled: false,
      message: `Ignored PR action: ${action}`,
    };
  }

  if (pr.draft && action !== "ready_for_review") {
    return {
      action,
      handled: false,
      message: "Draft PR \u2014 skipped until ready for review",
    };
  }

  const existingHandoff = getHandoffByPR(repo.full_name, pr.number);
  if (existingHandoff && action === "synchronize") {
    return {
      action,
      handled: true,
      message: `PR synchronized \u2014 existing handoff ${existingHandoff.handoff_id} tracked`,
      handoff_id: existingHandoff.handoff_id,
    };
  }

  const installationId = payload.installation?.id;
  const labels = pr.labels ?? [];

  // Route to agent based on PR labels (accessibility, security, docs, etc.)
  const targetAgent = routeToAgentByLabel(labels);
  const priority = adjustPriorityByLabel(labels, "medium");
  const isAccessibilityReview = hasAccessibilityReviewLabel(labels);

  const handoff = createHandoff(
    {
      task: `Review PR #${pr.number}: ${pr.title}`,
      to_agent: targetAgent,
      context: `PR by ${pr.user.login} targeting ${pr.base.ref} from ${pr.head.ref}`,
      priority,
    },
    {
      issue_number: pr.number,
      repository_full_name: repo.full_name,
      from_agent: "@pull-request-handler",
      additional: {
        installationId,
        author: pr.user.login,
        headSha: pr.head.sha,
        baseRef: pr.base.ref,
        labels: labels.map((l) => l.name),
        isAccessibilityReview,
      },
    },
  );

  return {
    action,
    handled: true,
    message: `Handoff created for PR #${pr.number}`,
    handoff_id: handoff.handoff_id,
  };
}

export async function webhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const event = req.headers["x-github-event"];

  if (!event) {
    res.status(400).json({
      error: "Bad Request",
      message: "Missing X-GitHub-Event header",
    });
    return;
  }

  try {
    if (event === "pull_request") {
      const result = await handlePullRequestEvent(
        req.body as PullRequestPayload,
      );
      res.status(200).json(result);
      return;
    }

    if (event === "ping") {
      res.status(200).json({ event: "ping", message: "pong" });
      return;
    }

    if (event === "installation" || event === "installation_repositories") {
      const result = await handleInstallationEvent(
        req.body as InstallationPayload,
      );
      res.status(200).json(result);
      return;
    }

    res.status(200).json({
      event,
      handled: false,
      message: `Event type '${event as string}' not handled`,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({
      error: "Internal Server Error",
      message,
    });
  }
}
