---
status: DRAFT
---

# Handoff Evidence Export

> **Status: DRAFT — dependency-gated.** This proposed contract depends on C-12. Neither endpoint nor MCP tool behavior is claimed as shipped or verified by this document.

The export is a portable, human-reviewable record for a pull request or handoff discussion. It is not an Enterprise audit ledger, compliance evidence store, tamper-proof record, or guarantee of durable retention.

## Proposed interfaces

- HTTP: `GET /api/handoffs/:id/export?format=md|json`
- MCP: `export_evidence`

The handler should apply the same handoff authorization as the existing handoff read surface, reject unsupported formats clearly, and never broaden access based only on possession of an identifier. C-12 must confirm the actual route, scopes, participant visibility, and error contract before this proposal becomes implementation documentation.

## Required evidence

Each export should contain:

| Field | Required content |
|---|---|
| Handoff identity | Handoff ID, export timestamp, and draft schema version |
| Participants | Participant identifiers and roles relevant to the handoff |
| Transitions | Ordered state transitions with actor, timestamp, and recorded reason |
| Gate decisions | Action, allow/deny result, limiting bound, and policy reference when known |
| Approvals | Approver, approval scope, and timestamp |
| Output references | Type and stable reference for produced pull requests, issues, or other outputs |

Use the same underlying evidence for Markdown and JSON so that the human-readable export does not omit decisions present in machine-readable output. Redact credentials and unrelated private context.

## Proposed JSON shape

The fixture in [`fixtures/handoff-evidence-export.json`](fixtures/handoff-evidence-export.json) is synthetic and illustrative. `schemaVersion: "draft-1"` is a proposal, not a released schema identifier. C-12 owns the stable schema, HTTP response details, MCP input/output, and authorization contract.

## Acceptance gate

- C-12 confirms the HTTP and MCP contracts, authorization scopes, schema versioning, and failure behavior.
- Tests verify that both formats include participants, transitions, gate decisions, approvals, and output references.
- Tests verify authorization and redaction for unrelated private context.
- The docs do not call the export an Enterprise audit ledger or claim durable compliance evidence.

Until then, keep this contract and fixture DRAFT and do not use them to describe a shipped export feature.
