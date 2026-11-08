#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedTools = [
  "create_handoff",
  "accept_handoff",
  "complete_handoff",
  "query_workflow_state",
  "attach_context",
  "get_context",
];
const documentation = await readFile(
  path.join(root, "docs", "MCP_TOOLS.md"),
  "utf8",
);
const documentedTools = [
  ...documentation.matchAll(/^## `([a-z_]+)`$/gm),
].map((match) => match[1]);
assert.deepEqual(
  documentedTools,
  expectedTools,
  "MCP_TOOLS.md must document the complete runtime tool list in server order",
);

const env = Object.fromEntries(
  Object.entries(process.env).filter((entry) => typeof entry[1] === "string"),
);
env["npm_config_loglevel"] = "silent";

const isWindows = process.platform === "win32";
const transport = new StdioClientTransport({
  command: isWindows ? env["ComSpec"] ?? "cmd.exe" : "npm",
  args: isWindows ? ["/d", "/s", "/c", "npm run mcp"] : ["run", "mcp"],
  cwd: path.join(root, "typescript"),
  env,
});
const client = new Client(
  { name: "agentcraftworks-docs-smoke", version: "1.0.0" },
  { capabilities: {} },
);

await client.connect(transport);
try {
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    expectedTools,
    "npm run mcp must expose the tools documented in MCP_TOOLS.md",
  );
  console.log(`MCP handshake succeeded; verified ${tools.length} documented tools.`);
} finally {
  await client.close();
}
