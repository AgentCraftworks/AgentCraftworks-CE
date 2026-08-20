# Implementation Plan — Community Edition Getting Started Experience & Product Documentation

> **Status:** APPROVED
> **Edition:** Community
> **Last updated:** 2025-11-24

**Repo:** `AgentCraftworks/AgentCraftworks-CE`
**Tracking epic:** [#238](https://github.com/AgentCraftworks/AgentCraftworks-CE/issues/238) — 17 child issues, [#239](https://github.com/AgentCraftworks/AgentCraftworks-CE/issues/239)–[#255](https://github.com/AgentCraftworks/AgentCraftworks-CE/issues/255)
**Reference edition:** `AgentCraftworks/AgentCraftworks` (paid) — used as the structural template only

> **Scope note:** Phase 1 of this plan (documentation truth fixes and the engagement level rename) is
> already implemented in commit `6ea91b7`. The remaining phases are approved but not yet started.

---

## 1. Objective

Give Community Edition parity with the paid edition on **two** things:

1. **Getting Started PR creation** — the automated, PR-first onboarding flow a user
   experiences the moment they install the GitHub App.
2. **Product documentation** — a coherent, indexed, accurate docs set that describes
   **only** CE capabilities.

Hard constraint: **every sentence we ship must describe a capability that exists in
the CE codebase.** No Enterprise feature may be documented as if it were available,
and no CE doc may describe an aspirational capability without the `docs/futures/`
convention and a `DRAFT` / `UNDER EVALUATION` status.

---

## 2. Current state

### 2.1 What CE already has

| Area | Asset | Notes |
|---|---|---|
| Install automation | `typescript/src/handlers/installation.ts` | Creates branch `agentcraftworks/setup-codeowners`, commits `.github/CODEOWNERS`, opens a PR. Idempotent on retry. Concurrency-limited to 5 repos. Handles org-wide installs via `GET /installation/repositories`. |
| Webhook wiring | `typescript/src/handlers/pull-request.ts` | `installation` and `installation_repositories` events route to `handleInstallationEvent`. |
| MCP server | `typescript/src/mcp/server.ts` | 6 tools: `create_handoff`, `accept_handoff`, `complete_handoff`, `query_workflow_state`, `attach_context`, `get_context`. |
| Governance | `services/autonomy-dial.ts`, `services/action-classifier.ts`, `middleware/permission-checker.ts` | Engagement levels 1–5, environment caps. |
| Routing | `utils/codeowners.ts`, `services/label-router.ts` | CODEOWNERS + label-based agent routing. |
| FSM | `utils/handoff-state-machine.ts` | `pending → active → completed \| failed`. |
| REST API | `handlers/handoff-api.ts`, `handlers/autonomy-dial-routes.ts` | `/api/handoffs`, `/api/dial`, `/health`, `/api/webhook`. |
| Workflows | 27 files in `.github/workflows/` (20 `ghaw-*`) | Toggled by `scripts/ghaw-toggle.ps1` + `.github/ghaw-config.json`. |
| Docs | `README.md`, `CONTRIBUTING.md`, `DEPLOYMENT.md` (920 lines), `FORKING.md` (23 lines), `SECURITY.md`, `CODE_OF_CONDUCT.md`, `AGENTS.md`, `docs/{architecture,accessibility,SDLC_LIFECYCLE_STRATEGY,GHAW_WORKFLOWS,RUBBER_DUCK_INTEGRATION,NEW_REPO_BRANCH_POLICY_TEMPLATE}.md`, `docs/futures/` | No `docs/README.md` index. No `docs/getting-started.md`. |
| Tests | 14 files incl. `test/installation.test.ts` | `node --import tsx --test` |

### 2.2 Gap matrix vs. paid edition

| Capability | Paid | CE today | Plan |
|---|---|---|---|
| CODEOWNERS setup PR on install | ✅ | ✅ | Enrich (A2) |
| Repo detection / maturity analysis in PR body | ✅ | ❌ | Build CE-safe subset (A2) |
| Getting Started **welcome issue** (`onboarding` label) | ✅ | ❌ | Build (A1) |
| Repo config file (`agentcraftworks.config.yml`) | ✅ | ❌ | Build CE schema (A3) |
| `ghaw-setup-validate` workflow posting pass/warn/fail | ✅ | ❌ | Build (A4) |
| Onboarding status API | ✅ | ❌ | Build (A5) |
| One-click activate (merge setup PR) | ✅ | ❌ | Build, human-gated (A6) |
| Installation health check run | ✅ | ❌ | Build (A7) |
| Auto-merge setup PR after 7 days | ✅ | ❌ | **Exclude from CE** (see §4.9) |
| `detect_repo` MCP tool | ✅ | ❌ | **Exclude** — preserves "6-tool" contract (see §4.9) |
| `docs/getting-started.md` | ✅ | ❌ | Build (B1) |
| `docs/README.md` docs index | ✅ | ❌ | Build (B2) |
| `docs/ONBOARDING_GUIDE.md` | ✅ | ❌ | Build (B3) |
| `docs/PRODUCT_GUIDE.md` | ✅ (39 KB) | ❌ | Build CE subset (B4) |
| `docs/ENGAGEMENT_LEVELS.md` | ✅ | ❌ (inline in README/architecture) | Build (B5) |
| `docs/ENVIRONMENTS_GUIDE.md` | ✅ | ❌ | Build (B6) |
| `docs/GITHUB_APP_DEV_SETUP.md` | ✅ | partial (inside `DEPLOYMENT.md`) | Extract (B7) |
| `docs/MCP_TOOLS.md` | ✅ (`docs/mcp-tools.md`) | ❌ | Build (B8) |
| `docs/CONFIGURATION.md` | ✅ (inline in getting-started) | ❌ | Build (B9) |
| `docs/TROUBLESHOOTING.md` | ✅ (inline) | ❌ | Build (B10) |
| Docs front-matter convention | ✅ | ❌ | Adopt (D1) |
| Link checking | ✅ `ghaw-link-checker` | ✅ present | Verify docs are in scope (D3) |

### 2.3 Documentation accuracy defects found in CE today

These are **shipping inaccuracies** and must be fixed before we add more docs on top:

| # | File | Defect | Correct value |
|---|---|---|---|
| DEF-1 | `README.md` line 64 | Advertises MCP tools as "analyze, fix, review, comment, rollback, escalate" | Actual: `create_handoff`, `accept_handoff`, `complete_handoff`, `query_workflow_state`, `attach_context`, `get_context` |
| DEF-2 | `README.md` line 126 | Claims FSM is `RECEIVED → CLASSIFIED → GOVERNANCE_CHECK → ROUTED → EXECUTING → COMPLETE` | Actual handoff FSM: `pending → active → completed \| failed`, with `failed` reason prefixes `rejected:` / `abandoned:` / `error:` / `timeout:`, and `overdue` as a computed property |
| DEF-3 | `README.md` line 98 | "see Quick Start section above" is a self-referential dangling pointer | Point at `docs/getting-started.md` (B1) |
| DEF-4 | `README.md` Quick Start | Only documents the *self-host / build from source* path; there is no *install the App and get a PR* path — which is the actual product experience | Add a two-track Quick Start (§4.10) |
| DEF-5 | `.env.example` vs `DEPLOYMENT.md` | `.env.example` uses `GH_CE_APP_ID` / `GH_CE_APP_PRIVATE_KEY` / `GH_CE_WEBHOOK_SECRET`; confirm every doc and workflow uses the same names | Single canonical env var table in `docs/CONFIGURATION.md` (B9) |
| DEF-6 | Engagement level naming | CE used Observer / Advisor / **Peer Programmer** / **Agent Team** / **Full Agent Team**; the paid product had since moved to Observer / Advisor / **Collaborator** / **Delegated** / **Autonomous** without pushing the change back to CE | **RESOLVED** — CE now uses the paid names. The old names are **removed outright** (no alias layer, no deprecation window); `resolveEngagementLevel` rejects them with an error naming the valid set. See D-1 and §7.1. |
| DEF-7 | `FORKING.md` (23 lines) | README links it as a "complete file-by-file checklist"; it is a short workflow-disable note | Either expand to match the promise or soften the README claim |

---

## 3. CE capability boundary (the allow/deny list)

This is the single most important artifact in this plan. Every doc author and agent
working on CE docs must apply it.

### 3.1 ✅ Documentable in CE

Webhook-driven GitHub App · HMAC-SHA256 webhook verification · IP + installation rate
limiting (`express-rate-limit`) · Agent Engagement Levels 1–5 with environment caps
(local 5 / dev 5 / staging 4 / production 3) · Action tiers T1–T5 · Action classifier ·
Permission checker middleware · Handoff FSM (`pending`/`active`/`completed`/`failed`) ·
Handoff REST API · Context attach/get · CODEOWNERS routing · Label routing · 6 MCP tools ·
CODEOWNERS setup PR on install · GH-AW workflow catalogue + toggle script ·
Docker Compose local run · Azure deploy via `azd` + Bicep · Accessibility agent team ·
CodeQL · SDLC lifecycle stages · Branch promotion policy `feature/* → staging → main` ·
MIT licence, forking, CLA.

### 3.2 ❌ NOT documentable in CE (Enterprise-only)

Rate Governor (6-pattern adaptive rate limiting) · Squad Coordinator / squads / S2S
coordination / `.squad/` team-config · Aspire integration · Governance Gates middleware ·
Promotion Engine (staging → canary → production) · Rate-limiting Audit Trail ·
Quarantine Bridge · Microsoft Entra Agent ID · Conditional Access · Microsoft Sentinel
SIEM / `sentinel.bicep` · NIST SP 800-53 / ISO 42001 compliance packs · nuSquad SDK ·
Three-layer Squad Engagement Dial · AEU cost model / wave planning · Risk-tier
compliance scaffolding (Tier 2/3 governance files) · Dashboard / canvas ·
Copilot Studio eval loop · Marketplace / billing / Stripe.

> ⚠️ **Conflict to resolve.** The research pass over the paid repo suggested Rate
> Governor, Squad Coordinator, Aspire, Governance Gates, Promotion Engine and
> Quarantine Bridge were "core to both editions." That contradicts CE's own
> `README.md` (lines 137–147), which lists all six as Enterprise-only, and the CE
> codebase, which contains none of them. **This plan treats CE `README.md` as
> authoritative.** See decision D-2 (§7).

### 3.3 Cross-reference pattern

Where a CE doc must acknowledge an Enterprise capability (for upgrade context only),
use exactly one pattern — a short callout, never a feature description:

```markdown
> **Enterprise:** Adaptive rate governing and multi-agent squad coordination are part
> of AgentCraftworks Enterprise. See [Editions](EDITIONS.md).
```

---

## 4. Workstream A — Getting Started PR creation (code)

**Goal:** installing the CE GitHub App on a repo produces a reviewable, human-approved
setup change set plus a guided checklist — with zero silent repo mutation.

Target end-to-end experience:

```
Install CE GitHub App
        ↓
[A7] Health check run  ──── "agentcraftworks-setup" check: permissions OK?
        ↓
[A2] CODEOWNERS setup PR  ── enriched body: detected language, CI, existing
        │                     instruction files, recommended engagement level
        ↓
[A1] Getting Started issue ── labelled `onboarding`, 5-item checklist,
        │                     links to the PR + docs/getting-started.md
        ↓
[A3] User adds agentcraftworks.config.yml
        ↓
[A4] ghaw-setup-validate runs → posts pass/warn/fail comment on the issue
        ↓
[A6] User clicks Activate (or merges the PR manually) → governance live
        ↓
[A5] GET /api/onboarding/:owner/:repo/status → machine-readable completion state
```

### A1 — Getting Started welcome issue

- **New:** `typescript/src/services/onboarding-issue.ts`
- Create one issue per newly-added repo, title `🚀 Getting started with AgentCraftworks`,
  label `onboarding` (create the label if absent).
- Body: 5-step checklist — (1) review setup PR, (2) customise CODEOWNERS teams,
  (3) add `agentcraftworks.config.yml`, (4) confirm engagement ceiling,
  (5) merge to activate. Plus a link to `docs/getting-started.md` and the PR URL.
- **Idempotency:** search `is:issue label:onboarding` before creating; reuse the
  existing issue number if found. Mirrors the existing `installation.ts` retry pattern.
- **Failure isolation:** wrap in try/catch, surface in `ScaffoldResult`, never block
  the CODEOWNERS PR.
- **Permission:** requires `issues: write` on the App. If missing, degrade gracefully
  and note it in the check run (A7).

### A2 — Repo detection + enriched setup PR body

- **New:** `typescript/src/services/repo-detect.ts`
- CE-safe detection only, all via GitHub REST (use `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1`
  — **one** request, per the rate-limit rule in `AGENTS.md`):
  - primary language (`GET /repos/{o}/{r}/languages`)
  - presence of `.github/workflows/**` and which CI is used
  - presence of a test directory / test script in `package.json`
  - presence of agent instruction files: `AGENTS.md`, `.github/copilot-instructions.md`,
    `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `.gemini/styleguide.md`, `.mcp.json`
  - branch protection on the default branch (`GET /repos/{o}/{r}/branches/{b}/protection`,
    tolerate 403/404)
- Produce a **readiness summary** and a **recommended engagement level (1–3)**.
  Recommendation must never exceed 3 by default — CE's production cap is 3.
- Make the CODEOWNERS template **language-aware** (extend `DEFAULT_CODEOWNERS_TEMPLATE`
  with Python / Go / Rust / C# patterns when detected).
- Render the detection summary as a table in the existing `PR_BODY`.
- **Explicitly out of scope:** "maturity score 0–100" and risk-tier classification —
  those belong to Enterprise scaffolding.

### A3 — `agentcraftworks.config.yml` (CE schema)

- **New:** `typescript/src/services/repo-config.ts` + `typescript/src/types/repo-config.ts`
- CE schema — deliberately a strict subset of the paid schema so configs are
  forward-compatible on upgrade:

```yaml
version: "1"
mode: "workflow"            # "workflow" | "agent" | "both"

workflows:
  enabled:
    - issue-triage
    - ci-coach
    - pr-fix

agents:
  ceiling: 3                # 1–5, capped by environment
  overrides:
    code-simplifier: 1

codeowners:
  auto_generate: true
  include_humans:
    - your-org/platform-lead
```

- Parser + schema validation with clear, line-referenced error messages.
- Wire `agents.ceiling` into `services/autonomy-dial.ts` so repo config becomes a
  *lower bound* on the environment cap — never an escape hatch above it.
- **Unknown keys warn, they do not fail** — so Enterprise-only keys in a shared config
  degrade gracefully in CE.
- Add `agentcraftworks.config.example.yml` at repo root.

### A4 — `ghaw-setup-validate.yml`

- **New:** `.github/workflows/ghaw-setup-validate.yml` + `typescript/src/jobs/setup-validate.ts`
- Triggers: `push` touching `agentcraftworks.config.yml` or `.github/CODEOWNERS`;
  `workflow_dispatch`; `issues: [opened]` filtered to the `onboarding` label.
- Checks: config YAML valid · required env/secrets present (`GH_CE_APP_ID`,
  `GH_CE_APP_PRIVATE_KEY`, `GH_CE_WEBHOOK_SECRET`) · `.github/CODEOWNERS` exists and
  parses · every slug in `workflows.enabled` maps to a real `.github/workflows/ghaw-*.yml` ·
  `agents.ceiling` within the environment cap.
- Output: single pass/warn/fail comment on the `onboarding` issue; update in place on rerun.
- Engagement level **T2 (Advisor)** — comment only. Header comment must state this
  (required by `AGENTS.md` workflow checklist).
- `permissions:` least-privilege: `contents: read`, `issues: write`.
- Register in `.github/ghaw-config.json` as Tier 1.

### A5 — Onboarding status API

- **New:** `typescript/src/handlers/onboarding-api.ts`, mounted at `/api/onboarding` in `index.ts`
- `GET /api/onboarding/:owner/:repo/status?installationId=N` →

```jsonc
{
  "codeowners":       { "exists": true, "merged": false, "pr_url": "..." },
  "onboardingIssue":  { "number": 12, "url": "..." },
  "config":           { "exists": true, "valid": true, "mode": "workflow", "ceiling": 3 },
  "instructionFiles": { "AGENTS.md": true, "CLAUDE.md": false },
  "engagementLevel":  3,
  "complete":         false
}
```

- Reuse the existing `express-rate-limit` pattern from `index.ts`.
- Auth: installation-scoped Octokit only; no unauthenticated repo enumeration.

### A6 — Activation endpoint (human-gated)

- **New:** `typescript/src/handlers/onboarding-activate.ts`
- `GET /api/onboarding/:owner/:repo/activate` → minimal, **WCAG 2.2 AA** confirmation
  page (semantic HTML, real `<button>`, visible focus ring, ≥4.5:1 contrast, page title,
  one `<h1>`). Must be reviewed by `@accessibility-lead` per `AGENTS.md`.
- `POST` same path → locate the `agentcraftworks/setup-codeowners` PR, verify installation
  access, squash-merge, return result.
- Rate limit 30 requests / IP / 15 min.
- **CE deliberately omits the paid 7-day auto-merge.** CE's positioning is
  "the human is always in the loop" — an unattended self-merge contradicts it.
  Ship a 48-hour *reminder comment* instead (D-3, §7).

### A7 — Installation health check run

- **New:** `typescript/src/handlers/installation-health.ts`
- Post an `agentcraftworks-setup` check run on the default branch HEAD summarising:
  granted permissions vs. required, whether the CODEOWNERS PR was opened, whether the
  onboarding issue was created, and any degraded capability.
- Conclusion `neutral` on partial permissions, `success` on full, never `failure`
  (a failed check on install is a hostile first impression).

### A8 — Tests

Extend `typescript/test/`:

| New test file | Covers |
|---|---|
| `onboarding-issue.test.ts` | creation, idempotent reuse, label auto-create, permission-denied degradation |
| `repo-detect.test.ts` | language/CI/instruction-file detection, ceiling recommendation never > 3, single-Trees-API-call assertion |
| `repo-config.test.ts` | valid parse, invalid YAML, unknown-key warning, ceiling clamped by env cap |
| `setup-validate.test.ts` | pass / warn / fail matrices, comment upsert |
| `onboarding-api.test.ts` | status shape, `complete` computation, rate limiting |
| `onboarding-activate.test.ts` | PR lookup, merge, missing-PR path, rate limiting |
| `installation-health.test.ts` | check-run payload, degraded-permission conclusion |

Extend `installation.test.ts` for the enriched PR body and language-aware CODEOWNERS.

**Gotcha (from `AGENTS.md`):** add `await new Promise(r => setTimeout(r, 10))` where the
test compares timestamps — sub-millisecond timing bites here.

### 4.9 Explicitly excluded from CE Workstream A

| Excluded | Why |
|---|---|
| `detect_repo` as a **7th MCP tool** | `README.md`, `AGENTS.md` and the org standard all state a **6-tool** MCP interface. Adding a 7th forces a doc change across every repo consuming the ORG-STANDARD block. Expose detection via `/api/onboarding/...` REST instead. |
| 7-day unattended auto-merge | Contradicts CE's human-in-the-loop positioning; production engagement cap is 3. |
| Maturity score (0–100) | Paid-edition analytics surface. |
| Risk-tier compliance scaffolding (Tier 2/3 governance files) | Enterprise compliance pack. |
| `squad.config.ts` / `.squad/` scaffolding | Squad Coordinator + nuSquad SDK are Enterprise. |
| `docs/governance/sentinel-audit-config.yaml` | Sentinel is Enterprise. |

### 4.10 Two-track Quick Start

CE's README currently only documents "clone and build." Both tracks must exist,
with the *user* track first:

- **Track 1 — Use it (5 min):** install the CE GitHub App → review the setup PR →
  add config → merge. Lands in `docs/getting-started.md`.
- **Track 2 — Run it (15 min):** clone → `npm install` → `.env` → Docker Compose or
  `npm start` → deploy with `azd`. Lands in `docs/SELF_HOSTING.md`, sourced from the
  existing 920-line `DEPLOYMENT.md`.

---

## 5. Workstream B — Product documentation

Target structure (all new files unless noted):

```
AgentCraftworks-CE/
├── README.md                       (M) fix DEF-1..4,7; two-track Quick Start
├── CONTRIBUTING.md                 (M) link to docs index
├── FORKING.md                      (M) expand or soften README claim (DEF-7)
├── DEPLOYMENT.md                   (M) becomes the deep reference behind SELF_HOSTING.md
└── docs/
    ├── README.md                   B2  documentation index
    ├── getting-started.md          B1  ⭐ primary user journey, ≤15 min
    ├── ONBOARDING_GUIDE.md         B3  what the App does on install, step by step
    ├── PRODUCT_GUIDE.md            B4  CE feature reference
    ├── ENGAGEMENT_LEVELS.md        B5  levels 1–5, action tiers, env caps
    ├── ENVIRONMENTS_GUIDE.md       B6  local/dev/staging/production
    ├── GITHUB_APP_DEV_SETUP.md     B7  create your own GitHub App (extracted)
    ├── MCP_TOOLS.md                B8  the 6 tools, schemas, client wiring
    ├── CONFIGURATION.md            B9  config file + canonical env var table
    ├── TROUBLESHOOTING.md          B10 install/webhook/permission failures
    ├── SELF_HOSTING.md             B11 Track 2 quick start
    ├── EDITIONS.md                 B12 CE vs Enterprise boundary
    ├── HANDOFF_LIFECYCLE.md        B13 FSM, states, reason prefixes, API
    ├── architecture.md             (existing)
    ├── accessibility.md            (existing)
    ├── SDLC_LIFECYCLE_STRATEGY.md  (existing)
    ├── GHAW_WORKFLOWS.md           (existing — verify slugs match A3/A4)
    └── futures/                    (existing)
```

### B1 — `docs/getting-started.md` ⭐

Mirror the paid structure, CE content only:

Prerequisites · Recommended install path: PR-first onboarding · Step 1 Install the App ·
Step 2 Review the CODEOWNERS PR · Step 3 Add `agentcraftworks.config.yml` ·
Step 4 Validate (`ghaw-setup-validate`) · Step 5 Activate · Modes table ·
Engagement levels table · Config reference · Available CE workflows table ·
Common configurations (solo / small team / open-source project) · Validation ·
Troubleshooting Q&A · Next steps.

Constraints: ≤15 minutes to first value · every command copy-pasteable and verified ·
workflow slug table generated from the actual `.github/workflows/ghaw-*.yml` files, not
hand-written · **no** `GH_ENT_*` secrets — CE uses `GH_CE_*`.

### B2 — `docs/README.md`

Documentation index grouped as: **Start here** (getting-started, onboarding,
configuration) · **Reference** (product guide, engagement levels, MCP tools, handoff
lifecycle, architecture) · **Operate** (self-hosting, deployment, environments,
troubleshooting) · **Contribute** (contributing, forking, accessibility, SDLC, GH-AW) ·
**Futures** (link to `docs/futures/README.md`, flagged as non-shipping).

### B3 — `docs/ONBOARDING_GUIDE.md`

Overview · Step 1 Install · Step 2 Getting Started issue (what detection reports) ·
Step 3 CODEOWNERS setup PR (annotated template) · Step 4 Activate (one-click vs manual —
**no auto-merge option in CE**) · Onboarding Status API · Troubleshooting ·
What's next. Written against A1–A7 as built.

### B4 — `docs/PRODUCT_GUIDE.md` (CE subset)

Sections: What is CE · Core concepts · Engagement levels · Quick start ·
CODEOWNERS + label routing · Handoff lifecycle (A2A) · MCP server · Webhook processing
and security · Configuration · GH-AW workflow catalogue · Human gates ·
Branch conventions · Troubleshooting · Cheat sheet.

Explicitly **dropped** vs. the paid 39 KB guide: Creating Squads, Dispatching Agents,
Squad-to-Squad, Rate Governing, Environment Promotion (Promotion Engine),
Governance & Compliance packs, Wave planning with AEUs.

### B5–B13 — remaining docs

| Doc | Source of truth in code | Key content |
|---|---|---|
| B5 `ENGAGEMENT_LEVELS.md` | `services/autonomy-dial.ts`, `services/action-classifier.ts`, `middleware/permission-checker.ts` | Levels 1–5 + action tiers T1–T5 + env caps + how a request is evaluated + `/api/dial` |
| B6 `ENVIRONMENTS_GUIDE.md` | `.github/workflows/deploy-*.yml`, `infra/` | local/dev/staging/production, caps per env, promotion `feature/* → staging → main` |
| B7 `GITHUB_APP_DEV_SETUP.md` | `DEPLOYMENT.md` §GitHub App Setup | Create App, permissions matrix (incl. `issues: write` for A1, `checks: write` for A7), private key, webhook URL, install |
| B8 `MCP_TOOLS.md` | `mcp/server.ts` | All 6 tools with input/output schemas + client config for Copilot / Claude / VS Code. **Fixes DEF-1.** |
| B9 `CONFIGURATION.md` | `.env.example`, `repo-config.ts` (A3) | Canonical `GH_CE_*` env var table + full config file reference. **Fixes DEF-5.** |
| B10 `TROUBLESHOOTING.md` | — | Webhook 401 (HMAC), install produced no PR, CODEOWNERS conflict, rate limit 403, missing permissions |
| B11 `SELF_HOSTING.md` | `DEPLOYMENT.md`, `docker-compose.yml`, `azure.yaml` | Track 2 quick start, links to `DEPLOYMENT.md` for depth |
| B12 `EDITIONS.md` | `README.md` §Enterprise Edition | Feature table; the one place Enterprise features may be named. Links to agentcraftworks.com |
| B13 `HANDOFF_LIFECYCLE.md` | `utils/handoff-state-machine.ts`, `handlers/handoff-api.ts` | 4 states, 2 terminal, `failed` reason prefixes, `overdue` computed, UUID ids, `abandoned:reason` no-space format. **Fixes DEF-2.** |

---

## 6. Workstream C & D — corrections, conventions, CI

### C1 — Fix documentation defects DEF-1 … DEF-7 (§2.3)

Do this **first**, in its own PR, before adding new docs. Publishing a bigger docs set on
top of an inaccurate MCP tool list and an invented FSM multiplies the error.

### D1 — Front-matter convention

Every doc under `docs/` starts with:

```markdown
> **Status:** Shipped
> **Edition:** Community
> **Last updated:** 2026-08-18
```

`Status` ∈ `Shipped` | `DRAFT` | `UNDER EVALUATION` | `APPROVED` | `SUPERSEDED`.
`docs/futures/` docs must not use `Shipped`. This matches the paid repo's marker scheme,
which keeps future ORG-STANDARD syncs mechanical.

### D2 — Naming

`SCREAMING_SNAKE_CASE.md` for reference docs (matches existing CE + paid convention);
`getting-started.md` stays lowercase to match the paid repo and because it is the
canonical entry-point URL.

### D3 — CI gates

- Confirm `ghaw-link-checker.yml` covers `docs/**` and root `*.md`; extend if not.
- Add a docs job to `ci.yml`: fail on links to `docs/` files that do not exist, and on
  any occurrence of the Enterprise-only term list (§3.2) outside `docs/EDITIONS.md`
  and the approved callout pattern (§3.3). This is the automated enforcement of the
  capability boundary.
- `ghaw-accessibility-review` already fires on `.md` changes → `@markdown-a11y-assistant`
  must pass on every docs PR (alt text, heading hierarchy, no "click here" links, table
  headers).

### D4 — Doc ↔ code drift guard

Add a test that asserts the tool names listed in `docs/MCP_TOOLS.md` exactly match the
tool names exported by `mcp/server.ts`. Prevents DEF-1 recurring.

---

## 7. Decisions — RESOLVED 2026-08-18

| ID | Decision | Resolution |
|---|---|---|
| **D-1** | Engagement level names | **RESOLVED — align CE to the paid naming.** CE adopts Observer / Advisor / **Collaborator** / **Delegated** / **Autonomous**. The old CE names were superseded by later improvements in the paid product that were never pushed back down to CE. CE has no released users, so the old names are **removed outright** — no alias layer, no deprecation window. `resolveEngagementLevel` rejects them with an error naming the valid set. |
| **D-2** | Are Rate Governor / Squad Coordinator / Aspire / Governance Gates / Promotion Engine / Quarantine Bridge CE or Enterprise? | **RESOLVED — Enterprise-only.** The product direction shifted away from CE-as-core; these six exist only in the paid product. The research pass that called them "core to both editions" was wrong. §3.2 stands. |
| **D-3** | Ship 7-day auto-merge of the setup PR in CE? | **No.** 48-hour reminder comment only. |
| **D-4** | Add `detect_repo` as a 7th MCP tool? | **No.** Preserve the 6-tool contract; expose via REST. |
| **D-5** | Does CE need `mode: workflow \| agent \| both`? | **Ship the field** for forward-compatibility, defaulting to `workflow`. |
| **D-6** | Publish docs to a site? | **Not in this scope.** |
| **D-7** | Where do product standards get authored? | Upstream in `AgentCraftworks`, consumed here via ORG-STANDARD sync. |

### 7.1 ⚠️ Upstream dependency created by D-1

The engagement level tables in CE's `AGENTS.md` (lines 337–348) sit **inside** the
`<!-- ORG-STANDARD:BEGIN/END -->` block (lines 249–499), which this repo's own policy
forbids editing by hand — it is synced from `AgentCraftworks/.github`.

Therefore the rename must be completed in two places:

1. **In CE (done — see §7.2):** code, tests, README, `docs/**`, workflow headers.
2. **Upstream (blocked on another repo):** `AgentCraftworks/.github/AGENTS.md` must be
   updated to the new names, after which `sync-org-standards` propagates to CE,
   `AgentCraftworks`, `AgentCraftworks-VSCode` and `AgentCraftworks_WebSite`.

Until step 2 lands, CE's `AGENTS.md` will show the old names and `sync-org-standards`
will report drift. **This is expected and must not be "fixed" by editing the block.**

### 7.2 Work already completed in this session

| Change | Files |
|---|---|
| Level rename in the type layer, with `LEGACY_ENGAGEMENT_LEVEL_ALIASES` and `VALID_ENGAGEMENT_LEVEL_NAMES` | `typescript/src/types/autonomy.ts`, `typescript/src/handlers/autonomy-dial-routes.ts` |
| Test updates + new coverage asserting superseded names are rejected | `typescript/test/action-classifier.test.ts` |
| DEF-1 MCP tool list corrected; DEF-2 FSM corrected; DEF-3 dangling link fixed; DEF-4 two-track Quick Start added; DEF-7 FORKING claim softened; Enterprise section marked "none of the following are included in CE" | `README.md` |
| DEF-1 + DEF-2 corrected; handoff state diagram and MCP tool table added; level rename | `docs/architecture.md` |
| Squad Coordinator no longer claimed as a CE capability; `.squad/` paths removed | `docs/RUBBER_DUCK_INTEGRATION.md` |
| Level rename | `SECURITY.md`, `CONTRIBUTING.md`, `DEPLOYMENT.md`, `docs/GHAW_WORKFLOWS.md`, `docs/accessibility.md`, 10 workflow headers, 6 job files |

Verified: `npm run typecheck` clean, **395/395 tests pass**.

This closes most of **Phase 1**. The remaining Phase 1 item is the docs↔code drift test (D4).

---

## 8. Phasing

All work follows the mandatory branch policy: `feature/*` → `staging` → `main`.
No direct pushes to `main` or `staging`.

| Phase | Branch | Contents | Exit criteria |
|---|---|---|---|
| **0 — Decisions** | — | Resolve D-1 … D-7 | Signed off in an issue |
| **1 — Truth** | `fix/ce-docs-accuracy` | C1 (DEF-1…DEF-7), D4 drift test | `README.md` describes only what the code does; drift test green |
| **2 — Docs skeleton** | `docs/ce-docs-structure` | B2 index, D1 front-matter, D2 naming, D3 CI gates, B12 `EDITIONS.md` | Index links resolve; boundary linter green |
| **3 — Getting Started (docs-first)** | `docs/ce-getting-started` | B1, B11, B9, B8, B13, B5 | A reader can install + configure CE using only these docs |
| **4 — Onboarding code** | `feat/ce-onboarding-experience` | A1, A2, A7, A8 (partial) | Install produces enriched PR + onboarding issue + check run; tests green |
| **5 — Config + validation** | `feat/ce-repo-config` | A3, A4, A8 | Config parses; `ghaw-setup-validate` posts pass/warn/fail |
| **6 — Status + activation** | `feat/ce-onboarding-api` | A5, A6, A8 | Status endpoint accurate; activation merges; a11y sign-off on the confirm page |
| **7 — Reference docs** | `docs/ce-product-guide` | B3, B4, B6, B7, B10 | Full docs set complete and indexed |
| **8 — Verify** | — | End-to-end dry run on a scratch repo | See §9 |

Phases 3 and 4 can run in parallel in separate worktrees (per `AGENTS.md` best
practice), provided B1 is written against the A-series *design* and reconciled in phase 7.

---

## 9. Acceptance criteria

**Getting Started experience**

1. Installing the CE App on a fresh repo produces, within 60s: one CODEOWNERS setup PR
   with a detection summary, one `onboarding`-labelled issue with a checklist, and one
   `agentcraftworks-setup` check run.
2. Re-delivering the same webhook creates no duplicates (idempotency).
3. A repo that already has CODEOWNERS is skipped cleanly and the issue says so.
4. Pushing a valid `agentcraftworks.config.yml` produces a ✅ comment on the onboarding
   issue; an invalid one produces a ❌ comment naming the offending line.
5. `GET /api/onboarding/:owner/:repo/status` returns `complete: true` only after the
   setup PR is merged **and** a valid config exists.
6. Nothing is merged into a customer repo without an explicit human action.
7. An App installed with reduced permissions degrades gracefully — no unhandled 403s.

**Documentation**

8. A developer with no prior context installs CE and reaches first agent activity using
   only `docs/getting-started.md`, in under 15 minutes.
9. Every command in every doc has been executed and verified.
10. `npm run typecheck` and the full test suite pass; new code has tests.
11. No Enterprise-only term (§3.2) appears outside `docs/EDITIONS.md` and approved
    callouts — enforced by the D3 CI gate.
12. `ghaw-link-checker` reports zero broken links.
13. `@markdown-a11y-assistant` and `@accessibility-lead` sign off on all docs and on the
    activation confirmation page.
14. The MCP tool list in docs matches `mcp/server.ts` exactly (D4 test).

---

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Enterprise capability leaks into CE docs | Credibility + support burden from users asking for features they don't have | D3 boundary linter in CI; §3 allow/deny list is mandatory reading |
| API rate limits during org-wide install (hundreds of repos) | 403s, partial onboarding | Trees API (1 call/repo); existing concurrency limit of 5; check `gh api rate_limit` before bulk ops per `AGENTS.md` |
| New `issues: write` / `checks: write` permissions force existing installs to re-consent | Silent breakage for current users | A7 health check reports degraded capability; docs call out the re-consent step; feature-flag A1/A7 off when permission absent |
| Docs drift from code again | Repeat of DEF-1/DEF-2 | D4 drift test + `ghaw-daily-doc-updater` |
| D-2 answered "these are CE features after all" | Large rework of §3 and B4/B12 | Resolve in Phase 0 before any writing |
| Config schema diverges from Enterprise | Users can't upgrade cleanly | CE schema is a strict subset; unknown keys warn not fail; propose upstream per D-7 |

---

## 11. Suggested issue breakdown

One epic + these issues, labelled for CODEOWNERS routing:

- `[epic] CE Getting Started experience & product documentation`
- Phase 0: Resolve CE/Enterprise capability boundary and engagement-level naming (D-1…D-7)
- Phase 1: Fix MCP tool list, FSM description and dangling links in README (DEF-1…DEF-7)
- Phase 1: Add docs↔code MCP tool drift test
- Phase 2: Add `docs/README.md` index, front-matter convention and Enterprise-term CI gate
- Phase 2: Add `docs/EDITIONS.md`
- Phase 3: Write `docs/getting-started.md` (two-track quick start)
- Phase 3: Extract `docs/SELF_HOSTING.md`, `docs/CONFIGURATION.md`, `docs/MCP_TOOLS.md`, `docs/HANDOFF_LIFECYCLE.md`, `docs/ENGAGEMENT_LEVELS.md`
- Phase 4: Getting Started welcome issue on install
- Phase 4: Repo detection + enriched CODEOWNERS setup PR
- Phase 4: Installation health check run
- Phase 5: `agentcraftworks.config.yml` schema, parser and autonomy-dial wiring
- Phase 5: `ghaw-setup-validate` workflow
- Phase 6: Onboarding status API
- Phase 6: Accessible one-click activation endpoint
- Phase 7: `docs/ONBOARDING_GUIDE.md`, `docs/PRODUCT_GUIDE.md`, `docs/ENVIRONMENTS_GUIDE.md`, `docs/GITHUB_APP_DEV_SETUP.md`, `docs/TROUBLESHOOTING.md`
- Phase 8: End-to-end onboarding dry run on a scratch repo
