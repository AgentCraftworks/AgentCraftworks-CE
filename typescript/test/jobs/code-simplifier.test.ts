import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SIMPLIFICATION_RULES,
  applySimplifications,
  buildSimplifierPrBody,
  main,
  type Simplification,
} from "../../src/jobs/code-simplifier.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

describe("jobs/code-simplifier", () => {
  describe("SIMPLIFICATION_RULES", () => {
    it("each rule's testBefore transforms into its testAfter", () => {
      for (const rule of SIMPLIFICATION_RULES) {
        if (typeof rule.replacement !== "string") continue;
        const actual = rule.testBefore.replace(rule.pattern, rule.replacement);
        assert.equal(actual, rule.testAfter, rule.name);
      }
    });

    it("has unique names", () => {
      const names = SIMPLIFICATION_RULES.map((r) => r.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe("applySimplifications", () => {
    it("returns content unchanged when nothing matches", () => {
      const src = "const a = 1;\nexport default a;\n";
      const { newContent, simplifications } = applySimplifications(src, "a.ts");
      assert.equal(newContent, src);
      assert.deepEqual(simplifications, []);
    });

    it("records a simplification with line number and applies it", () => {
      const src = "const x = 1;\nconst y = Math.pow(2, 8);\n";
      const { newContent, simplifications } = applySimplifications(src, "m.ts");
      assert.ok(newContent.includes("(2 ** 8)"));
      const pow = simplifications.find((s) => s.rule === "Exponentiation Operator");
      assert.ok(pow);
      assert.equal(pow.file, "m.ts");
      assert.equal(pow.line, 2);
      assert.equal(pow.before, "Math.pow(2, 8)");
      assert.equal(pow.after, "(2 ** 8)");
    });

    it("skips matches inside comments but still applies globally", () => {
      const src = "// Math.pow(2, 3)\n * Math.pow(4, 5)\nconst z = Math.pow(6, 7);";
      const { simplifications } = applySimplifications(src, "c.ts");
      assert.equal(simplifications.length, 1);
      assert.equal(simplifications[0]!.line, 3);
    });

    it("converts indexOf checks to includes", () => {
      const { newContent, simplifications } = applySimplifications("if (arr.indexOf(x) !== -1) {}\nif (arr.indexOf(y) === -1) {}", "i.ts");
      assert.ok(newContent.includes("arr.includes(x)"));
      assert.ok(newContent.includes("!arr.includes(y)"));
      assert.ok(simplifications.some((s) => s.rule === "Array.includes"));
      assert.ok(simplifications.some((s) => s.rule === "Array.includes (negative)"));
    });
  });

  describe("buildSimplifierPrBody", () => {
    const simp = (line: number, rule = "Exponentiation Operator"): Simplification => ({
      file: "a.ts",
      line,
      rule,
      before: "Math.pow(2, 3)",
      after: "(2 ** 3)",
    });

    it("summarises totals and per-rule stats", () => {
      const { title, body, total } = buildSimplifierPrBody([
        { path: "a.ts", simplifications: [simp(1), simp(2), simp(3, "Boolean Conversion")] },
        { path: "b.ts", simplifications: [simp(4)] },
      ]);
      assert.equal(total, 4);
      assert.equal(title, "🧹 Code Simplifier: 4 modernizations");
      assert.match(body, /applies \*\*4\*\* code modernization patterns to \*\*2\*\* files/);
      assert.match(body, /\| Exponentiation Operator \| 3 \| Replace Math\.pow with \*\* operator\. \|/);
      assert.match(body, /\| Boolean Conversion \| 1 \|/);
      assert.match(body, /#### `a\.ts` \(3 changes\)/);
      assert.match(body, /- \*\*Line 4\*\* \(Exponentiation Operator\): `Math\.pow\(2, 3\)` → `\(2 \*\* 3\)`/);
    });

    it("truncates per-file lists after 5 entries", () => {
      const many = Array.from({ length: 8 }, (_, i) => simp(i + 1));
      const { body } = buildSimplifierPrBody([{ path: "big.ts", simplifications: many }]);
      assert.match(body, /- \.\.\. and 3 more/);
    });

    it("handles an empty change set", () => {
      const { total, body } = buildSimplifierPrBody([]);
      assert.equal(total, 0);
      assert.match(body, /\*\*0\*\* code modernization patterns to \*\*0\*\* files/);
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.deepEqual(logs, ["Code Simplifier: Missing required environment variables. Skipping."]);
    });
  });
});
