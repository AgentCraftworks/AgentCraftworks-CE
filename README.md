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

Agent workflows combine automation, AI tools, and human decisions. Community Edition provides
governance and handoff primitives for those workflows; the integrations and policy configured by
each operator determine which actions are available:

- **Routes work to the team that owns the code** — every pull request goes to the people and
  agents who own the files it changes, falling back to labels when no owner is listed.
- **Sets an engagement level** — the default is **1 — Observer**. The model spans levels 1–5;
  **Levels 4–5 can be configured but are not yet enforced on all job paths.**
- **Records hand-offs** — records move through `pending → active → completed / failed`. A handoff
  record does not dispatch an agent or prove that the requested work ran.
- **Works with MCP clients** — GitHub Copilot, Claude, and other Model Context Protocol clients
  can create and manage handoff and context records through six tools.
- **Never changes your repository silently** — on install, Community Edition *proposes* an
  ownership file in a pull request. A human merges it, or not.

> **What Community Edition is / isn't**
>
> - **Is:** the MIT-licensed Community Edition, with webhook handling, routing, engagement
>   levels, handoff state, and six MCP tools.
> - **Isn't:** a prerequisite for Enterprise or a feature-trimmed Enterprise release. The editions
>   have distinct capabilities and deployment scopes.
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
for pull request 42, accept it, then complete it"* — or run the scripted version, which calls
the tools in sequence and shows a record move `pending → active → completed`. This demonstrates
the handoff API, not agent dispatch:

```bash
./docs/demos/01-first-handoff/run.sh       # PowerShell: .\docs\demos\01-first-handoff\run.ps1
```

## Demos

Each demo is scripted for macOS/Linux and Windows and ships the transcript it should produce.
Index: **[docs/demos/README.md](docs/demos/README.md)**.

| Demo | Proves | Time |
|---|---|---|
| [01 — First hand-off](docs/demos/01-first-handoff/README.md) | Six tools, full lifecycle, schema-validated context | 2 min |
| [02 — Engagement levels](docs/demos/02-engagement-levels/README.md) | A T4 action is denied by a repository configured at level 3 | 3 min |
| [03 — Ownership routing](docs/demos/03-codeowners-routing/README.md) | Setup pull request, owners → labels → none precedence, the action gate | 5 min |
| [04 — Docker Compose](docs/demos/04-docker-compose/README.md) | One container, `/health`, signed event accepted vs rejected | 5 min |
| [Two-minute architecture walkthrough](docs/demos/ce-architecture.html) | Accessible, self-contained tour of the whole flow | 2 min |

## How it works

```text
GitHub event ──signature verified──▶ ownership routing (→ labels → none)
                                               │
                                     engagement-level action gate
                                               │
                            allowed action or a recorded denial

MCP client ──tools/call──▶ MCP server ──▶ handoff/context records
```

### Agent engagement levels

| Level | Name | Agents may… | Edition |
|---|---|---|---|
| 1 | Observer | Read, view, list | Community (default) |
| 2 | Advisor | Comment, suggest, label | Community |
| 3 | Collaborator | Edit files, create branches, assign, request changes | Community |
| 4 | Delegated | Actions subject to operator and repository policy | Community; see enforcement note below |
| 5 | Autonomous | Actions subject to operator and repository policy | Community; see enforcement note below |

Community Edition's engagement model spans levels **1–5**. Levels 4–5 can be configured but are
not yet enforced on all job paths. Protected actions are denied by default and require both
repository and operator allow-lists; a configured level is not proof that an action is safe or
enforced everywhere.

### Hand-off lifecycle

Four states, two terminal (`completed`, `failed`). A `failed` hand-off always carries a reason
prefix — `rejected:`, `abandoned:`, `error:` or `timeout:`. `overdue` is a computed property, not
a stored state. Details: [docs/architecture.md](docs/architecture.md#handoff-state-machine).

### Agent tools (MCP)

`create_handoff` · `accept_handoff` · `complete_handoff` · `query_workflow_state` ·
`attach_context` · `get_context`. These tools create and manage handoff and context records; they
do not dispatch an agent. Reference: [docs/architecture.md](docs/architecture.md#mcp-tool-reference).

## Enterprise

[AgentCraftworks Enterprise](https://agentcraftworks.com) focuses on organizational scale:
centralized policy, durable multi-replica state, compliance evidence, and multi-squad
coordination. Community Edition also defines a single-squad Coordinator and local action
budgets; those capabilities are documented as in progress until their implementation lands.
See **[docs/EDITIONS.md](docs/EDITIONS.md)** for the draft edition comparison.

## Documentation

- **Start here:** [Getting Started](docs/getting-started.md) · [Demos](docs/demos/README.md) · [Editions](docs/EDITIONS.md)
- **Reference:** [Architecture](docs/architecture.md) · [Engagement levels](docs/architecture.md#agent-engagement-levels-reference) · [Agentic workflows](docs/GHAW_WORKFLOWS.md) · [Accessibility](docs/accessibility.md)
- **Operate:** [Deployment](DEPLOYMENT.md) · [Fork & Rename Guide](FORKING.md) · [Security policy](SECURITY.md)
- **Contribute:** [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [AGENTS.md](AGENTS.md)
- Full index: **[docs/README.md](docs/README.md)**

## Learn

- **[Community Edition quick start](docs/getting-started.md)** — install, configure, and make a
  first handoff record.
- **[Community Edition Academy tracks](docs/getting-started.md#learn)** — public lesson links will
  be added after the Academy publishes its Community Edition tracks.
- **[Troubleshooting](docs/getting-started.md#troubleshooting)** — common setup and API issues.

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
