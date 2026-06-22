# New Repo Branch Policy Template

Use this template when initializing a new AgentCraftworks repository.

## Standard Flow

All repositories should follow:

- `feature/*`, `feat/*`, `fix/*`, `hotfix/*`, `chore/*`, or `docs/*` -> `staging`
- `staging` -> `main`

Direct pushes to `staging` and `main` are not allowed.

## Bootstrap Steps

1. Run the bootstrap script:

```powershell
./scripts/bootstrap-branch-policy.ps1
```

2. If `staging` should be aligned to `main` immediately:

```powershell
./scripts/bootstrap-branch-policy.ps1 -SyncIntegrationFromMain
```

3. Verify protections and environments:

```bash
gh api repos/<owner>/<repo>/branches/main/protection
gh api repos/<owner>/<repo>/branches/staging/protection
gh api repos/<owner>/<repo>/environments --jq '.environments[].name'
```

4. Ensure branch policy guard workflow is enabled:

- `.github/workflows/ghaw-branch-policy-guard.yml`

5. Configure required status checks in repository rulesets/branch protection.

## Required Guardrails

- PRs into `main` must come from `staging`.
- PRs into `staging` must come from `feature/*`, `feat/*`, `fix/*`, `hotfix/*`, `chore/*`, or `docs/*`.
- At least 1 PR approval required for both `staging` and `main`.
- Conversation resolution required.
- Force-push and deletion disabled on protected branches.

## Agent Policy Snippet

Add this to `AGENTS.md` when creating a new repo:

```md
## Branching and Promotion Policy (MANDATORY)

1. Never push directly to `main` or `staging`.
2. Create work branches from `main` using `feature/*`, `feat/*`, `fix/*`, `hotfix/*`, `chore/*`, or `docs/*`.
3. Merge work into `staging` first.
4. Promote to production only by PR from `staging` into `main`.
5. PRs into `main` from non-`staging` branches are not allowed.
```
