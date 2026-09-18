<div align="center">

# AgentCraftworks Community Edition

**The open protocol layer for agentic DevOps**

[![Build and tests](https://github.com/AgentCraftworks/AgentCraftworks-CE/actions/workflows/ci.yml/badge.svg?branch=staging)](https://github.com/AgentCraftworks/AgentCraftworks-CE/actions/workflows/ci.yml)
[![Code scanning (CodeQL)](https://github.com/AgentCraftworks/AgentCraftworks-CE/actions/workflows/codeql.yml/badge.svg?branch=staging)](https://github.com/AgentCraftworks/AgentCraftworks-CE/actions/workflows/codeql.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)](https://modelcontextprotocol.io)

[Quick Start](#quick-start) · [Try it in 2 minutes](#try-it-in-2-minutes) · [Demos](#demos) · [How it works](#how-it-works) · [Enterprise](#enterprise) · [Docs](#documentation)

</div>

---

## The 90-second pitch

AI coding agents are powerful — and completely ungoverned. They merge pull requests without
approval, push to production without validation, and operate at full autonomy with no safety net.
**Engineering teams need an agent team operating at the speed of their trust while ensuring
critical security and compliance requirements are always met.** AgentCraftworks Community
Edition is a GitHub App plus an agent tool server that provides the open protocol layer for
agentic DevOps:

- **Routes work to the team that owns the code** — every pull request goes to the people and
  agents who own the files it changes, falling back to labels when no owner is listed.
- **Sets how much agents may do** — a per-repository level (default **1 — watch only**) that
  decides whether agents may only observe, may comment, or may edit files. Anything beyond the
  level is blocked and explained on the pull request.
- **Records every hand-off** — work passed between agents moves through `pending → active →
  completed / failed`, so you can always see who did what and why.
- **Works with the AI tools you already use** — GitHub Copilot, Claude and any client that speaks
  the Model Context Protocol (MCP) drive those hand-offs through six standard tools.
- **Never changes your repository silently** — on install, Community Edition *proposes* an
  ownership file in a pull request. A human merges it, or not.

> **What Community Edition is / isn't**
>
> - **Is:** the MIT-licensed protocol layer — the hand-off model, the agent-autonomy levels, and
>   the six agent tools that AgentCraftworks Enterprise is compatible with.
> - **Isn't:** the core that Enterprise is built on, and not a stripped-down Enterprise. Enterprise
>   ships a 46-tool catalogue plus orchestration and governance layers that are not in this repo.
>
> The full edition comparison lives in **[docs/EDITIONS.md](docs/EDITIONS.md)**.

## Quick Start

Two tracks, depending on whether you want to **use** Community Edition or **run your own instance**.
The canonical, step-by-step guide is **[docs/getting-started.md](docs/getting-started.md)**.

### Track 1 — Install the GitHub App (5 minutes)

1. Install your organisation's AgentCraftworks Community Edition App on a repository (there is no
   public marketplace listing — the App is registered by whoever runs the instance; see Track 2).
2. It opens a **setup pull request** titled *🤖 AgentCraftworks: Add default CODEOWNERS routing*
   adding a default `.github/CODEOWNERS` — the file that says which team owns which code, and
   therefore who reviews it.
3. Replace the placeholder team handles with your real GitHub teams and agents.
4. Merge the pull request to activate routing. **Community Edition never merges it for you.**

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
| `POST /api/webhook` | GitHub events (`pull_request`, `installation`, `installation_repositories`, `ping`) — signature-verified (HMAC-SHA256) |
| `GET /health` | Health check |
| `/api/handoffs`, `/api/dial` | Management API — requires `Authorization: Bearer $GH_CE_API_TOKEN`, rate-limited per IP |
| `npm run mcp` | Agent tool server (MCP over stdio, not HTTP) |

State is **in-memory**: run one instance; hand-offs reset on restart. Docker Compose and Azure
Container Apps (`azd`) instructions are in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Try it in 2 minutes

No GitHub App, no server — just the agent tool server, which [`.mcp.json`](.mcp.json) already
wires up for GitHub Copilot and Claude (`node --import tsx src/mcp/server.ts` in `typescript/`).
Open the repository in an MCP-aware client and ask it to *"create a handoff to @code-reviewer
for pull request 42, accept it, then complete it"* — or run the scripted version and watch the
server report exactly six tools and a hand-off move `pending → active → completed`:

```bash
./docs/demos/01-first-handoff/run.sh       # PowerShell: .\docs\demos\01-first-handoff\run.ps1
```

## Demos

Each demo is scripted for macOS/Linux and Windows and ships the transcript it should produce.
Index: **[docs/demos/README.md](docs/demos/README.md)**.

| Demo | Proves | Time |
|---|---|---|
| [01 — First hand-off](docs/demos/01-first-handoff/README.md) | Six tools, full lifecycle, schema-validated context | 2 min |
| [02 — Autonomy levels](docs/demos/02-engagement-levels/README.md) | An over-level action blocked at level 3; level 4 declined as Enterprise-only | 3 min |
| [03 — Ownership routing](docs/demos/03-codeowners-routing/README.md) | Setup pull request, owners → labels → none precedence, the action gate | 5 min |
| [04 — Docker Compose](docs/demos/04-docker-compose/README.md) | One container, `/health`, signed event accepted vs rejected | 5 min |
| [Two-minute architecture walkthrough](docs/demos/ce-architecture.html) | Accessible, self-contained tour of the whole flow | 2 min |

## How it works

```text
GitHub event ──signature verified──▶ ownership routing (→ labels → none) ──▶ hand-off (pending)
                                               │
                                     autonomy-level action gate
                                               │
                     allowed actions ◀─────────┴──────▶ denied actions: skipped + explained on the pull request
```

### Agent engagement levels

| Level | Name | Agents may… | Edition |
|---|---|---|---|
| 1 | Observer | Read, view, list | Community (default) |
| 2 | Advisor | Comment, suggest, label | Community |
| 3 | Collaborator | Edit files, create branches, assign, request changes | Community |
| 4 | Delegated | Push commits, approve, request reviews, open pull requests | Enterprise |
| 5 | Autonomous | Merge, deploy, publish releases | Enterprise |

Community Edition supports levels **1–3** in every environment. Requesting 4 or 5 on
`POST /api/dial/:owner/:repo` returns `422 ENTERPRISE_REQUIRED`
([decision record](docs/adr/ADR-CE-001-engagement-level-cap.md)).

### Hand-off lifecycle

Four states, two terminal (`completed`, `failed`). A `failed` hand-off always carries a reason
prefix — `rejected:`, `abandoned:`, `error:` or `timeout:`. `overdue` is a computed property, not
a stored state. Details: [docs/architecture.md](docs/architecture.md#handoff-state-machine).

### Agent tools (MCP)

`create_handoff` · `accept_handoff` · `complete_handoff` · `query_workflow_state` ·
`attach_context` · `get_context` — Community Edition exposes 6 of the 46 tools in the Enterprise
catalogue. Reference: [docs/architecture.md](docs/architecture.md#mcp-tool-reference).

## Enterprise

[AgentCraftworks Enterprise](https://agentcraftworks.com) includes the same hand-off model and
the same six agent tools as a compatible subset, and adds what production-scale multi-agent
workflows need:

- Agents may also push commits, approve, merge and deploy (levels 4–5), with a finer autonomy dial
- State that survives restarts and is shared across several instances
- The full 46-tool catalogue and coordination of whole agent teams
- Policy gates before and after every agent action, staged roll-outs with rollback, and
  **automatic fix-up of failing pull requests** (Community Edition's merge gate is `ACW PR Readiness`)
- Enterprise identity, security-monitoring and compliance integrations

Factual comparison and upgrade path: **[docs/EDITIONS.md](docs/EDITIONS.md)**.

## Documentation

- **Start here:** [Getting Started](docs/getting-started.md) · [Demos](docs/demos/README.md) · [Editions](docs/EDITIONS.md)
- **Reference:** [Architecture](docs/architecture.md) · [Autonomy-cap decision record](docs/adr/ADR-CE-001-engagement-level-cap.md) · [Agentic workflows](docs/GHAW_WORKFLOWS.md) · [Accessibility](docs/accessibility.md)
- **Operate:** [Deployment](DEPLOYMENT.md) · [Fork & Rename Guide](FORKING.md) · [Security policy](SECURITY.md)
- **Contribute:** [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [AGENTS.md](AGENTS.md)
- Full index: **[docs/README.md](docs/README.md)**

## Support & Community

- **Bugs and docs gaps:** [open an issue](https://github.com/AgentCraftworks/AgentCraftworks-CE/issues/new) — use the `documentation` label for anything on this page
- **Questions and ideas:** [GitHub Discussions](https://github.com/AgentCraftworks/AgentCraftworks-CE/discussions)
- **Security:** see [SECURITY.md](SECURITY.md) — please do not file vulnerabilities as public issues
- **Contributing:** read [CONTRIBUTING.md](CONTRIBUTING.md) and sign the [contributor licence agreement](.github/CLA.md); verify locally with `cd typescript && npm run typecheck && npm test`

## License

MIT License — Copyright (c) 2025 AgentCraftworks. See [LICENSE](LICENSE).

---

<div align="center">

Built with ❤️ for the agentic DevOps era · Powered by Azure + GitHub Copilot

[Enterprise](https://agentcraftworks.com) · [Issues](https://github.com/AgentCraftworks/AgentCraftworks-CE/issues) · [Discussions](https://github.com/AgentCraftworks/AgentCraftworks-CE/discussions)

</div>
