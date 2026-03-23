# Contributing to AgentCraftworks Community Edition

Thank you for contributing! AgentCraftworks Community Edition is an MIT-licensed open platform for agentic DevOps.

## Contributor License Agreement

**Before your first PR can be merged, you must sign the CLA.**

When you open a pull request, the CLA Assistant bot will automatically check if you have signed. If not, it will post instructions. To sign, add a comment to your PR:

> I have read the CLA Document and I hereby sign the CLA.

Read the full [CLA here](.github/CLA.md). You only sign once.

Why a CLA? It lets us dual-license community contributions into AgentCraftworks Enterprise while keeping CE MIT-licensed — the same model used by HashiCorp, GitLab, and MongoDB.

## Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes (see development setup below)
4. Run tests: `npm test`
5. Open a pull request against `main`

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