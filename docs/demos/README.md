# Community Edition demos

> **Status:** Shipped · **Edition:** Community · **Last updated:** 2026-09-18

Four short, scripted demos that each prove one thing Community Edition does, plus a
two-minute architecture walkthrough. Every demo ships a `run.sh` (macOS / Linux), a
`run.ps1` (Windows PowerShell) and an `expected-output.txt` captured from a real run
so you can tell at a glance whether yours worked.

Run them in order — each one builds a little on the previous — or jump to the one
that answers your question.

| # | Demo | Proves | Prerequisites | Time |
|---|---|---|---|---|
| 01 | [Your first handoff over MCP](01-first-handoff/README.md) | The 6-tool MCP server drives `pending → active → completed`, with schema-validated context | Node 22+, `npm install` | 2 min |
| 02 | [Engagement levels](02-engagement-levels/README.md) | A T4 action is blocked at level 3; level 4 returns `422 ENTERPRISE_REQUIRED` | Node 22+, CE running locally (`npm run start:env`) | 3 min |
| 03 | [CODEOWNERS routing](03-codeowners-routing/README.md) | The setup PR, CODEOWNERS → labels → none routing precedence, and the action gate | Node 22+, CE running locally | 5 min |
| 04 | [Docker Compose + signed webhook](04-docker-compose/README.md) | One container, `/health`, HMAC-SHA256-verified webhooks (200 vs 401) | Docker Compose v2, Node 22+ | 5 min |
| — | [Two-minute architecture walkthrough](ce-architecture.html) | How webhooks, CODEOWNERS, engagement levels, the handoff FSM and MCP fit together | A browser | 2 min |

## Expected output at a glance

| Demo | You should see |
|---|---|
| 01 | `tools/list → 6 tools`, then `pending → active → completed`, exit code `0` |
| 02 | `permitted: true` for `add_label`, `permitted: false … requires 4` for `push_commit`, `HTTP 422` with `"code":"ENTERPRISE_REQUIRED"` |
| 03 | Three handoffs routed to `@security-scanner`, `@accessibility-lead`, `@code-reviewer`; a CODEOWNERS preview table |
| 04 | `{"status":"ok",…}`, `HTTP 200 {"event":"ping","message":"pong"}`, `HTTP 401 … Invalid webhook signature` |

## Before you start

```bash
git clone https://github.com/AgentCraftworks/AgentCraftworks-CE.git
cd AgentCraftworks-CE/typescript && npm install && npm run build && cd ..
```

Demos 02 and 03 need a running instance. In one terminal:

```bash
cp .env.example .env                                   # PowerShell: Copy-Item .env.example .env
# set GH_CE_WEBHOOK_SECRET=demo-secret and GH_CE_API_TOKEN=demo-api-token in .env
cd typescript && npm run start:env
```

Demo 04 starts its own container on port 3000 — stop the local instance first.

## Conventions

- Scripts assume the repository root as the working directory unless noted.
- Secrets used in demos (`demo-secret`, `demo-api-token`) are placeholders. Never
  reuse them on a public endpoint.
- Every demo works **without GitHub App credentials**. Steps that would call back
  into GitHub (opening the setup PR, requesting reviewers) are described, not executed.
- State is **in-memory**: restarting the server or container clears all handoffs.

## Walkthrough video and slides

`ce-architecture.html` is a self-contained, keyboard-navigable page (no external
assets) that steps through the architecture in about two minutes. It respects
`prefers-reduced-motion` and targets WCAG 2.2 AA. Open it directly in a browser:

```bash
open docs/demos/ce-architecture.html          # macOS
start docs\demos\ce-architecture.html         # Windows
```

## Something didn't match?

1. Compare with the demo's `expected-output.txt` — PR numbers, UUIDs and timestamps
   differ on every run; statuses and states should not.
2. Check the version: `curl -s http://localhost:3000/health` reports `1.0.0-ts`.
3. Open an issue with the label `documentation` and paste your output:
   <https://github.com/AgentCraftworks/AgentCraftworks-CE/issues/new>
