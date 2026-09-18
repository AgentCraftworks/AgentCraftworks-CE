# Getting Started with AgentCraftworks Community Edition

> **Status:** Shipped · **Edition:** Community · **Last updated:** 2026-09-18

Community Edition serves two different people. Pick your track:

| You want to… | Track | Time |
|---|---|---|
| Govern agents in repositories your organisation already runs CE for | [Track 1 — Install the GitHub App](#track-1--install-the-github-app) | 5 minutes |
| Run CE yourself — locally, in Docker, or on Azure | [Track 2 — Run your own instance](#track-2--run-your-own-instance) | 30 minutes |

Both tracks end at the same place: [your first handoff](#your-first-handoff), then
[choosing an engagement level](#choose-an-engagement-level).

Every command below was run on Windows 11 (PowerShell 7) and macOS before this page
was published. If one fails for you, see [Troubleshooting](#troubleshooting).

---

## Track 1 — Install the GitHub App

> There is no public marketplace listing for CE. You install the App that your
> organisation (or you, via Track 2) registered. Ask the person who runs your CE
> instance for its install link — it looks like `https://github.com/apps/<app-name>`.

### 1. Install the App

Open the install link, choose the organisation or account, and select the repositories
to govern. CE asks for exactly these permissions:

| Permission | Access | Used for |
|---|---|---|
| Contents | Read & write | Reading `CODEOWNERS`; committing the setup PR's file |
| Pull requests | Read & write | Reading changed files; opening the setup PR; routing comments |
| Issues | Read & write | One tracking issue when an install exceeds `SCAFFOLD_MAX_REPOS` |
| Metadata | Read-only | Repository visibility and default branch |

Events subscribed: **Installation**, **Installation repositories**, **Pull request**.

### 2. What happens automatically

CE acknowledges the install immediately and, in the background, checks each selected
repository for `.github/CODEOWNERS`, `CODEOWNERS` or `docs/CODEOWNERS`. Where none
exists (archived repositories and forks are skipped) it opens a pull request:

> **🤖 AgentCraftworks: Add default CODEOWNERS routing**
>
> ## 🤖 AgentCraftworks: Default CODEOWNERS Setup
>
> This PR was automatically created by AgentCraftworks to scaffold a default
> `.github/CODEOWNERS` file for your repository. … The `CODEOWNERS` file is the
> **routing layer** for AgentCraftworks. It determines which agents and human reviewers
> are notified when specific files change in a pull request.

The proposed file is shown in [Demo 03 — Part A](demos/03-codeowners-routing/README.md#part-a--the-setup-pull-request).

### 3. Review, edit, merge — you are in the loop

Replace the placeholder handles (`@agents/security-scanner`, `@human-leads/team`, …)
with your real teams and agents, then merge. **CE never merges this PR itself**, and
nothing in your repository changes until a human does.

### 4. Set the engagement level

Every repository starts at **level 1 — Observer**: CE routes and records handoffs but
performs no writes on GitHub. Your CE administrator raises the level with the dial API
(it requires the instance's `GH_CE_API_TOKEN`):

```bash
curl -X POST https://<your-ce-host>/api/dial/<owner>/<repo> \
  -H "Authorization: Bearer $GH_CE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"engagement":"advisor","updatedBy":"you@example.com"}'
```

CE supports levels **1–3**. See [Choose an engagement level](#choose-an-engagement-level).

### 5. Open a test pull request

Open a PR that touches a path in your `CODEOWNERS`. CE creates a handoff routed to the
matching owners (falling back to labels such as `security` or `documentation`). At
level 2 or higher it labels or comments on the PR; at level 1 it only records the
handoff. Your administrator can list handoffs with
`GET /api/handoffs` — see [Demo 03](demos/03-codeowners-routing/README.md).

### 6. Where next

- [Your first handoff](#your-first-handoff) over MCP
- [Demos](demos/README.md) — five-minute proofs of each capability
- [Editions](EDITIONS.md) — what CE does not do

---

## Track 2 — Run your own instance

### Prerequisites

- **Node.js 22 or newer** — `node --version`
- **Git**
- Optional: Docker Compose v2 (for the container path), an Azure subscription (for `azd`)
- A **GitHub App you control** — only needed once you want real webhooks.
  You can complete steps 1–4 and every demo without one.

### 1. Clone, install, build

```bash
git clone https://github.com/AgentCraftworks/AgentCraftworks-CE.git
cd AgentCraftworks-CE/typescript
npm install
npm run build
```

### 2. Create `.env`

```bash
cp ../.env.example ../.env          # PowerShell: Copy-Item ..\.env.example ..\.env
```

Open `../.env` and set at least a webhook secret and an API token. These are the real
variable names CE reads (see [`.env.example`](../.env.example)):

| Variable | Required | Purpose |
|---|---|---|
| `GH_CE_WEBHOOK_SECRET` | Yes, to receive webhooks | HMAC-SHA256 secret shared with the GitHub App |
| `GH_CE_API_TOKEN` | Yes in production; recommended always | Bearer token for `/api/handoffs` and `/api/dial` |
| `GH_CE_APP_ID` | For GitHub write-back | Numeric App ID |
| `GH_CE_APP_PRIVATE_KEY` | For GitHub write-back | PEM contents (or base64) of the App's private key |
| `PORT` | No (default `3000`) | Listen port |
| `API_RATE_LIMIT` | No (default `60`) | Requests per minute per IP on the REST API |

Generate secrets with `openssl rand -hex 32` (PowerShell: `-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })`).

### 3. Start

```bash
npm run start:env
```

`npm run start:env` runs `node --env-file=../.env dist/index.js`, so the repo-root
`.env` is loaded by Node itself — no shell `source`/`export` step, and it works the
same in bash, zsh and PowerShell. If you set the variables some other way (CI, a
secrets manager, `docker compose`), plain `npm start` skips the `.env` file.

### 4. Verify

In a second terminal:

```bash
curl -s http://localhost:3000/health
```

```json
{"status":"ok","version":"1.0.0-ts","uptime":2.31,"timestamp":"2026-09-18T20:43:53.678Z"}
```

Send a signed test webhook without touching GitHub (the script reads
`GH_CE_WEBHOOK_SECRET` from your shell):

```bash
export GH_CE_WEBHOOK_SECRET=<the value in .env>      # PowerShell: $env:GH_CE_WEBHOOK_SECRET = "<value>"
node docs/demos/04-docker-compose/send-webhook.mjs ping        # run from the repository root
```

Expected: `HTTP 200` and `{"event":"ping","message":"pong"}`. A wrong secret returns `401`.

### 5. Create and register a GitHub App

Follow **[DEPLOYMENT.md → Create a GitHub App](../DEPLOYMENT.md)**. Use the
permissions and events listed in [Track 1, step 1](#1-install-the-app). Put the App ID
and private key into `.env` as `GH_CE_APP_ID` / `GH_CE_APP_PRIVATE_KEY`, use the same
webhook secret as `GH_CE_WEBHOOK_SECRET`, and restart with `npm run start:env`.

### 6. Point the webhook at your machine

GitHub must reach `POST /api/webhook`. For local development forward events:

```bash
# Option A — GitHub CLI (one-time: gh extension install cli/gh-webhook)
gh webhook forward --repo <owner>/<repo> --events pull_request,ping --url http://localhost:3000/api/webhook

# Option B — smee.io: create a channel at https://smee.io, set it as the App's webhook URL, then
npx --yes smee-client --url https://smee.io/<channel> --target http://localhost:3000/api/webhook
```

### 7. Install on a scratch repository

Install your App on a repository with no `CODEOWNERS` file. Within a few seconds the
**🤖 AgentCraftworks: Add default CODEOWNERS routing** PR appears. Merge it (or not — it
is your call), then continue with Track 1 steps 4–5 against `http://localhost:3000`.

### 8. Run it somewhere else

- **Docker Compose** — one container, no database: [Demo 04](demos/04-docker-compose/README.md)
- **Azure Container Apps** — `azd up` with OIDC and Key Vault: [DEPLOYMENT.md](../DEPLOYMENT.md)
- **Forks** — CI needs `GH_CE_APP_ID`, `GH_CE_APP_PRIVATE_KEY` and `REQUIRED_HUMAN_REVIEWER`: [FORKING.md](../FORKING.md)

> **Storage is in-memory.** CE keeps handoffs, dial settings and contexts in process
> memory. Run **one replica**; state resets on restart. Durable, multi-replica storage
> is an Enterprise capability — see [Editions](EDITIONS.md).

---

## Your first handoff

The handoff machine — `pending → active → completed` — is driven by six MCP tools over
stdio. GitHub Copilot and Claude launch the server from [`.mcp.json`](../.mcp.json)
(`npm run mcp`); the scripted version is [Demo 01](demos/01-first-handoff/README.md):

```bash
./docs/demos/01-first-handoff/run.sh        # PowerShell: .\docs\demos\01-first-handoff\run.ps1
```

The real payloads it sends, in order:

```jsonc
// tools/call create_handoff
{"to_agent":"@code-reviewer","task":"Review PR #42: docs: add accessibility statement",
 "context":"First handoff from the CE demo","priority":"high","repository":"octo/demo","issue_number":42,"sla_hours":4}
// → { "handoff_id": "<uuid>", "status": "pending", ... }

// tools/call query_workflow_state { "handoff_id": "<uuid>" }                                  → status + history
// tools/call accept_handoff       { "handoff_id": "<uuid>", "agent_name": "@code-reviewer", "notes": "On it." } → "status": "active"
// tools/call attach_context       { "handoff_id": "<uuid>", "schema_name": "code-review", "created_by": "@code-reviewer",
//                                   "data": { "file": "docs/accessibility.md", "line_start": 12, "line_end": 18,
//                                             "category": "best-practice", "suggestion": "…", "severity": "info" } }
// tools/call get_context          { "handoff_id": "<uuid>" }
// tools/call complete_handoff     { "handoff_id": "<uuid>", "agent_name": "@code-reviewer",
//                                   "outputs": { "summary": "Approved with no changes requested.", "deliverables": ["…"] } } → "status": "completed"
```

Tool names and schemas are defined in `typescript/src/mcp/server.ts`; the six tools are
listed in [Architecture → MCP tool reference](architecture.md#mcp-tool-reference).

## Choose an engagement level

| Level | Name | Agents may… | Edition |
|---|---|---|---|
| 1 | Observer | read, list, record handoffs | Community (default) |
| 2 | Advisor | comment, label | Community |
| 3 | Collaborator | edit files, create branches, assign | Community |
| 4 | Delegated | push commits, request reviews | Enterprise — `422 ENTERPRISE_REQUIRED` |
| 5 | Autonomous | merge, deploy | Enterprise — `422 ENTERPRISE_REQUIRED` |

Start at **1**, watch the handoffs CE records, and raise to **2** when you want it to
comment. [Demo 02](demos/02-engagement-levels/README.md) shows a blocked T4 action and
the 422 response; the decision is recorded in
[ADR-CE-001](adr/ADR-CE-001-engagement-level-cap.md).

## What CE does not do

Community Edition is a **subset**: it does not run engagement levels 4–5, does not
persist state across restarts or replicas, and ships 6 of the 46 MCP tools. The full,
honest list — and what carries over unchanged when you upgrade — is in
[Editions](EDITIONS.md).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 Invalid webhook signature` | Secret mismatch, or a proxy rewrote the body | Use the same `GH_CE_WEBHOOK_SECRET` in the App and `.env`; forward raw bodies |
| `401` on `/api/handoffs` or `/api/dial` | `GH_CE_API_TOKEN` is set but the request lacks `Authorization: Bearer …` | Send the header |
| `503` on `/api/handoffs` in production | `GH_CE_API_TOKEN` is not set | Set it — it is mandatory when `NODE_ENV=production` |
| `422 ENTERPRISE_REQUIRED` from `/api/dial` | You requested level 4 or 5 | CE supports 1–3; see [Editions](EDITIONS.md) |
| `429 Too Many Requests` | Per-IP rate limit (default 60/min on the API) | Raise `API_RATE_LIMIT` or slow down |
| MCP server starts but a client sees no tools | It was launched over HTTP | The MCP server is **stdio** — launch it with `npm run mcp` from `.mcp.json` |
| Handoffs vanished | Process restarted | Expected — storage is in-memory |
| Setup PR never appeared | Repository already has a `CODEOWNERS`, is archived, or is a fork | Expected — remove the file on a scratch repo to see it |

Still stuck? Open an issue with the `documentation` label and paste the output:
<https://github.com/AgentCraftworks/AgentCraftworks-CE/issues/new>.
