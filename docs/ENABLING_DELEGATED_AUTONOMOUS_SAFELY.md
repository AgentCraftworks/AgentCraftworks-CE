# Enabling Delegated and Autonomous Safely

Levels 4–5 increase the impact an agent can have on shared repository state.
They must not be enabled in production until the full G3 definition of done has
been verified.

> **Current enforcement status:** Levels 4–5 can be configured but are not yet enforced on all job paths.

## Readiness checklist

- [ ] Confirm the repository starts at level 1 and the repository ceiling is 3.
- [ ] Set `GH_CE_ENVIRONMENT` explicitly. If it is unset, the server selects
  `production` and emits a startup warning.
- [ ] Review the environment ceiling. Defaults are local=5, dev=5, staging=4,
  production=3. An operator may set an explicit override such as
  `GH_CE_ENV_MAX_LEVELS=production=5`.
- [ ] Keep the global ceiling (`GH_CE_MAX_LEVEL`, default 5) at or below the
  highest level approved for this deployment.
- [ ] Wait for repository-config support before raising `agents.ceiling`; the
  reviewed `agentcraftworks.config.yml` path is not yet implemented in this stack.
- [ ] Wait for scoped-principal enforcement before relying on `dial:elevate`.
  The current audit actor `operator` is not authenticated attribution.
- [ ] Confirm that protected actions are denied by default. Allowing one requires
  both the operator `GH_CE_ALLOW_PROTECTED_ACTIONS` and repository
  `agents.protected_actions` lists.
- [ ] Set `GH_CE_ACTION_BUDGETS` if the defaults are unsuitable (for example,
  `T4=20/h,T5=5/h`). Defaults are 30 T4 and 5 T5 actions per hour; they are
  process-local and reset on restart.
- [ ] Configure `GH_CE_AUDIT_FILE` only on a host with restricted file access and
  protected backups. The in-memory audit ring and JSONL file are not immutable,
  multi-replica compliance storage.
- [ ] Verify the effective policy in `/health`, then use `/api/dial/check` as a
  preview. A preview does not perform or authorize a later write.
- [ ] Require security review of the levels 4–5 threat model and verify that
  every relevant GH-AW job and webhook write is gated before enabling production
  use.

## Rollback

1. Set `GH_CE_AGENTS_PAUSED=true` and apply the supported configuration
   reload/restart. This forces effective level 1 and permits only T1 reads.
2. Confirm `/health` reports the paused policy before resuming any agent work.
3. Lower repository dials to level 1 and remove any operator environment-ceiling
   override that raised the limit.
4. Revert the reviewed repository ceiling change when repository-config support
   is available; remove both protected-action allow-lists unless a specific
   reviewed exception remains necessary.
5. If token exposure or misuse is suspected, revoke or rotate the affected token
   and preserve the relevant audit output for incident review.
6. Re-enable agents only after the cause is understood, the policy is restored,
   and the affected paths pass their denial tests.

For the tier definitions and current implementation status, see
[Agent Engagement Levels](ENGAGEMENT_LEVELS.md).
