# GitHub Copilot Instructions — AgentCraftworks Community Edition

> This file is **self-contained** — it includes organization-wide standards so that clones
> and forks of this repo receive the full Copilot instructions without org-level inheritance.

## Project Context

**Project Name**: AgentCraftworks Community Edition (CE)
**Purpose**: Open-source GitHub App for AI agent governance — 5-level engagement model, 4-state handoff FSM, CODEOWNERS routing, MCP tools
**Primary Technologies**: TypeScript (strict), Node.js 22+, Express, esbuild, Azure Container Apps
**Build**: `cd typescript && npm ci && npm run build`
**Test**: `npm -w typescript test`
**Typecheck**: `npm -w typescript run typecheck`

---

## Accessibility-First Development

Accessibility is a **first-class requirement** — equal in priority to Security and Quality. This applies to all UI, documentation, and user-facing content.

> ⚠️ AI tools are not perfect. Always verify with VoiceOver, NVDA, JAWS, and keyboard-only navigation. Automated checks are a starting point, not a substitute for real assistive technology testing.

### When to engage the accessibility agent team

Always engage `@accessibility-lead` before generating or modifying:
- Any UI component (`.jsx`, `.tsx`, `.vue`, `.svelte`, `.html`, `.css`, `.scss`, `.less`)
- Any documentation (`.md`, VPAT, release notes)
- Any design system token or theme change

### Core accessibility requirements (WCAG 2.2 AA)

- **Keyboard navigation**: All interactive elements must be keyboard-accessible (tab, arrow keys, Enter, Escape)
- **Color contrast**: 4.5:1 for text, 3:1 for UI components and focus indicators
- **ARIA**: Only use ARIA when native HTML semantics are insufficient; always set required states/properties
- **Focus management**: Dialogs and modals must trap focus; return focus to trigger on close
- **Forms**: Every input must have an associated `<label>`; errors must be programmatically associated
- **Images**: Meaningful images need descriptive alt text; decorative images use `alt=""`
- **Headings and landmarks**: Use semantic heading hierarchy (h1→h2→h3); include landmark regions

### Accessibility specialists (from Community-Access/accessibility-agents)

| Agent | Invoke when |
|-------|-------------|
| `@accessibility-lead` | Any UI work — orchestrates all other specialists |
| `@aria-specialist` | Custom widgets, roles, states, properties |
| `@contrast-master` | Color tokens, themes, focus indicators |
| `@keyboard-navigator` | Focus order, skip links, SPA routing |
| `@forms-specialist` | Form labels, validation, error messages |
| `@modal-specialist` | Dialogs, drawers, popovers |
| `@markdown-a11y-assistant` | Any `.md` documentation changes |

### Never

- ❌ Never merge UI changes without `@accessibility-lead` sign-off in staging/production
- ❌ Never use color alone to convey information
- ❌ Never set `tabindex > 0` (breaks natural focus order)
- ❌ Never add `aria-label` to elements that already have visible text labels
- ❌ Never use placeholder text as a substitute for `<label>`

---

<!-- ORG-STANDARD:BEGIN — Synced from https://github.com/AgentCraftworks/.github/blob/main/.github/copilot/instructions.md -->
<!-- Do not edit this section manually. It is updated by the sync-org-standards workflow. -->

## Security-First Authentication

When working with GitHub Actions workflows (`.github/workflows/`):

### NEVER use Personal Access Tokens (PATs)
- Replace any `secrets.*_PAT` with GitHub App Tokens
- Use `actions/create-github-app-token@v1` with `GH_APP_ID` and `GH_APP_PRIVATE_KEY`
- This applies to ALL workflows — no exceptions

### NEVER store Azure credentials as secrets
- Always use OIDC federated credentials for Azure authentication
- Use `azure/login@v2` with `client-id`, `tenant-id`, `subscription-id`
- Include `permissions: id-token: write` in any job that authenticates to Azure

### Token selection by agent tier
- **T1-T2 agents** (read/comment only): Use `secrets.GITHUB_TOKEN` with scoped `permissions:` block
- **T3+ agents** (write operations): Use GitHub App Token via `actions/create-github-app-token@v1`

### Every workflow MUST have
- A `permissions:` block with least-privilege scopes
- An engagement level comment in the header (e.g., `# Engagement Level: T2 (Advisor)`)
- `actions/checkout@v6` (not older versions)
- `environment:` on deploy jobs for protection rules

## Coding Agent Orchestration (4-Tier)

- **Local**: `@code-reviewer` (fast iteration)
- **Dev**: `@code-reviewer`, `@test-specialist`, `@documentation-expert` + specialists
- **Staging**: Core + `@security-specialist` (blocking), `@compliance-auditor` (blocking)
- **Production**: All agents (blocking); requires approvals from `@release-manager`, `@security-auditor`

## Environment Strategy
- Feature branches → CI only (build + test)
- `staging` branch → Deploy to staging Azure environment
- `main` branch → Deploy to production Azure environment
- Infrastructure provisioning → `deploy-azd.yml` (manual trigger with environment selection)

## GitHub API Rate Limits
- Check before heavy operations (>50 calls): `gh api rate_limit`
- Use `git/trees/{sha}?recursive=1` for bulk file reads (1 request vs N)
- If you hit 403: Stop immediately, report reset time, pause

## Coding Conventions
- **Env vars**: `GH_*` prefix (NOT `GITHUB_*` — reserved by GitHub Actions)
- **GitHub API**: Use `octokit.request()`, NOT `.rest.*` methods
- **Types**: Use `unknown` over `any`, strict null checks
- **Logging**: Structured `{ msg, key: value }` pattern
- **Error handling**: Graceful try/catch with structured logging

## Best Practices
- Use **git worktrees** for parallel development (3-5x productivity)
- Switch to **plan mode** when encountering unexpected failures
- Delegate to **subagents** for specialized tasks (security, testing, docs)
- Update **agent instruction files** after every correction (self-learning)

## Always Ask First

Before making significant changes:
- "Should I create a Git branch for this work?"
- "Should I use a git worktree for parallel development?"
- "Do we need security-specialist review for this change?"
- "Which environment (dev/staging/prod) does this target?"
- "Should I update agent instruction files with this lesson?"

<!-- ORG-STANDARD:END -->
