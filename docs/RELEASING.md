# Release procedure

AgentCraftworks Community Edition uses Changesets to prepare reviewed version
changes. GitHub Releases are the distribution channel; the project does not
publish packages to npm.

## Prepare a version on `staging`

1. For a user-visible change, add a Changeset to the pull request with
   `npx changeset`. Select the `@agentcraftworks/core` package and an
   appropriate patch, minor, or major bump.
2. Merge approved feature pull requests into `staging`.
3. The Changesets workflow opens or updates a version PR targeting `staging`.
   Review its package version and generated changelog, then merge it through
   the normal pull-request checks.
4. Open a promotion PR from `staging` to `main`. Review the complete staging
   diff and require the repository's normal approvals and checks before merge.

The Changesets release PR updates the TypeScript workspace version and
changelog; its version command synchronizes the root `package.json` version
used by the build. The release PR workflow's publish step is deliberately a
no-op, so it cannot publish to npm.

## Create a GitHub Release

After the staging-to-main promotion PR is approved and merged:

1. Confirm the root and TypeScript workspace versions match and review the
   generated changelog on `main`.
2. Create and push a signed annotated tag named `v<version>` on the promoted
   `main` commit (for example, `v0.2.0`). Do not tag `staging`.
3. The GitHub Release workflow builds and packs the TypeScript workspace,
   generates an SPDX SBOM, attests the package and SBOM provenance, and
   creates a GitHub Release with those artifacts and generated release notes.

Until the G6 release gate is approved, use `0.x` preview versions. Reserve
`1.0.0` for after G6. This procedure does not alter branch protection or
create a tag or release by itself.
