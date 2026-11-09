# Editions — Community and Enterprise

> **Status:** DRAFT · **Edition:** Community · **Last updated:** 2026-11-07
>
> This comparison records proposed decisions D-9 and D-13. It is not a claim that every
> listed Community capability has shipped. Levels 4–5 can be configured but are not yet
> enforced on all job paths. The Academy tracks publish after G6. Keep the document in draft
> until its dependencies land.

## Community Edition

Community Edition is the MIT-licensed, self-hosted product for one deployment. Its engagement
model includes levels 1–5, with a default repository level of 1 (Observer). Protected actions
are denied by default at every level and require both repository and operator allow-lists.

The effective level is the minimum of the repository dial, repository ceiling
(`agents.ceiling`, default 3), environment ceiling (operator-configured; defaults are local 5,
dev 5, staging 4, production 3), and `GH_CE_MAX_LEVEL` (default 5). Setting
`GH_CE_AGENTS_PAUSED=true` returns the effective level to 1. Levels 4–5 can be configured but
are not yet enforced on all job paths. They also require operator opt-in, a CODEOWNERS-reviewed
repository configuration, and a token with `dial:elevate`.

> **Enforcement status:** Levels 4–5 can be configured but are not yet enforced on all job
> paths. Do not treat a configured level as a safety guarantee.

The Community scope also includes a handoff state machine, six MCP tools, CODEOWNERS and label
routing, local audit records, local action budgets (not a distributed Rate Governor), a
single-node store, a single-squad Coordinator, and Community Edition Academy tracks after G6.
The MCP tools manage handoff and context records; a recorded handoff is not agent dispatch.

## Enterprise Edition

Enterprise is distinguished by organizational scale and centralized services:

- Organization-wide policy and centralized ceilings
- Microsoft Entra ID
- Durable multi-replica state
- Promotion Engine
- Compliance evidence
- Multi-squad service-to-service coordination
- Distributed Rate Governor
- Aspire integration
- Quarantine Bridge
- Enterprise Academy tracks, kept separate from Community tracks

## Capability comparison

| Capability | Community Edition | Enterprise Edition |
|---|---|---|
| Engagement model | Levels 1–5; default repository level 1 | Adds organization-wide policy and centralized ceilings |
| Level enforcement | Levels 4–5 can be configured but are not yet enforced on all job paths | Organization-wide policy and centralized ceilings; not an edition cap |
| Protected actions | Denied by default; repository and operator allow-lists required | Organization-level policy and governance |
| Handoff lifecycle | Four-state handoff record and six MCP tools | Compatible handoff contract with Enterprise coordination |
| Routing | CODEOWNERS and label-based routing | Organization-scale routing and coordination |
| Action budgets | Local budgets | Distributed Rate Governor |
| Squad coordination | Single-squad Coordinator | Multi-squad service-to-service coordination |
| State | Single-node store; state does not span replicas | Durable multi-replica state |
| Audit and evidence | Local audit records | Compliance evidence |
| Identity | GitHub App and local configuration | Microsoft Entra ID and enterprise integrations |
| Promotion | Repository workflows | Promotion Engine |
| Academy | Community tracks publish after G6 | Separate Enterprise tracks |

## Community Edition MCP tools

| Tool | Purpose |
|---|---|
| `create_handoff` | Record a new handoff request |
| `accept_handoff` | Move a pending handoff to active |
| `complete_handoff` | Record completion and outputs |
| `query_workflow_state` | Read handoff state and history |
| `attach_context` | Attach structured context to a handoff |
| `get_context` | Retrieve attached context |

Creating a handoff records work for a receiving agent; it does not dispatch that agent or prove
the requested work was executed.

## References

- [Getting Started](getting-started.md)
- [Architecture](architecture.md)
- Handoff lifecycle reference — planned in the documentation workstream
- Engagement levels reference — maintained with the levels workstream
