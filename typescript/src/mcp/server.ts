#!/usr/bin/env node
/**
 * MCP (Model Context Protocol) Server for AgentCraftworks
 *
 * Exposes workflow operations to VS Code / GitHub Copilot via stdio transport.
 * Provides 6 tools: create_handoff, accept_handoff, complete_handoff,
 * query_workflow_state, attach_context, get_context.
 *
 * Usage: node --import tsx src/mcp/server.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  createHandoff,
  getHandoff,
  listHandoffs,
  acceptHandoff,
  completeHandoff,
  initHandoffService,
} from "../services/handoff-service.js";

import {
  createContext,
  getContext,
  queryContexts,
  initContextService,
} from "../services/context-service.js";

import type {
  CreateHandoffToolInput,
  AcceptHandoffToolInput,
  CompleteHandoffToolInput,
  QueryWorkflowStateToolInput,
  AttachContextToolInput,
  GetContextToolInput,
} from "./types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ─── Server instance ───────────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "agent-craftworks",
    version: "1.0.0-ts",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── Tool definitions ──────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_handoff",
        description:
          "Create a new agent handoff to delegate work to another agent",
        inputSchema: {
          type: "object" as const,
          properties: {
            to_agent: {
              type: "string" as const,
              description:
                "Name of the agent to hand off to (e.g., @code-reviewer, @security-specialist)",
            },
            task: {
              type: "string" as const,
              description: "Description of the task to be completed",
            },
            context: {
              type: "string" as const,
              description:
                "Additional context or background information for the receiving agent",
            },
            priority: {
              type: "string" as const,
              enum: ["low", "medium", "high", "critical"],
              description: "Priority level of the handoff",
              default: "medium",
            },
            repository: {
              type: "string" as const,
              description: "Repository full name (owner/repo)",
            },
            issue_number: {
              type: "number" as const,
              description:
                "GitHub issue number associated with this handoff",
            },
            sla_hours: {
              type: "number" as const,
              description: "SLA deadline in hours (optional)",
            },
          },
          required: ["to_agent", "task", "repository", "issue_number"],
        },
      },
      {
        name: "accept_handoff",
        description:
          "Accept a handoff as the receiving agent and start working on it",
        inputSchema: {
          type: "object" as const,
          properties: {
            handoff_id: {
              type: "string" as const,
              description: "Unique ID of the handoff to accept",
            },
            agent_name: {
              type: "string" as const,
              description: "Name of the agent accepting the handoff",
            },
            notes: {
              type: "string" as const,
              description: "Optional notes or acknowledgment message",
            },
          },
          required: ["handoff_id", "agent_name"],
        },
      },
      {
        name: "complete_handoff",
        description: "Mark a handoff as completed with results",
        inputSchema: {
          type: "object" as const,
          properties: {
            handoff_id: {
              type: "string" as const,
              description: "Unique ID of the handoff to complete",
            },
            agent_name: {
              type: "string" as const,
              description: "Name of the agent completing the handoff",
            },
            outputs: {
              type: "object" as const,
              description:
                "Results or outputs from completing the task",
              properties: {
                summary: {
                  type: "string" as const,
                  description: "Summary of work completed",
                },
                deliverables: {
                  type: "array" as const,
                  items: { type: "string" as const },
                  description:
                    "List of deliverables (e.g., PR URLs, file paths)",
                },
                notes: {
                  type: "string" as const,
                  description: "Additional notes or observations",
                },
              },
            },
          },
          required: ["handoff_id", "agent_name"],
        },
      },
      {
        name: "query_workflow_state",
        description:
          "Query the current state of handoffs and workflows",
        inputSchema: {
          type: "object" as const,
          properties: {
            handoff_id: {
              type: "string" as const,
              description:
                "Specific handoff ID to query (optional)",
            },
            status: {
              type: "string" as const,
              enum: [
                "pending",
                "active",
                "completed",
                "failed",
              ],
              description: "Filter by handoff status (optional)",
            },
            to_agent: {
              type: "string" as const,
              description: "Filter by receiving agent (optional)",
            },
            repository: {
              type: "string" as const,
              description:
                "Filter by repository full name (optional)",
            },
          },
        },
      },
      {
        name: "attach_context",
        description:
          "Attach structured typed data to a handoff (e.g., security findings, code reviews, test results)",
        inputSchema: {
          type: "object" as const,
          properties: {
            handoff_id: {
              type: "string" as const,
              description: "ID of the handoff to attach context to",
            },
            schema_name: {
              type: "string" as const,
              description:
                "Schema name (e.g., security-finding, code-review, test-result)",
            },
            data: {
              type: "object" as const,
              description:
                "Structured data conforming to the schema",
            },
            created_by: {
              type: "string" as const,
              description: "Name of the agent creating this context",
            },
          },
          required: ["handoff_id", "schema_name", "data", "created_by"],
        },
      },
      {
        name: "get_context",
        description:
          "Retrieve structured context data attached to handoffs",
        inputSchema: {
          type: "object" as const,
          properties: {
            handoff_id: {
              type: "string" as const,
              description:
                "Filter by handoff ID (optional)",
            },
            schema_name: {
              type: "string" as const,
              description:
                "Filter by schema name (optional)",
            },
            context_id: {
              type: "string" as const,
              description:
                "Get a specific context by ID (optional)",
            },
          },
        },
      },
    ],
  };
});

// ─── Tool handler dispatch ──────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_handoff":
        return handleCreateHandoff(args as unknown as CreateHandoffToolInput);

      case "accept_handoff":
        return handleAcceptHandoff(args as unknown as AcceptHandoffToolInput);

      case "complete_handoff":
        return handleCompleteHandoff(
          args as unknown as CompleteHandoffToolInput,
        );

      case "query_workflow_state":
        return handleQueryWorkflowState(
          args as unknown as QueryWorkflowStateToolInput,
        );

      case "attach_context":
        return handleAttachContext(args as unknown as AttachContextToolInput);

      case "get_context":
        return handleGetContext(args as unknown as GetContextToolInput);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);

    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// ─── Tool handlers ────────────────────────────────────────────────────────────────────

function handleCreateHandoff(
  args: CreateHandoffToolInput,
): CallToolResult {
  const {
    to_agent,
    task,
    context,
    priority = "medium",
    repository,
    issue_number,
    sla_hours,
  } = args;

  // Calculate SLA deadline if provided
  let sla_deadline: string | null = null;
  if (sla_hours != null) {
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + sla_hours);
    sla_deadline = deadline.toISOString();
  }

  const handoff = createHandoff(
    {
      to_agent,
      task,
      context: context ?? "",
      priority,
      sla: sla_hours,
    },
    {
      repository_full_name: repository,
      issue_number,
      from_agent: "mcp-client",
      sla_deadline: sla_deadline ?? undefined,
    },
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            handoff_id: handoff.handoff_id,
            status: handoff.status,
            to_agent: handoff.to_agent,
            task: handoff.task,
            priority: handoff.priority,
            sla_deadline: handoff.sla_deadline,
            created_at: handoff.created_at,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function handleAcceptHandoff(
  args: AcceptHandoffToolInput,
): CallToolResult {
  const { handoff_id, agent_name, notes } = args;

  const handoff = getHandoff(handoff_id);
  if (!handoff) {
    throw new Error(`Handoff ${handoff_id} not found`);
  }

  const updated = acceptHandoff(handoff_id, agent_name);
  if (!updated) {
    throw new Error(`Failed to accept handoff ${handoff_id}`);
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            handoff_id: updated.handoff_id,
            status: updated.status,
            agent: agent_name,
            task: updated.task,
            accepted_at: updated.updated_at,
            notes,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function handleCompleteHandoff(
  args: CompleteHandoffToolInput,
): CallToolResult {
  const { handoff_id, agent_name, outputs } = args;

  const handoff = getHandoff(handoff_id);
  if (!handoff) {
    throw new Error(`Handoff ${handoff_id} not found`);
  }

  const outputsRecord: Record<string, unknown> | undefined =
    outputs ? { ...outputs } : undefined;

  const updated = completeHandoff(handoff_id, outputsRecord);
  if (!updated) {
    throw new Error(`Failed to complete handoff ${handoff_id}`);
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            handoff_id: updated.handoff_id,
            status: updated.status,
            agent: agent_name,
            task: updated.task,
            outputs: updated.outputs,
            completed_at: updated.updated_at,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function handleQueryWorkflowState(
  args: QueryWorkflowStateToolInput,
): CallToolResult {
  const { handoff_id, status, to_agent, repository } = args;

  // If a specific handoff_id was given, return that single handoff
  if (handoff_id) {
    const handoff = getHandoff(handoff_id);
    if (!handoff) {
      throw new Error(`Handoff ${handoff_id} not found`);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              handoff_id: handoff.handoff_id,
              status: handoff.status,
              from_agent: handoff.from_agent,
              to_agent: handoff.to_agent,
              task: handoff.task,
              priority: handoff.priority,
              created_at: handoff.created_at,
              updated_at: handoff.updated_at,
              sla_deadline: handoff.sla_deadline,
              repository: handoff.repository_full_name,
              issue_number: handoff.issue_number,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // Otherwise, list handoffs with filters
  const filters: Record<string, string> = {};
  if (status) filters["status"] = status;
  if (to_agent) filters["to_agent"] = to_agent;
  if (repository) filters["repository_full_name"] = repository;

  const handoffs = listHandoffs(filters);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            count: handoffs.length,
            filters,
            handoffs: handoffs.map((h) => ({
              handoff_id: h.handoff_id,
              status: h.status,
              from_agent: h.from_agent,
              to_agent: h.to_agent,
              task: h.task,
              priority: h.priority,
              created_at: h.created_at,
              repository: h.repository_full_name,
              issue_number: h.issue_number,
            })),
          },
          null,
          2,
        ),
      },
    ],
  };
}

function handleAttachContext(
  args: AttachContextToolInput,
): CallToolResult {
  const { handoff_id, schema_name, data, created_by } = args;

  // Verify handoff exists
  const handoff = getHandoff(handoff_id);
  if (!handoff) {
    throw new Error(`Handoff ${handoff_id} not found`);
  }

  // Create context with validation
  const context = createContext({
    schema_name,
    data,
    created_by,
    handoff_id,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            context_id: context.id,
            handoff_id: context.handoff_id,
            schema_name: context.schema_name,
            schema_version: context.schema_version,
            created_by: context.created_by,
            created_at: context.created_at,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function handleGetContext(
  args: GetContextToolInput,
): CallToolResult {
  const { handoff_id, schema_name, context_id } = args;

  // If a specific context_id was given, return that single context
  if (context_id) {
    const context = getContext(context_id);
    if (!context) {
      throw new Error(`Context ${context_id} not found`);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              count: 1,
              contexts: [context],
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // Otherwise, query with filters
  const contexts = queryContexts({
    handoff_id,
    schema_name,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            count: contexts.length,
            contexts,
          },
          null,
          2,
        ),
      },
    ],
  };
}

// ─── Exports (for testing) ────────────────────────────────────────────────────────────

export {
  server,
  handleCreateHandoff,
  handleAcceptHandoff,
  handleCompleteHandoff,
  handleQueryWorkflowState,
  handleAttachContext,
  handleGetContext,
};

// ─── Main entrypoint ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Initialize services for standalone use
  initHandoffService();
  initContextService();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("AgentCraftworks MCP server (TypeScript) running on stdio");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  void server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  void server.close();
  process.exit(0);
});

// Only run main if this is the entrypoint (not imported for tests).
// Accept both "/" and "\" so the check also works on Windows paths.
const isMainModule =
  typeof process.argv[1] === "string" &&
  /mcp[\\/]server/.test(process.argv[1]);

if (isMainModule) {
  main().catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`MCP server failed to start: ${msg}`);
    process.exit(1);
  });
}
