# MCP Tools

> **Status:** DRAFT · **Edition:** Community · **Last updated:** 2026-11-07
>
> This reference mirrors the MCP tool definitions in `typescript/src/mcp/server.ts`
> and their input types in `typescript/src/mcp/types.ts`.

The TypeScript MCP server exposes six tools over stdio. These tools create and manage
handoff and context records; they do not dispatch agents or prove that requested work ran.

## `create_handoff`

Creates a handoff record in the `pending` state.

| Input | Required | Description |
|---|---:|---|
| `to_agent` | Yes | Receiving agent name |
| `task` | Yes | Work description |
| `repository` | Yes | Repository name in `owner/repo` form |
| `issue_number` | Yes | Related GitHub issue number |
| `context` | No | Additional background, defaults to an empty string |
| `priority` | No | `low`, `medium`, `high`, or `critical`; defaults to `medium` |
| `sla_hours` | No | Hours until the optional SLA deadline |

Returns the new handoff ID, status, recipient, task, priority, and timestamps.

## `accept_handoff`

Transitions a pending handoff to `active`.

| Input | Required | Description |
|---|---:|---|
| `handoff_id` | Yes | ID returned by `create_handoff` |
| `agent_name` | Yes | Name recorded as accepting the handoff |
| `notes` | No | Optional acknowledgment notes |

The tool changes the handoff record; it does not start an agent process.

## `complete_handoff`

Marks a handoff `completed`. If the handoff is still `pending`, the current service first
transitions it to `active`, then to `completed`.

| Input | Required | Description |
|---|---:|---|
| `handoff_id` | Yes | Handoff to complete |
| `agent_name` | Yes | Name included in the response |
| `outputs` | No | Optional result object |
| `outputs.summary` | No | Summary of completed work |
| `outputs.deliverables` | No | Deliverable references such as PR URLs or paths |
| `outputs.notes` | No | Additional observations |

## `query_workflow_state`

Returns one handoff when `handoff_id` is supplied, otherwise a list matching the optional
filters.

| Input | Required | Description |
|---|---:|---|
| `handoff_id` | No | ID of one handoff to retrieve |
| `status` | No | `pending`, `active`, `completed`, or `failed` |
| `to_agent` | No | Filter by receiving agent |
| `repository` | No | Filter by repository name |

When `handoff_id` is supplied, it takes precedence over the list filters.

## `attach_context`

Attaches structured data to an existing handoff. The service validates the data against the
named context schema.

| Input | Required | Description |
|---|---:|---|
| `handoff_id` | Yes | Handoff to annotate |
| `schema_name` | Yes | Registered context schema name |
| `data` | Yes | Structured object matching that schema |
| `created_by` | Yes | Name recorded as the context author |

Returns the context ID, schema name and version, author, and creation time.

## `get_context`

Retrieves one context by ID or lists contexts matching optional filters.

| Input | Required | Description |
|---|---:|---|
| `context_id` | No | ID of one context to retrieve |
| `handoff_id` | No | Filter by associated handoff |
| `schema_name` | No | Filter by schema name |

When `context_id` is supplied, it takes precedence over the list filters.

## Implementation notes

- The current TypeScript implementation stores handoffs and context in memory. Restarting
  the process loses these records.
- `failed` is a handoff state, but the current MCP tool list has no `fail_handoff` tool.
- See [Handoff Lifecycle](HANDOFF_LIFECYCLE.md) for states, allowed transitions, and failure
  reason prefixes.
