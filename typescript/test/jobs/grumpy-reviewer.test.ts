import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_SMELLS,
  GRUMPY_INTROS,
  GRUMPY_OUTROS_GOOD,
  GRUMPY_OUTROS_BAD,
  GRUMPY_BAD_THRESHOLD,
  pickRandom,
  isCodeFile,
  severityEmoji,
  analyzeFileForSmells,
  groupByFile,
  determineReviewEvent,
  buildGrumpyReview,
  main,
  type ReviewComment,
} from "../../src/jobs/grumpy-reviewer.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

const comment = (over: Partial<ReviewComment> = {}): ReviewComment => ({
  path: "a.ts",
  line: 1,
  body: "### ⚠️ any type\n\ngrumble\n\n**Suggestion:** fix",
  severity: "warning",
  ...over,
});

describe("jobs/grumpy-reviewer", () => {
  describe("pickRandom", () => {
    it("returns an element of the array", () => {
      for (let i = 0; i < 20; i++) assert.ok(GRUMPY_INTROS.includes(pickRandom(GRUMPY_INTROS)));
      assert.equal(pickRandom(["only"]), "only");
    });
  });

  describe("isCodeFile", () => {
    it("accepts JS/TS extensions and rejects others", () => {
      for (const f of ["a.ts", "b.tsx", "c.js", "d.jsx", "e.mjs", "f.cjs"]) assert.equal(isCodeFile(f), true, f);
      for (const f of ["a.md", "b.json", "c.yml", "d.ts.bak"]) assert.equal(isCodeFile(f), false, f);
    });
  });

  describe("severityEmoji", () => {
    it("maps severities to emoji", () => {
      assert.equal(severityEmoji("error"), "🚨");
      assert.equal(severityEmoji("warning"), "⚠️");
      assert.equal(severityEmoji("info"), "💡");
    });
  });

  describe("analyzeFileForSmells", () => {
    it("returns nothing for clean code", () => {
      assert.deepEqual(analyzeFileForSmells("clean.ts", "const a: number = 1;\nexport { a };"), []);
    });

    it("finds smells with correct line numbers and severities", () => {
      const src = ["const x = eval('1');", "console.log(x);", "let y: any = 2;", "// TODO: later"].join("\n");
      const found = analyzeFileForSmells("dirty.ts", src);
      const byName = (n: string) => found.find((c) => c.body.includes(n));
      assert.equal(byName("eval() usage")?.line, 1);
      assert.equal(byName("eval() usage")?.severity, "error");
      assert.equal(byName("console.log in production")?.line, 2);
      assert.equal(byName("any type")?.line, 3);
      assert.equal(byName("TODO/FIXME left behind")?.line, 4);
      assert.equal(byName("TODO/FIXME left behind")?.severity, "info");
      for (const c of found) assert.equal(c.path, "dirty.ts");
    });

    it("detects an empty catch block", () => {
      const found = analyzeFileForSmells("e.ts", "try { x(); } catch (e) {}");
      assert.ok(found.some((c) => c.body.includes("Empty catch block")));
    });

    it("every smell has a suggestion and comment", () => {
      for (const s of CODE_SMELLS) {
        assert.ok(s.grumpyComment.length > 0, s.name);
        assert.ok(s.suggestion.length > 0, s.name);
      }
    });
  });

  describe("groupByFile", () => {
    it("groups comments preserving order", () => {
      const grouped = groupByFile([comment({ path: "a" }), comment({ path: "b" }), comment({ path: "a", line: 2 })]);
      assert.deepEqual([...grouped.keys()], ["a", "b"]);
      assert.equal(grouped.get("a")!.length, 2);
      assert.equal(grouped.get("b")!.length, 1);
    });
  });

  describe("determineReviewEvent", () => {
    it("requests changes on errors, approves when clean, comments otherwise", () => {
      assert.equal(determineReviewEvent(1, 3), "REQUEST_CHANGES");
      assert.equal(determineReviewEvent(0, 0), "APPROVE");
      assert.equal(determineReviewEvent(0, 2), "COMMENT");
    });
  });

  describe("buildGrumpyReview", () => {
    it("renders a summary table, per-file issues and a fixed voice", () => {
      const result = buildGrumpyReview(
        [
          comment({ severity: "error", body: "### 🚨 eval() usage\n\n..." }),
          comment({ line: 5 }),
          comment({ path: "b.ts", severity: "info", body: "### 💡 TODO\n\n..." }),
        ],
        { intro: "INTRO", outro: "OUTRO" },
      );
      assert.equal(result.errors, 1);
      assert.equal(result.warnings, 1);
      assert.equal(result.infos, 1);
      assert.equal(result.event, "REQUEST_CHANGES");
      assert.match(result.body, /^## 👴 Grumpy Reviewer's Assessment\n\nINTRO\n/);
      assert.match(result.body, /\| 🚨 Errors \| 1 \|/);
      assert.match(result.body, /\| \*\*Total\*\* \| \*\*3\*\* \|/);
      assert.match(result.body, /#### `a\.ts` \(2 issues\)/);
      assert.match(result.body, /- \*\*Line 1\*\*: 🚨 eval\(\) usage/);
      assert.match(result.body, /- \*\*Line 5\*\*: ⚠️ any type/);
      assert.match(result.body, /#### `b\.ts` \(1 issues\)/);
      assert.match(result.body, /\nOUTRO\n\n---\n/);
    });

    it("celebrates a clean review and approves", () => {
      const result = buildGrumpyReview([], { intro: "I", outro: "O" });
      assert.equal(result.event, "APPROVE");
      assert.match(result.body, /### No Issues Found! 🎉/);
      assert.doesNotMatch(result.body, /Issues by File/);
    });

    it("picks a bad outro above the threshold and a good one otherwise", () => {
      const few = buildGrumpyReview(Array.from({ length: GRUMPY_BAD_THRESHOLD }, () => comment()), { intro: "I" });
      assert.ok(GRUMPY_OUTROS_GOOD.some((o) => few.body.includes(o)));
      const many = buildGrumpyReview(Array.from({ length: GRUMPY_BAD_THRESHOLD + 1 }, () => comment()), { intro: "I" });
      assert.ok(GRUMPY_OUTROS_BAD.some((o) => many.body.includes(o)));
    });

    it("uses a random intro when none is supplied", () => {
      const result = buildGrumpyReview([], { outro: "O" });
      assert.ok(GRUMPY_INTROS.some((i) => result.body.includes(i)));
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.deepEqual(logs, ["Grumpy Reviewer: Missing required environment variables. Skipping."]);
    });
  });
});
