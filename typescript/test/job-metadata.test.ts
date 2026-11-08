import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JOB_METADATA } from "../src/jobs/metadata.js";

describe("job metadata", () => {
  it("classifies every current TypeScript job", () => {
    const ids = JOB_METADATA.map((job) => job.id);
    const expectedIds = [
      "changeset",
      "ci-coach",
      "ci-doctor",
      "cli-consistency-checker",
      "code-simplifier",
      "daily-doc-updater",
      "daily-test-improver",
      "grumpy-reviewer",
      "issue-triage",
      "link-checker",
      "plan-command",
      "pr-fix",
      "sub-issue-closer",
      "workflow-health-manager",
    ];

    assert.equal(ids.length, 14);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual([...ids].sort(), expectedIds.sort());
    assert.ok(
      JOB_METADATA.every(
        (job) => job.kind === "deterministic" || job.kind === "model-assisted",
      ),
    );
    assert.ok(JOB_METADATA.every((job) => job.kind === "deterministic"));
  });
});
