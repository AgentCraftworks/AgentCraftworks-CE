---
id: ADR-CE-001
title: Community Edition supports Agent Engagement Levels 1–5 with independent safeguards
status: Proposed
date: 2026-11-07
deciders: Product owner (AgentCraftworks)
related: "#270, #285, #288"
---

# ADR-CE-001 — Community Edition supports Agent Engagement Levels 1–5

**Status:** Proposed — pending G0 approval  
**Date:** 2026-11-07

## Context

The existing CE engagement-level implementation already models levels 1–5, but an
edition cap prevents CE repositories from selecting levels 4–5. This policy couples
agent permissions to licensing rather than to explicit operator and maintainer
authorization. Removing the edition cap must not make higher-impact actions
unguarded: the action gate, opt-in boundaries, protected-action policy, budgets,
kill switch, and audit trail are part of the CE implementation.

The paid product remains the source of truth for product-wide standards. This ADR
records the proposed CE implementation boundary; upstream standards and ADR-077 are
not edited here.

## Decision

1. CE supports engagement levels 1–5 without an edition or license cap. The default
   repository level remains 1 (Observer); every increase is deliberate.
2. The effective level is the minimum of the repository dial, repository ceiling
   (default 3), operator-configured environment ceiling (defaults: local 5, dev 5,
   staging 4, production 3), and global ceiling (default 5). Pausing agents forces
   effective level 1 and permits only T1 read actions.
3. Levels 4–5 require three independent, free opt-ins: an operator raises the
   environment ceiling; maintainers commit a repository ceiling of 4 or 5 to the
   default branch; and an authenticated API principal with `dial:elevate` raises
   the dial. The server derives environment and actor identity; callers cannot
   spoof either.
4. Protected actions are denied by default at every level. An action is allowed
   only when both the repository configuration and operator allow-list authorize
   it. T4 and T5 actions are subject to per-repository budgets.
5. Elevations, gate decisions, and denials are auditable. CE provides a
   single-squad coordinator and process-local action budgets; Enterprise retains
   organizational-scale governance, multi-squad S2S, distributed rate governing,
   Promotion Engine, Entra ID integration, and compliance evidence.
6. Until G3, CE documentation must say: “Levels 4–5 can be configured but are not
   yet enforced on all job paths.”

## Consequences

- CE can configure all five engagement levels without a license check.
- Levels 4–5 remain opt-in and bounded by independently controlled ceilings.
- The default repository ceiling remains 3 until repository configuration is
  implemented; the default dial remains 1.
- The action gate must cover every agent job and every PR-webhook write before
  G3. The caveat in this ADR and user-facing documentation remains until then.
- A pause or any removed opt-in lowers the effective level without changing the
  repository's stored dial.

## Supersession

This proposed decision supersedes the CE level-3 edition cap proposed by PR #285
and supersedes the CE-specific level boundary in upstream ADR-077. The upstream
source is not modified by this repository.

## References

- `typescript/src/types/autonomy.ts`
- `typescript/src/services/autonomy-dial.ts`
- `typescript/src/handlers/autonomy-dial-routes.ts`
- `agentcraftworks.config.yml` (`agents.ceiling`)
- `standards/action-tiers.json`
