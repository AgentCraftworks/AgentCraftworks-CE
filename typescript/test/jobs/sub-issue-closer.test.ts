import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSubIssueOf,
  findSubIssues,
  shouldCloseParent,
  buildClosingSummary,
  main,
  type IssueLike,
  type SubIssue,
} from "../../src/jobs/sub-issue-closer.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

const sub = (over: Partial<SubIssue> = {}): SubIssue => ({
  number: 2,
  title: "[Parent] 1/2: Do thing",
  state: "closed",
  closedAt: "2025-02-01T10:00:00Z",
  ...over,
});

describe("jobs/sub-issue-closer", () => {
  describe("isSubIssueOf", () => {
    it("matches on the [Parent Title] prefix only", () => {
      assert.equal(isSubIssueOf("[Big Feature] 1/3: Step", "Big Feature"), true);
      assert.equal(isSubIssueOf("Big Feature step", "Big Feature"), false);
      assert.equal(isSubIssueOf("[Other] 1/3: Step", "Big Feature"), false);
    });
  });

  describe("findSubIssues", () => {
    const parent = { number: 1, title: "Epic" };
    const issues: IssueLike[] = [
      { number: 1, title: "Epic", state: "open" },
      { number: 2, title: "[Epic] 1/2: A", state: "closed", closed_at: "2025-01-01T00:00:00Z" },
      { number: 3, title: "Unrelated", state: "open", body: "## 📋 Sub-issue of #1\n..." },
      { number: 4, title: "[Epic] 2/2: B", state: "open", body: "Sub-issue of #1", closed_at: null },
      { number: 5, title: "Nope", state: "open", body: "Sub-issue of #10" },
    ];

    it("matches by title prefix or body marker, excludes the parent and de-duplicates", () => {
      const found = findSubIssues(parent, issues);
      assert.deepEqual(found.map((s) => s.number), [2, 3, 4]);
      assert.equal(found[0]!.closedAt, "2025-01-01T00:00:00Z");
      assert.equal(found[2]!.closedAt, undefined);
      assert.equal(found[2]!.state, "open");
    });

    it("returns [] when nothing matches", () => {
      assert.deepEqual(findSubIssues({ number: 99, title: "Ghost" }, issues), []);
    });

    it("does not treat 'Sub-issue of #10' as a marker for parent #1 (regression)", () => {
      const found = findSubIssues({ number: 1, title: "Zzz" }, [{ number: 5, title: "Nope", state: "open", body: "Sub-issue of #10" }]);
      assert.deepEqual(found, []);
      const ok = findSubIssues({ number: 10, title: "Zzz" }, [{ number: 5, title: "Nope", state: "open", body: "Sub-issue of #10" }]);
      assert.deepEqual(ok.map((s) => s.number), [5]);
    });
  });

  describe("shouldCloseParent", () => {
    it("is true only when there are sub-issues and none are open", () => {
      assert.equal(shouldCloseParent([]), false);
      assert.equal(shouldCloseParent([sub(), sub({ number: 3, state: "open" })]), false);
      assert.equal(shouldCloseParent([sub(), sub({ number: 3 })]), true);
    });
  });

  describe("buildClosingSummary", () => {
    it("lists sub-issues sorted by close date with cleaned titles and summary dates", () => {
      const subIssues = [
        sub({ number: 3, title: "[Parent] 2/2: Second", closedAt: "2025-02-03T12:00:00Z" }),
        sub({ number: 2, title: "[Parent] 1/2: First", closedAt: "2025-02-01T12:00:00Z" }),
      ];
      const body = buildClosingSummary({ number: 1, title: "Parent", subIssues });
      const first = body.indexOf("#2 — First (closed 2025-02-01)");
      const second = body.indexOf("#3 — Second (closed 2025-02-03)");
      assert.ok(first > -1 && second > first);
      assert.match(body, /- \*\*Total sub-issues:\*\* 2/);
      assert.match(body, /- \*\*First completed:\*\* 2025-02-01/);
      assert.match(body, /- \*\*Last completed:\*\* 2025-02-03/);
      assert.match(body, /Engagement Level: T4 \(Delegated\)/);
      // Input order must not be mutated
      assert.equal(subIssues[0]!.number, 3);
    });

    it("uses unknown/N/A when close dates are missing", () => {
      const body = buildClosingSummary({ number: 1, title: "P", subIssues: [sub({ closedAt: undefined })] });
      assert.match(body, /\(closed unknown\)/);
      assert.match(body, /First completed:\*\* N\/A/);
      assert.match(body, /Last completed:\*\* N\/A/);
    });

    it("leaves titles without the numbered prefix untouched", () => {
      const body = buildClosingSummary({ number: 1, title: "P", subIssues: [sub({ title: "Plain title" })] });
      assert.match(body, /#2 — Plain title/);
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.deepEqual(logs, ["Sub-Issue Closer: Missing required environment variables. Skipping."]);
    });
  });
});
