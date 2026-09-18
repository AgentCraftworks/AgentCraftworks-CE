/**
 * Context Service
 *
 * Manages structured context data attached to handoffs.
 * Enables agents to pass typed data (security findings, code reviews, test results)
 * instead of plain text descriptions.
 *
 * Features:
 * - JSON Schema validation on write
 * - CRUD operations for contexts
 * - Schema registry management
 * - Backed by the shared HandoffStore (in-memory by default)
 */

import Ajv, { type JSONSchemaType } from "ajv";
import crypto from "node:crypto";
import type {
  Context,
  ContextSchema,
  CreateContextInput,
  RegisterSchemaInput,
  ContextFilters,
} from "../types/context.js";
import { BUILT_IN_SCHEMAS } from "./context-schemas.js";
import {
  getDefaultStore,
  type HandoffStore,
} from "../store/handoff-store.js";

// ─── Storage ────────────────────────────────────────────────────────────────────────

let configuredStore: HandoffStore | null = null;

function store(): HandoffStore {
  return configuredStore ?? getDefaultStore();
}

// ─── JSON Schema validator ──────────────────────────────────────────────────────────

const ajv = new Ajv({ allErrors: true, strict: true });

// ─── Init ───────────────────────────────────────────────────────────────────────────

/**
 * Initialize the context service and register built-in schemas.
 * Community Edition uses the in-memory store unless a custom `store` is supplied.
 */
export function initContextService(options: { store?: HandoffStore } = {}): void {
  configuredStore = options.store ?? null;

  // Register built-in schemas
  for (const schemaInput of BUILT_IN_SCHEMAS) {
    registerSchema(schemaInput);
  }
}

// ─── Schema Registry ───────────────────────────────────────────────────────────────

/**
 * Register a new context schema
 */
export function registerSchema(input: RegisterSchemaInput): ContextSchema {
  const now = new Date().toISOString();

  // Check if schema already exists
  if (store().getSchema(input.name)) {
    throw new Error(`Schema '${input.name}' already registered`);
  }

  // Validate that the json_schema is a valid JSON Schema
  try {
    ajv.compile(input.json_schema);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON Schema: ${message}`);
  }

  const schema: ContextSchema = {
    name: input.name,
    version: input.version,
    json_schema: input.json_schema,
    description: input.description,
    created_at: now,
    updated_at: now,
  };

  store().setSchema(schema.name, schema);
  return schema;
}

/**
 * Get a schema by name
 */
export function getSchema(name: string): ContextSchema | null {
  return store().getSchema(name);
}

/**
 * List all registered schemas
 */
export function listSchemas(): ContextSchema[] {
  return store().listSchemas();
}

// ─── Context CRUD ───────────────────────────────────────────────────────────────────

/**
 * Create a new context with schema validation
 */
export function createContext(input: CreateContextInput): Context {
  // Get the schema
  const schema = store().getSchema(input.schema_name);
  if (!schema) {
    throw new Error(`Schema '${input.schema_name}' not found`);
  }

  // Validate data against schema
  const validate = ajv.compile(schema.json_schema);
  const valid = validate(input.data);

  if (!valid) {
    const errors = validate.errors
      ?.map((e) => `${e.instancePath} ${e.message}`)
      .join(", ");
    throw new Error(`Schema validation failed: ${errors}`);
  }

  const now = new Date().toISOString();
  const context: Context = {
    id: crypto.randomUUID(),
    schema_name: input.schema_name,
    schema_version: schema.version,
    data: input.data,
    created_by: input.created_by,
    handoff_id: input.handoff_id,
    created_at: now,
  };

  store().setContext(context.id, context);
  return context;
}

/**
 * Get a context by ID
 */
export function getContext(id: string): Context | null {
  return store().getContext(id);
}

/**
 * Get all contexts for a handoff
 */
export function getContextsByHandoff(handoff_id: string): Context[] {
  return store()
    .listContexts()
    .filter((c) => c.handoff_id === handoff_id);
}

/**
 * Query contexts with filters
 */
export function queryContexts(filters: ContextFilters): Context[] {
  let results = store().listContexts();

  if (filters.handoff_id) {
    results = results.filter((c) => c.handoff_id === filters.handoff_id);
  }

  if (filters.schema_name) {
    results = results.filter((c) => c.schema_name === filters.schema_name);
  }

  if (filters.created_by) {
    results = results.filter((c) => c.created_by === filters.created_by);
  }

  return results;
}

/**
 * Clear all contexts and schemas (for testing)
 */
export function clearAllContexts(): void {
  store().clearContexts();
}
