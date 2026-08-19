# Accessibility in AgentCraftworks

Accessibility is a **first-class requirement** in AgentCraftworks — equal in priority to Security and Quality. This document describes the accessibility capability built into AgentCraftworks Community Edition and Enterprise, powered by the [Community-Access/accessibility-agents](https://github.com/Community-Access/accessibility-agents) open-source project.

> ⚠️ **AI tools are not perfect.** They miss things, make mistakes, and cannot replace testing with real screen readers and assistive technology. Always verify with VoiceOver, NVDA, JAWS, and keyboard-only navigation. This tooling is a helpful starting point, not a substitute for real accessibility testing.

---

## Why Accessibility Is Required

AI coding tools generate inaccessible code by default. They forget ARIA rules, skip keyboard navigation, ignore contrast ratios, and produce modals that trap screen reader users. Even with instructions in place, accessibility context gets deprioritized or dropped entirely.

AgentCraftworks solves this by treating accessibility as a **non-negotiable engineering standard** — enforced by automated workflows, agent instructions, and a dedicated accessibility agent team that engages on every relevant PR.

---

## The Accessibility Agent Team

AgentCraftworks integrates 31 specialized agents from [Community-Access/accessibility-agents](https://github.com/Community-Access/accessibility-agents) across three teams:

### Web Accessibility Team (16 agents)

These agents enforce WCAG 2.2 AA standards for web code:

| Agent | Role |
|-------|------|
| `@accessibility-lead` | Orchestrator — decides which specialists to invoke and runs the final review |
| `@aria-specialist` | ARIA roles, states, properties, widget patterns; enforces the first rule of ARIA |
| `@modal-specialist` | Dialogs, drawers, popovers — focus trapping, focus return, escape behavior |
| `@contrast-master` | Color contrast ratios, dark mode, focus indicators, color independence |
| `@keyboard-navigator` | Tab order, focus management, skip links, SPA route changes |
| `@live-region-controller` | Dynamic content announcements, toasts, loading states, search results |
| `@forms-specialist` | Labels, errors, validation, fieldsets, autocomplete, multi-step wizards |
| `@alt-text-headings` | Alt text, SVGs, icons, heading hierarchy, landmarks, page titles |
| `@tables-data-specialist` | Table markup, scope, caption, sortable columns, ARIA grids |
| `@link-checker` | Ambiguous link text, "click here" detection, missing new-tab warnings |
| `@accessibility-wizard` | Interactive guided web audit across all eleven accessibility domains |
| `@testing-coach` | Screen reader testing, keyboard testing, automated testing guidance |
| `@wcag-guide` | WCAG 2.2 criteria in plain language, conformance levels |
| `@cognitive-accessibility` | WCAG 2.2 cognitive SC, COGA guidance, plain language, auth UX |
| `@mobile-accessibility` | React Native, Expo, iOS, Android touch targets and screen readers |
| `@design-system-auditor` | Color token contrast, focus ring tokens, Tailwind/MUI/Chakra/shadcn |

**Document accessibility** (Office, PDF, ePub):

| Agent | Role |
|-------|------|
| `@markdown-a11y-assistant` | Markdown audit — links, alt text, headings, tables, emoji, anchors |
| `@word-accessibility` | Microsoft Word (DOCX) document accessibility scanning |
| `@excel-accessibility` | Microsoft Excel (XLSX) spreadsheet accessibility scanning |
| `@powerpoint-accessibility` | Microsoft PowerPoint (PPTX) presentation accessibility scanning |
| `@pdf-accessibility` | PDF conformance per PDF/UA and the Matterhorn Protocol |
| `@epub-accessibility` | ePub document accessibility per EPUB Accessibility 1.1 |

### GitHub Workflow Team (5 agents)

These agents handle GitHub repository management and triage:

| Agent | Role |
|-------|------|
| `@github-hub` | Orchestrator — routes GitHub management tasks |
| `@pr-review` | PR diff analysis with accessibility confidence scoring and inline comments |
| `@issue-tracker` | Issue triage — priority scoring, duplicate detection, project board sync |
| `@daily-briefing` | Morning overview of open accessibility issues, PR queue, CI status |
| `@insiders-a11y-tracker` | Track accessibility changes in VS Code Insiders and custom repos |

### Developer Tools Team (4 agents)

| Agent | Role |
|-------|------|
| `@developer-hub` | Orchestrator — routes developer tasks |
| `@desktop-a11y-specialist` | Platform accessibility APIs (UIA, MSAA, ATK, NSAccessibility) |
| `@desktop-a11y-testing-coach` | Desktop accessibility testing with NVDA, JAWS, Narrator, VoiceOver |
| `@a11y-tool-builder` | Building accessibility scanning tools, rule engines, report generators |

---

## Installation

Install the accessibility agent team in your development environment:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Community-Access/accessibility-agents/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Community-Access/accessibility-agents/main/install.ps1 | iex
```

The installer is **additive and non-destructive** — it never overwrites existing agent files or config. It wraps accessibility content in `<!-- a11y-agent-team: start/end -->` markers and merges it into your existing files.

### Supported platforms

- **Claude Code** — agents with hook-based enforcement that blocks UI file edits until accessibility review is complete
- **GitHub Copilot** (VS Code and CLI) — agents + workspace instructions for accessibility guidance in every conversation
- **Gemini CLI** — skills-based extension with always-on WCAG AA context
- **Claude Desktop** — MCP extension with tools and prompts for accessibility review
- **Codex CLI** — condensed WCAG AA rules loaded via `.codex/AGENTS.md`

---

## WCAG 2.2 AA Requirements

All UI/UX in AgentCraftworks must conform to [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/). Key requirements:

### Perceivable
- All non-text content has a text alternative (`alt`, `aria-label`, or `aria-labelledby`)
- Color is never the sole means of conveying information
- Text contrast ratio ≥ 4.5:1; large text ≥ 3:1
- UI component and focus indicator contrast ≥ 3:1

### Operable
- All functionality available via keyboard
- No keyboard traps (except intentional modal focus management)
- Skip links provided for navigation-heavy pages
- Focus indicators visible and high-contrast
- Drag-and-drop operations have keyboard/pointer alternatives

### Understandable
- Language of page declared (`lang` attribute)
- Labels and instructions for all form inputs
- Error messages identify the field and describe how to fix it
- Auth flows do not rely on cognitive tests without alternatives (WCAG 2.2 new)

### Robust
- Valid, well-formed HTML
- ARIA used correctly — name, role, value provided for all custom widgets
- Status messages programmatically determined without receiving focus

---

## Automated Enforcement

### PR Workflow

The `ghaw-accessibility-review` GitHub Actions workflow runs on every PR that touches UI-related files. It:

1. Posts an accessibility checklist comment on the PR
2. Tags `@accessibility-lead` to review changes
3. Adds the `accessibility-review` label for tracking

### Accessibility Checklist (required before merge)

- [ ] `@accessibility-lead` has reviewed UI changes
- [ ] All interactive elements keyboard-accessible
- [ ] Color contrast meets AA minimums
- [ ] ARIA used correctly (prefer native HTML semantics)
- [ ] Focus management correct for dialogs and modals
- [ ] All images have meaningful alt text
- [ ] Forms have associated labels and clear error messages
- [ ] Markdown documentation passes `@markdown-a11y-assistant`
- [ ] Tested with at least one screen reader (VoiceOver, NVDA, or JAWS)

---

## Integration with Agent Engagement Levels

Accessibility review is required at all agent engagement levels:

| Level | Accessibility Requirement |
|-------|--------------------------|
| T1 (Observer) | Read and flag accessibility issues in existing code |
| T2 (Advisor) | Post accessibility feedback on PRs; suggest fixes |
| T3 (Collaborator) | Apply accessibility fixes; get `@accessibility-lead` sign-off |
| T4 (Delegated) | Enforce accessibility before merge; block non-conforming UI PRs |
| T5 (Autonomous) | Run full accessibility audit in CI; generate VPAT reports |

---

## PlatformOps Sync

To ensure accessibility standards remain in sync across all AgentCraftworks organizations:

1. **Source of truth**: `AgentCraftworks/.github/AGENTS.md` contains the canonical accessibility requirements in its `ORG-STANDARD` section.
2. **Product repos** (`AgentCraftworks-CE`, `AgentCraftworks`, `AgentCraftworks-VSCode`): The `sync-org-standards` workflow detects drift weekly and opens a sync issue.
3. **AgentCraftworks-PlatformOps**: Must add `ORG-STANDARD:BEGIN/END` markers and an `ops-sync-standards` workflow pointing to the same source of truth, ensuring our internal engineering team always keeps Accessibility front and center alongside Security and Quality.

See [AGENTS.md](../AGENTS.md#platformops-cross-organization-sync) for the full cross-org sync policy.

---

## Resources

- [Community-Access/accessibility-agents](https://github.com/Community-Access/accessibility-agents) — the open-source accessibility agent team powering this integration
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — Web Content Accessibility Guidelines
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/) — patterns and examples for accessible widgets
- [axe-core](https://github.com/dequelabs/axe-core) — automated accessibility testing engine used by the agents
- [Getting Started Guide](https://github.com/Community-Access/accessibility-agents/blob/main/docs/getting-started.md) — detailed installation for all platforms
