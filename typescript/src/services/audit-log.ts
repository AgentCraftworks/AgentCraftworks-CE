import { appendFileSync } from "node:fs";
import type { ActionTier, DialLevel } from "../types/autonomy.js";

export type AuditEventName =
  | "dial.changed"
  | "ceiling.changed"
  | "gate.allowed"
  | "gate.denied"
  | "protected.denied"
  | "budget.exhausted";

export interface AuditBounds {
  repoCeiling: DialLevel;
  environmentCeiling: DialLevel;
  globalCeiling: DialLevel;
  agentsPaused: boolean;
}

export interface AuditEvent {
  event: AuditEventName;
  actor: string;
  repo: string;
  action: string;
  tier: ActionTier;
  bounds: AuditBounds;
  timestamp: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}

const AUDIT_BUFFER_CAPACITY = 1_000;
const auditBuffer: Array<AuditEvent | undefined> = new Array(
  AUDIT_BUFFER_CAPACITY,
);
let nextAuditIndex = 0;
let auditCount = 0;

export function recordAuditEvent(event: AuditEvent): void {
  const record: AuditEvent = {
    ...event,
    bounds: { ...event.bounds },
    ...(event.details ? { details: { ...event.details } } : {}),
  };
  auditBuffer[nextAuditIndex] = record;
  nextAuditIndex = (nextAuditIndex + 1) % AUDIT_BUFFER_CAPACITY;
  auditCount = Math.min(auditCount + 1, AUDIT_BUFFER_CAPACITY);

  console.log(JSON.stringify({ msg: "audit event", ...record }));

  const auditFile = process.env["GH_CE_AUDIT_FILE"];
  if (auditFile) {
    try {
      appendFileSync(auditFile, `${JSON.stringify(record)}\n`, {
        encoding: "utf8",
      });
    } catch (error: unknown) {
      throw new Error("Failed to append audit event to GH_CE_AUDIT_FILE", {
        cause: error,
      });
    }
  }
}

export function listAuditEvents(repo?: string): AuditEvent[] {
  const firstIndex =
    (nextAuditIndex - auditCount + AUDIT_BUFFER_CAPACITY) %
    AUDIT_BUFFER_CAPACITY;
  const normalizedRepo = repo?.toLowerCase();
  const events: AuditEvent[] = [];

  for (let offset = 0; offset < auditCount; offset++) {
    const event = auditBuffer[(firstIndex + offset) % AUDIT_BUFFER_CAPACITY];
    if (
      !event ||
      (normalizedRepo && event.repo.toLowerCase() !== normalizedRepo)
    ) {
      continue;
    }

    events.push({
      ...event,
      bounds: { ...event.bounds },
      ...(event.details ? { details: { ...event.details } } : {}),
    });
  }

  return events;
}

export function clearAuditEvents(): void {
  auditBuffer.fill(undefined);
  nextAuditIndex = 0;
  auditCount = 0;
}
