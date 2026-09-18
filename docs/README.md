# AgentCraftworks Community Edition — documentation

> **Status:** Shipped · **Edition:** Community · **Last updated:** 2026-09-18

Everything in `docs/` describes features that are **implemented and shipping** in
Community Edition. Plans and proposals live in [`docs/futures/`](futures/README.md) and
are labelled `DRAFT` — implementation agents should ignore them.

## Start here

| Document | Read it when… |
|---|---|
| [Getting Started](getting-started.md) | You are new. Two tracks: install the GitHub App (5 min) or run your own instance (30 min). |
| [Demos](demos/README.md) | You want proof in minutes — four scripted demos plus a [two-minute architecture walkthrough](demos/ce-architecture.html). |
| [Editions — Community vs Enterprise](EDITIONS.md) | You need to know exactly what CE does and does not do. The only page that names Enterprise features. |

## Reference

| Document | Covers |
|---|---|
| [Architecture](architecture.md) | Request flow, handoff state machine, storage, pull request routing and gating, MCP tool reference, engagement levels |
| [ADR-CE-001 — Engagement level cap](adr/ADR-CE-001-engagement-level-cap.md) | Why CE supports levels 1–3 and returns `422 ENTERPRISE_REQUIRED` for 4–5 |
| [GH-AW workflows](GHAW_WORKFLOWS.md) | The `ghaw-*` agentic workflow catalogue and `ACW PR Readiness` gate |
| [Accessibility](accessibility.md) | WCAG 2.2 AA requirements and the accessibility agent team |
| [`.mcp.json`](../.mcp.json) | MCP client configuration for GitHub Copilot and Claude (`npm run mcp`, stdio) |
| [`.env.example`](../.env.example) | Every environment variable CE reads |

## Operate

| Document | Covers |
|---|---|
| [DEPLOYMENT.md](../DEPLOYMENT.md) | Creating the GitHub App, Docker Compose, Azure Container Apps with `azd`, OIDC, Key Vault, background scaffolding |
| [FORKING.md](../FORKING.md) | Secrets and variables a fork needs (`GH_CE_APP_ID`, `GH_CE_APP_PRIVATE_KEY`, `REQUIRED_HUMAN_REVIEWER`) |
| [SECURITY.md](../SECURITY.md) | Reporting vulnerabilities; CodeQL and `npm audit` in CI |
| [SDLC lifecycle strategy](SDLC_LIFECYCLE_STRATEGY.md) | Greenfield-to-production promotion and environment strategy |
| [New repository branch policy template](NEW_REPO_BRANCH_POLICY_TEMPLATE.md) | `feature/* → staging → main` policy bootstrap |

## Contribute

| Document | Covers |
|---|---|
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Branching, PR labels, review routing, definition of done |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Contributor Covenant |
| [AGENTS.md](../AGENTS.md) | Instructions every coding agent follows in this repository, including mandatory accessibility rules |
| [Rubber Duck integration](RUBBER_DUCK_INTEGRATION.md) | Using GitHub Copilot Rubber Duck for a cross-model second opinion at CE review checkpoints |

## Futures (not implemented)

| Document | Status |
|---|---|
| [`docs/futures/README.md`](futures/README.md) | Index of proposals and their statuses |
| [CE Getting Started implementation plan](futures/CE_GETTING_STARTED_IMPLEMENTATION_PLAN.md) | Program plan behind this documentation set |
| [Playwright CLI integration](futures/PLAYWRIGHT_CLI_INTEGRATION.md) | `DRAFT` |

## Conventions

- Every shipped document starts with a status line:
  `> **Status:** Shipped · **Edition:** Community · **Last updated:** YYYY-MM-DD`.
- Enterprise features are named **only** in [EDITIONS.md](EDITIONS.md); elsewhere use
  the callout "CE is / isn't" pattern and link there.
- Markdown must pass the accessibility checklist in [AGENTS.md](../AGENTS.md):
  meaningful link text, heading order, alt text, tables with header rows.
