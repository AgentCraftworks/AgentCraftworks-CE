---
id: ADR-CE-001
title: Community Edition caps Agent Engagement Levels at 3
status: Accepted
date: 2026-09-18
deciders: Product owner (AgentCraftworks), squad:ce-reference
upstream: AgentCraftworks/AgentCraftworks — ADR-077
related: "#270, #276 (epic), #238, #243, #244, #246"
---

# ADR-CE-001 — Community Edition caps Agent Engagement Levels at 3

**Status:** Accepted
**Date:** 2026-09-18
**Upstream source of truth:** `AgentCraftworks/AgentCraftworks` → `docs/adr/ADR-077`

## Context

The paid product's ADR-077 states:

> CE permits levels 1–3 in all environments; 4–5 require Enterprise.

Before this decision, Community Edition (CE) contradicted that standard in three places:

| Location | Behaviour before |
|---|---|
| `typescript/src/types/autonomy.ts` | `ENV_MAX_LEVELS = { local: 5, dev: 5, staging: 4, production: 3 }` |
| `README.md` / `docs/architecture.md` | Documented levels 1–5 as available in CE, with environment caps |
| `docs/futures/CE_GETTING_STARTED_IMPLEMENTATION_PLAN.md` §3.1 | Listed "Agent Engagement Levels 1–5 with environment caps" as documentable in CE |

Per `AGENTS.md`, the paid repo is the **source of truth for product standards**; CE
consumes them. Issue #270 asked the product owner to choose between following ADR-077
(Option A) or amending it upstream (Option B) before user-facing level documentation
(#244, #246) is written.

## Decision

**Option A — follow ADR-077.**

1. CE permits engagement levels **1 (Observer), 2 (Advisor), 3 (Collaborator)** in
   **every** environment (`local`, `dev`, `staging`, `production`).
2. Levels **4 (Delegated)** and **5 (Autonomous)** require **AgentCraftworks Enterprise**.
3. The implementation introduces a single constant, `CE_MAX_LEVEL = 3`, and sets every
   entry of `ENV_MAX_LEVELS` to it. The per-environment cap mechanism is **retained** so
   Enterprise can raise individual caps (Enterprise defaults: local 5 / dev 5 /
   staging 4 / production 3).
4. The `DialLevel` type stays `1 | 2 | 3 | 4 | 5` and `ENGAGEMENT_LEVEL_NAMES` keeps all
   five entries so that error messages, action-tier tables (T1–T5), and Enterprise builds
   can still name the higher levels. `resolveEngagementLevel` continues to parse
   `delegated` / `autonomous` (and the D-1 aliases `agent-team` / `full-agent-team`);
   the **setter** rejects them.
5. Requesting level 4 or 5 — numerically or by name — is rejected with a structured error:
   - Service layer: `setDialLevel` throws `EnterpriseLevelError`
     (`code: "ENTERPRISE_REQUIRED"`, `requestedLevel`, `requestedLevelName`, `maxLevel`,
     `upgradeUrl`).
   - REST layer: `POST /api/dial/:owner/:repo` returns **HTTP 422 Unprocessable Entity**
     with the same fields.
   - Message text (verbatim):
     `Engagement levels 4–5 (Delegated, Autonomous) require AgentCraftworks Enterprise — https://agentcraftworks.com`
6. Out-of-range values (`< 1`, `> 5`, non-integers) continue to return **400** so the
   edition boundary (422) is distinguishable from malformed input.

## Alternatives considered

### Option B — amend ADR-077 upstream to "CE 1–5 with env caps; Enterprise adds governance gates / promotion engine"

| | |
|---|---|
| **Pros** | No code change in CE; matches the documentation that existed at the time. |
| **Cons** | Weakens Enterprise differentiation; contradicts the paid ADR until amended; the amendment must be authored in a repo this squad cannot write to; leaves an unauthenticated `/api/dial` able to unlock merge/deploy-class actions (see the related security finding). |
| **Outcome** | Rejected. |

### Option A′ — cap by environment only (e.g. `staging: 3, production: 3` but `local/dev: 5`)

Rejected: ADR-077 says "in all environments". A developer-only escape hatch would still
require Enterprise-grade governance features that CE does not ship (decision D-2).

## Consequences

**Positive**

- CE matches the declared product standard; #244 / #246 can document levels unambiguously.
- Clear upsell boundary consistent with the "protocol layer, no moat" strategy.
- Smaller blast radius for the (currently unauthenticated) `/api/dial` endpoint — the
  highest action tier reachable in CE is T3 (label, assign, approve, edit file).
- Callers get a machine-readable `ENTERPRISE_REQUIRED` code rather than a generic 400.

**Negative / trade-offs**

- Removes previously working, tested behaviour (levels 4–5). Tests were rewritten to
  assert the new cap and the rejection path on both the service and REST layers.
- The `AGENTS.md` `ORG-STANDARD` block still shows the org-wide 1–5 table with Enterprise
  environment caps. That block is synced from `AgentCraftworks/.github` and must **not**
  be hand-edited here; the upstream table should gain an "Edition" column or CE footnote
  (see "Follow-ups").

**Neutral**

- `checkActionPermission` and `isActionPermitted` signatures are unchanged; T4/T5 action
  classification is unchanged — those actions are simply never permitted in CE because
  no CE dial can reach level 4 or 5.

## Follow-ups

- [ ] Product owner mirrors this ADR (or a reference to it) in
      `AgentCraftworks/AgentCraftworks` `docs/adr/` alongside ADR-077 — the exact text is
      posted as a comment on #270 because this squad cannot open issues in the private repo.
- [ ] Upstream `AgentCraftworks/.github/AGENTS.md` engagement-level table: add an
      *Edition* column (1–3 CE, 4–5 Enterprise) so `sync-org-standards` propagates the
      distinction to every downstream repo.
- [ ] #243 (`EDITIONS.md`) and #246 (`ENGAGEMENT_LEVELS.md`) reference this ADR.

## References

- Issue #270 — decision request and implementation sketch
- Epic #276 — coordination
- `AgentCraftworks/AgentCraftworks` ADR-077 (paid repo, source of truth)
- `docs/futures/CE_GETTING_STARTED_IMPLEMENTATION_PLAN.md` §3.1 note and decision **D-8**
- `typescript/src/types/autonomy.ts` — `CE_MAX_LEVEL`, `ENV_MAX_LEVELS`, `EnterpriseLevelError`
- `typescript/src/services/autonomy-dial.ts` — `setDialLevel`
- `typescript/src/handlers/autonomy-dial-routes.ts` — `POST /api/dial/:owner/:repo`
