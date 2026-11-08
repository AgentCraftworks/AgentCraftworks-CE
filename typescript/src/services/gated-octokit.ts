import { actionGate, type ActionGateDecision } from "./action-gate.js";
import {
  getRuntimePolicy,
  type RuntimePolicy,
} from "../config/runtime.js";
import {
  getRepositoryConfig,
  isRepositoryConfigClient,
} from "./repo-config.js";
import type { RepositoryConfigClient } from "../types/repo-config.js";
import { classifyAction } from "./action-classifier.js";

const READ_ONLY_METHODS: Readonly<Record<string, ReadonlySet<string>>> = {
  actions: new Set([
    "downloadJobLogsForWorkflowRun",
    "downloadWorkflowRunLogs",
    "getWorkflowRun",
    "listJobsForWorkflowRun",
    "listRepoWorkflows",
    "listWorkflowRuns",
  ]),
  checks: new Set(["listForRef"]),
  issues: new Set(["get", "listForRepo"]),
  pulls: new Set(["get", "list", "listFiles"]),
  repos: new Set([
    "get",
    "getCommit",
    "getContent",
    "getLatestRelease",
    "listCommits",
  ]),
  git: new Set(["getRef", "getTree"]),
};

export interface GatedOctokitContext {
  owner: string;
  repo: string;
  job: string;
  policy?: RuntimePolicy;
  log?: (entry: Record<string, unknown>) => void;
  repositoryConfigClient?: RepositoryConfigClient;
}

export class ActionGateDeniedError extends Error {
  constructor(readonly decision: ActionGateDecision) {
    super(decision.reason);
    this.name = "ActionGateDeniedError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringParam(
  params: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = params?.[key];
  return typeof value === "string" ? value : undefined;
}

function actionFor(
  namespace: string,
  method: string,
  args: unknown[],
): { action: string; branchName?: string } {
  const params = asRecord(args[0]);

  if (namespace === "issues") {
    switch (method) {
      case "create":
        return { action: "create_issue" };
      case "createComment":
        return { action: "post_comment" };
      case "updateComment":
        return { action: "update_comment" };
      case "addLabel":
      case "addLabels":
        return { action: "add_label" };
      case "removeLabel":
        return { action: "remove_label" };
      case "update": {
        const state = stringParam(params, "state");
        return {
          action:
            state === "closed"
              ? "close_issue"
              : state === "open"
                ? "reopen_issue"
                : "update_issue",
        };
      }
    }
  }

  if (namespace === "pulls") {
    if (method === "create") {
      return {
        action: params?.["draft"] === true ? "create_draft_pr" : "create_pr",
      };
    }
    if (method === "createReview") {
      const event = stringParam(params, "event");
      return {
        action:
          event === "APPROVE"
            ? "approve_pr"
            : event === "REQUEST_CHANGES"
              ? "request_changes"
              : "post_review_comment",
      };
    }
  }

  if (namespace === "repos" && method === "createOrUpdateFileContents") {
    return {
      action: typeof params?.["sha"] === "string" ? "edit_file" : "create_file",
      branchName: stringParam(params, "branch"),
    };
  }

  if (namespace === "git" && method === "createRef") {
    const ref = stringParam(params, "ref");
    return {
      action: "create_branch",
      branchName: ref?.replace(/^refs\/heads\//, ""),
    };
  }

  return { action: `${namespace}.${method}` };
}

function wrapNamespace<T extends object>(
  namespaceTarget: T,
  namespace: string,
  context: GatedOctokitContext,
  policy: RuntimePolicy,
  log: (entry: Record<string, unknown>) => void,
  repositoryConfigClient: RepositoryConfigClient | undefined,
): T {
  return new Proxy(namespaceTarget, {
    get(target, property, receiver) {
      const methodValue: unknown = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || typeof methodValue !== "function") {
        return methodValue;
      }

      return (...args: unknown[]) => {
        if (!READ_ONLY_METHODS[namespace]?.has(property)) {
          const action = actionFor(namespace, property, args);
          const request = {
            owner: context.owner,
            repo: context.repo,
            action: action.action,
            ...(action.branchName ? { branchName: action.branchName } : {}),
          };
          if (!classifyAction(action.action).isKnownAction) {
            const decision = actionGate.check(request, policy);
            log({
              msg: "action denied",
              job: context.job,
              repo: `${context.owner}/${context.repo}`,
              action: decision.action,
              code: decision.code,
              tier: decision.tier,
              effectiveLevel: decision.effectiveLevel,
              requiredLevel: decision.requiredLevel,
              bounds: decision.bounds,
              reason: decision.reason,
            });
            throw new ActionGateDeniedError(decision);
          }

          return (async () => {
            let decision: ActionGateDecision;
            if (!repositoryConfigClient) {
              decision = actionGate.check(
                { ...request, repoConfigUnavailable: true },
                policy,
              );
            } else {
              try {
                const config = await getRepositoryConfig(
                  repositoryConfigClient,
                  context.owner,
                  context.repo,
                );
                decision = actionGate.check(
                  {
                    ...request,
                    repoCeiling: config.agents.ceiling,
                    repoProtectedActions: config.agents.protectedActions,
                    repoBudgets: config.agents.budgets,
                  },
                  policy,
                );
              } catch {
                decision = actionGate.check(
                  { ...request, repoConfigUnavailable: true },
                  policy,
                );
              }
            }
            if (!decision.allowed) {
              log({
                msg: "action denied",
                job: context.job,
                repo: `${context.owner}/${context.repo}`,
                action: decision.action,
                code: decision.code,
                tier: decision.tier,
                effectiveLevel: decision.effectiveLevel,
                requiredLevel: decision.requiredLevel,
                bounds: decision.bounds,
                reason: decision.reason,
              });
              throw new ActionGateDeniedError(decision);
            }
            return Reflect.apply(methodValue, target, args);
          })();
        }
        return Reflect.apply(methodValue, target, args);
      };
    },
  });
}

export function createGatedOctokit<T extends object>(
  octokit: T,
  context: GatedOctokitContext,
): T {
  const policy = context.policy ?? getRuntimePolicy();
  const log =
    context.log ??
    ((entry: Record<string, unknown>) => console.log(JSON.stringify(entry)));
  const repositoryConfigClient =
    context.repositoryConfigClient ??
    (isRepositoryConfigClient(octokit) ? octokit : undefined);
  return new Proxy(octokit, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (property === "paginate" && typeof value === "function") {
        return (...args: unknown[]) => Reflect.apply(value, target, args);
      }
      if (
        (property === "request" || property === "graphql") &&
        typeof value === "function"
      ) {
        return () => {
          const decision = actionGate.check(
            {
              owner: context.owner,
              repo: context.repo,
              action: "raw_octokit_request",
            },
            policy,
          );
          log({
            msg: "action denied",
            job: context.job,
            repo: `${context.owner}/${context.repo}`,
            action: decision.action,
            code: decision.code,
            tier: decision.tier,
            effectiveLevel: decision.effectiveLevel,
            requiredLevel: decision.requiredLevel,
            bounds: decision.bounds,
            reason: decision.reason,
          });
          throw new ActionGateDeniedError(decision);
        };
      }
      if (
        typeof value !== "object" ||
        value === null
      ) {
        return value;
      }
      return wrapNamespace(
        value,
        typeof property === "string" ? property : String(property),
        context,
        policy,
        log,
        repositoryConfigClient,
      );
    },
  });
}
