# SDLC Lifecycle Strategy: Greenfield to Production

This document defines how AgentCraftworks CE supports a full SDLC journey while allowing progressive governance:

- Greenfield ideation
- Prototype validation
- Productization and release discipline
- Production operations and incident response (with enterprise extensions)

## Framing

CE is intentionally open and easy to start. Teams should not be forced into full enterprise controls at day 0. Instead, policy and infrastructure should evolve with solution maturity.

## Maturity Stages

| Stage | Goal | Repo Policy | Infra & Environments | Governance |
|---|---|---|---|---|
| Prototype | Move fast and learn | Minimal constraints | Local/dev | Advisory actions |
| Validation | Prove reliability | PR flow to `staging` | Staging deploy + smoke tests | Controlled autonomy |
| Productized | Prepare for production | `feature/* -> staging -> main` enforced | Protected staging/prod environments | Strict policy checks |
| Production Ops | Operate safely | Audited promotion flow | Monitoring + incident workflow | Environment-capped autonomy |

## Branch Policy and Promotion

Branch policy bootstrap belongs to the transition from validation to productized.

- Script: `scripts/bootstrap-branch-policy.ps1`
- Guard workflow: `.github/workflows/ghaw-branch-policy-guard.yml`
- Template: `docs/NEW_REPO_BRANCH_POLICY_TEMPLATE.md`

Promotion flow:

`feature/* -> staging -> main`

## Infrastructure Evolution by Stage

### Prototype

- Keep setup lightweight
- Optional CI and advisory checks

### Validation

- Add `staging` branch and staging deployment checks
- Add smoke tests against staging URL

### Productized

- Protect `main` and `staging`
- Require PR reviews and resolved conversations
- Require branch topology checks

### Production Ops

- Add production approvals and release gates
- Add operational telemetry and incident process
- For advanced automation, use enterprise capabilities

## GitHub App Experience (Phased)

To support this journey, AgentCraftworks apps should use stage-aware behavior.

### Stage Flag

Use a repository stage flag (variable/config), e.g.:

- `prototype`
- `validation`
- `productized`
- `production-ops`

### App Behavior

- `prototype`: guidance-only, non-blocking
- `validation`: recommend and verify `staging` flow
- `productized`: enforce branch policy and required checks
- `production-ops`: enforce release and operational policy gates

### Suggested Commands

- `/acw stage set prototype|validation|productized|production-ops`
- `/acw bootstrap branch-policy`
- `/acw branch-policy status`

## CE and Enterprise Positioning

- CE provides open governance primitives and SDLC policy scaffolding.
- Enterprise extends into end-to-end production operations with advanced incident automation, governance monitor tooling, and operational telemetry integrations.

## Success Criteria

- Teams can start in hours, not weeks
- Teams can add controls progressively without rework
- Productionized repos maintain safe, auditable promotion paths
