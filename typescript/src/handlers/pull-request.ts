/**
 * Pull Request Event Handler
 *
 * Handles GitHub webhook events for pull requests:
 *   - opened / reopened / ready_for_review / labeled: route via CODEOWNERS
 *     (falling back to labels), create a handoff, and perform gated writes
 *   - synchronize: Re-analyze on new commits
 *   - closed: Abandon active handoffs
 *
 * Every GitHub write (label, comment, review request) passes through
 * `gateAction()` so the repository's engagement level is enforced.
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
} from "../services/label-router.js";
import {
  resolveRouting,
  type OctokitLike,
  type RoutingDecision,
} from "../services/codeowners-router.js";
import {
  canComment,
  describeDenial,
  gateAction,
  resolveEnvironmentTier,
  type ActionType,
  type GateDecision,
} from "../services/action-gate.js";
import type { EnvironmentTier } from "../types/autonomy.js";
import { getInstallationOctokit } from "../utils/auth.js";
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
  "labeled",
]);

/** Injectable collaborators (tests pass a mocked Octokit). */
export interface PullRequestHandlerDeps {
  /** Octokit for the installation; `null` disables GitHub reads/writes. */
  octokit?: OctokitLike | null;
  env?: EnvironmentTier;
  log?: (entry: Record<string, unknown>) => void;
}

export interface PullRequestResult {
  action: string;
  handled: boolean;
  message: string;
  handoff_id?: string;
  routing?: Pick<RoutingDecision, "teams" | "agents" | "source">;
  /** Gate outcome per attempted write action. */
  actions?: Array<{
    action: string;
    allowed: boolean;
    performed: boolean;
    tier: string;
    reason: string;
  }>;
}

const defaultLog = (entry: Record<string, unknown>): void => {
  // node --test sets NODE_TEST_CONTEXT; keep test output free of handler logs
  if (process.env["NODE_TEST_CONTEXT"]) return;
  console.log(JSON.stringify(entry));
};

export async function handlePullRequestEvent(
  payload: PullRequestPayload,
  deps: PullRequestHandlerDeps = {},
): Promise<PullRequestResult> {
  const { action, pull_request: pr, repository: repo } = payload;
  const log = deps.log ?? defaultLog;
  const env = deps.env ?? resolveEnvironmentTier();

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
  if (existingHandoff && (action === "synchronize" || action === "labeled")) {
    return {
      action,
      handled: true,
      message: `PR ${action === "labeled" ? "labeled" : "synchronized"} \u2014 existing handoff ${existingHandoff.handoff_id} tracked`,
      handoff_id: existingHandoff.handoff_id,
    };
  }

  const installationId = payload.installation?.id;
  const labels = pr.labels ?? [];
  const owner = repo.owner.login;

  const octokit = await resolveOctokit(deps, installationId, log, repo.full_name);

  // Routing precedence: CODEOWNERS → labels → none
  let routing: RoutingDecision;
  try {
    routing = await resolveRouting({
      octokit,
      owner,
      repo: repo.name,
      pullNumber: pr.number,
      labels,
    });
  } catch (error: unknown) {
    log({
      msg: "codeowners routing failed, falling back to labels",
      repo: repo.full_name,
      pr: pr.number,
      error: error instanceof Error ? error.message : String(error),
    });
    routing = await resolveRouting({
      octokit: null,
      owner,
      repo: repo.name,
      pullNumber: pr.number,
      labels,
    });
  }

  const targetAgent = routing.agents[0]!;
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
      teams: routing.teams,
      additional: {
        installationId,
        author: pr.user.login,
        headSha: pr.head.sha,
        baseRef: pr.base.ref,
        labels: labels.map((l) => l.name),
        isAccessibilityReview,
        routing: {
          source: routing.source,
          teams: routing.teams,
          agents: routing.agents,
          fileCount: routing.files.length,
        },
      },
    },
  );

  log({
    msg: "pr routed",
    repo: repo.full_name,
    pr: pr.number,
    handoff_id: handoff.handoff_id,
    source: routing.source,
    teams: routing.teams,
    agents: routing.agents,
  });

  const actions = await performGatedWrites({
    octokit,
    owner,
    repo: repo.name,
    repoFullName: repo.full_name,
    pr,
    routing,
    handoffId: handoff.handoff_id,
    env,
    log,
  });

  return {
    action,
    handled: true,
    message: `Handoff created for PR #${pr.number}`,
    handoff_id: handoff.handoff_id,
    routing: {
      teams: routing.teams,
      agents: routing.agents,
      source: routing.source,
    },
    actions,
  };
}

// ─── Octokit resolution ───────────────────────────────────────────────────────────────

async function resolveOctokit(
  deps: PullRequestHandlerDeps,
  installationId: number | undefined,
  log: (entry: Record<string, unknown>) => void,
  repoFullName: string,
): Promise<OctokitLike | null> {
  if (deps.octokit !== undefined) return deps.octokit;

  // Without an installation or app credentials there is nothing to authenticate with.
  const hasCredentials =
    Boolean(process.env["GH_CE_APP_ID"]) &&
    Boolean(process.env["GH_CE_APP_PRIVATE_KEY"]);
  if (!installationId || !hasCredentials) return null;

  try {
    return await getInstallationOctokit(installationId);
  } catch (error: unknown) {
    log({
      msg: "installation octokit unavailable, routing by labels only",
      repo: repoFullName,
      installationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ─── Gated writes ─────────────────────────────────────────────────────────────────────

interface GatedWriteContext {
  octokit: OctokitLike | null;
  owner: string;
  repo: string;
  repoFullName: string;
  pr: PullRequestPayload["pull_request"];
  routing: RoutingDecision;
  handoffId: string;
  env: EnvironmentTier;
  log: (entry: Record<string, unknown>) => void;
}

interface GatedWrite {
  action: ActionType;
  run: (octokit: OctokitLike) => Promise<void>;
}

/**
 * Run each write through the action gate. Denied writes are skipped, logged,
 * and summarised in a single PR comment when the level permits commenting.
 */
async function performGatedWrites(
  ctx: GatedWriteContext,
): Promise<NonNullable<PullRequestResult["actions"]>> {
  const { octokit, owner, repo, pr, routing, log } = ctx;
  const results: NonNullable<PullRequestResult["actions"]> = [];
  const denied: GateDecision[] = [];

  // No authenticated client → nothing can be written; skip gating noise.
  if (!octokit) return results;

  const writes = buildWrites(ctx);

  for (const write of writes) {
    const decision = gateAction(owner, repo, write.action, ctx.env);

    if (!decision.allowed) {
      denied.push(decision);
      log({
        msg: "action denied",
        repo: ctx.repoFullName,
        pr: pr.number,
        action: decision.action,
        tier: decision.tier,
        level: decision.level,
        effectiveLevel: decision.effectiveLevel,
        requiredLevel: decision.requiredLevel,
        env: decision.env,
        reason: decision.reason,
      });
      results.push({
        action: decision.action,
        allowed: false,
        performed: false,
        tier: decision.tier,
        reason: decision.reason,
      });
      continue;
    }

    let performed = false;
    try {
      await write.run(octokit);
      performed = true;
    } catch (error: unknown) {
      log({
        msg: "action failed",
        repo: ctx.repoFullName,
        pr: pr.number,
        action: decision.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    results.push({
      action: decision.action,
      allowed: true,
      performed,
      tier: decision.tier,
      reason: decision.reason,
    });
  }

  if (denied.length > 0 && canComment(owner, repo, ctx.env)) {
    try {
      await octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner,
          repo,
          issue_number: pr.number,
          body: buildDenialComment(denied, owner, repo, routing),
        },
      );
    } catch (error: unknown) {
      log({
        msg: "denial comment failed",
        repo: ctx.repoFullName,
        pr: pr.number,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

function buildWrites(ctx: GatedWriteContext): GatedWrite[] {
  const { owner, repo, pr, routing, handoffId } = ctx;
  const primaryAgent = routing.agents[0] ?? "@code-reviewer";
  const writes: GatedWrite[] = [];

  // T2 — label the PR with the agent it was routed to
  writes.push({
    action: "add_label",
    run: async (octokit) => {
      await octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/labels",
        {
          owner,
          repo,
          issue_number: pr.number,
          labels: [`agent:${primaryAgent.replace(/^@/, "")}`],
        },
      );
    },
  });

  // T2 — routing summary comment
  writes.push({
    action: "post_comment",
    run: async (octokit) => {
      const via =
        routing.source === "codeowners"
          ? `CODEOWNERS (${routing.teams.map((t) => `\`${t}\``).join(", ")})`
          : routing.source === "labels"
            ? "PR labels"
            : "default routing";
      await octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner,
          repo,
          issue_number: pr.number,
          body:
            `🤝 **AgentCraftworks handoff created**\n\n` +
            `Routed to ${routing.agents.map((a) => `\`${a}\``).join(", ")} via ${via}.\n` +
            `Handoff ID: \`${handoffId}\``,
        },
      );
    },
  });

  // T4 — request review from matched CODEOWNERS owners
  if (routing.source === "codeowners") {
    const teamSlugs = new Set(routing.teamSlugs);
    const teamReviewers = routing.teams.filter((t) => teamSlugs.has(t));
    const reviewers = routing.teams.filter(
      (t) => !teamSlugs.has(t) && t !== pr.user.login,
    );

    if (teamReviewers.length > 0 || reviewers.length > 0) {
      writes.push({
        action: "request_review",
        run: async (octokit) => {
          await octokit.request(
            "POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers",
            {
              owner,
              repo,
              pull_number: pr.number,
              reviewers,
              team_reviewers: teamReviewers,
            },
          );
        },
      });
    }
  }

  return writes;
}

function buildDenialComment(
  denied: GateDecision[],
  owner: string,
  repo: string,
  routing: RoutingDecision,
): string {
  const lines = denied.map((d) => `- ${describeDenial(d)}`);
  const routedTo = routing.agents.map((a) => `\`${a}\``).join(", ");
  return (
    `🔒 **AgentCraftworks blocked ${denied.length} action${denied.length === 1 ? "" : "s"}**\n\n` +
    `This PR was routed to ${routedTo} via ${routing.source}, but the following ` +
    `writes were not performed because the repository's engagement level is too low:\n\n` +
    `${lines.join("\n")}\n\n` +
    `To allow these actions, raise the engagement level with ` +
    `\`POST /api/dial/${owner}/${repo}\` (body: \`{ "dialLevel": <1-5>, "updatedBy": "<login>" }\`). ` +
    `Environment caps still apply.`
  );
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
