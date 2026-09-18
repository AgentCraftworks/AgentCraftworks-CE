import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  findSourceFiles,
  fileExists,
  candidateTestLocations,
  isHighPriorityPath,
  describeGap,
  sortGapsByPriority,
  buildCoverageReport,
  MAX_MEDIUM_GAPS_LISTED,
  main,
  type CoverageGap,
} from "../../src/jobs/daily-test-improver.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

const gap = (over: Partial<CoverageGap> = {}): CoverageGap => ({
  sourceFile: "src/utils/x.ts",
  expectedTestFile: "test/utils/x.test.ts",
  priority: "medium",
  reason: "Source file without corresponding test coverage",
  ...over,
});

describe("jobs/daily-test-improver", () => {
  describe("findSourceFiles / fileExists", () => {
    it("returns [] for a missing directory and false for a missing file", async () => {
      const missing = join(tmpdir(), "nope-" + Date.now());
      assert.deepEqual(await findSourceFiles(missing), []);
      assert.equal(await fileExists(missing), false);
    });

    it("recurses, skipping configured dirs and non-source files", async () => {
      const root = await mkdtemp(join(tmpdir(), "dti-"));
      try {
        await mkdir(join(root, "services"));
        await mkdir(join(root, "types"));
        await mkdir(join(root, "node_modules"));
        await writeFile(join(root, "index.ts"), "");
        await writeFile(join(root, "a.ts"), "");
        await writeFile(join(root, "a.test.ts"), "");
        await writeFile(join(root, "a.d.ts"), "");
        await writeFile(join(root, "readme.md"), "");
        await writeFile(join(root, "services", "svc.ts"), "");
        await writeFile(join(root, "types", "t.ts"), "");
        await writeFile(join(root, "node_modules", "dep.ts"), "");

        const found = (await findSourceFiles(root)).map((f) => f.slice(root.length + 1)).sort();
        assert.deepEqual(found, ["a.ts", join("services", "svc.ts")]);
        assert.equal(await fileExists(join(root, "a.ts")), true);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });

  describe("candidateTestLocations", () => {
    it("returns sibling, __tests__ and mirrored test/ locations", () => {
      const locs = candidateTestLocations("repo/src/services/foo.ts");
      assert.equal(locs.length, 3);
      assert.equal(locs[0], join("repo/src/services", "foo.test.ts"));
      assert.equal(locs[1], join("repo/src/services", "__tests__", "foo.test.ts"));
      assert.equal(locs[2], "repo/test/services/foo.test.ts");
    });
  });

  describe("isHighPriorityPath", () => {
    it("matches handlers/services/middleware with either separator", () => {
      assert.equal(isHighPriorityPath("src/handlers/pr.ts"), true);
      assert.equal(isHighPriorityPath("src\\services\\x.ts"), true);
      assert.equal(isHighPriorityPath("src/middleware/auth.ts"), true);
    });

    it("does not match other directories or bare names", () => {
      assert.equal(isHighPriorityPath("src/utils/x.ts"), false);
      assert.equal(isHighPriorityPath("services.ts"), false);
    });
  });

  describe("describeGap", () => {
    it("marks core modules high priority", () => {
      const g = describeGap("/r/src/handlers/pr.ts", "src/handlers/pr.ts");
      assert.equal(g.priority, "high");
      assert.match(g.reason, /high impact/);
      assert.equal(g.expectedTestFile, "/r/test/handlers/pr.test.ts");
      assert.equal(g.sourceFile, "src/handlers/pr.ts");
    });

    it("marks other modules medium priority", () => {
      const g = describeGap("/r/src/utils/u.ts", "src/utils/u.ts");
      assert.equal(g.priority, "medium");
      assert.match(g.reason, /without corresponding test coverage/);
    });
  });

  describe("sortGapsByPriority", () => {
    it("orders high before medium before low without mutating input", () => {
      const input = [gap({ priority: "low" }), gap({ priority: "high" }), gap({ priority: "medium" })];
      const copy = [...input];
      const sorted = sortGapsByPriority(input);
      assert.deepEqual(sorted.map((g) => g.priority), ["high", "medium", "low"]);
      assert.deepEqual(input, copy);
    });
  });

  describe("buildCoverageReport", () => {
    it("lists high-priority gaps with reasons and medium gaps as a checklist", () => {
      const report = buildCoverageReport([
        gap({ sourceFile: "src/services/s.ts", priority: "high", reason: "Core" }),
        gap({ sourceFile: "src/utils/u.ts" }),
      ]);
      assert.match(report, /Found \*\*2\*\* source files without test coverage/);
      assert.match(report, /- \[ \] `src\/services\/s\.ts` — Core/);
      assert.match(report, /### Medium Priority/);
      assert.match(report, /- \[ \] `src\/utils\/u\.ts`\n/);
    });

    it("says all high-priority modules are covered when none are missing", () => {
      const report = buildCoverageReport([gap()]);
      assert.match(report, /All high-priority modules have test coverage\./);
    });

    it("truncates the medium list", () => {
      const many = Array.from({ length: MAX_MEDIUM_GAPS_LISTED + 4 }, (_, i) => gap({ sourceFile: `src/u${i}.ts` }));
      const report = buildCoverageReport(many);
      assert.match(report, new RegExp(`- \\.\\.\\. and 4 more`));
      assert.equal(report.split("\n").filter((l) => l.startsWith("- [ ] `src/u")).length, MAX_MEDIUM_GAPS_LISTED);
    });

    it("omits the medium section when there are none", () => {
      const report = buildCoverageReport([gap({ priority: "high" })]);
      assert.doesNotMatch(report, /Medium Priority/);
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.deepEqual(logs, ["Daily Test Improver: Missing required environment variables. Skipping."]);
    });
  });
});
