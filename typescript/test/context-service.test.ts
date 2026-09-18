/**
 * Tests for Context Service
 * Validates schema registration, context creation, validation, and querying
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  initContextService,
  registerSchema,
  getSchema,
  listSchemas,
  createContext,
  getContext,
  getContextsByHandoff,
  queryContexts,
  clearAllContexts,
} from "../src/services/context-service.js";
import type { RegisterSchemaInput } from "../src/types/context.js";
import type { JSONSchemaType } from "ajv";

describe("Context Service", () => {
  beforeEach(() => {
    clearAllContexts();
    initContextService();
  });

  describe("Schema Registry", () => {
    it("should register built-in schemas on init", () => {
      const schemas = listSchemas();
      assert.ok(schemas.length >= 3, "Should have at least 3 built-in schemas");

      const schemaNames = schemas.map((s) => s.name);
      assert.ok(schemaNames.includes("security-finding"));
      assert.ok(schemaNames.includes("code-review"));
      assert.ok(schemaNames.includes("test-result"));
    });

    it("should get schema by name", () => {
      const schema = getSchema("security-finding");
      assert.ok(schema, "Schema should exist");
      assert.strictEqual(schema.name, "security-finding");
      assert.strictEqual(schema.version, "1.0.0");
      assert.ok(schema.json_schema, "Should have json_schema");
    });

    it("should return null for unknown schema", () => {
      const schema = getSchema("non-existent-schema");
      assert.strictEqual(schema, null);
    });

    it("should register a custom schema", () => {
      interface CustomData {
        message: string;
        count: number;
      }

      const customSchema: JSONSchemaType<CustomData> = {
        type: "object",
        properties: {
          message: { type: "string" },
          count: { type: "number" },
        },
        required: ["message", "count"],
        additionalProperties: false,
      };

      const input: RegisterSchemaInput = {
        name: "custom-schema",
        version: "1.0.0",
        json_schema: customSchema as JSONSchemaType<unknown>,
        description: "A custom schema for testing",
      };

      const registered = registerSchema(input);
      assert.strictEqual(registered.name, "custom-schema");
      assert.strictEqual(registered.version, "1.0.0");

      const retrieved = getSchema("custom-schema");
      assert.ok(retrieved);
      assert.strictEqual(retrieved.name, "custom-schema");
    });

    it("should reject duplicate schema registration", () => {
      interface TestData {
        value: string;
      }

      const schema: JSONSchemaType<TestData> = {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      };

      const input: RegisterSchemaInput = {
        name: "test-duplicate",
        version: "1.0.0",
        json_schema: schema as JSONSchemaType<unknown>,
      };

      registerSchema(input);

      assert.throws(
        () => registerSchema(input),
        /already registered/,
        "Should reject duplicate schema",
      );
    });

    it("should reject invalid JSON Schema", () => {
      const input: RegisterSchemaInput = {
        name: "invalid-schema",
        version: "1.0.0",
        json_schema: { type: "invalid-type" } as unknown as JSONSchemaType<unknown>,
      };

      assert.throws(
        () => registerSchema(input),
        /Invalid JSON Schema/,
        "Should reject invalid schema",
      );
    });
  });

  describe("Context Creation", () => {
    it("should create a valid security finding context", () => {
      const context = createContext({
        schema_name: "security-finding",
        data: {
          severity: "high",
          cwe: "CWE-79",
          file: "src/handler.ts",
          line: 42,
          description: "XSS vulnerability in user input handling",
          remediation: "Sanitize user input before rendering",
        },
        created_by: "@security-agent",
        handoff_id: "123e4567-e89b-12d3-a456-426614174000",
      });

      assert.ok(context.id, "Should have ID");
      assert.strictEqual(context.schema_name, "security-finding");
      assert.strictEqual(context.schema_version, "1.0.0");
      assert.strictEqual(context.created_by, "@security-agent");
      assert.strictEqual(context.data.severity, "high");
    });

    it("should create a valid code review context", () => {
      const context = createContext({
        schema_name: "code-review",
        data: {
          file: "src/service.ts",
          line_start: 10,
          line_end: 15,
          category: "performance",
          suggestion: "Use Map instead of array lookup for better performance",
          severity: "minor",
        },
        created_by: "@code-reviewer",
        handoff_id: "123e4567-e89b-12d3-a456-426614174001",
      });

      assert.strictEqual(context.schema_name, "code-review");
      assert.strictEqual(context.data.category, "performance");
    });

    it("should create a valid test result context", () => {
      const context = createContext({
        schema_name: "test-result",
        data: {
          suite: "HandoffService",
          name: "should create handoff",
          status: "passed",
          duration: 150,
        },
        created_by: "@test-agent",
        handoff_id: "123e4567-e89b-12d3-a456-426614174002",
      });

      assert.strictEqual(context.schema_name, "test-result");
      assert.strictEqual(context.data.status, "passed");
    });

    it("should reject invalid data (missing required field)", () => {
      assert.throws(
        () =>
          createContext({
            schema_name: "security-finding",
            data: {
              severity: "high",
              // Missing required fields: file, line, description, remediation
            },
            created_by: "@security-agent",
            handoff_id: "123e4567-e89b-12d3-a456-426614174000",
          }),
        /Schema validation failed/,
        "Should reject data with missing fields",
      );
    });

    it("should reject invalid data (wrong enum value)", () => {
      assert.throws(
        () =>
          createContext({
            schema_name: "security-finding",
            data: {
              severity: "super-critical", // Invalid enum value
              file: "src/handler.ts",
              line: 42,
              description: "Test",
              remediation: "Test",
            },
            created_by: "@security-agent",
            handoff_id: "123e4567-e89b-12d3-a456-426614174000",
          }),
        /Schema validation failed/,
        "Should reject invalid enum value",
      );
    });

    it("should reject unknown schema", () => {
      assert.throws(
        () =>
          createContext({
            schema_name: "non-existent-schema",
            data: { test: "data" },
            created_by: "@agent",
            handoff_id: "123e4567-e89b-12d3-a456-426614174000",
          }),
        /Schema.*not found/,
        "Should reject unknown schema",
      );
    });
  });

  describe("Context Retrieval", () => {
    const handoffId1 = "123e4567-e89b-12d3-a456-426614174000";
    const handoffId2 = "123e4567-e89b-12d3-a456-426614174001";

    beforeEach(() => {
      // Create test contexts
      createContext({
        schema_name: "security-finding",
        data: {
          severity: "high",
          file: "src/a.ts",
          line: 10,
          description: "Finding 1",
          remediation: "Fix 1",
        },
        created_by: "@security-agent",
        handoff_id: handoffId1,
      });

      createContext({
        schema_name: "security-finding",
        data: {
          severity: "low",
          file: "src/b.ts",
          line: 20,
          description: "Finding 2",
          remediation: "Fix 2",
        },
        created_by: "@security-agent",
        handoff_id: handoffId1,
      });

      createContext({
        schema_name: "code-review",
        data: {
          file: "src/c.ts",
          line_start: 5,
          line_end: 10,
          category: "style",
          suggestion: "Use const instead of let",
          severity: "info",
        },
        created_by: "@code-reviewer",
        handoff_id: handoffId2,
      });
    });

    it("should get context by ID", () => {
      const contexts = getContextsByHandoff(handoffId1);
      const first = contexts[0];
      assert.ok(first);
      const context = getContext(first.id);
      assert.ok(context);
      assert.strictEqual(context.id, first.id);
    });

    it("should return null for unknown ID", () => {
      const context = getContext("non-existent-id");
      assert.strictEqual(context, null);
    });

    it("should get all contexts for a handoff", () => {
      const contexts = getContextsByHandoff(handoffId1);
      assert.strictEqual(contexts.length, 2);
      assert.ok(contexts.every((c) => c.handoff_id === handoffId1));
    });

    it("should query contexts by schema", () => {
      const contexts = queryContexts({ schema_name: "security-finding" });
      assert.strictEqual(contexts.length, 2);
      assert.ok(contexts.every((c) => c.schema_name === "security-finding"));
    });

    it("should query contexts by agent", () => {
      const contexts = queryContexts({ created_by: "@security-agent" });
      assert.strictEqual(contexts.length, 2);
      assert.ok(contexts.every((c) => c.created_by === "@security-agent"));
    });

    it("should query with multiple filters", () => {
      const contexts = queryContexts({
        handoff_id: handoffId1,
        schema_name: "security-finding",
      });
      assert.strictEqual(contexts.length, 2);
    });

    it("should return empty array for no matches", () => {
      const contexts = queryContexts({ handoff_id: "non-existent" });
      assert.strictEqual(contexts.length, 0);
    });
  });
});
