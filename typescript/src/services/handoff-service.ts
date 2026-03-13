/**
 * Unified Handoff Service
 *
 * In-memory implementation of the handoff lifecycle.
 * Open-source core: basic CRUD, state transitions, isOverdue.
 *
 * 4-state FSM:
 *   pending → active → completed
 *     ↓        ↓
 *   failed   failed
 *
 * The "failed" state uses reason prefixes for diagnostics:
 *   rejected:*, abandoned:*, error:*, timeout:*
 *
 * - "overdue" is a computed property, not a stored state
 * - tracker's "created" maps to "pending"
 * - tracker's "abandoned" maps to "failed" with reason="abandoned:..."
 */

import crypto from "node:crypto";
import type {
  Handoff,
  HandoffState,
  CreateHandoffInput,
  HandoffMetadata,
  StateChange,
  TransitionOptions,
  TransitionResult,
  HandoffStats,
  HandoffFilters,
} from "../types/handoff.js";
import {
  HandoffStates,
  TransitionReasons,
  isValidTransition,
  isTerminalState,
  getAllowedNextStates,
} from "../utils/handoff-state-machine.js";

// ─── In-memory storage ──────────────────────────────────────────────────────────────

const inMemoryHandoffs = new Map<string, Handoff>();
const inMemoryStateChanges = new Map<string, StateChange[]>();

// ─── Re-export types ────────────────────────────────────────────────────────────────

export type { Handoff, HandoffState, HandoffFilters, HandoffStats };

// ─── Init ───────────────────────────────────────────────────────────────────────────

/**
 * Initialize the handoff service.
 * In this TypeScript port we always use in-memory storage.
 */
export function initHandoffService(
  _options: { forceInMemory?: boolean } = {},
): void {
  // Nothing to probe; always in-memory for the hackathon.
}

// ─── Create ─────────────────────────────────────────────────────────────────────────

/**
 * Create a new handoff record.
 * Compatible with both old handoff-storage and handoff-tracker callers.
 */
export function createHandoff(
  handoffData: CreateHandoffInput,
  metadata: HandoffMetadata = {},
): Handoff {
  const handoff_id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Normalize fields from both caller patterns
  const repoFullName =
    metadata.repository_full_name ?? metadata.repo ?? "";
  const slaHours = metadata.sla_hours ?? metadata.slaHours ?? null;
  const slaDeadline =
    metadata.sla_deadline ??
    (slaHours != null
      ? new Date(Date.now() + slaHours * 3_600_000).toISOString()
      : null);

  const record: Handoff = {
    handoff_id,
    issue_number: metadata.issue_number ?? metadata.prNumber ?? null,
    repository_full_name: repoFullName,
    from_agent: metadata.from_agent ?? null,
    to_agent: handoffData.to ?? handoffData.to_agent ?? null,
    status: HandoffStates.PENDING as HandoffState,
    task: handoffData.task ?? "",
    context: handoffData.context ?? "",
    priority: handoffData.priority ?? "medium",
    completed_work: handoffData.completed_work ?? [],
    blockers: handoffData.blockers ?? [],
    outputs: handoffData.outputs ?? {},
    dependencies: handoffData.dependencies ?? [],
    sla: handoffData.sla ?? slaHours ?? null,
    sla_deadline: slaDeadline,
    sla_hours: slaHours,
    initiating_comment_id: metadata.comment_id ?? null,
    created_at: now,
    updated_at: now,
    acknowledged_at: null,
    in_progress_at: null,
    completed_at: null,
    failed_at: null,
    failure_reason: null,
    // Tracker-specific fields
    teams: metadata.teams ? [...metadata.teams] : [],
    tier: metadata.tier ?? null,
    metadata: metadata.additional ?? {},
    // Audit trail fields (initially null)
    worktree_id: null,
    worktree_path: null,
    session_id: null,
  };

  inMemoryHandoffs.set(handoff_id, record);
  inMemoryStateChanges.set(handoff_id, []);

  return record;
}

// ─── Read ───────────────────────────────────────────────────────────────────────────

/** Get handoff by ID (UUID). */
export function getHandoff(handoff_id: string): Handoff | null {
  return inMemoryHandoffs.get(handoff_id) ?? null;
}

/**
 * Get handoff by repository and PR number (backward compat with tracker).
 */
export function getHandoffByPR(
  repo: string,
  prNumber: number,
): Handoff | null {
  for (const h of inMemoryHandoffs.values()) {
    if (h.repository_full_name === repo && h.issue_number === prNumber) {
      return h;
    }
  }
  return null;
}

/**
 * List handoffs with optional filters.
 * Supports both unified and tracker-style filter names.
 */
export function listHandoffs(filters: HandoffFilters = {}): Handoff[] {
  // Normalize tracker-style filter names
  const status: HandoffState | undefined =
    (filters.status ?? mapTrackerState(filters.state)) as
      | HandoffState
      | undefined;
  const toAgent = filters.to_agent;
  const fromAgent = filters.from_agent;
  const repoFullName = filters.repository_full_name ?? filters.repo;

  let results = Array.from(inMemoryHandoffs.values());

  if (status) results = results.filter((h) => h.status === status);
  if (toAgent) results = results.filter((h) => h.to_agent === toAgent);
  if (fromAgent)
    results = results.filter((h) => h.from_agent === fromAgent);
  if (repoFullName)
    results = results.filter(
      (h) => h.repository_full_name === repoFullName,
    );

  // Sort newest first
  results.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return results;
}

// ─── State Transitions ──────────────────────────────────────────────────────────────

/**
 * Transition a handoff to a new state with validation.
 */
export function transitionHandoff(
  handoff_id: string,
  toState: HandoffState,
  options: TransitionOptions = {},
): TransitionResult {
  const handoff = getHandoff(handoff_id);
  if (!handoff) {
    throw new Error(`Handoff not found: ${handoff_id}`);
  }

  const fromState = handoff.status;

  // Validate transition
  if (!isValidTransition(fromState, toState)) {
    throw new Error(
      `Invalid state transition: ${fromState} → ${toState}`,
    );
  }

  // Build state change record
  const stateChange: StateChange = {
    change_id: crypto.randomUUID(),
    handoff_id,
    from_state: fromState,
    to_state: toState,
    reason: options.reason ?? "unknown",
    triggered_by: options.triggeredBy ?? "system",
    comment_id: options.commentId ?? null,
    metadata: options.metadata ?? {},
    created_at: new Date().toISOString(),
  };

  // Build updates
  const now = new Date().toISOString();
  const updates: Partial<Handoff> = {
    status: toState,
    updated_at: now,
  };

  switch (toState) {
    case HandoffStates.ACTIVE:
      updates.in_progress_at = now;
      break;
    case HandoffStates.COMPLETED:
      updates.completed_at = now;
      break;
    case HandoffStates.FAILED:
      updates.failed_at = now;
      updates.failure_reason = options.reason ?? "error:unknown";
      break;
  }

  // Apply in-memory
  const updatedHandoff: Handoff = { ...handoff, ...updates } as Handoff;
  inMemoryHandoffs.set(handoff_id, updatedHandoff);

  const changes = inMemoryStateChanges.get(handoff_id) ?? [];
  changes.push(stateChange);
  inMemoryStateChanges.set(handoff_id, changes);

  return { handoff: updatedHandoff, stateChange };
}

// ─── Convenience transition methods ───────────────────────────────────────────────

/**
 * Accept a handoff (pending → active).
 */
export function acceptHandoff(
  handoff_id: string,
  acceptedBy?: string,
): Handoff | null {
  const handoff = getHandoff(handoff_id);
  if (!handoff) return null;

  const result = transitionHandoff(
    handoff_id,
    HandoffStates.ACTIVE as HandoffState,
    {
      reason: TransitionReasons.AGENT_ACCEPTED,
      triggeredBy: acceptedBy ?? "system",
      metadata: { acceptedBy },
    },
  );

  return result.handoff;
}

/**
 * Complete a handoff.
 * Fast-tracks through active if still pending.
 */
export function completeHandoff(
  handoff_id: string,
  outputs?: Record<string, unknown>,
): Handoff | null {
  const handoff = getHandoff(handoff_id);
  if (!handoff) return null;

  // Fast-track: if still pending, transition to active first
  if (handoff.status === HandoffStates.PENDING) {
    transitionHandoff(
      handoff_id,
      HandoffStates.ACTIVE as HandoffState,
      {
        reason: TransitionReasons.AGENT_ACCEPTED,
        triggeredBy: "system",
      },
    );
  }

  if (outputs) {
    updateHandoff(handoff_id, { outputs });
  }

  const result = transitionHandoff(
    handoff_id,
    HandoffStates.COMPLETED as HandoffState,
    {
      reason: TransitionReasons.WORK_COMPLETED,
      triggeredBy: "system",
    },
  );

  return result.handoff;
}

/**
 * Fail a handoff.
 */
export function failHandoff(
  handoff_id: string,
  reason = "unknown",
): Handoff {
  const result = transitionHandoff(
    handoff_id,
    HandoffStates.FAILED as HandoffState,
    {
      reason,
      triggeredBy: "system",
    },
  );

  return result.handoff;
}

/**
 * Abandon a handoff (maps to failed with reason="abandoned:...").
 * Backward compat with handoff-tracker.abandonHandoff().
 */
export function abandonHandoff(
  handoff_id: string,
  reason = "PR closed or cancelled",
): Handoff {
  return failHandoff(handoff_id, `abandoned:${reason}`);
}

// ─── Update ─────────────────────────────────────────────────────────────────────────

/**
 * Update handoff fields (non-state fields).
 */
export function updateHandoff(
  handoff_id: string,
  updates: Partial<Handoff>,
): Handoff | null {
  const handoff = inMemoryHandoffs.get(handoff_id);
  if (!handoff) return null;

  const safeColumns = [
    "task",
    "context",
    "priority",
    "outputs",
    "blockers",
    "completed_work",
    "dependencies",
    "metadata",
    "worktree_id",
    "worktree_path",
    "session_id",
  ] as const;

  const safeUpdates: Record<string, unknown> = {};
  for (const key of safeColumns) {
    if (key in updates) {
      safeUpdates[key] = updates[key as keyof Handoff];
    }
  }

  const updated: Handoff = {
    ...handoff,
    ...safeUpdates,
    updated_at: new Date().toISOString(),
  } as Handoff;

  inMemoryHandoffs.set(handoff_id, updated);
  return updated;
}

// ─── State History ──────────────────────────────────────────────────────────────────

/** Get state change history for a handoff. */
export function getStateChangeHistory(handoff_id: string): StateChange[] {
  return inMemoryStateChanges.get(handoff_id) ?? [];
}

// ─── SLA Tracking ───────────────────────────────────────────────────────────────────

/**
 * Check if a handoff is overdue (computed property, not stored state).
 */
export function isOverdue(handoff: Handoff): boolean {
  if (isTerminalState(handoff.status)) return false;
  if (!handoff.sla_deadline) return false;
  return new Date(handoff.sla_deadline) < new Date();
}

/**
 * Get active (non-terminal) handoffs.
 */
export function getActiveHandoffs(): Handoff[] {
  const all = listHandoffs();
  return all.filter((h) => !isTerminalState(h.status));
}

// ─── Statistics ─────────────────────────────────────────────────────────────────────

/**
 * Get handoff statistics.
 */
export function getHandoffStats(): HandoffStats {
  const allHandoffs = Array.from(inMemoryHandoffs.values());

  const byStatus: Partial<Record<HandoffState, number>> = {};
  for (const state of Object.values(HandoffStates)) {
    byStatus[state as HandoffState] = allHandoffs.filter(
      (h) => h.status === state,
    ).length;
  }

  const priorityCounts = new Map<string, number>();
  for (const handoff of allHandoffs) {
    const key = handoff.priority;
    priorityCounts.set(key, (priorityCounts.get(key) ?? 0) + 1);
  }
  const byPriority: Partial<Record<string, number>> = Object.fromEntries(priorityCounts);

  const completed = allHandoffs.filter(
    (h) =>
      h.status === HandoffStates.COMPLETED && h.completed_at != null,
  );

  let avgCompletionTime: number | null = null;
  if (completed.length > 0) {
    const totalTime = completed.reduce((sum, h) => {
      return (
        sum +
        (new Date(h.completed_at!).getTime() -
          new Date(h.created_at).getTime())
      );
    }, 0);
    avgCompletionTime = Math.round(totalTime / completed.length);
  }

  let slaComplianceRate = 0;
  if (completed.length > 0) {
    const withinSla = completed.filter((h) => {
      if (!h.sla_deadline) return true;
      return (
        new Date(h.completed_at!).getTime() <=
        new Date(h.sla_deadline).getTime()
      );
    }).length;
    slaComplianceRate =
      Math.round((withinSla / completed.length) * 10000) / 100;
  }

  return {
    total: allHandoffs.length,
    byStatus,
    byPriority,
    avgCompletionTime,
    slaComplianceRate,
  };
}

// ─── Cleanup ────────────────────────────────────────────────────────────────────────

/** Clear all handoffs (for testing). */
export function clearAllHandoffs(): void {
  inMemoryHandoffs.clear();
  inMemoryStateChanges.clear();
}

/**
 * Clean up old completed/failed handoffs.
 */
export function cleanupOldHandoffs(maxAgeHours = 168): number {
  const cutoff = new Date(Date.now() - maxAgeHours * 3_600_000);
  let cleaned = 0;

  for (const [id, handoff] of inMemoryHandoffs.entries()) {
    if (
      isTerminalState(handoff.status) &&
      new Date(handoff.created_at) < cutoff
    ) {
      inMemoryHandoffs.delete(id);
      inMemoryStateChanges.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────────

/**
 * Map old tracker states to the 4-state FSM.
 * "created"/"initiated" → "pending", "accepted" → "active",
 * "rejected"/"abandoned" → "failed", "overdue" → null (computed)
 */
function mapTrackerState(state: string | undefined): string | undefined {
  if (!state) return undefined;
  const stateMap: Record<string, string | undefined> = {
    created: HandoffStates.PENDING,
    initiated: HandoffStates.PENDING,
    accepted: HandoffStates.ACTIVE,
    rejected: HandoffStates.FAILED,
    completed: HandoffStates.COMPLETED,
    abandoned: HandoffStates.FAILED,
    overdue: undefined,
  };
  return stateMap[state] ?? state;
}

// ─── Re-exports ─────────────────────────────────────────────────────────────────────

export {
  HandoffStates,
  TransitionReasons,
  isValidTransition,
  isTerminalState,
  getAllowedNextStates,
};
