/**
 * Handoff Store
 *
 * Storage abstraction for all Community Edition runtime state:
 * handoffs + their state-change history, per-repository autonomy dial
 * settings, and structured contexts + their schemas.
 *
 * Community Edition ships with `InMemoryHandoffStore` only. State lives in the
 * process and is lost on restart, so the app must run as a single replica.
 * Durable, multi-replica storage is an Enterprise feature; implement this
 * interface to plug in a different backend.
 */

import type { Handoff, StateChange } from "../types/handoff.js";
import type { DialLevel } from "../types/autonomy.js";
import type { Context, ContextSchema } from "../types/context.js";

// ─── Records ────────────────────────────────────────────────────────────────────────

/** Persisted autonomy dial setting for one repository. */
export interface DialRecord {
  repoOwner: string;
  repoName: string;
  dialLevel: DialLevel;
  updatedBy: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

// ─── Interface ──────────────────────────────────────────────────────────────────────

export interface HandoffStore {
  // Handoffs (keyed by handoff_id UUID)
  getHandoff(id: string): Handoff | null;
  setHandoff(id: string, handoff: Handoff): void;
  deleteHandoff(id: string): boolean;
  listHandoffs(): Handoff[];

  // State-change history (keyed by handoff_id)
  getStateChanges(handoffId: string): StateChange[];
  setStateChanges(handoffId: string, changes: StateChange[]): void;
  deleteStateChanges(handoffId: string): boolean;

  // Autonomy dials (keyed by "owner/repo")
  getDial(key: string): DialRecord | null;
  setDial(key: string, record: DialRecord): void;
  deleteDial(key: string): boolean;
  listDials(): DialRecord[];

  // Contexts (keyed by context id UUID)
  getContext(id: string): Context | null;
  setContext(id: string, context: Context): void;
  deleteContext(id: string): boolean;
  listContexts(): Context[];

  // Context schemas (keyed by schema name)
  getSchema(name: string): ContextSchema | null;
  setSchema(name: string, schema: ContextSchema): void;
  deleteSchema(name: string): boolean;
  listSchemas(): ContextSchema[];

  // Bulk clears (used by tests and service reset helpers)
  clearHandoffs(): void;
  clearDials(): void;
  clearContexts(): void;
}

// ─── In-memory implementation ───────────────────────────────────────────────────────

export class InMemoryHandoffStore implements HandoffStore {
  private readonly handoffs = new Map<string, Handoff>();
  private readonly stateChanges = new Map<string, StateChange[]>();
  private readonly dials = new Map<string, DialRecord>();
  private readonly contexts = new Map<string, Context>();
  private readonly schemas = new Map<string, ContextSchema>();

  getHandoff(id: string): Handoff | null {
    return this.handoffs.get(id) ?? null;
  }
  setHandoff(id: string, handoff: Handoff): void {
    this.handoffs.set(id, handoff);
  }
  deleteHandoff(id: string): boolean {
    return this.handoffs.delete(id);
  }
  listHandoffs(): Handoff[] {
    return Array.from(this.handoffs.values());
  }

  getStateChanges(handoffId: string): StateChange[] {
    return this.stateChanges.get(handoffId) ?? [];
  }
  setStateChanges(handoffId: string, changes: StateChange[]): void {
    this.stateChanges.set(handoffId, changes);
  }
  deleteStateChanges(handoffId: string): boolean {
    return this.stateChanges.delete(handoffId);
  }

  getDial(key: string): DialRecord | null {
    return this.dials.get(key) ?? null;
  }
  setDial(key: string, record: DialRecord): void {
    this.dials.set(key, record);
  }
  deleteDial(key: string): boolean {
    return this.dials.delete(key);
  }
  listDials(): DialRecord[] {
    return Array.from(this.dials.values());
  }

  getContext(id: string): Context | null {
    return this.contexts.get(id) ?? null;
  }
  setContext(id: string, context: Context): void {
    this.contexts.set(id, context);
  }
  deleteContext(id: string): boolean {
    return this.contexts.delete(id);
  }
  listContexts(): Context[] {
    return Array.from(this.contexts.values());
  }

  getSchema(name: string): ContextSchema | null {
    return this.schemas.get(name) ?? null;
  }
  setSchema(name: string, schema: ContextSchema): void {
    this.schemas.set(name, schema);
  }
  deleteSchema(name: string): boolean {
    return this.schemas.delete(name);
  }
  listSchemas(): ContextSchema[] {
    return Array.from(this.schemas.values());
  }

  clearHandoffs(): void {
    this.handoffs.clear();
    this.stateChanges.clear();
  }
  clearDials(): void {
    this.dials.clear();
  }
  clearContexts(): void {
    this.contexts.clear();
    this.schemas.clear();
  }
}

// ─── Default store ──────────────────────────────────────────────────────────────────

let defaultStore: HandoffStore = new InMemoryHandoffStore();

/** The store shared by all CE services (in-memory unless replaced). */
export function getDefaultStore(): HandoffStore {
  return defaultStore;
}

/**
 * Replace the shared store. Called by the service `init*` functions when a
 * caller supplies an alternative backend; defaults to `InMemoryHandoffStore`.
 */
export function setDefaultStore(store: HandoffStore): void {
  defaultStore = store;
}
