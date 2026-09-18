# Demo 03 — CODEOWNERS setup PR and routing

> **Status:** Shipped (PR #288 / issue #266) · **Edition:** Community · **Time:** about 5 minutes

`CODEOWNERS` is the routing layer of Community Edition: it decides which agents and
humans review which paths. Routing precedence is **CODEOWNERS → labels → none**
(`@code-reviewer`), and every GitHub write CE performs on a PR is gated by the
repository's engagement level. This demo has three parts:

| Part | What it shows | Needs |
|---|---|---|
| A | The **setup pull request** CE opens when the App is installed | Nothing to run |
| B | **Label-based routing** — the fallback you see locally without App credentials | Local CE instance |
| C | **CODEOWNERS routing preview** using the same parser the webhook path uses | Local checkout |

## Prerequisites

- Node.js 22+ and `cd typescript && npm install` done once.
- Parts B and C need a running CE instance on `http://localhost:3000` started with
  `GH_CE_WEBHOOK_SECRET=demo-secret` (see
  [Demo 04](../04-docker-compose/README.md) or
  [Getting Started Track 2](../../getting-started.md#track-2--run-your-own-instance)).
- Part A needs nothing to run — it documents what the hosted App does on install. To
  see it for real, install the App on a scratch repository that has no `CODEOWNERS`
  file ([Getting Started Track 1](../../getting-started.md#track-1--install-the-github-app)).

## Part A — the setup pull request

When the App receives `installation.created` (or `installation_repositories.added`),
`typescript/src/handlers/installation.ts` checks each repository for an existing
`.github/CODEOWNERS`, `CODEOWNERS` or `docs/CODEOWNERS`. If none exists it:

1. creates a branch `agentcraftworks/setup-codeowners` from the default branch,
2. commits a default `.github/CODEOWNERS` template, and
3. opens a pull request titled **🤖 AgentCraftworks: Add default CODEOWNERS routing**.

The template it proposes:

```text
# Security-critical code → security scanner agent + human lead
*.js              @agents/security-scanner @human-leads/security
*.ts              @agents/security-scanner @human-leads/security
package.json      @agents/security-scanner @human-leads/security
package-lock.json @agents/security-scanner @human-leads/security

# Documentation → docs reviewer agent (autonomous)
docs/**           @agents/docs-reviewer
*.md              @agents/docs-reviewer
README.md         @agents/docs-reviewer @human-leads/docs

# Infrastructure → humans-only (no agent writes without oversight)
.github/**        @human-leads/platform
infra/**          @human-leads/platform
Dockerfile        @human-leads/platform

# Catch-all → code reviewer agent + team leads
*                 @agents/code-reviewer @human-leads/team
```

**Nothing changes in your repository until a human merges that PR.** CE never
auto-merges it. Replace the placeholder handles with your real teams, then merge.

## Part B — label-based routing (live, the local fallback)

When CE receives a `pull_request` event **with an installation ID and App
credentials**, it fetches the PR's changed files and the repository's CODEOWNERS
(`.github/CODEOWNERS`, then `CODEOWNERS`, then `docs/CODEOWNERS`; cached 5 minutes)
and routes to the matched owners. Without credentials — which is the case for a
locally signed webhook — it cannot read GitHub, so it falls back to **labels**. That
fallback is what you exercise here.

Send three signed `pull_request` webhooks with different labels and list the resulting
handoffs. From the repository root:

```bash
# macOS / Linux
./docs/demos/03-codeowners-routing/run.sh
```

```powershell
# Windows PowerShell
.\docs\demos\03-codeowners-routing\run.ps1
```

Expected (PR numbers are random):

```text
634 ["security"]      -> @security-scanner
293 ["accessibility"] -> @accessibility-lead
467 []                -> @code-reviewer
```

Routing rules live in `typescript/src/services/label-router.ts`:
`security` / `security-review` → `@security-scanner`;
`accessibility` / `accessibility-review` / `wcag` → `@accessibility-lead`;
`documentation` / `docs-review` → `@docs-reviewer`; otherwise `@code-reviewer`.
Each handoff records the decision in `metadata.routing.source`
(`"codeowners"`, `"labels"` or `"none"`).

## Part C — CODEOWNERS routing preview

The same scripts then run the CODEOWNERS parser (`typescript/src/utils/codeowners.ts`,
the one `services/codeowners-router.ts` uses in the webhook path) against the template
above for a sample change set — this is what a real installation would produce:

```text
Parsed 11 CODEOWNERS rules from the default setup-PR template.

typescript/src/index.ts          → @security-scanner, @security, @code-reviewer, @team
docs/getting-started.md          → @docs-reviewer, @code-reviewer, @team
infra/main.bicep                 → @platform, @code-reviewer, @team
README.md                        → @docs-reviewer, @docs, @code-reviewer, @team

Reviewers for this change set (4 files): @security-scanner, @security, @code-reviewer, @team, @docs-reviewer, @platform, @docs
```

Pass your own paths to try other files:

```bash
cd typescript && node --import tsx ../docs/demos/03-codeowners-routing/route-preview.mts src/app.py Dockerfile
```

## What happens next: the action gate

Routing decides *who* reviews; the **engagement level** decides what CE may *do*.
In the webhook path (`typescript/src/services/action-gate.ts`) every GitHub write is
checked against the repository dial before it runs:

| Write | Tier | Needs level |
|---|---|---|
| `add_label` | T2 | 2 — Advisor |
| `post_comment` | T2 | 2 — Advisor |
| `request_review` (CODEOWNERS owners) | T4 | Enterprise (CE caps at 3) |

Denied writes are **skipped**, logged as `{ msg: "action denied", … }`, and — if the
level allows commenting — CE posts one PR comment beginning
**🔒 AgentCraftworks blocked N actions** that explains what was withheld and how to raise
the level with `POST /api/dial/{owner}/{repo}`. The default dial is **1 — Observer**, so
out of the box CE routes and records handoffs but writes nothing to GitHub. Use
[Demo 02](../02-engagement-levels/README.md) to raise the dial and see the gate open.

## What to read next

- [Getting Started — Track 1](../../getting-started.md#track-1--install-the-github-app)
- [Architecture — Pull request routing and gating](../../architecture.md#pull-request-routing-and-gating)
- [Demo 04 — Docker Compose](../04-docker-compose/README.md)
