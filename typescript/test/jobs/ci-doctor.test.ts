import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FAILURE_CATEGORIES,
  extractLogSnippet,
  diagnoseFailures,
  overallSeverity,
  collectLabels,
  buildDiagnosticReport,
  main,
  type DiagnosticResult,
} from "../../src/jobs/ci-doctor.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

const category = (name: string) => FAILURE_CATEGORIES.find((c) => c.name === name)!;
const diag = (name: string, matched: string[] = ["x"]): DiagnosticResult => ({
  category: category(name),
  matchedLines: matched,
  context: matched.join("\n"),
});

describe("jobs/ci-doctor", () => {
  describe("extractLogSnippet", () => {
    const logs = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");

    it("returns the first match with surrounding context", () => {
      const snippet = extractLogSnippet(logs, /line 5/, 2);
      assert.equal(snippet, ["line 3", "line 4", "line 5", "line 6", "line 7"].join("\n"));
    });

    it("clamps context at the start and end of the log", () => {
      assert.equal(extractLogSnippet(logs, /line 0/, 2), ["line 0", "line 1", "line 2"].join("\n"));
      assert.equal(extractLogSnippet(logs, /line 9/, 2), ["line 7", "line 8", "line 9"].join("\n"));
    });

    it("returns an empty string when nothing matches", () => {
      assert.equal(extractLogSnippet(logs, /nope/), "");
    });
  });

  describe("diagnoseFailures", () => {
    it("returns no diagnostics for a clean log", () => {
      assert.deepEqual(diagnoseFailures("everything passed"), []);
    });

    it("identifies a type error and limits matched lines to 5", () => {
      const logs = Array.from({ length: 8 }, (_, i) => `src/f${i}.ts: error TS2322: bad`).join("\n");
      const results = diagnoseFailures(logs);
      assert.equal(results.length, 1);
      assert.equal(results[0]!.category.name, "Type Error");
      assert.equal(results[0]!.matchedLines.length, 5);
      assert.ok(results[0]!.context.length > 0);
    });

    it("identifies multiple categories", () => {
      const logs = ["Build failed", "AssertionError: expected 1 to equal 2"].join("\n");
      const names = diagnoseFailures(logs).map((r) => r.category.name);
      assert.ok(names.includes("Build Error"));
      assert.ok(names.includes("Test Failure"));
    });
  });

  describe("overallSeverity", () => {
    it("returns low when there are no diagnostics", () => {
      assert.equal(overallSeverity([]), "low");
    });

    it("picks the highest severity present", () => {
      assert.equal(overallSeverity([diag("Type Error")]), "high");
      assert.equal(overallSeverity([diag("Type Error"), diag("Build Error")]), "critical");
    });
  });

  describe("collectLabels", () => {
    it("always includes ci-doctor and de-duplicates category labels", () => {
      const labels = collectLabels([diag("Type Error"), diag("Test Failure")]);
      assert.equal(labels[0], "ci-doctor");
      assert.equal(new Set(labels).size, labels.length);
      assert.ok(labels.includes("typescript"));
      assert.ok(labels.includes("testing"));
      assert.equal(labels.filter((l) => l === "bug").length, 1);
    });

    it("returns only ci-doctor for no diagnostics", () => {
      assert.deepEqual(collectLabels([]), ["ci-doctor"]);
    });
  });

  describe("buildDiagnosticReport", () => {
    const run = {
      name: "CI",
      run_number: 7,
      html_url: "https://gh/run/7",
      head_branch: "feat/x",
      head_sha: "abcdef1234567890",
    };

    it("includes metadata table, issues, remediation and failed jobs", () => {
      const { title, body } = buildDiagnosticReport(
        run,
        [{ name: "build", html_url: "https://gh/job/1" }, { name: "test", html_url: null }],
        [diag("Build Error", ["Build failed"])],
        "critical",
      );
      assert.equal(title, "🏥 CI Failure: CI #7 — CRITICAL");
      assert.match(body, /\| \*\*Workflow\*\* \| CI \|/);
      assert.match(body, /\| \*\*Commit\*\* \| `abcdef1` \|/);
      assert.match(body, /\| \*\*Severity\*\* \| CRITICAL \|/);
      assert.match(body, /\| \*\*Failed Jobs\*\* \| 2 \|/);
      assert.match(body, /### 🚨 Build Error/);
      assert.match(body, /Build failed/);
      assert.match(body, /- \[ \] Run `npm ci && npm run build` locally/);
      assert.match(body, /- ❌ \*\*build\*\* — \[View logs\]\(https:\/\/gh\/job\/1\)/);
      // Missing job URL falls back to run URL
      assert.match(body, /- ❌ \*\*test\*\* — \[View logs\]\(https:\/\/gh\/run\/7\)/);
    });

    it("uses the warning emoji for non-critical categories", () => {
      const { body } = buildDiagnosticReport(run, [], [diag("Type Error")], "high");
      assert.match(body, /### ⚠️ Type Error/);
      assert.doesNotMatch(body, /Failed Jobs\n/);
    });

    it("renders an unknown-failure section when nothing matched", () => {
      const { body } = buildDiagnosticReport(run, [], [], "low");
      assert.match(body, /## ❓ Unknown Failure/);
      assert.match(body, /\[workflow logs\]\(https:\/\/gh\/run\/7\)/);
      assert.doesNotMatch(body, /Identified Issues/);
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.deepEqual(logs, ["CI Doctor: Missing required environment variables. Skipping."]);
    });
  });
});
