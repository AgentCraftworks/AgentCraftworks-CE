# Agent Engagement Levels

AgentCraftworks Community Edition supports engagement levels 1–5 without an
edition cap. A new repository starts at level 1 (Observer); every increase is
deliberate and remains bounded by the repository dial, repository ceiling,
environment ceiling, global ceiling, and pause state.

> **Current enforcement status:** Levels 4–5 can be configured but are not yet enforced on all job paths. Do not enable them in production until the G3 checklist is complete.

## Levels and action tiers

| Level | Name | Tier | Intended actions |
|---|---|---|---|
| 1 | Observer | T1 | Read files, view state, and list resources |
| 2 | Advisor | T2 | Comment, review comments, suggest, label, and react |
| 3 | Collaborator | T3 | Propose changes on `agent/*` branches, create draft PRs, create/update issues, request changes |
| 4 | Delegated | T4 | Act on shared state: mark PRs ready, approve, request reviews, close/reopen issues, update PR branches, and create tags |
| 5 | Autonomous | T5 | Merge, deploy, publish releases, revert/cherry-pick, modify CI, orchestrate agents, and emergency rollback |

Unknown actions are denied. Protected actions are separate from the levels:
force-push, force-merge, branch-protection bypass, ruleset changes, secret
management, and CI changes remain denied unless both the repository and operator
allow-lists authorize them.

## Effective level and defaults

The effective level is the minimum of the requested repository dial, repository
ceiling, environment ceiling, and global ceiling. When agents are paused, the
effective level is 1 and only T1 read actions are permitted.

| Bound | Default |
|---|---|
| New repository dial | Level 1 |
| Repository ceiling | Level 3 |
| Environment ceilings | local 5, dev 5, staging 4, production 3 |
| Global ceiling | Level 5 (`GH_CE_MAX_LEVEL`) |
| T4/T5 budgets | 30 T4 actions/hour and 5 T5 actions/hour per process and repository |
| Pause | `GH_CE_AGENTS_PAUSED=true` forces level 1 |

The environment is selected by the server's `GH_CE_ENVIRONMENT`. If unset, the
server uses `production` and warns at startup. Request fields cannot select the
environment.

## Independent opt-ins for levels 4–5

The intended safety policy requires all three independent approvals:

1. An operator raises the environment ceiling, for example
   `GH_CE_ENV_MAX_LEVELS=production=5`.
2. Maintainers review a default-branch repository configuration that raises
   `agents.ceiling` to 4 or 5; CODEOWNERS must protect that file.
3. The API caller authenticates as a principal with the `dial:elevate` scope.

The repository policy loader now reads `agentcraftworks.config.yml` from the
default branch, applies a maximum 60-second cache, and invalidates the cache on
default-branch pushes. Missing configuration keeps the repository ceiling at 3;
policy load failures deny the affected request. See
[`agentcraftworks.config.example.yml`](../agentcraftworks.config.example.yml).

Scoped-principal enforcement is still pending. Until it lands and G3 is
verified, the `dial:elevate` opt-in is not enforced and audit events identify
the actor as the placeholder `operator`; do not treat the three independent
opt-ins as complete authorization.

## Request evaluation

For each action, the server resolves its canonical tier, computes the effective
level, checks protected-action allow-lists, verifies branch restrictions, and
applies the T4/T5 budget. The gate records allowed and denied decisions. A
permission preview does not consume an action budget.

Use `POST /api/dial/check` to preview a known action and inspect the returned
effective level and bounds. A preview is not authorization to perform a separate
write. Unknown actions remain denied even when the dial is level 5.

For safe rollout and rollback steps, see
[Enabling Delegated and Autonomous Safely](ENABLING_DELEGATED_AUTONOMOUS_SAFELY.md).
