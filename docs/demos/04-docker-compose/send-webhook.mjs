#!/usr/bin/env node
/**
 * Send an HMAC-SHA256-signed GitHub webhook to a running AgentCraftworks CE instance.
 *
 * Usage:
 *   node send-webhook.mjs [event] [url] [label]
 *
 *   event  ping | pull_request   (default: ping)
 *   url    webhook URL           (default: http://localhost:3000/api/webhook)
 *   label  PR label for pull_request payloads (default: documentation; "none" for no label)
 *
 * Reads the signing secret from GH_CE_WEBHOOK_SECRET (must match the server).
 * Exit code 0 when the server accepts the payload, 1 otherwise.
 */
import { createHmac } from "node:crypto";

const event = process.argv[2] ?? "ping";
const url = process.argv[3] ?? "http://localhost:3000/api/webhook";
const label = process.argv[4] ?? "documentation";
const secret = process.env.GH_CE_WEBHOOK_SECRET;

if (!secret) {
  console.error("GH_CE_WEBHOOK_SECRET is not set. It must match the value the server was started with.");
  process.exit(1);
}

const prNumber = 40 + Math.floor(Math.random() * 1000);
const payloads = {
  ping: { zen: "Keep it logically awesome.", hook_id: 1 },
  pull_request: {
    action: "opened",
    number: prNumber,
    pull_request: {
      number: prNumber,
      title: "docs: add accessibility statement",
      draft: false,
      user: { login: "octocat" },
      head: { ref: "feat/a11y-statement", sha: "0123456789abcdef0123456789abcdef01234567" },
      base: { ref: "staging" },
      labels: label === "none" ? [] : [{ name: label }],
    },
    repository: { full_name: "octo/demo", name: "demo", owner: { login: "octo" } },
    installation: { id: 12345 },
  },
};

const payload = payloads[event];
if (!payload) {
  console.error(`Unknown event "${event}". Use one of: ${Object.keys(payloads).join(", ")}`);
  process.exit(1);
}

const body = JSON.stringify(payload);
const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-GitHub-Event": event,
    "X-GitHub-Delivery": `demo-${Date.now()}`,
    "X-Hub-Signature-256": signature,
  },
  body,
});

const text = await res.text();
console.log(`POST ${url}`);
console.log(`X-GitHub-Event: ${event}`);
console.log(`HTTP ${res.status}`);
console.log(text);
process.exit(res.ok ? 0 : 1);
