# AgentCraftworks Architecture

This document describes the full end-to-end architecture of AgentCraftworks — from GitHub events to agentic remediation.

## SDLC Lifecycle Context

Architecture decisions in this repository align to a staged SDLC strategy:

- Greenfield ideation and rapid prototyping
- Validation and staging hardening
- Productized promotion flow and governance
- Production operations and incident response

See `docs/SDLC_LIFECYCLE_STRATEGY.md` for the lifecycle model and when to activate stricter repo policy and infrastructure controls.

## Community Edition Architecture

```mermaid
graph TD
    subgraph GitHub["GitHub"]
        prEvent["Pull Request"]
        pushEvent["Push Event"]
        issueEvent["Issue Event"]
        workflowEvent["Workflow Event"]
    end

    subgraph CE["AgentCraftworks Community Edition (Open Source)"]
        webhookHandler["Webhook Handler<br/>POST /api/webhook"]
        signatureVerify["HMAC Signature Verification"]
        eventFsm["Handoff FSM<br/>pending → active → completed | failed"]
        engagementLevels["Agent Engagement Levels<br/>Observer → Autonomous"]
        codeownersRouter["CODEOWNERS Router"]
        mcpServer["MCP Server<br/>6 Core Tools"]
    end

    subgraph Actions["Agent Actions"]
        level1["Observer (T1): Read, view, list"]
        level2["Advisor (T2): Comment, suggest"]
        level3["Collaborator (T3): Label, assign, approve, edit file"]
        level4["Delegated (T4): Merge, close, create branch, push commit"]
        level5["Autonomous (T5): Deploy, modify CI, orchestrate agents"]
    end

    prEvent --> webhookHandler
    pushEvent --> webhookHandler
    issueEvent --> webhookHandler
    workflowEvent --> webhookHandler
    webhookHandler --> signatureVerify
    signatureVerify --> eventFsm
    eventFsm --> engagementLevels
    engagementLevels --> codeownersRouter
    codeownersRouter --> level1
    codeownersRouter --> level2
    codeownersRouter --> level3
    codeownersRouter --> level4
    codeownersRouter --> level5
    level1 --> mcpServer
    level2 --> mcpServer
    level3 --> mcpServer
    level4 --> mcpServer
    level5 --> mcpServer
    mcpServer -->|create_handoff| ghApi["GitHub API"]
    mcpServer -->|accept_handoff| ghApi
    mcpServer -->|complete_handoff| ghApi
    mcpServer -->|query_workflow_state| ghApi
    mcpServer -->|attach_context| ghApi
    mcpServer -->|get_context| ghApi
```

## Handoff State Machine

Every agent handoff is a transition in a 4-state machine with two terminal states:

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> active: accept_handoff
    pending --> failed: rejected / abandoned / timeout
    active --> completed: complete_handoff
    active --> failed: error / abandoned / timeout
    completed --> [*]
    failed --> [*]
```

- Handoff IDs are UUIDs.
- `failed` always carries a reason prefix: `rejected:`, `abandoned:`, `error:` or `timeout:`.
- `overdue` is a **computed property**, not a stored state.

## MCP Tool Reference

| Tool | Description |
|---|---|
| `create_handoff` | Create a new agent handoff |
| `accept_handoff` | Accept a pending handoff |
| `complete_handoff` | Mark a handoff as completed |
| `query_workflow_state` | Query handoff state and history |
| `attach_context` | Attach structured context to a handoff |
| `get_context` | Retrieve context for a handoff |

## Agent Engagement Levels Reference

| Level | Name | Action Tier | Permitted Actions | Human Required |
|---|---|---|---|---|
| 1 | Observer | T1 | Read, view, list | Always |
| 2 | Advisor | T2 | Comment, suggest | Always |
| 3 | Collaborator | T3 | Label, assign, approve, edit file | For merge |
| 4 | Delegated | T4 | Merge, close, create branch, push commit | Escalation only |
| 5 | Autonomous | T5 | Deploy, modify CI, orchestrate agents | Never |

Environment caps: local=5, dev=5, staging=4, production=3