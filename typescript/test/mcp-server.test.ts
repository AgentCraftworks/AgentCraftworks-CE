/**
 * MCP Server — Comprehensive Tests
 *
 * Tests the 4 MCP tool handlers directly (without stdio transport).
 * Uses node:test (describe, it, beforeEach) and node:assert/strict.
 *
 * Tests cover:
 *   - create_handoff: creation, validation, defaults, SLA
 *   - accept_handoff: accept, not found, already completed
 *   - complete_handoff: complete, outputs, not found, already completed
 *   - query_workflow_state: single, list, filters, empty results
 *   - Error handling and edge cases
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  handleCreateHandoff,
  handleAcceptHandoff,
  handleCompleteHandoff,
  handleQueryWorkflowState,
} from "../src/mcp/server.js";
import {
  initHandoffService,
  createHandoff,
  clearAllHandoffs,
  acceptHandoff,
  completeHandoff,
} from "../src/services/handoff-service.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseResult(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const textContent = result.content[0];
  assert.ok(textContent, "Expected at least one content item");
  assert.equal(textContent.type, "text");
  assert.ok(typeof textContent.text === "string", "Expected text content");
  return JSON.parse(textContent.text);
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearAllHandoffs();
  initHandoffService({ forceInMemory: true });
});

// ─── create_handoff ────────────────────────────────────────────────────────────

describe("MCP create_handoff", () => {
  it("should create a handoff with required fields", () => {
    const result = handleCreateHandoff({
      to_agent: "@code-reviewer",
      task: "Review PR #42",
      repository: "org/repo",
      issue_number: 42,
    });

    assert.equal(result.isError, undefined);
    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["success"], true);
    assert.ok(data["handoff_id"]);
    assert.equal(data["status"], "pending");
    assert.equal(data["to_agent"], "@code-reviewer");
    assert.equal(data["task"], "Review PR #42");
    assert.equal(data["priority"], "medium");
    assert.ok(data["created_at"]);
  });

  it("should create a handoff with all optional fields", () => {
    const result = handleCreateHandoff({
      to_agent: "@security-specialist",
      task: "Security audit",
      context: "Check for SQL injection",
      priority: "critical",
      repository: "org/repo",
      issue_number: 99,
      sla_hours: 4,
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["success"], true);
    assert.equal(data["priority"], "critical");
    assert.ok(data["sla_deadline"]);
    assert.equal(data["to_agent"], "@security-specialist");
  });

  it("should set SLA deadline when sla_hours is provided", () => {
    const before = Date.now();
    const result = handleCreateHandoff({
      to_agent: "@bot",
      task: "test",
      repository: "o/r",
      issue_number: 1,
      sla_hours: 2,
    });

    const data = parseResult(result) as Record<string, unknown>;
    const deadline = new Date(data["sla_deadline"] as string).getTime();
    // Deadline should be approximately 2 hours from now
    assert.ok(deadline >= before + 2 * 3_600_000 - 2000);
    assert.ok(deadline <= Date.now() + 2 * 3_600_000 + 2000);
  });

  it("should default priority to medium", () => {
    const result = handleCreateHandoff({
      to_agent: "@bot",
      task: "test",
      repository: "o/r",
      issue_number: 1,
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["priority"], "medium");
  });

  it("should not set sla_deadline when sla_hours is not provided", () => {
    const result = handleCreateHandoff({
      to_agent: "@bot",
      task: "test",
      repository: "o/r",
      issue_number: 1,
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["sla_deadline"], null);
  });

  it("should generate unique handoff IDs for multiple creations", () => {
    const r1 = handleCreateHandoff({
      to_agent: "@a",
      task: "task1",
      repository: "o/r",
      issue_number: 1,
    });
    const r2 = handleCreateHandoff({
      to_agent: "@b",
      task: "task2",
      repository: "o/r",
      issue_number: 2,
    });

    const d1 = parseResult(r1) as Record<string, unknown>;
    const d2 = parseResult(r2) as Record<string, unknown>;
    assert.notEqual(d1["handoff_id"], d2["handoff_id"]);
  });

  it("should accept low priority", () => {
    const result = handleCreateHandoff({
      to_agent: "@bot",
      task: "low priority task",
      priority: "low",
      repository: "o/r",
      issue_number: 1,
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["priority"], "low");
  });

  it("should accept high priority", () => {
    const result = handleCreateHandoff({
      to_agent: "@bot",
      task: "high priority task",
      priority: "high",
      repository: "o/r",
      issue_number: 1,
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["priority"], "high");
  });
});

// ─── accept_handoff ────────────────────────────────────────────────────────────

describe("MCP accept_handoff", () => {
  it("should accept a handoff", () => {
    const h = createHandoff(
      { task: "review", to: "@reviewer" },
      { repository_full_name: "o/r", issue_number: 1 },
    );

    const result = handleAcceptHandoff({
      handoff_id: h.handoff_id,
      agent_name: "@reviewer",
    });

    assert.equal(result.isError, undefined);
    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["success"], true);
    assert.equal(data["status"], "active");
    assert.equal(data["agent"], "@reviewer");
    assert.ok(data["accepted_at"]);
  });

  it("should accept with notes", () => {
    const h = createHandoff(
      { task: "review", to: "@reviewer" },
      { repository_full_name: "o/r", issue_number: 1 },
    );

    const result = handleAcceptHandoff({
      handoff_id: h.handoff_id,
      agent_name: "@reviewer",
      notes: "Starting review now",
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["notes"], "Starting review now");
  });

  it("should throw for non-existent handoff", () => {
    assert.throws(
      () =>
        handleAcceptHandoff({
          handoff_id: "nonexistent-id",
          agent_name: "@bot",
        }),
      /not found/,
    );
  });

  it("should fail when accepting an already-completed handoff", () => {
    const h = createHandoff(
      { task: "done", to: "@bot" },
      { repository_full_name: "o/r", issue_number: 1 },
    );
    completeHandoff(h.handoff_id);

    assert.throws(
      () =>
        handleAcceptHandoff({
          handoff_id: h.handoff_id,
          agent_name: "@bot",
        }),
      /Invalid state transition|Failed to accept/,
    );
  });
});

// ─── complete_handoff ──────────────────────────────────────────────────────────

describe("MCP complete_handoff", () => {
  it("should complete a handoff without outputs", () => {
    const h = createHandoff(
      { task: "implement", to: "@dev" },
      { repository_full_name: "o/r", issue_number: 1 },
    );

    const result = handleCompleteHandoff({
      handoff_id: h.handoff_id,
      agent_name: "@dev",
    });

    assert.equal(result.isError, undefined);
    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["success"], true);
    assert.equal(data["status"], "completed");
    assert.equal(data["agent"], "@dev");
    assert.ok(data["completed_at"]);
  });

  it("should complete a handoff with outputs", () => {
    const h = createHandoff(
      { task: "implement", to: "@dev" },
      { repository_full_name: "o/r", issue_number: 1 },
    );

    const result = handleCompleteHandoff({
      handoff_id: h.handoff_id,
      agent_name: "@dev",
      outputs: {
        summary: "Implemented feature X",
        deliverables: ["https://github.com/o/r/pull/1"],
        notes: "Added 3 new tests",
      },
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["success"], true);
    const outputs = data["outputs"] as Record<string, unknown>;
    assert.equal(outputs["summary"], "Implemented feature X");
  });

  it("should throw for non-existent handoff", () => {
    assert.throws(
      () =>
        handleCompleteHandoff({
          handoff_id: "nonexistent-id",
          agent_name: "@bot",
        }),
      /not found/,
    );
  });

  it("should fail when completing an already-completed handoff", () => {
    const h = createHandoff(
      { task: "done", to: "@bot" },
      { repository_full_name: "o/r", issue_number: 1 },
    );
    completeHandoff(h.handoff_id);

    assert.throws(
      () =>
        handleCompleteHandoff({
          handoff_id: h.handoff_id,
          agent_name: "@bot",
        }),
      /Invalid state transition|Failed to complete/,
    );
  });

  it("should complete a handoff that was already accepted", () => {
    const h = createHandoff(
      { task: "implement", to: "@dev" },
      { repository_full_name: "o/r", issue_number: 1 },
    );
    acceptHandoff(h.handoff_id, "@dev");

    const result = handleCompleteHandoff({
      handoff_id: h.handoff_id,
      agent_name: "@dev",
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["status"], "completed");
  });
});

// ─── query_workflow_state ──────────────────────────────────────────────────────

describe("MCP query_workflow_state", () => {
  it("should query a specific handoff by ID", () => {
    const h = createHandoff(
      { task: "review", to: "@reviewer", priority: "high" },
      { repository_full_name: "org/repo", issue_number: 42 },
    );

    const result = handleQueryWorkflowState({
      handoff_id: h.handoff_id,
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["handoff_id"], h.handoff_id);
    assert.equal(data["status"], "pending");
    assert.equal(data["to_agent"], "@reviewer");
    assert.equal(data["task"], "review");
    assert.equal(data["priority"], "high");
    assert.equal(data["repository"], "org/repo");
    assert.equal(data["issue_number"], 42);
    assert.ok(data["created_at"]);
    assert.ok(data["updated_at"]);
  });

  it("should throw for non-existent handoff ID", () => {
    assert.throws(
      () =>
        handleQueryWorkflowState({
          handoff_id: "nonexistent-id",
        }),
      /not found/,
    );
  });

  it("should list all handoffs when no filters given", () => {
    createHandoff({ task: "a", to: "@a" });
    createHandoff({ task: "b", to: "@b" });
    createHandoff({ task: "c", to: "@c" });

    const result = handleQueryWorkflowState({});

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["count"], 3);
    assert.ok(Array.isArray(data["handoffs"]));
  });

  it("should filter by status", () => {
    const h = createHandoff({ task: "a", to: "@a" });
    createHandoff({ task: "b", to: "@b" });
    acceptHandoff(h.handoff_id, "@a");

    const result = handleQueryWorkflowState({
      status: "active",
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["count"], 1);
    const handoffs = data["handoffs"] as Array<Record<string, unknown>>;
    assert.equal(handoffs[0]!["status"], "active");
  });

  it("should filter by to_agent", () => {
    createHandoff({ task: "a", to: "@alice" });
    createHandoff({ task: "b", to: "@bob" });

    const result = handleQueryWorkflowState({
      to_agent: "@alice",
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["count"], 1);
    const handoffs = data["handoffs"] as Array<Record<string, unknown>>;
    assert.equal(handoffs[0]!["to_agent"], "@alice");
  });

  it("should filter by repository", () => {
    createHandoff(
      { task: "a", to: "@a" },
      { repository_full_name: "org/repo1" },
    );
    createHandoff(
      { task: "b", to: "@b" },
      { repository_full_name: "org/repo2" },
    );

    const result = handleQueryWorkflowState({
      repository: "org/repo1",
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["count"], 1);
  });

  it("should return empty list when no handoffs match filters", () => {
    createHandoff({ task: "a", to: "@a" });

    const result = handleQueryWorkflowState({
      status: "completed",
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["count"], 0);
    const handoffs = data["handoffs"] as Array<Record<string, unknown>>;
    assert.equal(handoffs.length, 0);
  });

  it("should return filters in response", () => {
    const result = handleQueryWorkflowState({
      status: "pending",
      to_agent: "@bot",
    });

    const data = parseResult(result) as Record<string, unknown>;
    const filters = data["filters"] as Record<string, unknown>;
    assert.equal(filters["status"], "pending");
    assert.equal(filters["to_agent"], "@bot");
  });

  it("should return empty list when no handoffs exist", () => {
    const result = handleQueryWorkflowState({});

    const data = parseResult(result) as Record<string, unknown>;
    assert.equal(data["count"], 0);
  });

  it("should include SLA deadline in single query", () => {
    const h = createHandoff(
      { task: "urgent", to: "@bot" },
      {
        repository_full_name: "o/r",
        issue_number: 1,
        sla_hours: 4,
      },
    );

    const result = handleQueryWorkflowState({
      handoff_id: h.handoff_id,
    });

    const data = parseResult(result) as Record<string, unknown>;
    assert.ok(data["sla_deadline"]);
  });
});
