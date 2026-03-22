---
status: DRAFT
created: 2026-03-18
author: AI Agent
---

# Playwright CLI Integration for AgentCraftworks-CE (Community Edition)

> **Status: DRAFT** — This proposal is under evaluation. Nothing described here is implemented.

## Overview

This proposal defines how AgentCraftworks-CE (the open-source community edition) integrates [Microsoft Playwright CLI](https://github.com/microsoft/playwright-cli) to enable browser automation capabilities for Agent Teams. This provides OSS-friendly defaults suitable for individual developers and small teams.

## Why Playwright CLI for Community Edition?

### Community Benefits

| Benefit | Description |
|---------|-------------|
| **Zero Cost** | Playwright is fully open source (Apache 2.0 license) |
| **Token Efficient** | CLI-based approach works well with free-tier LLM context limits |
| **Skill Modularity** | Install only the skills you need |
| **Cross-Platform** | Works on Linux, macOS, Windows |
| **No Lock-In** | Standard Playwright tests; no proprietary formats |

### OSS Developer Use Cases

| Use Case | Description |
|----------|-------------|
| **PR Verification** | Automated testing of web changes in PRs |
| **Local Development** | Agent-assisted browser interaction during dev |
| **Test Generation** | Generate Playwright tests from agent interactions |
| **Screenshot Documentation** | Capture UI states for docs/READMEs |
| **Form Testing** | Validate form submissions and error handling |
| **Accessibility Checks** | Basic a11y verification via snapshots |

## Quick Start

### Installation

```bash
# Install Playwright CLI globally
npm install -g @playwright/cli@latest

# Install Playwright Skills into your repo
playwright-cli install --skills
```

This creates skill definitions that coding agents (Claude Code, GitHub Copilot, Cursor, etc.) can use.

### Basic Usage

```bash
# Open a browser and navigate
playwright-cli open https://your-app.local:3000

# Take a snapshot (agents read this to understand the page)
playwright-cli snapshot

# Interact with elements (refs come from snapshot)
playwright-cli click e5
playwright-cli fill e7 "test@example.com"
playwright-cli press Enter

# Take a screenshot
playwright-cli screenshot --filename=result.png

# Close the browser
playwright-cli close
```

## Playwright Skills

The `playwright-cli install --skills` command installs these skill packages:

| Skill | What It Does |
|-------|--------------|
| **Browser Automation** | Core commands: open, click, fill, type, press, snapshot |
| **Request Mocking** | Intercept network requests for isolated testing |
| **Session Management** | Multiple browser sessions with named identifiers |
| **Storage State** | Save/load cookies and localStorage for auth |
| **Test Generation** | Generate Playwright test code from interactions |
| **Tracing** | Record traces for debugging failed tests |
| **Video Recording** | Capture video of browser sessions |

## AGENTS.md Integration

Add Playwright CLI to your AGENTS.md to enable it for coding agents:

```yaml
---
name: playwright-cli
description: Browser automation for web testing, screenshots, and form interaction.
allowed-tools: Bash(playwright-cli:*)
---

# Browser Automation with playwright-cli

## Quick start

```bash
playwright-cli open https://localhost:3000
playwright-cli snapshot
playwright-cli click e15
playwright-cli screenshot
playwright-cli close
```

Refer to `playwright-cli --help` for all commands.
```

## Agent Team Examples

### Default (Single Developer)

For solo developers, a simple configuration works:

```bash
# Set environment variable for session naming
export PLAYWRIGHT_CLI_SESSION=dev

# Use in your workflow
playwright-cli open https://localhost:3000
playwright-cli snapshot
# ... agent interactions ...
playwright-cli close
```

### CI/CD Integration

For GitHub Actions or other CI:

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright CLI
        run: npm install -g @playwright/cli@latest
      
      - name: Install browsers
        run: npx playwright install --with-deps chromium
      
      - name: Start app
        run: npm run dev &
        
      - name: Run E2E tests via agent
        run: |
          playwright-cli open http://localhost:3000
          playwright-cli snapshot --filename=home.yml
          playwright-cli screenshot --filename=home.png
          playwright-cli close
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: playwright-artifacts
          path: .playwright-cli/
```

## Configuration

### Default Configuration (OSS-Friendly)

Create `.playwright/cli.config.json`:

```json
{
  "browser": {
    "browserName": "chromium",
    "isolated": true
  },
  "outputDir": ".playwright-cli",
  "outputMode": "file",
  "timeouts": {
    "action": 5000,
    "navigation": 30000
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PLAYWRIGHT_CLI_SESSION` | `default` | Session name for browser instance |
| `PLAYWRIGHT_CLI_BROWSER` | `chromium` | Browser engine (chromium, firefox, webkit) |
| `PLAYWRIGHT_CLI_HEADLESS` | `true` | Run without visible browser window |

## Common Workflows

### PR Testing Workflow

When an agent reviews a PR with UI changes:

1. Agent opens the changed component in browser
2. Takes snapshots to understand the current state
3. Interacts with the UI to verify functionality
4. Takes screenshots documenting the behavior
5. Generates test code if tests are missing
6. Closes browser and reports findings

### Test Generation Workflow

```bash
# Open the app
playwright-cli open https://localhost:3000

# Perform the flow you want to test
playwright-cli fill e3 "user@example.com"
playwright-cli fill e5 "password123"
playwright-cli click e7
playwright-cli snapshot

# Agent can generate Playwright test from these interactions
# using the tracing and snapshot data
```

### Debugging Failed Tests

```bash
# Start tracing
playwright-cli tracing-start

# Run the failing flow
playwright-cli open https://localhost:3000
playwright-cli click e5
# ... more commands ...

# Stop tracing and inspect
playwright-cli tracing-stop
# Opens trace viewer with step-by-step replay
```

## Comparison with Paid Edition

| Feature | CE (This Repo) | Paid (AgentCraftworks) |
|---------|----------------|------------------------|
| Core Playwright CLI | ✅ | ✅ |
| Skill Installation | ✅ | ✅ |
| Session Management | Basic | Multi-tenant isolation |
| Tracing | ✅ | ✅ + Audit logging |
| Visual Regression | Manual | Automated diffing |
| Synthetic Monitoring | DIY | Built-in dashboards |
| Enterprise SSO Testing | Manual | Templates included |
| Support | Community | Enterprise SLA |

## Implementation Checklist

- [ ] Add `@playwright/cli` to `package.json` (devDependencies)
- [ ] Run `playwright-cli install --skills`
- [ ] Add Playwright skill definition to AGENTS.md
- [ ] Create `.playwright/cli.config.json` with OSS defaults
- [ ] Add `.playwright-cli/` to `.gitignore` (artifacts)
- [ ] Document usage in `docs/PLAYWRIGHT_GUIDE.md`
- [ ] Add CI workflow example to `.github/workflows/`

## References

- [Playwright CLI Repository](https://github.com/microsoft/playwright-cli)
- [Playwright CLI SKILL.md](https://github.com/microsoft/playwright-cli/blob/main/skills/playwright-cli/SKILL.md)
- [Playwright Documentation](https://playwright.dev/docs/intro)
