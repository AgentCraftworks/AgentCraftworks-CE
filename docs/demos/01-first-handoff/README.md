# Demo 01 — Your first handoff over MCP

> **Status:** Shipped · **Edition:** Community · **Time:** about 2 minutes

Drive the complete handoff lifecycle — `pending → active → completed` — through the
six MCP tools that Community Edition ships, using the same stdio server that
`.mcp.json` points GitHub Copilot and Claude at.

## What you will see

1. The MCP server starts on stdio and reports **exactly six tools**.
2. `create_handoff` returns a UUID handoff in state `pending`.
3. `accept_handoff` moves it to `active`.
4. `attach_context` / `get_context` store and read back a schema-validated
   `code-review` record.
5. `complete_handoff` moves it to `completed` and `query_workflow_state`
   confirms the terminal state.

## Prerequisites

- Node.js 22 or newer (`node --version`)
- Dependencies installed once: `cd typescript && npm install`
- No GitHub App credentials and no running HTTP server are needed — the MCP
  server is a separate stdio process with its own in-memory store.

## Run it

From the repository root:

```bash
# macOS / Linux
./docs/demos/01-first-handoff/run.sh
```

```powershell
# Windows PowerShell
.\docs\demos\01-first-handoff\run.ps1
```

Both wrappers call `node docs/demos/01-first-handoff/first-handoff.mjs`, which
spawns `node --import tsx src/mcp/server.ts` in `typescript/` (the same command as
the `agentcraftworks-ts` entry in [`.mcp.json`](../../../.mcp.json)) and speaks
JSON-RPC over stdio. No MCP client library is required.

## Expected output

See [`expected-output.txt`](expected-output.txt) for a full transcript. UUIDs and
timestamps will differ; everything else should match. The last lines are:

```text
▶ query_workflow_state({"handoff_id":"…"})
{
  "handoff_id": "…",
  "status": "completed",
  …
}

✔ Lifecycle complete: pending → active → completed
```

The script exits `0` on success and `1` if any tool call errors or the server exposes
a different number of tools.

## Use it from an AI client instead

The repo-root [`.mcp.json`](../../../.mcp.json) already registers the server. Open the
repository in VS Code with GitHub Copilot (or point Claude Desktop / Claude Code at the
same file) and ask, for example:

> Create a handoff to `@code-reviewer` for issue 42 in `octo/demo` to review the
> accessibility statement, then accept it and query its state.

The client will call `create_handoff`, `accept_handoff` and `query_workflow_state`
and show you the same JSON as the script.

## What to read next

- [Handoff lifecycle](../../architecture.md#handoff-state-machine) — states,
  `failed:` reason prefixes, why `overdue` is computed rather than stored
- [MCP tool reference](../../architecture.md#mcp-tool-reference)
- [Demo 02 — Engagement levels](../02-engagement-levels/README.md)
