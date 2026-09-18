# Editions — Community vs Enterprise

> **Status:** Shipped · **Edition:** Community · **Last updated:** 2026-09-18
>
> This is the **only page** in this repository that names and describes Enterprise
> features. Every other document links here instead of listing them.

## Positioning

**Community Edition (CE)** is the open protocol layer for agentic DevOps. It lets you
govern what AI agents may do in your own repositories: route pull requests to agents and
humans with `CODEOWNERS`, cap agent autonomy with engagement levels, and pass work between
agents through a four-state handoff machine that any MCP client can drive. It is
MIT-licensed, self-hosted, single-process and keeps its state in memory.

**AgentCraftworks Enterprise** is the commercial product for running that model at
production scale: many agents, many repositories, durable state, cost and risk controls,
and integrations with enterprise identity and security tooling. Enterprise includes the
same handoff FSM and six-tool MCP contract as a **compatible subset** — CE is not the core
Enterprise is built on, nor a stripped-down build of it.

## Feature table

Every ✅ in the Community column is traceable to code in this repository (path shown).

| Capability | Community | Enterprise | Where in CE |
|---|---|---|---|
| Webhook server with HMAC-SHA256 verification | ✅ | ✅ | `typescript/src/middleware/webhook-signature.ts` |
| Webhook and API rate limiting (per IP) | ✅ | ✅ | `typescript/src/index.ts`, `middleware/api-auth.ts` |
| Bearer-token auth on `/api/handoffs` and `/api/dial` (`GH_CE_API_TOKEN`) | ✅ | ✅ | `typescript/src/middleware/api-auth.ts` |
| CODEOWNERS setup pull request on install (human merges) | ✅ | ✅ | `typescript/src/handlers/installation.ts` |
| CODEOWNERS routing with label fallback | ✅ | ✅ | `typescript/src/services/codeowners-router.ts`, `label-router.ts` |
| Engagement levels **1–3** (Observer, Advisor, Collaborator) | ✅ | ✅ | `typescript/src/types/autonomy.ts` (`CE_MAX_LEVEL`) |
| Engagement levels **4–5** (Delegated, Autonomous) | ❌ `422 ENTERPRISE_REQUIRED` | ✅ | [ADR-CE-001](adr/ADR-CE-001-engagement-level-cap.md) |
| Action tiers T1–T5 and the action gate | ✅ | ✅ | `typescript/src/services/action-classifier.ts`, `action-gate.ts` |
| Handoff state machine (`pending → active → completed / failed`) | ✅ | ✅ | `typescript/src/utils/handoff-state-machine.ts` |
| Handoff REST API (`/api/handoffs`, `/api/dial`) | ✅ | ✅ | `typescript/src/handlers/` |
| Schema-validated context (`code-review`, `security-finding`, `test-result`) | ✅ | ✅ | `typescript/src/services/context-schemas.ts` |
| MCP server (stdio) — **6 tools** | ✅ | ✅ (46-tool catalogue) | `typescript/src/mcp/server.ts` |
| In-memory storage, single replica, state resets on restart | ✅ | — | `typescript/src/store/handoff-store.ts` |
| Durable, multi-replica storage | ❌ | ✅ | — |
| Docker Compose and Azure Container Apps (`azd`) deployment | ✅ | ✅ | `docker-compose.yml`, `infra/`, [DEPLOYMENT.md](../DEPLOYMENT.md) |
| GH-AW workflow catalogue (`ghaw-*`) and `ACW PR Readiness` gate | ✅ | ✅ | `.github/workflows/` |
| CodeQL and `npm audit` in CI | ✅ | ✅ | `.github/workflows/codeql.yml`, `ci.yml` |
| Accessibility agent team and review workflow | ✅ | ✅ | [docs/accessibility.md](accessibility.md) |
| Get-to-Green Meta-Harness (automated PR remediation loop) | ❌ | ✅ | — |
| Rate Governor · Audit Trail for rate limiting | ❌ | ✅ | — |
| Squad Coordinator · nuSquad SDK | ❌ | ✅ | — |
| Governance Gates · Promotion Engine · risk-tier scaffolding | ❌ | ✅ | — |
| Three-layer engagement dial · AEU cost model | ❌ | ✅ | — |
| Quarantine Bridge · Aspire Integration | ❌ | ✅ | — |
| Entra Agent ID · Conditional Access · Sentinel SIEM | ❌ | ✅ | — |
| NIST / ISO compliance packs | ❌ | ✅ | — |
| Dashboard | ❌ | ✅ | — |

Enterprise capabilities are listed factually for orientation; see
<https://agentcraftworks.com> for current scope.

## Upgrade path

Moving from CE to Enterprise does not change your repositories or your agents' contract:

- **Same handoff FSM** — the four states, terminal states and `failed` reason prefixes are identical.
- **Same six MCP tools** — `create_handoff`, `accept_handoff`, `complete_handoff`,
  `query_workflow_state`, `attach_context`, `get_context` keep their names and schemas;
  Enterprise adds tools, it does not rename these.
- **Same CODEOWNERS routing** — the file you merged from the setup PR keeps working.
- **Configuration is a forward-compatible subset** — CE environment variables
  (`GH_CE_APP_ID`, `GH_CE_APP_PRIVATE_KEY`, `GH_CE_WEBHOOK_SECRET`, `GH_CE_API_TOKEN`)
  are honoured by Enterprise.
- **Engagement levels 4–5 unlock** — the same `POST /api/dial/:owner/:repo` call that
  returns `422` in CE succeeds in Enterprise.

## What CE will never gate

Community Edition is MIT-licensed. **No capability that ships in CE today will be moved
behind the paid tier.** The engagement-level cap at 3 is a boundary that has been in
place since [ADR-CE-001](adr/ADR-CE-001-engagement-level-cap.md); it is not a removal.
If you believe a CE feature has been gated, open an issue — that is a bug.

## See also

- [Getting Started](getting-started.md) — the two-track on-ramp
- [Architecture](architecture.md) — how the pieces fit
- [Demos](demos/README.md) — prove each capability in minutes
- <https://agentcraftworks.com> — Enterprise
