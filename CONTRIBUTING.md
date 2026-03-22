# Contributing to AgentCraftworks Community Edition

Thank you for contributing! AgentCraftworks Community Edition is an MIT-licensed open platform for agentic DevOps.

## Contributor License Agreement

**Before your first PR can be merged, you must sign the CLA.**

### Why a CLA?

A CLA lets us dual-license community contributions into AgentCraftworks Enterprise while keeping CE MIT-licensed — the same model used by HashiCorp, GitLab, and MongoDB. You only sign once.

### How to sign

1. Open a pull request targeting `staging` (the integration branch for external contributions).
2. The **CLA Assistant** bot automatically checks whether your GitHub account has a signature on file.
3. If you have **not** signed, the bot posts a comment explaining what to do.
4. To sign, post the following **exact text** as a comment on the PR:

   > I have read the CLA Document and I hereby sign the CLA.

5. The bot records your signature in the `cla-signatures` branch and marks the check as passed.
6. You do **not** need to sign again on future PRs — your signature is stored permanently.

Read the full [CLA document here](.github/CLA.md).

### Signing scope and exemptions

- **Bot accounts** (names matching `bot*`), `dependabot[bot]`, `github-actions[bot]`, and the repository maintainer account are exempt from signing.
- **Staging → main promotion PRs** (internal merges) bypass the CLA check — only external contributor PRs are gated.

### Troubleshooting

| Problem | Resolution |
|---------|------------|
| Bot never posted a comment | Ensure the `cla` check is listed under the PR's status checks. If absent, ask a maintainer to re-run it. |
| I signed but the check still fails | Re-trigger the check by pushing an empty commit or asking a maintainer to re-run the workflow. |
| My signature is missing after a rebase | Signatures are stored by GitHub username, not commit SHA — a rebase does not affect your signature. |
| I need to revoke my CLA | Open an issue and a maintainer will remove your entry from the `cla-signatures` branch. |

## Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes (see development setup below)
4. Run tests: `npm test`
5. Open a pull request against `staging`

## Development Setup

```bash
# Node.js 22+ required
cd typescript
npm install
npm run build
npm test
```

## Code Style

- TypeScript strict mode
- Prefer `async/await` over callbacks
- All public APIs must have JSDoc comments
- New features require tests

## What Belongs in CE vs Enterprise

| Community Edition (this repo) | Enterprise |
|---|---|
| Webhook routing + FSM | SRE incident response |
| Agent Engagement Levels (Observer → Full Agent Team) | Self-healing orchestration |
| MCP 6-tool interface | Chronicle AI ledger |
| CODEOWNERS routing | Governance Monitor |
| GitHub App scaffolding | CI autofix engine |

If your contribution adds Enterprise-tier functionality, it may not be accepted into CE — but we may offer to integrate it into Enterprise with attribution.

## Reporting Issues

Use [GitHub Issues](../../issues) with the appropriate label.

## License

By contributing, you agree to the terms of the [Contributor License Agreement](.github/CLA.md). Your contributions will be licensed under the [MIT License](LICENSE).