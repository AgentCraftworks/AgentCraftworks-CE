import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_PATTERNS,
  DEFAULT_PLAN,
  detectPattern,
  effortToEmoji,
  buildSubIssueTitle,
  buildSubIssueBody,
  buildPlanSummary,
  main,
} from "../../src/jobs/plan-command.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

describe("jobs/plan-command", () => {
  describe("detectPattern", () => {
    it("requires at least two keyword hits", () => {
      assert.equal(detectPattern("Add a new API"), null);
      assert.equal(detectPattern("Add a new REST API endpoint")?.type, "api");
    });

    it("returns the first matching pattern in table order", () => {
      // "component" + "page" → ui; also "docs" + "readme" → documentation; ui is earlier
      assert.equal(detectPattern("Component page and docs readme")?.type, "ui");
      assert.equal(detectPattern("There is a bug that causes a crash")?.type, "bug");
      assert.equal(detectPattern("Update the docs and the README guide")?.type, "documentation");
    });

    it("is case-insensitive", () => {
      assert.equal(detectPattern("BUG: CRASH on load")?.type, "bug");
    });

    it("all patterns have 3-5 sub-tasks with acceptance criteria", () => {
      for (const p of [...PLAN_PATTERNS.map((x) => x.subTasks), DEFAULT_PLAN]) {
        assert.ok(p.length >= 3 && p.length <= 5);
        for (const t of p) assert.ok(t.acceptanceCriteria.length > 0, t.title);
      }
    });
  });

  describe("effortToEmoji", () => {
    it("maps efforts to emoji with a fallback", () => {
      assert.equal(effortToEmoji("small"), "🟢");
      assert.equal(effortToEmoji("medium"), "🟡");
      assert.equal(effortToEmoji("large"), "🔴");
      assert.equal(effortToEmoji("unknown"), "⚪");
    });
  });

  describe("buildSubIssueTitle / buildSubIssueBody", () => {
    const task = DEFAULT_PLAN[0]!;

    it("formats the title with 1-based index and total", () => {
      assert.equal(buildSubIssueTitle("Parent", 0, 4, task), "[Parent] 1/4: Research and design");
    });

    it("renders description, effort and acceptance criteria checklist", () => {
      const body = buildSubIssueBody(42, "Parent", task);
      assert.match(body, /^## 📋 Sub-issue of #42\n/);
      assert.match(body, /\*\*Parent:\*\* Parent/);
      assert.match(body, /\*\*Effort:\*\* 🟢 small/);
      assert.match(body, /## Description\n\nUnderstand requirements and design solution/);
      for (const ac of task.acceptanceCriteria) assert.ok(body.includes(`- [ ] ${ac}`));
      assert.match(body, /Engagement Level: T3 \(Collaborator\)/);
    });
  });

  describe("buildPlanSummary", () => {
    it("lists created issues in order with the pattern type", () => {
      const body = buildPlanSummary(
        [
          { number: 101, title: "A" },
          { number: 102, title: "B" },
        ],
        "api",
      );
      assert.match(body, /created \*\*2\*\* sub-issues .* \*\*api\*\* pattern/);
      assert.match(body, /1\. #101 — A\n2\. #102 — B/);
      assert.match(body, /auto-closed when all sub-issues are complete/);
    });

    it("handles zero created issues", () => {
      assert.match(buildPlanSummary([], "general"), /\*\*0\*\* sub-issues/);
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.deepEqual(logs, ["Plan Command: Missing required environment variables. Skipping."]);
    });
  });
});
