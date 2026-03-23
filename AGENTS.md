# AGENTS.md — AgentCraftworks Core (Open Source)

> This file follows the [AGENTS.md](https://agents.md/) open standard (Linux Foundation / Agentic AI Foundation).
> It is read by 25+ coding agent tools including Claude Code, GitHub Copilot, Gemini CLI, Cursor, Windsurf, Devin, OpenAI Codex, and more.
>
> This file is **self-contained** — it includes organization-wide standards so that clones
> and forks of this repo receive the full agent instructions without needing org-level inheritance.

---

## Project Overview

AgentCraftworks Core is an open-source **GitHub App** (webhook-driven Express server) that orchestrates multi-agent software development workflows. It uses a 4-state handoff finite state machine, CODEOWNERS-based routing, and the Model Context Protocol (MCP).

**This is NOT a CLI tool.** It is a webhook-driven server that listens for GitHub events and routes work to specialized AI agents.

## Repository Structure

```
AgentCraftworks-CE/
├── typescript/
│   ├── src/          # Source code
│   │   ├── types/    # TypeScript type definitions
│   │   ├── utils/    # Core utilities (FSM, CODEOWNERS, auth)
│   │   ├── services/ # Business logic (handoffs, classification, autonomy)
│   │   ├── middleware/ # Express middleware (webhook sig, permissions)
│   │   ├── handlers/  # Route handlers (PR, handoff API, autonomy)
│   │   ├── mcp/      # MCP server with 6 tools
│   │   └── index.ts  # Entry point
│   ├── test/         # Tests (node:test + tsx)
│   ├── tsconfig.json # strict: true
│   └── package.json  # @agentcraftworks/core
├── infra/            # Azure Bicep infrastructure-as-code
├── scripts/          # Deployment and utility scripts
└── docs/             # Documentation
```

## Building and Testing

```bash
cd typescript && npm install
npm run typecheck      # tsc --noEmit
npm run build          # esbuild compilation
node --import tsx --test test/**/*.test.ts
```

## Core Domain Concepts

### Handoff State Machine

```
pending → active → completed
  ↓         ↓
failed    failed
```

- 4 states, 2 terminal (`completed`, `failed`)
- `failed` uses reason prefixes: `rejected:*`, `abandoned:*`, `error:*`, `timeout:*`
- `overdue` is a **computed property** (not a stored state)
- Handoff IDs are UUIDs
- `abandonHandoff` maps to `failed` with `reason="abandoned:..."` (no space after colon)

### MCP Server

The TypeScript implementation exposes an MCP (Model Context Protocol) server with 6 tools:

| Tool | Description |
|------|-------------|
| `create_handoff` | Create a new agent handoff |
| `accept_handoff` | Accept a pending handoff |
| `complete_handoff` | Mark a handoff as completed |
| `query_workflow_state` | Query handoff state and history |
| `attach_context` | Attach structured context to a handoff |
| `get_context` | Retrieve context for a handoff |

## Key Gotchas

1. Sub-millisecond timing in tests: add small delays (`setTimeout(r, 10)`) when comparing timestamps
2. `abandonHandoff` format: `abandoned:reason` (no space after colon)
3. TypeScript `dist/` is gitignored — only source is committed

## Organization Repository Boundaries

The AgentCraftworks org separates **Product**, **Platform Operations**, and **Business Operations** into distinct repos with different audiences, credentials, and agent behavior rules.

| Domain | Repos | Audience | Auth |
|--------|-------|----------|------|
| **Product (Paid)** | `AgentCraftworks` | Customers, enterprise buyers | Product App (`GH_APP_ID`) |
| **Product (OSS)** | `AgentCraftworks-CE` (this repo), `AgentCraftworks-VSCode`, `AgentCraftworks_WebSite` | Contributors, open-source community | Product App (`GH_APP_ID`) |
| **Platform Operations** | `AgentCraftworks-PlatformOps` | Engineering team | Internal Ops App (`GH_OPS_APP_ID`) |
| **Business Operations** | `AgentCraftworks-BizOps` | Business team | TBD |

### Standards hierarchy

Product-specific agent standards (engagement levels, handoff FSM, action tiers, MCP tools, CODEOWNERS routing) are **authored in `AgentCraftworks`** (the paid product repo) and **consumed here** via the `ORG-STANDARD` sync mechanism. Do not author new product agent standards in this repo — propose them in `AgentCraftworks` first.

`AgentCraftworks-PlatformOps` is the central product development and platform engineering hub for org-wide engineering standards (CI/CD, infrastructure, process automation).

### Rules for agents in THIS repo (Product — OSS)

1. **Never use ops credentials** (`GH_OPS_APP_ID`) — those belong to PlatformOps
2. **Never create internal cost reports here** — those go to PlatformOps issues
3. **GH-AW workflows** (`ghaw-*` prefix) belong here — product CI/CD automation
4. **Ops workflows** (`ops-*` prefix) belong in `AgentCraftworks-PlatformOps`
5. **Product app credentials** (`GH_APP_ID` / `GH_APP_PRIVATE_KEY`) are for customer-facing webhook processing only
6. **This repo consumes product standards from `AgentCraftworks`** — do not create new product standards here

---

## Accessibility Requirements

> **MANDATORY — all agents must follow these rules when creating or modifying any UI, documentation, or user-facing content.**

Accessibility is a **first-class requirement** in AgentCraftworks — equal in priority to Security and Quality. Every agent team operating in Community Edition or Enterprise must treat WCAG 2.2 AA conformance as a non-negotiable baseline.

> ⚠️ **AI tools are not perfect.** They miss things, make mistakes, and cannot replace testing with real screen readers and assistive technology. Always verify with VoiceOver, NVDA, JAWS, and keyboard-only navigation. Agent tooling is a helpful starting point, not a substitute for real accessibility testing.

### Accessibility Agent Team

This project integrates the [Community-Access/accessibility-agents](https://github.com/Community-Access/accessibility-agents) open-source agent team. These agents enforce WCAG AA standards and must be engaged for all UI/UX work.

**Core web accessibility agents** (engage for any `.jsx`, `.tsx`, `.vue`, `.svelte`, `.html`, `.css`, `.scss`, `.less` changes):

| Agent | Role |
|-------|------|
| `@accessibility-lead` | Orchestrator — decides which specialists to invoke and runs the final review |
| `@aria-specialist` | ARIA roles, states, properties, widget patterns; enforces the first rule of ARIA |
| `@modal-specialist` | Dialogs, drawers, popovers — focus trapping, focus return, escape behavior |
| `@contrast-master` | Color contrast ratios, dark mode, focus indicators, color independence |
| `@keyboard-navigator` | Tab order, focus management, skip links, SPA route changes |
| `@live-region-controller` | Dynamic content announcements, toasts, loading states |
| `@forms-specialist` | Labels, errors, validation, fieldsets, autocomplete, multi-step wizards |
| `@alt-text-headings` | Alt text, SVGs, icons, heading hierarchy, landmarks, page titles |
| `@tables-data-specialist` | Table markup, scope, caption, sortable columns, ARIA grids |
| `@link-checker` | Ambiguous link text, "click here" detection, missing new-tab warnings |
| `@cognitive-accessibility` | WCAG 2.2 cognitive SC, COGA guidance, plain language, auth UX |
| `@mobile-accessibility` | React Native, Expo, iOS, Android touch targets and screen readers |
| `@design-system-auditor` | Color token contrast, focus ring tokens, Tailwind/MUI/Chakra/shadcn |

**Documentation accessibility** (engage for `.md`, `.pdf`, `.docx`, `.xlsx`, `.pptx` changes):

| Agent | Role |
|-------|------|
| `@markdown-a11y-assistant` | Markdown audit — links, alt text, headings, tables, emoji, anchors |
| `@word-accessibility` | Microsoft Word (DOCX) document accessibility scanning |
| `@excel-accessibility` | Microsoft Excel (XLSX) spreadsheet accessibility scanning |
| `@powerpoint-accessibility` | Microsoft PowerPoint (PPTX) presentation accessibility scanning |
| `@pdf-accessibility` | PDF conformance per PDF/UA and the Matterhorn Protocol |

**GitHub workflow agents** (always active):

| Agent | Role |
|-------|------|
| `@pr-review` | PR diff analysis with accessibility confidence scoring |
| `@issue-tracker` | Accessibility issue triage — priority scoring, duplicate detection |

### Accessibility Requirements Checklist

When creating or modifying any UI, documentation, or user-facing content:

- [ ] WCAG 2.2 AA conformance verified by `@accessibility-lead`
- [ ] All interactive elements are keyboard-navigable
- [ ] Color contrast ratios meet AA minimums (4.5:1 text, 3:1 UI components)
- [ ] ARIA roles/states used correctly (first rule of ARIA: don't use ARIA if native HTML suffices)
- [ ] Focus management correct for dialogs, modals, and dynamic content
- [ ] All images have meaningful alt text (or `alt=""` for decorative)
- [ ] Forms have associated labels and clear error messages
- [ ] Markdown documentation passes `@markdown-a11y-assistant` review

### Installation

Install the accessibility agent team locally:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Community-Access/accessibility-agents/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Community-Access/accessibility-agents/main/install.ps1 | iex
```

### Enforcement

The `ghaw-accessibility-review` workflow automatically posts an accessibility checklist comment on every PR that touches UI files. The `@accessibility-lead` agent must sign off before merging any UI change in staging or production environments.

---

## Security & Quality Scanning

This repository includes automated CodeQL security analysis enabled by default across all branches and pull requests.

### CodeQL (Shift-Left Security)

**CodeQL workflow**: `.github/workflows/codeql.yml`
**Engagement Level**: T1 (Observer) — analysis only, no changes permitted.

CodeQL runs on every push and pull request with:
- ✅ **Automatic detection** of security vulnerabilities in JavaScript/TypeScript code
- ✅ **Shift-left scanning** — catch issues before they reach main or staging
- ✅ **Community fork safety** — when you clone this repo, CodeQL comes with it
- ✅ **Weekly scheduled scans** (Monday 2 AM UTC) for continuous oversight
- ✅ **Query suite**: `security-and-quality` (covers OWASP Top 10, CWE, and code quality)

When CodeQL finds issues:
1. Alerts appear in the **Security** tab of the repository
2. PRs will show CodeQL checks in the status (may block merge if severe)
3. Review findings and either:
   - Fix the issue in your branch
   - Suppress the alert with a comment (if false positive): `// lgtm [js/sql-injection]`

**For contributors**: If you fork this repo, CodeQL will automatically run in your fork as well, helping you maintain security standards from day one.

---

## PlatformOps Cross-Organization Sync

> **Planning item** — AgentCraftworks operates multiple GitHub organizations. The following policy ensures accessibility (and all other engineering standards) remain in sync across orgs.

### Sync Strategy

The `sync-org-standards` workflow in each product repo detects drift in the `<!-- ORG-STANDARD:BEGIN/END -->` sections of `AGENTS.md` and `.github/copilot/instructions.md` by comparing SHA-256 hashes against the source of truth in the **`AgentCraftworks/.github` repo** (the shared org standards repository).

**Standards flow:**

```
AgentCraftworks-PlatformOps      ← Org-wide engineering standards (CI/CD, infra, process)
    ↓
AgentCraftworks (paid product)   ← Source of truth for product-specific agent standards
    ↓                               (engagement levels, handoff FSM, action tiers, etc.)
AgentCraftworks-CE (this repo)   ← Consumes standards via ORG-STANDARD sync
AgentCraftworks-VSCode            ← Consumes standards via ORG-STANDARD sync
AgentCraftworks_WebSite           ← Consumes standards via ORG-STANDARD sync
```

1. The `AgentCraftworks` repo (paid product) is the **source of truth** for all product-specific agent standards.
2. `AgentCraftworks-PlatformOps` is the central product development hub for org-wide engineering standards.
3. Every downstream product repo (`AgentCraftworks-CE`, `AgentCraftworks-VSCode`) embeds the `ORG-STANDARD` sections and runs `sync-org-standards` weekly.
4. When the source of truth is updated (e.g., adding engagement level changes), all repos detect drift within one week and open a sync issue.

### Requirements

- [ ] `AgentCraftworks-PlatformOps` adds the same `ORG-STANDARD:BEGIN/END` markers to its `AGENTS.md` and `copilot/instructions.md`
- [ ] `AgentCraftworks-PlatformOps` adds an `ops-sync-standards.yml` workflow equivalent to `sync-org-standards.yml` in this repo
- [ ] All future product-specific agent standards are authored first in `AgentCraftworks/AGENTS.md` and propagated via the sync workflows
- [ ] Org-wide engineering standards are authored in `AgentCraftworks-PlatformOps` and propagated to all repos
- [ ] The accessibility agent team (above) is listed in all repos including `AgentCraftworks-PlatformOps` so internal engineering always keeps Accessibility front and center

---

<!-- ORG-STANDARD:BEGIN — Synced from https://github.com/AgentCraftworks/.github/blob/main/AGENTS.md -->
<!-- Do not edit this section manually. It is updated by the sync-org-standards workflow. -->

## Security Requirements for Workflows & Authentication

> **MANDATORY — all agents must follow these rules when creating or modifying GitHub Actions workflows, authentication, or infrastructure code.**

### Authentication Hierarchy (most secure → least)

| Priority | Method | Use Case | Required |
|----------|--------|----------|----------|
| 1 | **OIDC Federated Credentials** | Azure login in GitHub Actions | ✅ Always |
| 2 | **GitHub App Token** (`actions/create-github-app-token@v1`) | T3+ agent workflows that write (branches, commits, PRs) | ✅ For T3+ |
| 3 | **`GITHUB_TOKEN`** (automatic) | T1-T2 agent workflows (read, comment) | ✅ For T1-T2 |

### Prohibited Practices

- ❌ **Never use Personal Access Tokens (PATs)** — use GitHub App Tokens instead
- ❌ **Never store Azure credentials as secrets** — use OIDC federated credentials (`id-token: write`)
- ❌ **Never use `secrets.GITHUB_TOKEN` for T3+ agents** — use `actions/create-github-app-token` instead (commits from `GITHUB_TOKEN` don't trigger downstream workflows)
- ❌ **Never create workflows without a `permissions:` block** — always declare least-privilege permissions
- ❌ **Never hardcode secrets, tokens, or credentials** in workflow files or source code
- ❌ **Never commit `.env` files** — use `.env.example` templates only

### GitHub App Token Pattern (required for T3+ agents)

```yaml
steps:
  - name: Generate GitHub App Token
    id: app-token
    uses: actions/create-github-app-token@v1
    with:
      app-id: ${{ secrets.GH_APP_ID }}
      private-key: ${{ secrets.GH_APP_PRIVATE_KEY }}

  - name: Checkout with App Token
    uses: actions/checkout@v6
    with:
      token: ${{ steps.app-token.outputs.token }}

  - name: Run agent job
    env:
      GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}
    run: npx tsx src/jobs/your-job.ts
```

### Azure OIDC Pattern (required for all Azure deployments)

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - name: Azure Login (OIDC)
    uses: azure/login@v2
    with:
      client-id: ${{ secrets.AZURE_CLIENT_ID }}
      tenant-id: ${{ secrets.AZURE_TENANT_ID }}
      subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
```

### Workflow Requirements Checklist

When creating or modifying any `.github/workflows/*.yml` file:

- [ ] `permissions:` block is present with least-privilege scopes
- [ ] No PATs — use GitHub App Token or `GITHUB_TOKEN`
- [ ] Azure auth uses OIDC (no `AZURE_CREDENTIALS` secret)
- [ ] Deploy workflows specify `environment:` for protection rules
- [ ] `actions/checkout` uses `@v6` (not older versions)
- [ ] Agent engagement level (T1-T5) is documented in workflow header comment

### Security Guidelines

- **HMAC Verification**: All webhooks must be HMAC-SHA256 verified before processing
- **Managed Identities**: Use managed identity when deployed to Azure (no stored credentials)
- **Correlation IDs**: All logs must include correlation ID for tracing across Azure Monitor
- **Never commit secrets**: Use `.env` file (not in git) or environment-scoped secrets in CI/CD

## Agent Engagement Levels (1-5)

Graduated permission control for AI agents:

| Level | Name | Action Tier | Permitted Actions |
|-------|------|-------------|-------------------|
| 1 | Observer | T1 | Read, view, list |
| 2 | Advisor | T2 | Comment, suggest |
| 3 | Peer Programmer | T3 | Label, assign, approve, edit file |
| 4 | Agent Team | T4 | Merge, close, create branch, push commit |
| 5 | Full Agent Team | T5 | Deploy, modify CI, orchestrate agents |

### Environment Caps

| Environment | Max Level | Max Name |
|------------|-----------|----------|
| local | 5 | Full Agent Team |
| dev | 5 | Full Agent Team |
| staging | 4 | Agent Team |
| production | 3 | Peer Programmer |

## Coding Agent Orchestration (4-Tier)

- **Local**: `@code-reviewer` (fast iteration)
- **Dev**: `@code-reviewer`, `@test-specialist`, `@documentation-expert` + specialists
- **Staging**: Core + `@security-specialist` (blocking), `@compliance-auditor` (blocking), `@performance-optimizer`, `@refactoring-expert`
- **Production**: All agents (blocking); requires approvals from `@release-manager`, `@security-auditor`, `@compliance-auditor`; deployment monitoring by `@production-observer`

### Environment Strategy for CI/CD

- Feature branches → CI only (build + test)
- `staging` branch → Deploy to staging Azure environment
- `main` branch → Deploy to production Azure environment
- Infrastructure provisioning → `deploy-azd.yml` (manual trigger with environment selection)

## Architecture Patterns & Practices

**Before implementing ANY pattern covered by a standard, you MUST read the relevant document in `ArchitecturePatternsPractices/` (if present in the repo).** These are **LOCKED** standards. Do not deviate without creating an Architecture Decision Record (ADR).

### Rules

1. **Read before writing**: Each standard documents anti-patterns. Do NOT repeat them.
2. **Verification checklists**: Each standard has one. Validate your implementation before submitting.
3. **ADR for deviations**: To deviate from a LOCKED standard, create an ADR using the template.
4. **New standards**: Use the `TEMPLATE.md` for new standard proposals.

## GitHub API Rate Limit Management

**The authenticated GitHub API has a 5,000 request/hour limit per user token.**

### Rate limit rules for agents

1. **Check before heavy operations** (>50 API calls):
   ```bash
   gh api rate_limit --jq '.resources.core | "\(.remaining)/\(.limit) remaining, resets \(.reset | todate)"'
   ```
2. **Batch reads via Trees API**: Use `git/trees/{sha}?recursive=1` (1 request) instead of `contents/{path}` per file.
3. **Cache SHAs across operations**: If you read a file's SHA in one step, reuse it.
4. **Pace bulk writes**: For >10 writes, use the Git Data API to create a single commit with multiple file changes.
5. **If you hit 403 rate limit**: Stop immediately. Check `gh api rate_limit` for reset time. Report to the user and pause.

## Best Practices for AI-Assisted Development

### 1. Git Worktrees for Parallel Development

Use git worktrees to run 3-5 parallel agent sessions:
```bash
git worktree add ../MyRepo-security feature/security-hardening
git worktree add ../MyRepo-docs feature/documentation-update
```
**Benefits**: 3-5x productivity, zero context switching, independent environments.

### 2. Plan Mode for Verification

Switch to plan mode when things go sideways: unexpected test failures, build errors, cascading fixes, unclear requirements.

### 3. Subagent Orchestration

Delegate to specialized subagents to keep context clean.

### 4. Voice Dictation

Speak prompts (3x faster than typing): macOS Fn×2, Windows Win+H.

### 5. Self-Learning Rules

After every correction, update agent instruction files so agents don't repeat mistakes.

## Coding Conventions

- **Runtime**: Node.js 22+ with ES Modules
- **Build**: esbuild for compilation, `tsc --noEmit` for type checking
- **Testing**: `node --import tsx --test test/**/*.test.ts`
- **Types**: Use `unknown` over `any`, strict null checks enabled
- **Logging**: Structured `{ msg, key: value }` pattern
- **Env vars**: `GH_*` prefix (NOT `GITHUB_*` which is reserved by GitHub Actions)
- **GitHub API**: Use `octokit.request()`, NOT `.rest.*` methods
- **Error Handling**: Graceful try/catch; structured error logging with context
- **Comments**: Explain "why", not "what"; use JSDoc for public functions

## Contributing Standards

1. Create feature branch: `feat/*` or `feature/*`
2. Use git worktrees for parallel development (see best practices)
3. Open PR with agent labels for review routing
4. Address feedback from assigned agents
5. Update agent instruction files if you discover new lessons
6. Merge after approval and CI passes
7. Delete feature branch and worktree

## Branching and Promotion Policy (MANDATORY)

Standard promotion flow for this repository:

`feature/*` -> `staging` -> `main`

Rules:

1. Never push directly to `main` or `staging`.
2. Create work branches from `main` using `feature/*`, `feat/*`, `fix/*`, `hotfix/*`, `chore/*`, or `docs/*`.
3. Merge to `staging` first for full integration testing.
4. Promote to `main` only by PR from `staging`.
5. PRs into `main` from non-`staging` branches are disallowed.

Bootstrap assets for this policy:

- A script to initialize and enforce the branch policy for new repositories
- A PR guard workflow that blocks merges violating the branch policy
- A new-repo template or checklist documenting how to apply this policy to fresh projects

## Documentation Standards — Futures vs Implemented

**All strategy evaluations, forward-looking plans, roadmaps, and proposals MUST be:**

1. **Labeled** with status `DRAFT` in their front matter
2. **Placed** in `docs/futures/` (not in `docs/` root)
3. **Never mixed** with documentation for shipped/implemented features

### Rules

- `docs/` contains documentation for features that are **implemented and shipping**
- `docs/futures/` contains plans and proposals that are **under evaluation or not yet started**
- Every `docs/futures/` folder MUST have a `README.md` explaining its purpose and listing document statuses
- When a future plan is approved and implementation begins, graduate relevant docs from `docs/futures/` to `docs/` and update status
- Agents performing implementation or bug-fixing work should **ignore** `docs/futures/` — those documents describe things that do not exist yet

### Status values for futures documents

| Status | Meaning |
|---|---|
| `DRAFT` | Initial proposal, still being shaped |
| `UNDER EVALUATION` | Being actively assessed for feasibility and value |
| `APPROVED` | Accepted into the roadmap — implementation not yet started |
| `SUPERSEDED` | Replaced by a newer document (retained for historical context) |

_Legacy label mapping:_ If you encounter the combined label `DRAFT — FUTURE / UNDER EVALUATION` in older docs, treat it as the canonical status **`UNDER EVALUATION`**.
## Always Ask First

Before making significant changes:
- "Should I create a Git branch for this work?"
- "Should I use a git worktree for parallel development?"
- "Do we need security-specialist review for this change?"
- "Which environment (dev/staging/prod) does this target?"
- "Should I update deployment or status documentation?"
- "Should I update agent instruction files with this lesson?"

<!-- ORG-STANDARD:END -->
