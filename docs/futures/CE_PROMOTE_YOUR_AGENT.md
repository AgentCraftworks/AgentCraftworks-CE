---
status: DRAFT
---

# Promote Your Agent: Observer to Autonomous

> **Status: DRAFT — dependency-gated.** This sandbox exercise depends on C-8, C-12, and G3. It is a walkthrough proposal, not a verified runtime procedure.

**Levels 4–5 can be configured but are not yet enforced on all job paths.** The final two rungs must remain explicitly labeled as configurable, enforcement in progress until G3 approves the safety wording and the relevant job paths are verified.

## Safety setup

Run this only in a disposable sandbox repository with synthetic issues and files. Never point it at a production repository or use it to merge or deploy. Before testing elevated levels, an operator must configure all three opt-ins: an operator environment ceiling, a CODEOWNERS-reviewed repository configuration, and a token with `dial:elevate`. Protected actions remain denied unless both the repository and operator allow-lists permit the specific action.

Keep the action budget low enough for a short demonstration. Record the repository, effective level, chosen action, and evidence-export result at every step. If a level check, gate decision, or export is missing or unclear, stop rather than advancing.

## Five-rung exercise

Start at Observer and use one synthetic work item throughout. At the baseline rung, set and record the Observer dial; at each later rung, raise only the named bound, perform exactly one sandbox action allowed at the resulting effective level, then export the handoff evidence. The exact configuration and action commands are intentionally omitted until C-8 and C-12 publish stable contracts.

| Rung | Target | Single bound set or raised | One sandbox action | Evidence checkpoint |
|---|---|---|---|---|
| 1 | Observer (1) | Set the repository dial to Observer (1; the default when unset) | Read the synthetic issue | Export the read-only handoff record |
| 2 | Level 2 | Raise only the repository dial to 2 | Add one comment to the synthetic issue | Export and confirm the transition and action |
| 3 | Level 3 | Raise only the repository dial to 3 | Apply one pre-approved label to the synthetic issue | Export and confirm the gate decision |
| 4 | Level 4 | Raise only the repository dial to 4 after the three opt-ins are verified | Open one PR containing a harmless sandbox-only change; do not merge it | Export and confirm the approvals and output reference |
| 5 | Autonomous (5) | Raise only the repository dial to 5 after the three opt-ins are verified | Make one additional allow-listed change on the sandbox PR; do not merge or deploy | Export and confirm the final transition and output reference |

The action examples are provisional: C-8 must confirm their action tiers and protected-action treatment before the walkthrough is runnable. A repository dial increase alone must never be presented as sufficient authorization for a protected action.

## Kill-switch drill

After the final export, set `GH_CE_AGENTS_PAUSED=true` in the sandbox operator environment. Verify that the effective level returns to Observer (level 1), then attempt one non-destructive action that would otherwise require a higher level and confirm it is denied. Export the denial evidence. If the effective level does not return to Observer or the action is not denied, stop and do not continue the promotion exercise.

## Walkthrough script

The following is choreography, not executable shell. Replace each placeholder only after C-8 and C-12 provide verified command and export contracts.

```text
for rung in 1..5:
  verify_sandbox_repository()
  raise_exactly_one_bound_for(rung)
  verify_effective_level_and_policy_gate(rung)
  perform_exactly_one_allowlisted_sandbox_action(rung)
  export_and_review_handoff_evidence(rung)

set GH_CE_AGENTS_PAUSED=true
verify_effective_level_is_1()
verify_higher_level_action_is_denied()
export_and_review_denial_evidence()
```

## Acceptance gate

- C-8 confirms dial, action-tier, denial, and protected-action semantics.
- C-12 confirms the export route, MCP tool, and evidence schema.
- G3 reviews and approves the level 4–5 safety wording and verifies enforcement coverage.
- The final walkthrough uses a disposable sandbox, records evidence at every rung, and proves the kill switch returns the effective level to Observer.

Until all four conditions pass, this document and its fixture remain DRAFT and must not be used as evidence that higher-level actions are safe or enforced.
