/**
 * Pull Request Handler — Tests
 *
 * Tests the PR webhook event handler logic.
 * Uses node:test and node:assert/strict.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  handlePullRequestEvent,
} from "../src/handlers/pull-request.js";
import {
  initHandoffService,
  clearAllHandoffs,
  getHandoff,
  createHandoff,
} from "../src/services/handoff-service.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makePrPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "opened",
    pull_request: {
      number: 42,
      title: "Add new feature",
      user: { login: "dev-user" },
      head: { ref: "feature/new-thing", sha: "abc123" },
      base: { ref: "main" },
      draft: false,
    },
    repository: {
      full_name: "testorg/testrepo",
      name: "testrepo",
      owner: { login: "testorg" },
    },
    installation: { id: 12345 },
    sender: { login: "dev-user" },
    ...overrides,
  };
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearAllHandoffs();
  initHandoffService({ forceInMemory: true });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("handlePullRequestEvent", () => {
  it("should create a handoff on PR opened", async () => {
    const payload = makePrPayload({ action: "opened" });
    const result = await handlePullRequestEvent(payload as never);

    assert.equal(result.handled, true);
    assert.equal(result.action, "opened");
    assert.ok(result.handoff_id);
    assert.ok(result.message.includes("Handoff created"));

    // Verify handoff was actually created
    const handoff = getHandoff(result.handoff_id!);
    assert.ok(handoff);
    assert.equal(handoff.issue_number, 42);
    assert.equal(handoff.repository_full_name, "testorg/testrepo");
    assert.equal(handoff.to_agent, "@code-reviewer");
    assert.ok(handoff.task.includes("PR #42"));
  });

  it("should abandon handoff on PR closed", async () => {
    // First create a handoff
    createHandoff(
      { task: "Review PR #42", to: "@code-reviewer" },
      { repository_full_name: "testorg/testrepo", issue_number: 42 },
    );

    const payload = makePrPayload({ action: "closed" });
    const result = await handlePullRequestEvent(payload as never);

    assert.equal(result.handled, true);
    assert.ok(result.message.includes("abandoned"));
    assert.ok(result.handoff_id);

    // Verify handoff was abandoned (set to failed)
    const handoff = getHandoff(result.handoff_id!);
    assert.ok(handoff);
    assert.equal(handoff.status, "failed");
  });

  it("should handle PR closed with no active handoff", async () => {
    const payload = makePrPayload({ action: "closed" });
    const result = await handlePullRequestEvent(payload as never);

    assert.equal(result.handled, true);
    assert.ok(result.message.includes("no active handoff"));
  });

  it("should not abandon handoff on PR closed if already in terminal state", async () => {
    // Create and complete a handoff
    const handoff = createHandoff(
      { task: "Review PR #42", to: "@code-reviewer" },
      { repository_full_name: "testorg/testrepo", issue_number: 42 },
    );
    
    // Import completeHandoff to transition to completed state
    const { completeHandoff } = await import("../src/services/handoff-service.js");
    const completed = completeHandoff(handoff.handoff_id);
    assert.ok(completed, "completeHandoff should succeed");
    assert.equal(completed.status, "completed", "Handoff should be in completed state");

    const payload = makePrPayload({ action: "closed" });
    const result = await handlePullRequestEvent(payload as never);

    assert.equal(result.handled, true);
    assert.ok(result.message.includes("already in terminal state"));
    assert.equal(result.handoff_id, handoff.handoff_id);

    // Verify handoff is still completed (not failed)
    const updatedHandoff = getHandoff(handoff.handoff_id);
    assert.ok(updatedHandoff);
    assert.equal(updatedHandoff.status, "completed");
  });

  it("should track existing handoff on synchronize", async () => {
    // Create a pre-existing handoff
    const existing = createHandoff(
      { task: "Review PR #42", to: "@code-reviewer" },
      { repository_full_name: "testorg/testrepo", issue_number: 42 },
    );

    const payload = makePrPayload({ action: "synchronize" });
    const result = await handlePullRequestEvent(payload as never);

    assert.equal(result.handled, true);
    assert.equal(result.handoff_id, existing.handoff_id);
    assert.ok(result.message.includes("existing handoff"));
  });

  it("should create new handoff on synchronize with no existing", async () => {
    const payload = makePrPayload({ action: "synchronize" });
    const result = await handlePullRequestEvent(payload as never);

    assert.equal(result.handled, true);
    assert.ok(result.handoff_id);
    assert.ok(result.message.includes("Handoff created"));
  });

  it("should ignore unsupported PR actions", async () => {
    const payload = makePrPayload({ action: "labeled" });
    const result = await handlePullRequestEvent(payload as never);

    assert.equal(result.handled, false);
    assert.ok(result.message.includes("Ignored"));
  });

  it("should skip draft PRs", async () => {
    const payload = makePrPayload({
      action: "opened",
      pull_request: {
        number: 42,
        title: "WIP",
        user: { login: "dev-user" },
        head: { ref: "feature/wip", sha: "abc123" },
        base: { ref: "main" },
        draft: true,
      },
    });
    const result = await handlePullRequestEvent(payload as never);

    assert.equal(result.handled, false);
    assert.ok(result.message.includes("Draft"));
  });

  it("should handle ready_for_review on a draft PR", async () => {
    const payload = makePrPayload({
      action: "ready_for_review",
      pull_request: {
        number: 42,
        title: "Feature ready",
        user: { login: "dev-user" },
        head: { ref: "feature/ready", sha: "abc123" },
        base: { ref: "main" },
        draft: false,
      },
    });
    const result = await handlePullRequestEvent(payload as never);

    assert.equal(result.handled, true);
    assert.ok(result.handoff_id);
  });

  it("should handle reopened PRs", async () => {
    const payload = makePrPayload({ action: "reopened" });
    const result = await handlePullRequestEvent(payload as never);

    assert.equal(result.handled, true);
    assert.ok(result.handoff_id);
  });

  it("should set context with author and branch info", async () => {
    const payload = makePrPayload({ action: "opened" });
    const result = await handlePullRequestEvent(payload as never);

    assert.ok(result.handoff_id);
    const handoff = getHandoff(result.handoff_id!);
    assert.ok(handoff);
    assert.ok(handoff.context.includes("dev-user"));
    assert.ok(handoff.context.includes("main"));
  });

  it("should store installation ID in metadata", async () => {
    const payload = makePrPayload({ action: "opened" });
    const result = await handlePullRequestEvent(payload as never);

    assert.ok(result.handoff_id);
    const handoff = getHandoff(result.handoff_id!);
    assert.ok(handoff);
    assert.equal(
      (handoff.metadata as Record<string, unknown>)["installationId"],
      12345,
    );
  });
});
