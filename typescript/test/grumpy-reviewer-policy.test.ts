import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectGrumpyReviewEvent } from "../src/jobs/grumpy-reviewer-policy.js";

describe("selectGrumpyReviewEvent", () => {
  it("uses COMMENT when no files were inspected", () => {
    assert.equal(selectGrumpyReviewEvent(0, 0, 0), "COMMENT");
  });

  it("approves only after inspecting at least one file with no findings", () => {
    assert.equal(selectGrumpyReviewEvent(1, 0, 0), "APPROVE");
  });

  it("requests changes when an inspected file has errors", () => {
    assert.equal(selectGrumpyReviewEvent(1, 1, 1), "REQUEST_CHANGES");
  });
});
