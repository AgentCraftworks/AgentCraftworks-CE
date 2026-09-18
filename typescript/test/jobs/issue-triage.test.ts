import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LABEL_RULES,
  SPAM_INDICATORS,
  calculateSimilarity,
  analyzeIssue,
  findSimilarIssues,
  buildTriageComment,
  SIMILARITY_THRESHOLD,
  MAX_SIMILAR_ISSUES,
  main,
  type TriageResult,
} from "../../src/jobs/issue-triage.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

describe("jobs/issue-triage", () => {
  describe("calculateSimilarity", () => {
    it("is 1 for identical titles (case-insensitive) and 0 for disjoint ones", () => {
      assert.equal(calculateSimilarity("Login fails", "login FAILS"), 1);
      assert.equal(calculateSimilarity("alpha beta", "gamma delta"), 0);
    });

    it("computes Jaccard over word sets", () => {
      // {a,b,c} vs {b,c,d}: intersection 2, union 4
      assert.equal(calculateSimilarity("a b c", "b c d"), 0.5);
    });
  });

  describe("analyzeIssue", () => {
    it("returns needs-triage with zero confidence for neutral content", () => {
      const r = analyzeIssue("Hello there everyone", "Just saying hi to the team.");
      assert.equal(r.category, "needs-triage");
      assert.equal(r.confidence, 0);
      assert.deepEqual(r.suggestedLabels, []);
      assert.equal(r.isSpam, false);
    });

    it("suggests labels and picks the highest-priority category", () => {
      const r = analyzeIssue("Crash with error: stack trace", "There is a vulnerability, CVE-2024-1 exploit");
      assert.ok(r.suggestedLabels.includes("bug"));
      assert.ok(r.suggestedLabels.includes("security"));
      // security has priority 0 (highest)
      assert.equal(r.category, "security");
      assert.ok(r.confidence > 0 && r.confidence <= 100);
    });

    it("caps confidence at 100", () => {
      const r = analyzeIssue(
        "bug error crash broken fails issue problem feature request add improve",
        "error: exception stack trace regression unexpected behavior feature request please add",
      );
      assert.equal(r.confidence, 100);
    });

    it("flags spam when two or more indicators match", () => {
      const r = analyzeIssue("WIN", "Buy crypto now!!! casino prize winner aaaaaaaaaaaaaaaaaaaa");
      assert.equal(r.isSpam, true);
      assert.ok(r.spamReasons.length >= 2);
    });

    it("flags very short content and excessive URLs", () => {
      const short = analyzeIssue("hi", "yo");
      assert.ok(short.spamReasons.includes("Very short content"));
      const urls = analyzeIssue("Links", "http://a http://b http://c");
      assert.ok(urls.spamReasons.includes("Excessive URLs in body"));
    });

    it("rule tables are well-formed", () => {
      for (const rule of LABEL_RULES) {
        assert.ok(rule.keywords.length > 0, rule.label);
        assert.ok(rule.patterns.length > 0, rule.label);
      }
      assert.ok(SPAM_INDICATORS.length >= 5);
    });
  });

  describe("findSimilarIssues", () => {
    const candidates = [
      { number: 1, title: "Login button does nothing" },
      { number: 2, title: "Login button does something" },
      { number: 3, title: "Completely unrelated topic here" },
      { number: 9, title: "Login button does nothing" },
    ];

    it("excludes the issue itself, filters by threshold and sorts descending", () => {
      const result = findSimilarIssues("Login button does nothing", 9, candidates);
      assert.deepEqual(result.map((r) => r.number), [1, 2]);
      assert.equal(result[0]!.similarity, 1);
      for (const r of result) assert.ok(r.similarity > SIMILARITY_THRESHOLD);
    });

    it("limits results to MAX_SIMILAR_ISSUES", () => {
      const many = Array.from({ length: 12 }, (_, i) => ({ number: i + 1, title: "same words here" }));
      assert.equal(findSimilarIssues("same words here", 999, many).length, MAX_SIMILAR_ISSUES);
    });
  });

  describe("buildTriageComment", () => {
    const base: TriageResult = {
      suggestedLabels: ["bug", "security"],
      isSpam: false,
      spamReasons: [],
      similarIssues: [{ number: 4, title: "Old bug", similarity: 0.5 }],
      category: "security",
      confidence: 60,
    };

    it("includes category, labels and similar issues", () => {
      const body = buildTriageComment(base);
      assert.match(body, /### Category: \*\*security\*\*/);
      assert.match(body, /Confidence: 60%/);
      assert.match(body, /`bug`, `security`/);
      assert.match(body, /- #4 — Old bug \(50% similar\)/);
      assert.doesNotMatch(body, /Potential Spam/);
      assert.match(body, /Engagement Level: T2 \(Advisor\)/);
    });

    it("adds a spam section when flagged and omits empty sections", () => {
      const body = buildTriageComment({
        ...base,
        isSpam: true,
        spamReasons: ["r1", "r2"],
        suggestedLabels: [],
        similarIssues: [],
      });
      assert.match(body, /### ⚠️ Potential Spam Detected/);
      assert.match(body, /- r1\n- r2/);
      assert.doesNotMatch(body, /Suggested Labels/);
      assert.doesNotMatch(body, /Similar Issues/);
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.deepEqual(logs, ["Issue Triage: Missing required environment variables. Skipping."]);
    });
  });
});
