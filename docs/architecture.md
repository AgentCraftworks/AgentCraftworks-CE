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
        PR[Pull Request]
        PUSH[Push Event]
        ISSUE[Issue Event]
        WF[Workflow Event]
    end

    subgraph CE["AgentCraftworks Community Edition (Open Source)"]
        WH[Webhook Handler<br/>POST /api/webhook]
        AUTH[HMAC Signature Verification]
        FSM[Event FSM<br/>RECEIVED → CLASSIFIED → ROUTED → GOVERNANCE_CHECK → EXECUTING → COMPLETE]
        AD[Agent Engagement Levels<br/>Observer → Full Agent Team]
        COD[CODEOWNERS Router]
        MCP[MCP Server<br/>6 Core Tools]
    end

    subgraph Actions["Agent Actions"]
        L1[Observer (T1): Read, view, list]
        L2[Advisor (T2): Comment, suggest]
        L3[Peer Programmer (T3): Label, assign, approve, edit file]
        L4[Agent Team (T4): Merge, close, create branch, push commit]
        L5[Full Agent Team (T5): Deploy, modify CI, orchestrate agents]
    end

    PR --> WH
    PUSH --> WH
    ISSUE --> WH
    WF --> WH
    WH --> AUTH
    AUTH --> FSM
    FSM --> AD
    AD --> COD
    COD --> L1
    COD --> L2
    COD --> L3
    COD --> L4
    COD --> L5
    L1 --> MCP
    L2 --> MCP
    L3 --> MCP
    L4 --> MCP
    L5 --> MCP
    MCP -->|analyze| GH_API[GitHub API]
    MCP -->|fix| GH_API
    MCP -->|review| GH_API
    MCP -->|comment| GH_API
    MCP -->|rollback| GH_API
    MCP -->|escalate| GH_API
```


## Agent Engagement Levels Reference

| Level | Name | Action Tier | Permitted Actions | Human Required |
|---|---|---|---|---|
| 1 | Observer | T1 | Read, view, list | Always |
| 2 | Advisor | T2 | Comment, suggest | Always |
| 3 | Peer Programmer | T3 | Label, assign, approve, edit file | For merge |
| 4 | Agent Team | T4 | Merge, close, create branch, push commit | Escalation only |
| 5 | Full Agent Team | T5 | Deploy, modify CI, orchestrate agents | Never |

Environment caps: local=5, dev=5, staging=4, production=3