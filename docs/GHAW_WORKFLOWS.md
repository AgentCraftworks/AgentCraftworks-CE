> **Status**: Implemented  
> **Date**: March 2026  
> **Source**: Adapted from [githubnext/agentics](https://github.com/githubnext/agentics)

# GH-AW Workflows

AgentCraftworks uses **GitHub Agentic Workflows (GH-AW)** to automate development tasks. These workflows run as GitHub Actions and implement the agentic-workflow patterns from [githubnext/agentics](https://github.com/githubnext/agentics) as deterministic scripts.

## How these workflows work

> **No LLM calls.** Every GH-AW job in this repository (`typescript/src/jobs/*.ts`) is a **deterministic, heuristic automation**: it reads GitHub data through the REST API, applies regex/keyword rules and simple scoring, and writes the result back as a comment, label, issue, or PR. None of them call Copilot, OpenAI, Azure OpenAI, or any other model. Their output is reproducible for the same input and costs nothing beyond Actions minutes and API requests.
>
> Names like "CI Coach" or "Grumpy Reviewer" describe the *role* of the automation, not an AI persona. If a job's heuristics do not fit your project, the rule tables at the top of each job file are the place to tune them.

Schedules below are the authoritative crons from `.github/ghaw-config.json`; `node scripts/check-ghaw-config.mjs` (run in CI) fails if a workflow file or this table drifts from that config.

## Available Workflows

### Tier 1 — High Value (Recommended for All)

| Workflow | Trigger | Description |
|----------|---------|-------------|
| **CI Coach** | `workflow_run` | Analyzes CI failures and suggests fixes as PR comments |
| **CI Doctor** | `workflow_run` | Investigates CI failures and creates detailed diagnostic issues |
| **Link Checker** | `schedule` (`0 6 * * 1`, weekly Mon 06:00 UTC) | Finds and fixes broken links in documentation |
| **Issue Triage** | `issues` | Auto-labels and triages new issues with analysis notes |
| **Plan Command** | `/plan` comment | Breaks down issues into actionable sub-tasks |

### Tier 2 — For Active Teams

| Workflow | Trigger | Description |
|----------|---------|-------------|
| **Daily Test Improver** | `schedule` (`0 9 * * 1-5`, weekdays 09:00 UTC) | Identifies test coverage gaps and suggests new tests |
| **Daily Doc Updater** | `schedule` (`0 8 * * 1-5`, weekdays 08:00 UTC) | Updates documentation based on recent code changes |
| **Sub-Issue Closer** | `schedule` (`0 10 * * *`, daily 10:00 UTC) | Closes parent issues when all sub-issues complete |
| **Grumpy Reviewer** | `/grumpy` comment | On-demand thorough code review with attitude |
| **Code Simplifier** | `schedule` (`0 10 * * 3`, weekly Wed 10:00 UTC) | Simplifies recently modified code while preserving functionality |

### Existing Workflows

Additional workflows for branch policy, accessibility, CLI consistency, changeset management, and more. See `.github/ghaw-config.json` for the full list.

## Enable/Disable Workflows

All workflows use the central config file `.github/ghaw-config.json` for enable/disable control.

### Using the Toggle Script

```powershell
# List all workflows and their status
.\scripts\ghaw-toggle.ps1 list

# Show status summary by tier
.\scripts\ghaw-toggle.ps1 status

# Enable a specific workflow
.\scripts\ghaw-toggle.ps1 enable ghaw-ci-doctor

# Disable a specific workflow
.\scripts\ghaw-toggle.ps1 disable ghaw-code-simplifier

# Enable all Tier 1 workflows
.\scripts\ghaw-toggle.ps1 enable tier-1

# Disable all Tier 2 workflows
.\scripts\ghaw-toggle.ps1 disable tier-2

# Enable/disable all workflows
.\scripts\ghaw-toggle.ps1 enable all
.\scripts\ghaw-toggle.ps1 disable all
```

### Manual Configuration

Edit `.github/ghaw-config.json` directly:

```json
{
  "id": "ghaw-ci-doctor",
  "name": "GH-AW: CI Doctor",
  "enabled": false,  // Set to false to disable
  ...
}
```

Changes take effect immediately on the next workflow run — no deployment needed.

## How It Works

Each workflow checks the config file at runtime:

```yaml
- name: Check GH-AW config
  id: ghaw-config
  run: |
    CONFIG=".github/ghaw-config.json"
    WORKFLOW_ID="ghaw-ci-doctor"
    if [ -f "$CONFIG" ]; then
      ENABLED=$(jq -r --arg id "$WORKFLOW_ID" '.workflows[] | select(.id == $id) | .enabled' "$CONFIG")
      if [ "$ENABLED" = "false" ]; then
        echo "::notice::Workflow $WORKFLOW_ID is disabled — skipping."
        echo "skip=true" >> "$GITHUB_OUTPUT"
        exit 0
      fi
    fi
    echo "skip=false" >> "$GITHUB_OUTPUT"
```

## Slash Commands

Some workflows are triggered by slash commands in issue/PR comments:

| Command | Workflow | Who Can Use |
|---------|----------|-------------|
| `/plan` | Plan Command | Maintainers (write access) |
| `/grumpy` | Grumpy Reviewer | Maintainers (write access) |

## Engagement Levels

Workflows operate at different engagement levels per [ENGAGEMENT_LEVELS.md](ENGAGEMENT_LEVELS.md):

- **T2 (Advisor)**: Creates comments, labels, issues — no code changes
- **T3 (Collaborator)**: Creates PRs with code/doc changes

## Adding New Workflows

1. Create workflow file in `.github/workflows/ghaw-*.yml`
2. Add entry to `.github/ghaw-config.json`
3. Create job implementation in `typescript/src/jobs/`
4. Update this documentation

## Source

These workflows are adapted from the [githubnext/agentics](https://github.com/githubnext/agentics) repository, which provides a curated collection of reusable GitHub Agentic Workflows.
