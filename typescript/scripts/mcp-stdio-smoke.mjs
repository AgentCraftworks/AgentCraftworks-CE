#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, "package.json"), "utf8"),
);
const [runtime, ...mcpArgs] = packageJson.scripts.mcp.trim().split(/\s+/u);
assert.equal(
  runtime,
  "node",
  "The MCP smoke test expects the npm mcp script to use Node.",
);

function withTimeout(promise, operation) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `Timed out: ${operation}` +
                `${serverStderr ? `\n${serverStderr}` : ""}` +
                `${transportErrors ? `\n${transportErrors}` : ""}`,
            ),
          ),
        15_000,
      );
      timer.unref();
    }),
  ]).finally(() => clearTimeout(timer));
}

function getToolData(result, toolName) {
  assert.notEqual(result.isError, true, `${toolName} returned an MCP error`);
  const text = result.content.find((item) => item.type === "text")?.text;
  assert.ok(text, `${toolName} returned no text result`);
  return JSON.parse(text);
}

// Run npm's declared MCP command directly so npm lifecycle output never enters stdio.
const transport = new StdioClientTransport({
  command: process.execPath,
  args: mcpArgs,
  cwd: packageRoot,
  stderr: "pipe",
});
let serverStderr = "";
let transportErrors = "";
transport.stderr?.on("data", (chunk) => {
  serverStderr += chunk.toString();
});
transport.onerror = (error) => {
  transportErrors += `${error.message}\n`;
};

let serverClosed;
const closed = new Promise((resolve) => {
  serverClosed = resolve;
});
transport.onclose = serverClosed;

const client = new Client(
  { name: "agentcraftworks-ce-stdio-smoke", version: "0.0.0" },
  { capabilities: {} },
);
let connected = false;

try {
  await withTimeout(client.connect(transport), "MCP initialize");
  connected = true;

  const { tools } = await withTimeout(client.listTools(), "tools/list");
  assert.equal(tools.length, 6, `Expected 6 tools, received ${tools.length}`);

  const created = getToolData(
    await withTimeout(
      client.callTool({
        name: "create_handoff",
        arguments: {
          to_agent: "@stdio-smoke",
          task: "Verify the MCP stdio lifecycle",
          repository: "agentcraftworks/smoke-test",
          issue_number: 1,
        },
      }),
      "create_handoff",
    ),
    "create_handoff",
  );
  assert.equal(created.success, true);
  assert.equal(created.status, "pending");
  assert.ok(created.handoff_id);

  const accepted = getToolData(
    await withTimeout(
      client.callTool({
        name: "accept_handoff",
        arguments: {
          handoff_id: created.handoff_id,
          agent_name: "@stdio-smoke",
        },
      }),
      "accept_handoff",
    ),
    "accept_handoff",
  );
  assert.equal(accepted.status, "active");

  const completed = getToolData(
    await withTimeout(
      client.callTool({
        name: "complete_handoff",
        arguments: {
          handoff_id: created.handoff_id,
          agent_name: "@stdio-smoke",
          outputs: { summary: "stdio lifecycle passed" },
        },
      }),
      "complete_handoff",
    ),
    "complete_handoff",
  );
  assert.equal(completed.status, "completed");
} finally {
  if (connected) {
    await withTimeout(client.close(), "client/server shutdown");
  } else {
    await withTimeout(transport.close(), "server shutdown after initialization failure");
  }
  await withTimeout(closed, "MCP server process exit");
}

if (serverStderr.includes("MCP server failed to start:")) {
  throw new Error(serverStderr);
}

console.log("MCP stdio smoke passed: initialize, 6 tools, handoff transitions, clean shutdown.");
