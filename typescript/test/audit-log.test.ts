import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  clearAuditEvents,
  listAuditEvents,
  recordAuditEvent,
  type AuditEvent,
} from "../src/services/audit-log.js";

const bounds: AuditEvent["bounds"] = {
  repoCeiling: 3,
  environmentCeiling: 3,
  globalCeiling: 5,
  agentsPaused: false,
};

function createEvent(repo: string, action = "post_comment"): AuditEvent {
  return {
    event: "gate.allowed",
    actor: "operator",
    repo,
    action,
    tier: "T2",
    bounds,
    timestamp: new Date(0).toISOString(),
  };
}

describe("audit log", () => {
  afterEach(() => {
    clearAuditEvents();
  });

  it("keeps events in chronological order and filters by repository", () => {
    recordAuditEvent(createEvent("owner/first", "comment"));
    recordAuditEvent(createEvent("owner/second", "label"));
    recordAuditEvent(createEvent("owner/first", "review_comment"));

    assert.deepEqual(
      listAuditEvents("OWNER/FIRST").map((event) => event.action),
      ["comment", "review_comment"],
    );
    assert.deepEqual(
      listAuditEvents().map((event) => event.action),
      ["comment", "label", "review_comment"],
    );
  });

  it("retains only the newest events when the ring buffer fills", () => {
    const originalLog = console.log;
    console.log = () => {};
    try {
      for (let index = 0; index < 1_005; index++) {
        recordAuditEvent(createEvent("owner/repo", `action-${index}`));
      }
    } finally {
      console.log = originalLog;
    }

    const events = listAuditEvents();
    assert.equal(events.length, 1_000);
    assert.equal(events[0]?.action, "action-5");
    assert.equal(events[999]?.action, "action-1004");
  });

  it("appends JSON Lines when GH_CE_AUDIT_FILE is configured", () => {
    const directory = mkdtempSync(join(tmpdir(), "agentcraftworks-audit-"));
    const auditFile = join(directory, "audit.jsonl");
    const previous = process.env["GH_CE_AUDIT_FILE"];
    process.env["GH_CE_AUDIT_FILE"] = auditFile;

    try {
      recordAuditEvent(createEvent("owner/repo"));
      recordAuditEvent(createEvent("owner/repo", "label"));

      const lines = readFileSync(auditFile, "utf8").trim().split(/\r?\n/);
      assert.equal(lines.length, 2);
      assert.equal(JSON.parse(lines[0] ?? "{}")["action"], "post_comment");
      assert.equal(JSON.parse(lines[1] ?? "{}")["action"], "label");
    } finally {
      if (previous === undefined) {
        delete process.env["GH_CE_AUDIT_FILE"];
      } else {
        process.env["GH_CE_AUDIT_FILE"] = previous;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("surfaces file errors without discarding the in-memory event", () => {
    const directory = mkdtempSync(join(tmpdir(), "agentcraftworks-audit-"));
    const previous = process.env["GH_CE_AUDIT_FILE"];
    process.env["GH_CE_AUDIT_FILE"] = join(directory, "missing", "audit.jsonl");

    try {
      assert.throws(() => recordAuditEvent(createEvent("owner/repo")));
      assert.equal(listAuditEvents("owner/repo").length, 1);
    } finally {
      if (previous === undefined) {
        delete process.env["GH_CE_AUDIT_FILE"];
      } else {
        process.env["GH_CE_AUDIT_FILE"] = previous;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
