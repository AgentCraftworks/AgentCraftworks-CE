> **Status**: Implemented  
> **Date**: March 2026  
> **Source**: Adapted from [githubnext/agentics](https://github.com/githubnext/agentics)

# GH-AW Workflows

AgentCraftworks uses **GitHub Agentic Workflows (GH-AW)** to automate development tasks. These workflows run as GitHub Actions and integrate with AI to perform intelligent automation.

## Available Workflows

### Tier 1 — High Value (Recommended for All)

| Workflow | Trigger | Description |
|----------|---------|-------------|
| **CI Coach** | `workflow_run` | Analyzes CI failures and suggests fixes as PR comments |
| **CI Doctor** | `workflow_run` | Investigates CI failures and creates detailed diagnostic issues |
| **Link Checker** | `schedule` (daily) | Finds and fixes broken links in documentation |
| **Issue Triage** | `issues` | Auto-labels and triages new issues with analysis notes |
| **Plan Command** | `/plan` comment | Breaks down issues into actionable sub-tasks |

### Tier 2 — For Active Teams

| Workflow | Trigger | Description |
|----------|---------|-------------|
| **Daily Test Improver** | `schedule` (daily) | Identifies test coverage gaps and suggests new tests |
| **Daily Doc Updater** | `schedule` (daily) | Updates documentation based on recent code changes |
| **Sub-Issue Closer** | `schedule` (daily) | Closes parent issues when all sub-issues complete |
| **Grumpy Reviewer** | `/grumpy` comment | On-demand thorough code review with attitude |
| **Code Simplifier** | `schedule` (daily) | Simplifies recently modified code while preserving functionality |

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
- **T3 (Peer Programmer)**: Creates PRs with code/doc changes

## Adding New Workflows

1. Create workflow file in `.github/workflows/ghaw-*.yml`
2. Add entry to `.github/ghaw-config.json`
3. Create job implementation in `typescript/src/jobs/`
4. Update this documentation

## Source

These workflows are adapted from the [githubnext/agentics](https://github.com/githubnext/agentics) repository, which provides a curated collection of reusable GitHub Agentic Workflows.
