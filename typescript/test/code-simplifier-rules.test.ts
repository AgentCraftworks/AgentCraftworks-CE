import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applySimplifications } from "../src/utils/code-simplifier-rules.js";

describe("Code Simplifier unsafe rewrites", () => {
  it("demonstrates that || and ?? differ for falsy non-nullish values", () => {
    const falsyValues = [0, "", false, Number.NaN];

    assert.deepEqual(
      falsyValues.map((value) => value || "d"),
      ["d", "d", "d", "d"],
    );
    assert.deepEqual(
      falsyValues.map((value) => value ?? "d"),
      falsyValues,
    );
  });

  it("demonstrates that Number rejects trailing characters accepted by parseInt", () => {
    assert.equal(parseInt("10px"), 10);
    assert.ok(Number.isNaN(Number("10px")));
  });

  it("does not suggest either unsafe rewrite", () => {
    const source = 'const fallback = value || "d";\nconst amount = parseInt(input);\n';

    assert.deepEqual(applySimplifications(source, "example.ts"), {
      newContent: source,
      simplifications: [],
    });
  });
});
