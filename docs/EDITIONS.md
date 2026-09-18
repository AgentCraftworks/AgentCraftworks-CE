# Editions — Community vs Enterprise

> **Status:** Shipped · **Edition:** Community · **Last updated:** 2026-09-18
>
> This is the **only page** in this repository that names and describes Enterprise
> capabilities. Every other document links here instead of listing them.

## Positioning

**Community Edition** is the open protocol layer for agentic DevOps. It lets you decide
what AI coding agents may do in your own repositories: send each pull request to the
people and agents who own the code it touches, set how much autonomy agents have in each
repository, and pass work between agents in a way that is recorded and can be audited.
It is free under the MIT licence, runs on your own infrastructure as a single service,
and keeps its working state in memory.

**AgentCraftworks Enterprise** is the commercial product for running that model at
production scale: many agents, many repositories, state that survives restarts, cost and
risk controls, and integration with enterprise identity and security tooling. Enterprise
includes the same handoff model and the same six agent tools as a **compatible subset** —
Community Edition is not the core that Enterprise is built on, nor a stripped-down build
of it.

## What you get

| Capability | Community | Enterprise |
|---|---|---|
| Verifies that every event really came from GitHub before acting on it | ✅ | ✅ |
| Protects its own management endpoints with a token and a request limit | ✅ | ✅ |
| On install, proposes a "who owns which code" file as a pull request — a human decides whether to merge | ✅ | ✅ |
| Sends each pull request to the team that owns the changed code, falling back to labels | ✅ | ✅ |
| Lets you set how much agents may do per repository: watch only, advise, or edit files | ✅ | ✅ |
| Lets agents also push commits, approve, merge and deploy on their own | ❌ | ✅ |
| Blocks any agent action that goes beyond the level you set, and explains why on the pull request | ✅ | ✅ |
| Records every hand-off between agents from start to finish so you can see who did what | ✅ | ✅ |
| Lets GitHub Copilot, Claude and other AI clients drive those hand-offs through six standard tools | ✅ | ✅ (the full catalogue of 46) |
| Keeps working state in memory; one instance; state resets on restart | ✅ | — |
| Keeps state across restarts and across several instances | ❌ | ✅ |
| Runs in a container on your own machine or in Azure | ✅ | ✅ |
| A firm "ready to merge" gate on protected branches — **ACW PR Readiness** | ✅ | ✅ |
| Code scanning and dependency-vulnerability checks in the build | ✅ | ✅ |
| Accessibility review by a dedicated agent team on every user-facing change | ✅ | ✅ |
| Automatic fix-up of failing pull requests (see below) | ❌ | ✅ |
| Adaptive throttling that slows agents down before they hit GitHub's limits, with a full audit trail | ❌ | ✅ |
| Coordinating whole teams of agents on one piece of work | ❌ | ✅ |
| Policy gates before and after every agent action, and staged roll-outs with automatic rollback | ❌ | ✅ |
| Fine-grained autonomy dial and a cost model for agent work | ❌ | ✅ |
| Automatic quarantine of misbehaving agents; distributed tracing dashboards | ❌ | ✅ |
| Enterprise identity, conditional access and security-monitoring integration | ❌ | ✅ |
| Compliance packs for common standards | ❌ | ✅ |
| A dashboard | ❌ | ✅ |

Enterprise capabilities are listed factually for orientation; see
<https://agentcraftworks.com> for current scope.

## Automatic fix-up of failing pull requests (Enterprise)

| Capability | What it does for you |
|---|---|
| **Automatic fix-up of failing pull requests** | When a build, test, style check, or type check fails, the platform works out what kind of failure it is and dispatches the right fix — first a safe automatic repair, then a coding-agent task, then a hand-off to the team that owns that part of the code. Engineers step in only when automation has run out of options. |
| **Remembers every pull request's journey** | Each pull request carries its own record of where it is in the process, what has been tried, and how long it has waited. Nothing starts from zero on every push. |
| **Attempt limits that prevent runaway automation** | Automated fixes are rationed per kind of problem (e.g. three tries for build failures, one for security findings). When the allowance is spent, the platform stops and asks a human. |
| **Different rules for different kinds of change** | Drafts get a light check; hotfixes a fast path; staging-to-production promotions need compliance sign-off and a staged-rollout gate; human-written changes get advice only; multi-team changes need every team's hand-off complete. |
| **A wider definition of "ready to merge"** | In addition to Community Edition's checks (human approval, resolved comments, clean code scanning, safe dependencies): branch-policy compliance, passing build and tests, clean style and type checks, no leaked secrets, a Copilot review, correct governance level, and a customer-experience label. |
| **A clear, four-step escalation path** | One diagnosis comment, a "needs a human decision" label, a review request to the code owners, and a notification to your escalation channel. |
| **Catches pull requests that go quiet** | A sweep every 30 minutes in business hours re-checks stalled pull requests; anything waiting over an hour is flagged as overdue. |
| **Team-aware routing** | Knows which teams a change touches and will not call it ready until each has completed its hand-off within its permitted autonomy. |
| **Full visibility** | Every step change is recorded so you can see pipeline health and where automation is earning its keep. |
| **Runs on your own infrastructure if you prefer** | GitHub-hosted or self-hosted runners. |

Community Edition: a firm ready-to-merge gate on protected branches, automatic Copilot + human review requests, one clear escalation comment, and locked, version-pinned rules shared across repositories.

Community Edition's merge gate is the **ACW PR Readiness** workflow. It checks that a
pull request has human approval, no unresolved review comments, clean code scanning and
no known-vulnerable dependencies before it may merge. It does not attempt repairs.

## Upgrade path

Moving from Community Edition to Enterprise does not change your repositories or the way
your agents work:

- **Same hand-off model** — the four stages a hand-off passes through, and the reasons it
  can fail, are identical.
- **Same six agent tools** — they keep their names and inputs; Enterprise adds tools, it
  does not rename these.
- **Same ownership routing** — the "who owns which code" file you merged from the setup
  pull request keeps working.
- **Same configuration** — everything Community Edition reads from its environment is
  honoured by Enterprise.
- **Higher autonomy levels unlock** — the same request that Community Edition declines
  with "requires Enterprise" succeeds in Enterprise.

## What Community Edition will never gate

Community Edition is MIT-licensed. **No capability that ships in Community Edition today
will be moved behind the paid tier.** The autonomy cap (agents may edit files but not push
commits, approve, merge or deploy) is a boundary that has been in place since
[the decision record](adr/ADR-CE-001-engagement-level-cap.md); it is not a removal. If you
believe a Community capability has been gated, open an issue — that is a bug.

## For engineers — where each Community capability lives

Every ✅ in the Community column above is traceable to code in this repository.

| Capability | Identifier | Where in Community Edition |
|---|---|---|
| Event verification | HMAC-SHA256 webhook signatures | `typescript/src/middleware/webhook-signature.ts` |
| Management-endpoint protection | Bearer `GH_CE_API_TOKEN` on `/api/handoffs`, `/api/dial`; per-IP rate limit `API_RATE_LIMIT` | `typescript/src/middleware/api-auth.ts`, `typescript/src/index.ts` |
| Ownership file proposed on install | `CODEOWNERS` setup pull request | `typescript/src/handlers/installation.ts` |
| Ownership routing with label fallback | `CODEOWNERS` → labels → none | `typescript/src/services/codeowners-router.ts`, `label-router.ts` |
| Autonomy per repository | Engagement levels **1–3** (Observer, Advisor, Collaborator); `CE_MAX_LEVEL` | `typescript/src/types/autonomy.ts` |
| Higher autonomy (Enterprise) | Levels **4–5** → `422 ENTERPRISE_REQUIRED` | [ADR-CE-001](adr/ADR-CE-001-engagement-level-cap.md) |
| Blocking over-level actions | Action tiers T1–T5 and the action gate | `typescript/src/services/action-classifier.ts`, `action-gate.ts` |
| Recorded hand-offs | Handoff state machine `pending → active → completed / failed` | `typescript/src/utils/handoff-state-machine.ts` |
| Management endpoints | REST `/api/handoffs`, `/api/dial` | `typescript/src/handlers/` |
| Structured hand-off data | Context schemas `code-review`, `security-finding`, `test-result` | `typescript/src/services/context-schemas.ts` |
| AI-client tools | MCP server (stdio), **6 tools** | `typescript/src/mcp/server.ts` |
| In-memory state | `InMemoryHandoffStore`, single replica | `typescript/src/store/handoff-store.ts` |
| Containers and Azure | Docker Compose, Azure Container Apps (`azd`) | `docker-compose.yml`, `infra/`, [DEPLOYMENT.md](../DEPLOYMENT.md) |
| Merge gate and agentic workflows | `ACW PR Readiness`, `ghaw-*` | `.github/workflows/` |
| Code scanning and dependency checks | CodeQL, `npm audit` | `.github/workflows/codeql.yml`, `ci.yml` |
| Accessibility review | Accessibility agent team | [docs/accessibility.md](accessibility.md) |

Environment variables Community Edition reads: `GH_CE_APP_ID`, `GH_CE_APP_PRIVATE_KEY`,
`GH_CE_WEBHOOK_SECRET`, `GH_CE_API_TOKEN`, `PORT`, `API_RATE_LIMIT`.

## See also

- [Getting Started](getting-started.md) — the two-track on-ramp
- [Architecture](architecture.md) — how the pieces fit
- [Demos](demos/README.md) — prove each capability in minutes
- <https://agentcraftworks.com> — Enterprise
