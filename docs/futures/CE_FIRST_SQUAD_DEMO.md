---
status: DRAFT
---

# Your First CE Squad

> **Status: DRAFT — dependency-gated.** This demo depends on G-6 and the G-1 squad contract. No executable `.squad` file is included because its accepted schema and skill-routing rules are owned by those workstreams and are not yet available here.

The proposed demo uses two members routed by skill in a disposable repository. One member completes a permitted task; the other attempts a single action that the repository level does not permit and receives a clear denial. The demo must use synthetic work and must not merge, deploy, or modify a production repository.

## Proposed demo flow

1. Start with the repository at a documented low level and record the effective level.
2. Route a documentation task to a documentation-skilled member and a test-investigation task to a testing-skilled member using the G-1/G-6-approved `.squad` contract.
3. Let one member perform an action allowed by the configured repository level.
4. Have the other member attempt one action above that level. The expected result is a denial that names the limiting bound and the human or configuration change needed to permit it.
5. Capture the handoff and denial evidence only after C-12 confirms the export contract.

The exact action, denial code, configuration fields, and evidence command remain open until the owning contracts are available. Do not invent `.squad` syntax or present the proposed flow as a working squad integration.

## Acceptance gate

- G-1 provides the supported squad format and routing behavior.
- G-6 provides the CE two-member sample contract and confirms how the repository-level denial is demonstrated.
- C-8 confirms the denial response and its limiting-bound explanation.
- C-12 confirms evidence export before the demo claims to save or share evidence.
- The final demo includes a validated `.squad` template, two skill-routed members, one permitted action, one denied action, and only synthetic repository content.

Until these dependencies are available, this document is a DRAFT scenario only; it is not a usable squad template or product guarantee.
