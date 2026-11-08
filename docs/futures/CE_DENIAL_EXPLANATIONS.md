---
status: DRAFT
---

# Community Edition denial explanations

This draft defines the denial explanation for I-2. It depends on C-8 and C-12 and is
not a description of a shipped response format. The companion JSON file is a proposed
fixture for those work items to implement and verify.

## Example: Collaborator attempts a merge

Scenario: a repository is dialed to level 3, its ceiling is 5, the local environment
ceiling and global ceiling are 5, agents are not paused, and the Collaborator agent
requests `merge_pr`. The action catalog classifies `merge_pr` as T5, so the repository
dial is the limiting bound.

The denial should say, in plain language:

> **Denied:** `merge_pr` requires T5, but this repository is dialed to level 3. The
> repository dial is the limiting bound. See the [engagement and runtime policy](../architecture.md#agent-engagement-levels-reference).
> A repository owner can request a dial increase through the instance's dial API using
> an authorized `dial:elevate` token, after CODEOWNERS review. Because `merge_pr` is a
> protected action, the operator and repository must also allow-list it.

The message must distinguish a currently limiting bound from later prerequisites. It
must not imply that changing one setting guarantees that a merge will be permitted.
Production's default environment ceiling is 3 and staging's is 4, so neither environment
can authorize a T5 action under the supplied defaults.

> Levels 4–5 can be configured but are not yet enforced on all job paths.

## Required explanation fields

- The denied action and its required tier.
- The effective level and the limiting bound (repository dial, repository ceiling,
  environment ceiling, global ceiling, or pause switch).
- A policy reference that a contributor can open.
- The human owner and configuration or approval change needed for a future attempt.
- Any independent prerequisites, such as a protected-action allow-list.

Do not expose token values, private repository data, or internal-only policy URLs. If the
limiting bound cannot be determined, say so and direct the user to a maintainer instead
of guessing.

## Verification

Use [the proposed fixture](fixtures/denial-explanation.json) to assert the explanation
identifies the repository dial as the limiting bound and lists both the human and
operator/repository changes. The test must remain draft until C-8 and C-12 define the
stable response contract.
