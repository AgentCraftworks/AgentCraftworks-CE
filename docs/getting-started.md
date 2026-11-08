# Getting Started with AgentCraftworks Community Edition

> **Status:** DRAFT · **Edition:** Community · **Last updated:** 2026-11-07
>
> This draft reflects decisions D-9 and D-13 and depends on the levels and runtime workstreams.
> Levels 4–5 can be configured but are not yet enforced on all job paths.

Community Edition serves two different people. Pick your track:

| You want to… | Track | Time |
|---|---|---|
| Govern agents in repositories your organisation already runs Community Edition for | [Track 1 — Install the GitHub App](#track-1--install-the-github-app) | 5 minutes |
| Run Community Edition yourself — locally, in a container, or on Azure | [Track 2 — Run your own instance](#track-2--run-your-own-instance) | 30 minutes |

Both tracks end at the same place: [your first handoff](#your-first-handoff), then
[choosing how much agents may do](#choose-an-engagement-level).

Commands and examples are being added to CI smoke coverage. If one fails for you, see
[Troubleshooting](#troubleshooting).

## Local quickstart and doctor (planned)

The `quickstart` and `doctor` commands are part of the E-1 CLI work and are not available
yet. The planned experience creates a local sample repository with deterministic handoff
fixtures, then checks the developer environment and reports actionable fixes. Until E-1
lands, follow [Track 2](#track-2--run-your-own-instance) to install and run the current
server. The [Codespaces environment](../.devcontainer/devcontainer.json) installs the
repository dependencies and builds the server; it does not configure GitHub credentials.

---

## Track 1 — Install the GitHub App

> There is no public marketplace listing for Community Edition. You install the App that
> your organisation (or you, via Track 2) registered. Ask the person who runs your
> instance for its install link — it looks like `https://github.com/apps/<app-name>`.

### 1. Install the App

Open the install link, choose the organisation or account, and select the repositories
to govern. The App asks for exactly these permissions:

| Permission | Access | Used for |
|---|---|---|
| Contents | Read & write | Reading the ownership file (`CODEOWNERS`); committing the setup pull request's file |
| Pull requests | Read & write | Reading changed files; opening the setup pull request; routing comments |
| Issues | Read & write | One tracking issue when an install covers more repositories than the limit (`SCAFFOLD_MAX_REPOS`, default 25) |
| Metadata | Read-only | Repository visibility and default branch |

Events subscribed: **Installation**, **Installation repositories**, **Pull request**.

### 2. What happens automatically

Community Edition acknowledges the install immediately and, in the background, checks
each selected repository for an ownership file — `.github/CODEOWNERS`, `CODEOWNERS` or `docs/CODEOWNERS`. Where none
exists (archived repositories and forks are skipped) it opens a pull request proposing one:

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
with your real teams and agents, then merge. **Community Edition never merges this pull
request itself**, and nothing in your repository changes until a human does.

### 4. Set how much agents may do

Every repository starts at **level 1 — Observer**: Community Edition routes and records
hand-offs but changes nothing on GitHub. Your administrator raises the level with the
`/api/dial` endpoint (it requires the instance's `GH_CE_API_TOKEN`):

```bash
curl -X POST https://<your-ce-host>/api/dial/<owner>/<repo> \
  -H "Authorization: Bearer $GH_CE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"engagement":"advisor","updatedBy":"you@example.com"}'
```

Community Edition's engagement model spans levels **1–5**. Levels 4–5 can be configured but
are not yet enforced on all job paths. Protected actions are denied by default and require both
repository and operator allow-lists. See [Choose an engagement level](#choose-an-engagement-level).

### 5. Open a test pull request

Open a pull request that touches a path in your ownership file. Community Edition creates
a hand-off record routed to the matching owners (falling back to labels such as `security` or
`documentation`). At level 2 or higher it labels or comments on the pull request; at
level 1 it only records the hand-off. A handoff record does not dispatch an agent or prove that
the requested work ran. Your administrator can list hand-offs with
`GET /api/handoffs` — see [Demo 03](demos/03-codeowners-routing/README.md).

### 6. Where next

- [Your first hand-off](#your-first-handoff) — drive it from GitHub Copilot or Claude
- [Demos](demos/README.md) — five-minute proofs of each capability
- [Editions](EDITIONS.md) — what Community Edition does not do

---

## Track 2 — Run your own instance

### Prerequisites

- **Node.js 22 or newer** — `node --version`
- **Git**
- Optional: Docker Compose v2 (for the container path), an Azure subscription (for the Azure path)
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
variable names Community Edition reads (see [`.env.example`](../.env.example)):

| Variable | Required | Purpose |
|---|---|---|
| `GH_CE_WEBHOOK_SECRET` | Yes, to receive GitHub events | Signing secret shared with the GitHub App (HMAC-SHA256) |
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
same in bash, zsh and PowerShell. If you set the variables some other way (your build
pipeline, a secrets manager, `docker compose`), plain `npm start` skips the `.env` file.

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
**🤖 AgentCraftworks: Add default CODEOWNERS routing** pull request appears. Merge it (or not — it
is your call), then continue with Track 1 steps 4–5 against `http://localhost:3000`.

### 8. Run it somewhere else

- **Docker Compose** — one container, no database: [Demo 04](demos/04-docker-compose/README.md)
- **Azure Container Apps** — `azd up` with passwordless sign-in and Key Vault: [DEPLOYMENT.md](../DEPLOYMENT.md)
- **Forks** — the build and tests need `GH_CE_APP_ID`, `GH_CE_APP_PRIVATE_KEY` and `REQUIRED_HUMAN_REVIEWER`: [FORKING.md](../FORKING.md)

> **Storage is in-memory.** Community Edition keeps hand-offs, level settings and
> contexts in process memory. Run **one instance**; state resets on restart. State that
> survives restarts and is shared across instances is an Enterprise capability — see [Editions](EDITIONS.md).

---

## Your first handoff

A hand-off record moves `pending → active → completed`. MCP clients can call six tools
to create and update that record; these calls do not dispatch an agent. GitHub Copilot and Claude launch the tool server from [`.mcp.json`](../.mcp.json)
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
| 1 | Observer | read, list, record hand-offs | Community (default) |
| 2 | Advisor | comment, label | Community |
| 3 | Collaborator | edit files, create branches, assign | Community |
| 4 | Delegated | actions subject to operator and repository policy | Community; see enforcement note below |
| 5 | Autonomous | actions subject to operator and repository policy | Community; see enforcement note below |

Start at **1** and raise the level only after reviewing the operator and repository policy.
Levels 4–5 can be configured but are not yet enforced on all job paths. Protected actions are
denied by default and require both repository and operator allow-lists. Until the G3 enforcement
work is complete, do not treat these levels as a safety guarantee. [Demo 02](demos/02-engagement-levels/README.md)
shows a T4 action denied at level 3.

## What Community Edition does not do

Community Edition keeps state in a single-node store and does not provide organization-wide
policy, durable multi-replica state, or compliance evidence. It does provide levels 1–5 in its
engagement model, local action budgets, and a single-squad Coordinator; see the draft
[Editions](EDITIONS.md) comparison. Levels 4–5 can be configured but are not yet enforced on all
job paths.

## Learn

Community Edition Academy tracks will be linked here after the Academy publishes them.
The links will point only to public learning material.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 Invalid webhook signature` | Secret mismatch, or a proxy rewrote the body | Use the same `GH_CE_WEBHOOK_SECRET` in the App and `.env`; forward raw bodies |
| `401` on `/api/handoffs` or `/api/dial` | `GH_CE_API_TOKEN` is set but the request lacks `Authorization: Bearer …` | Send the header |
| `503` on `/api/handoffs` in production | `GH_CE_API_TOKEN` is not set | Set it — it is mandatory when `NODE_ENV=production` |
| A level 4–5 action is handled inconsistently | Levels 4–5 can be configured but are not yet enforced on all job paths | Keep protected actions disabled and rely only on reviewed policy; do not treat a configured level as an enforcement guarantee |
| `429 Too Many Requests` | Per-IP rate limit (default 60/min on the API) | Raise `API_RATE_LIMIT` or slow down |
| Tool server starts but a client sees no tools | It was launched over HTTP | The tool server speaks **stdio** — launch it with `npm run mcp` from `.mcp.json` |
| Handoffs vanished | Process restarted | Expected — storage is in-memory |
| Setup pull request never appeared | Repository already has a `CODEOWNERS`, is archived, or is a fork | Expected — remove the file on a scratch repo to see it |

Still stuck? Open an issue with the `documentation` label and paste the output:
<https://github.com/AgentCraftworks/AgentCraftworks-CE/issues/new>.
