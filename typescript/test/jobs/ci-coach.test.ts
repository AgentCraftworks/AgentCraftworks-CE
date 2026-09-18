import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FAILURE_PATTERNS,
  detectFailurePatterns,
  buildCoachComment,
  selectRecentCoachComment,
  COACH_COMMENT_MARKER,
  COACH_MAX_COMMENT_AGE_MINUTES,
  main,
  type MinimalComment,
} from "../../src/jobs/ci-coach.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

const MIN = 60 * 1000;

describe("jobs/ci-coach", () => {
  describe("detectFailurePatterns", () => {
    it("detects a TypeScript error", () => {
      const found = detectFailurePatterns("src/x.ts(1,2): error TS2322: Type 'a' is not assignable");
      assert.deepEqual(found.map((f) => f.category), ["Type Error"]);
    });

    it("detects multiple categories in a single log", () => {
      const log = ["FAIL test/a.test.ts", "npm ERR! ERESOLVE unable to resolve", "Cannot find module 'x'"].join("\n");
      const cats = detectFailurePatterns(log).map((f) => f.category);
      assert.ok(cats.includes("Test Failure"));
      assert.ok(cats.includes("Dependency Error"));
      assert.ok(cats.includes("Build Error"));
    });

    it("returns an empty array when nothing matches", () => {
      assert.deepEqual(detectFailurePatterns("all good here"), []);
    });

    it("every pattern has a suggestion", () => {
      for (const fp of FAILURE_PATTERNS) {
        assert.ok(fp.suggestion.length > 10, fp.category);
      }
    });
  });

  describe("buildCoachComment", () => {
    const run = { name: "CI", run_number: 42, html_url: "https://gh/run/42" };

    it("lists detected issues with suggestions", () => {
      const body = buildCoachComment(run, [FAILURE_PATTERNS[0]!], 999);
      assert.match(body, /## 🤖 CI Coach Analysis/);
      assert.match(body, /Workflow \*\*CI\*\* failed on run \[#42\]\(https:\/\/gh\/run\/42\)/);
      assert.match(body, /### Detected Issues/);
      assert.match(body, /- \*\*Type Error\*\*: Run `npm run type-check`/);
      assert.match(body, /<!-- run:999 -->$/);
    });

    it("falls back to a no-pattern message", () => {
      const body = buildCoachComment(run, [], 1);
      assert.match(body, /### No Specific Pattern Detected/);
      assert.match(body, /\[workflow logs\]\(https:\/\/gh\/run\/42\)/);
      assert.doesNotMatch(body, /Detected Issues/);
    });
  });

  describe("selectRecentCoachComment", () => {
    const now = Date.parse("2025-06-01T12:00:00Z");
    const bot = { login: "github-actions[bot]" };
    const comment = (over: Partial<MinimalComment>): MinimalComment => ({
      id: 1,
      body: `## 🤖 ${COACH_COMMENT_MARKER}\n<!-- run:123 -->`,
      created_at: new Date(now - MIN).toISOString(),
      user: bot,
      ...over,
    });

    it("returns null when there are no coach comments", () => {
      assert.equal(selectRecentCoachComment([], now), null);
      assert.equal(
        selectRecentCoachComment([comment({ user: { login: "human" } }), comment({ body: "unrelated" })], now),
        null,
      );
    });

    it("returns the most recent fresh coach comment with its run id", () => {
      const older = comment({ id: 10, created_at: new Date(now - 3 * MIN).toISOString(), body: `${COACH_COMMENT_MARKER} <!-- run:1 -->` });
      const newer = comment({ id: 11, created_at: new Date(now - 1 * MIN).toISOString(), body: `${COACH_COMMENT_MARKER} <!-- run:2 -->` });
      const result = selectRecentCoachComment([older, newer], now);
      assert.deepEqual(result, { id: 11, runId: "2", createdAt: newer.created_at });
    });

    it("ignores comments older than the freshness window", () => {
      const stale = comment({ created_at: new Date(now - (COACH_MAX_COMMENT_AGE_MINUTES + 1) * MIN).toISOString() });
      assert.equal(selectRecentCoachComment([stale], now), null);
    });

    it("returns null runId when the marker lacks a run id", () => {
      const result = selectRecentCoachComment([comment({ body: COACH_COMMENT_MARKER })], now);
      assert.equal(result?.runId, null);
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.equal(logs.length, 1);
      assert.match(logs[0]!, /CI Coach: Missing required environment variables/);
    });
  });
});
