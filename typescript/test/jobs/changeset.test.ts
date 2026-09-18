import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  determineBump,
  highestBump,
  bumpVersion,
  buildChangelog,
  main,
  type ChangeEntry,
} from "../../src/jobs/changeset.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

const entry = (over: Partial<ChangeEntry> = {}): ChangeEntry => ({
  pr: 1,
  title: "fix: thing",
  author: "octocat",
  bump: "patch",
  labels: [],
  ...over,
});

describe("jobs/changeset", () => {
  describe("determineBump", () => {
    it("returns major for breaking/major labels (case-insensitive)", () => {
      assert.equal(determineBump(["Breaking"], "fix: x"), "major");
      assert.equal(determineBump(["MAJOR"], "chore: x"), "major");
    });

    it("returns minor for enhancement/feature labels or feat titles", () => {
      assert.equal(determineBump(["enhancement"], "chore: x"), "minor");
      assert.equal(determineBump(["feature"], "chore: x"), "minor");
      assert.equal(determineBump([], "feat: add thing"), "minor");
      assert.equal(determineBump([], "feature(scope): add thing"), "minor");
    });

    it("defaults to patch", () => {
      assert.equal(determineBump([], "fix: bug"), "patch");
      assert.equal(determineBump(["bug", "docs"], "docs: update"), "patch");
    });

    it("prefers major over minor when both apply", () => {
      assert.equal(determineBump(["breaking", "feature"], "feat: x"), "major");
    });
  });

  describe("highestBump", () => {
    it("returns patch for an empty list", () => {
      assert.equal(highestBump([]), "patch");
    });

    it("returns the highest bump across entries", () => {
      assert.equal(highestBump([entry(), entry({ bump: "minor" })]), "minor");
      assert.equal(highestBump([entry({ bump: "minor" }), entry({ bump: "major" }), entry()]), "major");
      assert.equal(highestBump([entry(), entry()]), "patch");
    });
  });

  describe("bumpVersion", () => {
    it("bumps each component and resets lower ones", () => {
      assert.equal(bumpVersion("1.2.3", "patch"), "1.2.4");
      assert.equal(bumpVersion("1.2.3", "minor"), "1.3.0");
      assert.equal(bumpVersion("1.2.3", "major"), "2.0.0");
    });

    it("tolerates a leading v", () => {
      assert.equal(bumpVersion("v0.9.9", "minor"), "0.10.0");
    });

    it("treats missing components as zero", () => {
      assert.equal(bumpVersion("2", "patch"), "2.0.1");
      assert.equal(bumpVersion("2.1", "minor"), "2.2.0");
    });
  });

  describe("buildChangelog", () => {
    it("renders a heading and one bullet per entry", () => {
      const md = buildChangelog(
        [entry({ pr: 12, title: "fix: a", author: "alice" }), entry({ pr: 13, title: "feat: b", author: "bob" })],
        "1.1.0",
        "2025-01-02",
      );
      const lines = md.split("\n");
      assert.equal(lines[0], "## 1.1.0 (2025-01-02)");
      assert.equal(lines[1], "");
      assert.equal(lines[2], "- fix: a (#12) @alice");
      assert.equal(lines[3], "- feat: b (#13) @bob");
      assert.equal(lines[4], "");
    });

    it("handles an empty entry list", () => {
      assert.equal(buildChangelog([], "1.0.1", "2025-01-01"), "## 1.0.1 (2025-01-01)\n\n");
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.deepEqual(logs, ["Changeset: Missing required environment variables. Skipping."]);
    });
  });
});
