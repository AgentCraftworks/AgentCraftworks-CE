<div align="center">

# AgentCraftworks Community Edition

**The open protocol layer for agentic DevOps**

[![TypeScript CI](https://github.com/AgentCraftworks/AgentCraftworks-CE/actions/workflows/ci.yml/badge.svg?branch=staging)](https://github.com/AgentCraftworks/AgentCraftworks-CE/actions/workflows/ci.yml)
[![CodeQL](https://github.com/AgentCraftworks/AgentCraftworks-CE/actions/workflows/codeql.yml/badge.svg?branch=staging)](https://github.com/AgentCraftworks/AgentCraftworks-CE/actions/workflows/codeql.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)](https://modelcontextprotocol.io)

[Quick Start](#quick-start) · [Try it in 2 minutes](#try-it-in-2-minutes) · [Demos](#demos) · [How it works](#how-it-works) · [Enterprise](#enterprise) · [Docs](#documentation)

</div>

---

## The 90-second pitch

AI coding agents are powerful — and completely ungoverned. They merge PRs without approval,
push to production without validation, and operate at full autonomy with no safety net.
**Engineering teams need an agent team operating at the speed of their trust while ensuring
critical security and compliance requirements are always met.** AgentCraftworks Community
Edition is a GitHub App + MCP server that provides the open protocol layer for agentic DevOps:

- **CODEOWNERS routing** — pull requests are routed to the agents and humans who own the changed
  paths (checked in `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS`), falling back to labels.
- **Agent Engagement Levels** — a per-repository dial (default **1 — Observer**) that decides what
  agents may *do*. Every GitHub write is gated; denied writes are skipped and explained.
- **Handoff state machine** — `pending → active → completed / failed`, auditable and reproducible.
- **6-tool MCP server** — GitHub Copilot, Claude and any MCP client drive the same machine.
- **Setup PR on install** — CE proposes a `CODEOWNERS` file in a pull request. A human merges it;
  nothing changes in your repository otherwise.

> **What CE is / isn't**
>
> - **Is:** the MIT-licensed protocol layer — the handoff FSM, engagement-level model, and the
>   6-tool MCP subset that AgentCraftworks Enterprise is compatible with.
> - **Isn't:** the core that Enterprise is built on, and not a stripped-down Enterprise. Enterprise
>   ships a 46-tool MCP catalogue plus orchestration and governance layers that are not in this repo.
>
> The full edition comparison lives in **[docs/EDITIONS.md](docs/EDITIONS.md)**.

## Quick Start

Two tracks, depending on whether you want to **use** CE or **run your own instance**.
The canonical, step-by-step guide is **[docs/getting-started.md](docs/getting-started.md)**.

### Track 1 — Install the GitHub App (5 minutes)

1. Install your organisation's AgentCraftworks CE App on a repository (there is no public
   marketplace listing — the App is registered by whoever runs the instance; see Track 2).
2. CE opens a **setup pull request** titled *🤖 AgentCraftworks: Add default CODEOWNERS routing*
   adding a default `.github/CODEOWNERS` — the routing layer that decides who reviews which paths.
3. Replace the placeholder team handles with your real GitHub teams and agents.
4. Merge the PR to activate routing. **CE never merges it for you.**

### Track 2 — Run your own instance (30 minutes)

```bash
# Requirements: Node.js 22+
git clone https://github.com/AgentCraftworks/AgentCraftworks-CE.git
cd AgentCraftworks-CE/typescript
npm install

# Configure environment
cp ../.env.example ../.env        # PowerShell: Copy-Item ..\.env.example ..\.env
# Set GH_CE_WEBHOOK_SECRET and GH_CE_API_TOKEN; add GH_CE_APP_ID / GH_CE_APP_PRIVATE_KEY
# once you have a GitHub App — see DEPLOYMENT.md for how to create one

# Build and start
npm run build
npm run start:env
```

`npm run start:env` runs `node --env-file=../.env dist/index.js`, so Node loads the repo-root
`.env` itself — no shell `source`/`export` step; identical in bash, zsh and PowerShell.
Then, in another terminal: `curl -s http://localhost:3000/health` → `{"status":"ok",…}`.

| Endpoint | Purpose |
|---|---|
| `POST /api/webhook` | GitHub webhooks (`pull_request`, `installation`, `installation_repositories`, `ping`) — HMAC-SHA256 verified |
| `GET /health` | Health check |
| `/api/handoffs`, `/api/dial` | REST API — requires `Authorization: Bearer $GH_CE_API_TOKEN`, rate-limited per IP |
| `npm run mcp` | MCP server (stdio transport, not HTTP) |

State is **in-memory**: run one replica; handoffs reset on restart. Docker Compose and Azure
Container Apps (`azd`) instructions are in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Try it in 2 minutes

No GitHub App, no server — just the MCP server over stdio, which [`.mcp.json`](.mcp.json) already
wires up for GitHub Copilot and Claude (`node --import tsx src/mcp/server.ts` in `typescript/`).
Open the repository in an MCP-aware client and ask it to *"create a handoff to @code-reviewer
for PR 42, accept it, then complete it"* — or run the scripted version and watch the server
report exactly six tools and a handoff move `pending → active → completed`:

```bash
./docs/demos/01-first-handoff/run.sh       # PowerShell: .\docs\demos\01-first-handoff\run.ps1
```

## Demos

Each demo is scripted for macOS/Linux and Windows and ships the transcript it should produce.
Index: **[docs/demos/README.md](docs/demos/README.md)**.

| Demo | Proves | Time |
|---|---|---|
| [01 — First handoff over MCP](docs/demos/01-first-handoff/README.md) | Six tools, full lifecycle, schema-validated context | 2 min |
| [02 — Engagement levels](docs/demos/02-engagement-levels/README.md) | A T4 action blocked at level 3; level 4 → `422 ENTERPRISE_REQUIRED` | 3 min |
| [03 — CODEOWNERS routing](docs/demos/03-codeowners-routing/README.md) | Setup PR, CODEOWNERS → labels → none precedence, the action gate | 5 min |
| [04 — Docker Compose](docs/demos/04-docker-compose/README.md) | One container, `/health`, signed webhook accepted vs rejected | 5 min |
| [Two-minute architecture walkthrough](docs/demos/ce-architecture.html) | Accessible, self-contained tour of the whole flow | 2 min |

## How it works

```text
GitHub webhook ──HMAC verified──▶ CODEOWNERS routing (→ labels → none) ──▶ handoff (pending)
                                            │
                                  engagement-level action gate
                                            │
                          allowed writes ◀──┴──▶ denied writes: skipped + explained on the PR
```

### Agent Engagement Levels

| Level | Name | Action tier | Agents may… | Edition |
|---|---|---|---|---|
| 1 | Observer | T1 | Read, view, list | Community (default) |
| 2 | Advisor | T2 | Comment, suggest, label | Community |
| 3 | Collaborator | T3 | Edit file, create branch, assign, request changes | Community |
| 4 | Delegated | T4 | Push commit, approve, request review, create PR | Enterprise |
| 5 | Autonomous | T5 | Merge, deploy, publish release | Enterprise |

CE supports levels **1–3** in every environment. Requesting 4 or 5 on `POST /api/dial/:owner/:repo`
returns `422 ENTERPRISE_REQUIRED` ([ADR-CE-001](docs/adr/ADR-CE-001-engagement-level-cap.md)).

### Handoff finite state machine

Four states, two terminal (`completed`, `failed`). A `failed` handoff always carries a reason
prefix — `rejected:`, `abandoned:`, `error:` or `timeout:`. `overdue` is a computed property, not
a stored state. Details: [docs/architecture.md](docs/architecture.md#handoff-state-machine).

### MCP tools

`create_handoff` · `accept_handoff` · `complete_handoff` · `query_workflow_state` ·
`attach_context` · `get_context` — CE exposes 6 of the 46 MCP tools in the Enterprise catalogue.
Reference: [docs/architecture.md](docs/architecture.md#mcp-tool-reference).

## Enterprise

[AgentCraftworks Enterprise](https://agentcraftworks.com) includes the same finite state machine
and 6-tool MCP contract as a compatible subset, and adds what production-scale multi-agent
workflows need:

- Engagement levels 4–5 (Delegated, Autonomous) with a three-layer dial
- Durable, multi-replica state instead of in-memory storage
- The full 46-tool MCP catalogue and squad orchestration
- Governance gates, promotion engine and the Get-to-Green PR remediation harness
  (CE's PR gate is the `ACW PR Readiness` workflow)
- Enterprise identity, SIEM and compliance integrations

Factual comparison and upgrade path: **[docs/EDITIONS.md](docs/EDITIONS.md)**.

## Documentation

- **Start here:** [Getting Started](docs/getting-started.md) · [Demos](docs/demos/README.md) · [Editions](docs/EDITIONS.md)
- **Reference:** [Architecture](docs/architecture.md) · [ADR-CE-001](docs/adr/ADR-CE-001-engagement-level-cap.md) · [GH-AW workflows](docs/GHAW_WORKFLOWS.md) · [Accessibility](docs/accessibility.md)
- **Operate:** [Deployment](DEPLOYMENT.md) · [Fork & Rename Guide](FORKING.md) · [Security policy](SECURITY.md)
- **Contribute:** [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [AGENTS.md](AGENTS.md)
- Full index: **[docs/README.md](docs/README.md)**

## Support & Community

- **Bugs and docs gaps:** [open an issue](https://github.com/AgentCraftworks/AgentCraftworks-CE/issues/new) — use the `documentation` label for anything on this page
- **Questions and ideas:** [GitHub Discussions](https://github.com/AgentCraftworks/AgentCraftworks-CE/discussions)
- **Security:** see [SECURITY.md](SECURITY.md) — please do not file vulnerabilities as public issues
- **Contributing:** read [CONTRIBUTING.md](CONTRIBUTING.md) and sign the [CLA](.github/CLA.md); verify locally with `cd typescript && npm run typecheck && npm test`

## License

MIT License — Copyright (c) 2025 AgentCraftworks. See [LICENSE](LICENSE).

---

<div align="center">

Built with ❤️ for the agentic DevOps era · Powered by Azure + GitHub Copilot

[Enterprise](https://agentcraftworks.com) · [Issues](https://github.com/AgentCraftworks/AgentCraftworks-CE/issues) · [Discussions](https://github.com/AgentCraftworks/AgentCraftworks-CE/discussions)

</div>
