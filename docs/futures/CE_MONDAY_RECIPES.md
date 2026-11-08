---
status: DRAFT
---

# CE Monday-Morning Recipes

> **Status: DRAFT — dependency-gated.** This proposal depends on C-10. It describes the current checked-in workflow implementations only; it is not a claim that the CE runtime enforces their declared engagement levels.

These recipes are intended as small, reviewable ways to use the current repository automation. Confirm each generated change with a human before merging or acting on it.

## 1. Documentation and accessibility review

Use the Daily Doc Updater to draft a changelog pull request, the Link Checker to check Markdown links and propose fixes, and the Accessibility Review workflow to post its checklist when a pull request changes documentation or UI files.

| Workflow | Declared permissions | Current behavior |
|---|---|---|
| [Daily Doc Updater](../../.github/workflows/ghaw-daily-doc-updater.yml) | `contents: write`, `issues: read`, `pull-requests: write` | Categorizes merged pull requests from titles and labels, then opens a changelog PR. It is currently disabled in `.github/ghaw-config.json`. |
| [Link Checker](../../.github/workflows/ghaw-link-checker.yml) | `contents: write`, `pull-requests: write` | Checks Markdown links and can open a PR with proposed fixes. |
| [Accessibility Review](../../.github/workflows/ghaw-accessibility-review.yml) | `contents: read`, `issues: write`, `pull-requests: write` | Posts a static accessibility checklist comment; it does not inspect a page with assistive technology or change source files. |

- **AI dependency:** None in these checked-in implementations. Changelog categorization uses title/label rules, link checking tests URLs, and the accessibility workflow posts a fixed checklist. The workflow names or GH-AW configuration do not imply an LLM call.
- **Expected cost:** No model-token or model-provider charge. GitHub Actions runner minutes and GitHub API quota are used; actual runner cost depends on the repository's plan and runner configuration.
- **Minimum level:** Workflow headers declare T3 for the two PR-producing workflows and T2 for the checklist. The GH-AW configuration records different tier values for the Daily Doc Updater and Link Checker. These declarations are inconsistent, and no CE dial enforcement for these GitHub Actions was verified; do not treat them as an effective-level guarantee.
- **Undo:** Review and close an unwanted generated PR; the workflows propose changes in PRs rather than committing to the default branch. For an inaccurate checklist comment, reply with the correction. No source change is made by the checklist workflow.

## 2. Failing-test investigation

Use CI Doctor to open a diagnostic issue for a failed TypeScript CI run and CI Coach to post a diagnosis on the associated pull request when one is available.

| Workflow | Declared permissions | Current behavior |
|---|---|---|
| [CI Doctor](../../.github/workflows/ghaw-ci-doctor.yml) | `contents: read`, `actions: read`, `issues: write` | Matches downloaded logs against fixed failure patterns and creates a diagnostic issue with preset remediation suggestions. |
| [CI Coach](../../.github/workflows/ghaw-ci-coach.yml) | `contents: read`, `actions: read`, `checks: read`, `pull-requests: write` | Matches failure logs against fixed patterns and posts a comment on the associated pull request. |

- **AI dependency:** None in the checked-in jobs. Diagnosis is deterministic pattern matching against logs, not model-generated root-cause analysis.
- **Expected cost:** No model-token or model-provider charge. Runner minutes and GitHub Actions/log API usage apply.
- **Minimum level:** Both workflow headers declare T2. The GH-AW configuration labels CI Doctor `tier-1`; that differs from its workflow header. These are declarations, not proof of an effective CE runtime level or a gate on these GitHub Actions.
- **Undo:** Close a redundant or unhelpful CI Doctor issue. For a CI Coach comment, reply with a correction or context; the automation does not modify code or repair the failing run.

## 3. Issue to reviewable plan

On an issue where the actor has repository write permission, comment `/plan` to create a sequence of sub-issues from the issue's plan content. Review the generated sub-issues and their ordering before assigning or starting work.

- **Workflow and permissions:** [Plan Command](../../.github/workflows/ghaw-plan.yml) declares `contents: read`, `issues: write`, and `discussions: read`. Its workflow also checks that the commenter has write, maintain, or admin permission.
- **AI dependency:** None in the checked-in job; the command parses the issue/comment and creates GitHub sub-issues through the API.
- **Expected cost:** No model-token or model-provider charge. Runner minutes and GitHub API usage apply.
- **Minimum level:** The workflow header declares T2, while `.github/ghaw-config.json` records `tier-1`. No effective CE level gate for this GitHub Actions workflow was verified.
- **Undo:** Close generated sub-issues that are not useful and add a correction to the parent issue. The command does not edit repository files.

## Verification boundary

Before treating these recipes as product guarantees, reconcile the workflow-header and GH-AW configuration tier mismatches and verify whether the relevant GitHub Actions are actually gated by the CE runtime. C-10 is pending; this draft does not claim that its policy or budget controls are active on these job paths.
