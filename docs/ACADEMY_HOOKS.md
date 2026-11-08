# Community Edition Academy hooks

> **Status:** DRAFT · **Edition:** Community

The `academy-impact` label marks pull requests that change CE surfaces consumed by
Academy lessons or verifiers. The labeler watches engagement levels and policy, runtime
configuration, repository settings, HTTP and MCP APIs, CLI commands, setup artifacts,
action tiers, and release metadata. The PR template asks contributors to confirm when
their changes affect those contracts.

When a GitHub release is published, the Academy release workflow sends a
`repository_dispatch` event named `ce-release-published` with the CE repository, release
tag, release URL, publication time, and workflow run ID. It does not publish an Academy
lesson or expose Academy repository details in CE documentation.

## Enabling release dispatch

Repository maintainers configure the following in GitHub Actions settings; do not commit
credential values:

| Setting | Type | Purpose |
|---|---|---|
| `GH_CE_ACADEMY_DISPATCH_APP_ID` | Repository secret | Dedicated GitHub App ID used for cross-repository dispatch |
| `GH_CE_ACADEMY_DISPATCH_APP_PRIVATE_KEY` | Repository secret | Private key for that dedicated GitHub App |
| `ACADEMY_REPOSITORY` | Repository variable | Target repository in `owner/repository` form |

Install the dedicated GitHub App on the target Academy repository with **Contents: write**
access. The workflow scopes its installation token to that single repository and
requests only `contents: write`. No personal access token or new secret value is included
in this repository.
