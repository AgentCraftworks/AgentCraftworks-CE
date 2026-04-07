/**
 * Plan Command — Creates implementation plans from /plan command in issues.
 *
 * Triggered when a user comments /plan on an issue. Analyzes the issue content,
 * breaks it down into 3-5 actionable sub-issues with clear acceptance criteria,
 * and creates them as linked sub-issues.
 *
 * Environment variables:
 *   GITHUB_TOKEN   — GitHub token for API access
 *   ISSUE_NUMBER   — Parent issue number
 *   REPOSITORY     — owner/repo string
 *
 * Engagement Level: T3 (Peer Programmer) — creates sub-issues with structured content.
 */

import { Octokit } from "@octokit/rest";

interface PlanPattern {
  type: string;
  keywords: string[];
  subTasks: SubTaskTemplate[];
}

interface SubTaskTemplate {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  labels: string[];
  estimatedEffort: "small" | "medium" | "large";
}

const PLAN_PATTERNS: PlanPattern[] = [
  {
    type: "api",
    keywords: ["api", "endpoint", "rest", "graphql", "route", "controller"],
    subTasks: [
      {
        title: "Define API contract and types",
        description: "Create TypeScript interfaces for request/response schemas",
        acceptanceCriteria: [
          "Request type defined with all required/optional fields",
          "Response type defined including error responses",
          "Types exported for client consumption",
        ],
        labels: ["api", "types"],
        estimatedEffort: "small",
      },
      {
        title: "Implement API handler",
        description: "Create the route handler with input validation",
        acceptanceCriteria: [
          "Handler validates all input parameters",
          "Proper error responses for invalid input",
          "Handler calls service layer (no business logic in handler)",
        ],
        labels: ["api", "implementation"],
        estimatedEffort: "medium",
      },
      {
        title: "Add API tests",
        description: "Write integration tests for the endpoint",
        acceptanceCriteria: [
          "Tests cover happy path",
          "Tests cover error cases (400, 401, 404, 500)",
          "Tests verify response schema",
        ],
        labels: ["api", "testing"],
        estimatedEffort: "medium",
      },
      {
        title: "Document API endpoint",
        description: "Add OpenAPI/Swagger documentation",
        acceptanceCriteria: [
          "Endpoint documented with examples",
          "Error responses documented",
          "README updated if needed",
        ],
        labels: ["api", "documentation"],
        estimatedEffort: "small",
      },
    ],
  },
  {
    type: "ui",
    keywords: ["ui", "component", "page", "frontend", "react", "form", "button", "modal"],
    subTasks: [
      {
        title: "Create component structure",
        description: "Set up component files with props interface",
        acceptanceCriteria: [
          "Props interface defined with proper types",
          "Component file created with basic structure",
          "Styles/CSS module created if needed",
        ],
        labels: ["ui", "frontend"],
        estimatedEffort: "small",
      },
      {
        title: "Implement component logic",
        description: "Add state management and event handlers",
        acceptanceCriteria: [
          "State managed correctly (local or global)",
          "Event handlers implemented",
          "Loading and error states handled",
        ],
        labels: ["ui", "implementation"],
        estimatedEffort: "medium",
      },
      {
        title: "Add component tests",
        description: "Write unit and integration tests",
        acceptanceCriteria: [
          "Component renders without errors",
          "User interactions work correctly",
          "Accessibility basics verified (a11y)",
        ],
        labels: ["ui", "testing"],
        estimatedEffort: "medium",
      },
      {
        title: "Add Storybook story",
        description: "Create stories for component variants",
        acceptanceCriteria: [
          "Default story created",
          "Variant stories for different props",
          "Interactive controls configured",
        ],
        labels: ["ui", "documentation"],
        estimatedEffort: "small",
      },
    ],
  },
  {
    type: "bug",
    keywords: ["bug", "fix", "broken", "error", "crash", "regression"],
    subTasks: [
      {
        title: "Reproduce and document bug",
        description: "Create reliable reproduction steps",
        acceptanceCriteria: [
          "Steps to reproduce documented",
          "Expected vs actual behavior documented",
          "Root cause identified",
        ],
        labels: ["bug", "investigation"],
        estimatedEffort: "small",
      },
      {
        title: "Write failing test",
        description: "Create test that demonstrates the bug",
        acceptanceCriteria: [
          "Test fails with current code",
          "Test clearly shows expected behavior",
          "Test is minimal and focused",
        ],
        labels: ["bug", "testing"],
        estimatedEffort: "small",
      },
      {
        title: "Implement fix",
        description: "Fix the root cause",
        acceptanceCriteria: [
          "Root cause addressed (not just symptoms)",
          "No regressions introduced",
          "Code follows project conventions",
        ],
        labels: ["bug", "implementation"],
        estimatedEffort: "medium",
      },
      {
        title: "Verify fix and cleanup",
        description: "Ensure fix works and add any needed docs",
        acceptanceCriteria: [
          "All tests pass",
          "Manual verification completed",
          "Changelog updated if user-facing",
        ],
        labels: ["bug", "verification"],
        estimatedEffort: "small",
      },
    ],
  },
  {
    type: "documentation",
    keywords: ["docs", "documentation", "readme", "guide", "tutorial", "example"],
    subTasks: [
      {
        title: "Audit existing documentation",
        description: "Review current docs and identify gaps",
        acceptanceCriteria: [
          "Existing docs reviewed for accuracy",
          "Missing sections identified",
          "Outdated content flagged",
        ],
        labels: ["documentation", "investigation"],
        estimatedEffort: "small",
      },
      {
        title: "Draft new content",
        description: "Write the new documentation",
        acceptanceCriteria: [
          "Content is accurate and complete",
          "Examples are tested and working",
          "Follows project style guide",
        ],
        labels: ["documentation", "implementation"],
        estimatedEffort: "medium",
      },
      {
        title: "Review and publish",
        description: "Get review and merge changes",
        acceptanceCriteria: [
          "Technical review completed",
          "Links verified",
          "Table of contents updated if needed",
        ],
        labels: ["documentation", "review"],
        estimatedEffort: "small",
      },
    ],
  },
];

const DEFAULT_PLAN: SubTaskTemplate[] = [
  {
    title: "Research and design",
    description: "Understand requirements and design solution",
    acceptanceCriteria: [
      "Requirements documented",
      "Approach documented",
      "Edge cases identified",
    ],
    labels: ["planning"],
    estimatedEffort: "small",
  },
  {
    title: "Implementation",
    description: "Implement the feature/fix",
    acceptanceCriteria: [
      "Code follows project conventions",
      "Types are correct and complete",
      "Error handling implemented",
    ],
    labels: ["implementation"],
    estimatedEffort: "medium",
  },
  {
    title: "Testing",
    description: "Add tests for the changes",
    acceptanceCriteria: [
      "Unit tests added",
      "Integration tests if needed",
      "All tests pass",
    ],
    labels: ["testing"],
    estimatedEffort: "medium",
  },
  {
    title: "Documentation",
    description: "Update relevant documentation",
    acceptanceCriteria: [
      "Code comments where needed",
      "README updated if user-facing",
      "CHANGELOG updated if applicable",
    ],
    labels: ["documentation"],
    estimatedEffort: "small",
  },
];

function detectPattern(content: string): PlanPattern | null {
  const lowerContent = content.toLowerCase();

  for (const pattern of PLAN_PATTERNS) {
    const matchCount = pattern.keywords.filter((kw) => lowerContent.includes(kw)).length;
    if (matchCount >= 2) {
      return pattern;
    }
  }

  return null;
}

function effortToEmoji(effort: string): string {
  switch (effort) {
    case "small":
      return "🟢";
    case "medium":
      return "🟡";
    case "large":
      return "🔴";
    default:
      return "⚪";
  }
}

async function main(): Promise<void> {
  const token = process.env["GITHUB_TOKEN"];
  const issueNumber = process.env["ISSUE_NUMBER"];
  const repository = process.env["REPOSITORY"];

  if (!token || !issueNumber || !repository) {
    console.log("Plan Command: Missing required environment variables. Skipping.");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("Plan Command: Invalid REPOSITORY format. Expected owner/repo.");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });
  const issueNum = parseInt(issueNumber, 10);

  // Fetch parent issue
  const { data: parentIssue } = await octokit.issues.get({
    owner,
    repo,
    issue_number: issueNum,
  });

  const content = `${parentIssue.title} ${parentIssue.body ?? ""}`;
  const pattern = detectPattern(content);
  const subTasks = pattern?.subTasks ?? DEFAULT_PLAN;
  const patternType = pattern?.type ?? "general";

  console.log(`Plan Command: Detected pattern type: ${patternType}`);

  // Create sub-issues
  const createdIssues: Array<{ number: number; title: string }> = [];

  for (let i = 0; i < subTasks.length; i++) {
    const task = subTasks[i]!;
    const subTitle = `[${parentIssue.title}] ${i + 1}/${subTasks.length}: ${task.title}`;

    const subBody = [
      `## 📋 Sub-issue of #${issueNum}`,
      "",
      `**Parent:** ${parentIssue.title}`,
      `**Effort:** ${effortToEmoji(task.estimatedEffort)} ${task.estimatedEffort}`,
      "",
      "---",
      "",
      "## Description",
      "",
      task.description,
      "",
      "## Acceptance Criteria",
      "",
      ...task.acceptanceCriteria.map((ac) => `- [ ] ${ac}`),
      "",
      "---",
      "*Generated by GH-AW Plan Command — Engagement Level: T3 (Peer Programmer)*",
    ].join("\n");

    try {
      const { data: subIssue } = await octokit.issues.create({
        owner,
        repo,
        title: subTitle,
        body: subBody,
        labels: task.labels,
      });

      createdIssues.push({ number: subIssue.number, title: task.title });
      console.log(`Plan Command: Created sub-issue #${subIssue.number}: ${task.title}`);
    } catch (err) {
      console.error(`Plan Command: Failed to create sub-issue: ${task.title}`, err);
    }
  }

  // Post summary comment on parent issue
  const summaryLines = [
    "## 📝 Implementation Plan Generated",
    "",
    `I've created **${createdIssues.length}** sub-issues for this work based on the **${patternType}** pattern.`,
    "",
    "### Sub-Issues",
    "",
    ...createdIssues.map((issue, idx) => `${idx + 1}. #${issue.number} — ${issue.title}`),
    "",
    "### How to Track Progress",
    "",
    "- Work through sub-issues in order",
    "- Check off acceptance criteria as you complete them",
    "- Close sub-issues when done",
    "- This parent issue will be auto-closed when all sub-issues are complete",
    "",
    "---",
    "*Generated by GH-AW Plan Command — Engagement Level: T3 (Peer Programmer)*",
  ];

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNum,
    body: summaryLines.join("\n"),
  });

  // Add 'has-plan' label to parent
  try {
    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: issueNum,
      labels: ["has-plan"],
    });
  } catch {
    // Label might not exist
  }

  console.log(`Plan Command: Posted summary to parent issue #${issueNum}`);
}

main().catch((err: unknown) => {
  console.error("Plan Command failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
