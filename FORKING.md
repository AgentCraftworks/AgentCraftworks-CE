# Forking AgentCraftworks Community Edition

This repository includes several GitHub Actions workflows that assume AgentCraftworks organization infrastructure and secrets. When you fork the repo, disable the org-specific workflows below so your CI stays green.

## Workflows to Disable on Fork

You can disable a workflow by deleting its file under `.github/workflows/` in your fork, or by changing its triggers so it only runs via `workflow_dispatch` after you have replaced org-specific settings.

| Workflow | File | Why disable on forks | How to disable |
| --- | --- | --- | --- |
| Org Standards Sync | .github/workflows/sync-org-standards.yml | Fetches embedded instructions from `AgentCraftworks/.github`; forks will hit 404 without the org app token. | Remove the file, or change `on:` to `workflow_dispatch` after pointing it at your own standards repo and app credentials. |
| GH-AW: Secret Rotation Reminder | .github/workflows/ghaw-secret-rotation-reminder.yml | Reads the org’s `.github/security/secret-rotation-policy.json` and opens issues; policy and secrets are org-specific. | Delete the workflow, or make it `workflow_dispatch`-only after replacing the policy file and secrets with your own. |
| Refresh staging branch after promotion | .github/workflows/ghaw-staging-refresh.yml | Force-deletes and recreates the `staging` branch on the upstream remote; forks typically do not mirror this branch policy. | Remove the file to avoid branch deletions in your fork. |
| GH-AW: Changeset | .github/workflows/ghaw-changeset.yml | Requires the AgentCraftworks GitHub App token to write branches and changelog updates. | Delete it, or switch to manual (`workflow_dispatch`) after configuring your own app/token. |
| CLA Assistant | .github/workflows/cla.yml | Points to AgentCraftworks CLA content and stores signatures in `cla-signatures`; not valid for other projects. | Remove it, or update the CLA URL and branch to your own before re-enabling. |

## Fork-safe workflows

These workflows run fine on forks (once you set any required secrets for your environments):

- `.github/workflows/ci.yml` — TypeScript CI using the standard `GITHUB_TOKEN`.
- `.github/workflows/codeql.yml` — CodeQL analysis using GitHub-provided scanning.
- `.github/workflows/deploy-azd.yml` — Azure deployment; safe after you provide your own Azure credentials and environment config.
