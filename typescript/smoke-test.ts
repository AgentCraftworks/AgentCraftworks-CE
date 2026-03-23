#!/usr/bin/env tsx

/**
 * Smoke Test Suite for AgentCraftworks TypeScript Service
 * 
 * Tests:
 * - /health endpoint availability
 * - Handoff creation via API
 * 
 * Note: MCP is implemented as a stdio server, not HTTP endpoint
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✓ ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMsg, duration: Date.now() - start });
    console.log(`✗ ${name} (${Date.now() - start}ms)\n  Error: ${errorMsg}`);
  }
}

async function testHealthEndpoint(): Promise<void> {
  const response = await fetch(`${BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  const data = await response.json();
  if (data.status !== "ok") {
    throw new Error(`Expected status "ok", got "${data.status}"`);
  }
  if (!data.version) {
    throw new Error("Missing version in health response");
  }
}

async function testCreateHandoff(): Promise<void> {
  const handoff = {
    task: "Smoke test handoff",
    from_agent: "test-agent",
    to_agent: "code-reviewer",
    repository: "test-owner/test-repo",
    issue_number: 1,
    context: JSON.stringify({ test: true }),
    sla_hours: 0.5,
  };

  const response = await fetch(`${BASE_URL}/api/handoffs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(handoff),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create handoff: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (!data.handoff_id) {
    throw new Error("Created handoff missing handoff_id");
  }
  if (data.status !== "pending") {
    throw new Error(`Expected status "pending", got "${data.status}"`);
  }
}

async function main(): Promise<void> {
  console.log(`\n🔍 Running smoke tests against ${BASE_URL}\n`);

  await test("Health endpoint responds", testHealthEndpoint);
  await test("Create handoff via API", testCreateHandoff);

  console.log("\n" + "=".repeat(50));
  console.log("\nTest Summary:");
  console.log(`  Total: ${results.length}`);
  console.log(`  Passed: ${results.filter((r) => r.passed).length}`);
  console.log(`  Failed: ${results.filter((r) => !r.passed).length}`);

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.log("\nFailed tests:");
    failed.forEach((r) => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }

  console.log("\n✅ All smoke tests passed!\n");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
