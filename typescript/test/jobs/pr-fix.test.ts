import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  relevantFilesForCheck,
  buildPrFixComment,
  MAX_RELEVANT_FILES_LISTED,
  main,
} from "../../src/jobs/pr-fix.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

const files = ["src/a.ts", "src/b.tsx", "src/c.js", "test/a.test.ts", "docs/x.md", "spec/y.spec.js"];

describe("jobs/pr-fix", () => {
  describe("relevantFilesForCheck", () => {
    it("narrows type checks to TS files", () => {
      assert.deepEqual(relevantFilesForCheck("Typecheck", files), ["src/a.ts", "src/b.tsx", "test/a.test.ts"]);
    });

    it("narrows lint checks to TS/JS files", () => {
      assert.deepEqual(relevantFilesForCheck("ESLint", files), ["src/a.ts", "src/c.js", "test/a.test.ts", "spec/y.spec.js"]);
    });

    it("narrows test checks to test/spec paths", () => {
      assert.deepEqual(relevantFilesForCheck("Unit Tests", files), ["test/a.test.ts", "spec/y.spec.js"]);
    });

    it("returns everything for unknown checks", () => {
      assert.deepEqual(relevantFilesForCheck("Deploy", files), files);
    });
  });

  describe("buildPrFixComment", () => {
    it("uses the check summary when present and lists relevant files", () => {
      const body = buildPrFixComment(
        [{ name: "Typecheck", html_url: "https://gh/c/1", output: { summary: "3 errors" } }],
        files,
      );
      assert.match(body, /Found \*\*1\*\* failed check\(s\)/);
      assert.match(body, /### ❌ Typecheck\n\n3 errors/);
      assert.match(body, /\*\*Files to check:\*\*\n- `src\/a\.ts`\n- `src\/b\.tsx`\n- `test\/a\.test\.ts`/);
      assert.match(body, /Engagement Level: T2 \(Advisor\)/);
    });

    it("falls back to a link when there is no summary", () => {
      const body = buildPrFixComment([{ name: "Build", html_url: "https://gh/c/2", output: null }], []);
      assert.match(body, /Check \[Build\]\(https:\/\/gh\/c\/2\) failed\. Review the logs for details\./);
      assert.doesNotMatch(body, /Files to check/);
    });

    it("tolerates a missing html_url", () => {
      const body = buildPrFixComment([{ name: "Build" }], []);
      assert.match(body, /Check \[Build\]\(\) failed/);
    });

    it("caps the file list", () => {
      const many = Array.from({ length: MAX_RELEVANT_FILES_LISTED + 5 }, (_, i) => `f${i}.ts`);
      const body = buildPrFixComment([{ name: "Deploy" }], many);
      assert.equal(body.split("\n").filter((l) => l.startsWith("- `f")).length, MAX_RELEVANT_FILES_LISTED);
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.deepEqual(logs, ["PR Fix: Missing required environment variables. Skipping."]);
    });
  });
});
