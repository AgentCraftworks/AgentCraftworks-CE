import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyStatus,
  computeWorkflowHealth,
  buildHealthReport,
  FAILING_THRESHOLD,
  DEGRADED_THRESHOLD,
  main,
  type RunLike,
  type WorkflowHealth,
} from "../../src/jobs/workflow-health-manager.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

const run = (conclusion: string | null, createdAt: string, durationSec: number): RunLike => ({
  conclusion,
  created_at: createdAt,
  updated_at: new Date(Date.parse(createdAt) + durationSec * 1000).toISOString(),
});

const health = (over: Partial<WorkflowHealth> = {}): WorkflowHealth => ({
  name: "CI",
  id: 1,
  status: "healthy",
  lastRun: "2025-01-01T00:00:00Z",
  lastConclusion: "success",
  recentFailures: 0,
  recentSuccesses: 10,
  avgDurationMs: 60_000,
  ...over,
});

describe("jobs/workflow-health-manager", () => {
  describe("classifyStatus", () => {
    it("uses the degraded and failing thresholds", () => {
      assert.equal(classifyStatus(0), "healthy");
      assert.equal(classifyStatus(DEGRADED_THRESHOLD - 1), "healthy");
      assert.equal(classifyStatus(DEGRADED_THRESHOLD), "degraded");
      assert.equal(classifyStatus(FAILING_THRESHOLD - 1), "degraded");
      assert.equal(classifyStatus(FAILING_THRESHOLD), "failing");
    });
  });

  describe("computeWorkflowHealth", () => {
    it("aggregates failures, successes, average duration and the latest run", () => {
      const runs = [
        run("failure", "2025-01-03T00:00:00Z", 30),
        run("success", "2025-01-02T00:00:00Z", 60),
        run(null, "2025-01-01T00:00:00Z", 90),
      ];
      const h = computeWorkflowHealth({ id: 7, name: "CI" }, runs);
      assert.equal(h.id, 7);
      assert.equal(h.name, "CI");
      assert.equal(h.recentFailures, 1);
      assert.equal(h.recentSuccesses, 1);
      assert.equal(h.avgDurationMs, 60_000);
      assert.equal(h.lastRun, "2025-01-03T00:00:00Z");
      assert.equal(h.lastConclusion, "failure");
      assert.equal(h.status, "healthy");
    });

    it("handles no runs", () => {
      const h = computeWorkflowHealth({ id: 1, name: "Empty" }, []);
      assert.equal(h.avgDurationMs, 0);
      assert.equal(h.lastRun, null);
      assert.equal(h.lastConclusion, null);
      assert.equal(h.status, "healthy");
    });

    it("flags failing workflows", () => {
      const runs = Array.from({ length: FAILING_THRESHOLD }, (_, i) => run("failure", `2025-01-0${i + 1}T00:00:00Z`, 10));
      assert.equal(computeWorkflowHealth({ id: 1, name: "Bad" }, runs).status, "failing");
    });
  });

  describe("buildHealthReport", () => {
    it("renders a table row per workflow and action items for problems", () => {
      const body = buildHealthReport([
        health(),
        health({ name: "Flaky", status: "degraded", recentFailures: 3, avgDurationMs: 0, lastRun: null }),
        health({ name: "Broken", status: "failing", recentFailures: 6 }),
      ]);
      assert.match(body, /\*\*2\*\* workflow\(s\) need attention/);
      assert.match(body, /\| ✅ healthy \| CI \| 0\/10 \| 60s \| /);
      assert.match(body, /\| ⚠️ degraded \| Flaky \| 3\/10 \| N\/A \| Never \|/);
      assert.match(body, /\| ❌ failing \| Broken \| 6\/10 \|/);
      assert.match(body, /### Action Items/);
      assert.match(body, /- 🔴 \*\*Broken\*\*: 6 failures in last 10 runs\. Investigate immediately\./);
      assert.match(body, /- 🟡 \*\*Flaky\*\*: 3 failures in last 10 runs\. Monitor closely\./);
      assert.match(body, /Engagement Level: T2 \(Advisor\)/);
    });

    it("omits action items when everything is healthy", () => {
      const body = buildHealthReport([health()]);
      assert.match(body, /\*\*0\*\* workflow\(s\) need attention/);
      assert.doesNotMatch(body, /Action Items/);
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.deepEqual(logs, ["Workflow Health: Missing required environment variables. Skipping."]);
    });
  });
});
