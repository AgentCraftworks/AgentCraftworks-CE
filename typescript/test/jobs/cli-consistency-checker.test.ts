import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkRouteContent,
  checkMcpContent,
  checkRouteConsistency,
  checkMcpConsistency,
  buildConsistencyReport,
  type ConsistencyIssue,
} from "../../src/jobs/cli-consistency-checker.js";

describe("jobs/cli-consistency-checker", () => {
  describe("checkRouteContent", () => {
    it("passes lowercase kebab-case routes and ignores path params", () => {
      const src = [
        'router.get("/api/handoffs/:id", handler);',
        "app.post('/api/agent-autonomy', handler);",
      ].join("\n");
      assert.deepEqual(checkRouteContent("handlers/x.ts", src), []);
    });

    it("flags uppercase segments with the line number", () => {
      const issues = checkRouteContent("handlers/x.ts", '\nrouter.get("/api/Handoffs", h);');
      assert.equal(issues.length, 1);
      assert.equal(issues[0]!.line, 2);
      assert.equal(issues[0]!.file, "handlers/x.ts");
      assert.match(issues[0]!.issue, /"Handoffs" is not lowercase/);
      assert.match(issues[0]!.suggestion, /"handoffs"/);
    });

    it("flags underscores (but not leading underscore) and suggests kebab-case", () => {
      const issues = checkRouteContent("f", 'router.put("/api/agent_autonomy/_internal", h);');
      assert.equal(issues.length, 1);
      assert.match(issues[0]!.issue, /uses underscores/);
      assert.match(issues[0]!.suggestion, /"agent-autonomy"/);
    });

    it("can report both problems on one segment", () => {
      const issues = checkRouteContent("f", 'router.delete("/Api_Thing", h);');
      assert.equal(issues.length, 2);
    });
  });

  describe("checkMcpContent", () => {
    it("passes snake_case names", () => {
      assert.deepEqual(checkMcpContent("mcp/s.ts", 'name: "create_handoff",'), []);
    });

    it("flags uppercase and kebab-case names", () => {
      const src = ["name: 'Create_Handoff',", 'name: "get-context",'].join("\n");
      const issues = checkMcpContent("mcp/s.ts", src);
      assert.equal(issues.length, 2);
      assert.match(issues[0]!.issue, /contains uppercase/);
      assert.equal(issues[0]!.line, 1);
      assert.match(issues[1]!.issue, /uses kebab-case/);
      assert.match(issues[1]!.suggestion, /"get_context"/);
      assert.equal(issues[1]!.line, 2);
    });
  });

  describe("directory scanners", () => {
    it("return no issues for a missing directory", async () => {
      assert.deepEqual(await checkRouteConsistency(join(tmpdir(), "does-not-exist-xyz")), []);
      assert.deepEqual(await checkMcpConsistency(join(tmpdir(), "does-not-exist-xyz")), []);
    });

    it("scan only .ts files and label them by directory", async () => {
      const dir = await mkdtemp(join(tmpdir(), "cli-consistency-"));
      try {
        await writeFile(join(dir, "a.ts"), 'router.get("/Bad", h);\nname: "Bad-Name"');
        await writeFile(join(dir, "ignored.md"), 'router.get("/Bad", h);');
        const routes = await checkRouteConsistency(dir);
        const mcp = await checkMcpConsistency(dir);
        assert.equal(routes.length, 1);
        assert.equal(routes[0]!.file, "handlers/a.ts");
        assert.equal(mcp.length, 2);
        assert.equal(mcp[0]!.file, "mcp/a.ts");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("buildConsistencyReport", () => {
    it("renders a table row per issue", () => {
      const issues: ConsistencyIssue[] = [
        { file: "handlers/a.ts", line: 3, issue: "bad", suggestion: "good" },
        { file: "mcp/b.ts", line: 9, issue: "worse", suggestion: "better" },
      ];
      const report = buildConsistencyReport(issues);
      assert.match(report, /Found \*\*2\*\* consistency issue\(s\)/);
      assert.match(report, /\| `handlers\/a\.ts` \| 3 \| bad \| good \|/);
      assert.match(report, /\| `mcp\/b\.ts` \| 9 \| worse \| better \|/);
      assert.match(report, /Engagement Level: T2 \(Advisor\)/);
    });
  });
});
