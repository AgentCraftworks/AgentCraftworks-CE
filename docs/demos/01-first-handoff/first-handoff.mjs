#!/usr/bin/env node
/**
 * Demo 01 — First handoff over MCP (stdio).
 *
 * Spawns the CE MCP server exactly as `.mcp.json` does, then drives the
 * six-tool lifecycle with plain JSON-RPC over stdio — no client SDK needed:
 *
 *   tools/list → create_handoff → query_workflow_state → accept_handoff
 *             → attach_context → get_context → complete_handoff → query_workflow_state
 *
 * Usage (from the repo root, after `cd typescript && npm install`):
 *   node docs/demos/01-first-handoff/first-handoff.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const tsDir = path.join(repoRoot, "typescript");

// Same command as the "agentcraftworks-ts" entry in .mcp.json
const child = spawn(
  process.execPath,
  ["--import", "tsx", "src/mcp/server.ts"],
  { cwd: tsDir, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "development" } },
);

child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

let nextId = 1;
const pending = new Map();
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function request(method, params) {
  const id = nextId++;
  const p = new Promise((resolve) => pending.set(id, resolve));
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return p;
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

async function callTool(name, args) {
  const res = await request("tools/call", { name, arguments: args });
  const text = res.result?.content?.[0]?.text ?? JSON.stringify(res);
  console.log(`\n▶ ${name}(${JSON.stringify(args)})`);
  console.log(text);
  if (res.result?.isError) throw new Error(text);
  return JSON.parse(text);
}

try {
  const init = await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "ce-demo-01", version: "1.0.0" },
  });
  notify("notifications/initialized", {});
  console.log(`Connected to MCP server "${init.result.serverInfo.name}" v${init.result.serverInfo.version}`);

  const list = await request("tools/list", {});
  const names = list.result.tools.map((t) => t.name);
  console.log(`\nTools exposed (${names.length}): ${names.join(", ")}`);
  if (names.length !== 6) throw new Error(`Expected exactly 6 tools, got ${names.length}`);

  const created = await callTool("create_handoff", {
    to_agent: "@code-reviewer",
    task: "Review PR #42: docs: add accessibility statement",
    context: "First handoff from the CE demo",
    priority: "high",
    repository: "octo/demo",
    issue_number: 42,
    sla_hours: 4,
  });
  const id = created.handoff_id;

  await callTool("query_workflow_state", { handoff_id: id });
  await callTool("accept_handoff", { handoff_id: id, agent_name: "@code-reviewer", notes: "On it." });
  await callTool("attach_context", {
    handoff_id: id,
    schema_name: "code-review",
    created_by: "@code-reviewer",
    data: {
      file: "docs/accessibility.md",
      line_start: 12,
      line_end: 18,
      category: "best-practice",
      suggestion: "Heading order and alt text verified — no changes needed.",
      severity: "info",
    },
  });
  await callTool("get_context", { handoff_id: id });
  const done = await callTool("complete_handoff", {
    handoff_id: id,
    agent_name: "@code-reviewer",
    outputs: { summary: "Approved with no changes requested.", deliverables: ["https://github.com/octo/demo/pull/42#pullrequestreview-1"] },
  });
  const final = await callTool("query_workflow_state", { handoff_id: id });

  console.log(`\n✔ Lifecycle complete: pending → active → ${final.status}`);
  if (done.status !== "completed") throw new Error("Handoff did not reach completed");
  process.exitCode = 0;
} catch (err) {
  console.error(`\n✖ Demo failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  child.kill();
}
