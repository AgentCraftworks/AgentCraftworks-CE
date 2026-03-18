/**
 * CI Doctor — Investigates CI failures, analyzes logs, identifies root causes.
 *
 * Deep-dives into workflow run failures, categorizes them by type
 * (Type Error, Test Failure, Build Error, etc.), extracts relevant log snippets,
 * and creates diagnostic issues with remediation steps.
 *
 * Environment variables:
 *   GITHUB_TOKEN     — GitHub token for API access
 *   WORKFLOW_RUN_ID  — ID of the failed workflow run
 *   REPOSITORY       — owner/repo string
 *
 * Engagement Level: T2 (Advisor) — creates diagnostic issues, no code modifications.
 */

import { Octokit } from "@octokit/rest";

interface FailureCategory {
  name: string;
  pattern: RegExp;
  severity: "critical" | "high" | "medium" | "low";
  remediation: string[];
  labels: string[];
}

const FAILURE_CATEGORIES: FailureCategory[] = [
  {
    name: "Type Error",
    pattern: /error TS\d+:|Type '.*' is not assignable|Property '.*' does not exist/i,
    severity: "high",
    remediation: [
      "Run `npm run type-check` locally to see all type errors",
      "Check for missing type imports or incorrect generic parameters",
      "Verify interface/type definitions match expected shapes",
      "Consider using type assertions if the type is correct but inferred wrong",
    ],
    labels: ["bug", "typescript", "ci-failure"],
  },
  {
    name: "Test Failure",
    pattern: /FAIL|AssertionError|Expected .* but received|test failed|✗/i,
    severity: "high",
    remediation: [
      "Run `npm test` locally to reproduce the failure",
      "Check for snapshot mismatches — update with `npm test -- -u`",
      "Verify mock data matches expected format",
      "Check for async/timing issues in tests",
    ],
    labels: ["bug", "testing", "ci-failure"],
  },
  {
    name: "Build Error",
    pattern: /esbuild.*error|Cannot find module|Module not found|Build failed/i,
    severity: "critical",
    remediation: [
      "Run `npm ci && npm run build` locally",
      "Check import paths for typos or missing extensions",
      "Verify all dependencies are in package.json",
      "Check for circular dependencies with `madge --circular`",
    ],
    labels: ["bug", "build", "ci-failure"],
  },
  {
    name: "Lint Error",
    pattern: /eslint|prettier.*error|Parsing error|Unexpected token/i,
    severity: "medium",
    remediation: [
      "Run `npx eslint . --fix` to auto-fix issues",
      "Run `npx prettier --write .` to fix formatting",
      "Check for syntax errors in recent changes",
      "Ensure ESLint config matches project standards",
    ],
    labels: ["code-quality", "ci-failure"],
  },
  {
    name: "Dependency Error",
    pattern: /npm ERR!|ERESOLVE|peer dep|Could not resolve dependency/i,
    severity: "high",
    remediation: [
      "Delete `node_modules` and `package-lock.json`",
      "Run `npm install` to regenerate lock file",
      "Check for peer dependency conflicts",
      "Consider using `--legacy-peer-deps` if needed",
    ],
    labels: ["dependencies", "ci-failure"],
  },
  {
    name: "Memory Error",
    pattern: /FATAL ERROR|heap out of memory|JavaScript heap/i,
    severity: "critical",
    remediation: [
      "Increase Node memory: `NODE_OPTIONS=--max-old-space-size=4096`",
      "Check for memory leaks in tests",
      "Split large operations into smaller chunks",
      "Profile memory usage with `--inspect`",
    ],
    labels: ["performance", "ci-failure"],
  },
  {
    name: "Timeout Error",
    pattern: /timeout|timed out|exceeded.*time|ETIMEDOUT/i,
    severity: "medium",
    remediation: [
      "Check for infinite loops or blocking operations",
      "Increase test timeout if operations are legitimately slow",
      "Add proper async/await handling",
      "Consider adding retry logic for flaky network calls",
    ],
    labels: ["performance", "ci-failure"],
  },
  {
    name: "Permission Error",
    pattern: /EACCES|permission denied|403 Forbidden|EPERM/i,
    severity: "high",
    remediation: [
      "Check GitHub token permissions",
      "Verify workflow has required secrets configured",
      "Check file system permissions in CI environment",
      "Review GITHUB_TOKEN scope in workflow file",
    ],
    labels: ["security", "ci-failure"],
  },
];

interface DiagnosticResult {
  category: FailureCategory;
  matchedLines: string[];
  context: string;
}

function extractLogSnippet(logs: string, pattern: RegExp, contextLines = 3): string {
  const lines = logs.split("\n");
  const matchIndices: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i] ?? "")) {
      matchIndices.push(i);
    }
  }

  if (matchIndices.length === 0) return "";

  // Get first match with context
  const firstMatch = matchIndices[0]!;
  const start = Math.max(0, firstMatch - contextLines);
  const end = Math.min(lines.length, firstMatch + contextLines + 1);

  return lines.slice(start, end).join("\n");
}

function diagnoseFailures(logs: string): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];

  for (const category of FAILURE_CATEGORIES) {
    if (category.pattern.test(logs)) {
      const matchedLines = logs.split("\n").filter((line) => category.pattern.test(line));
      const context = extractLogSnippet(logs, category.pattern);

      results.push({
        category,
        matchedLines: matchedLines.slice(0, 5), // Limit to first 5 matches
        context,
      });
    }
  }

  return results;
}

async function main(): Promise<void> {
  const token = process.env["GITHUB_TOKEN"];
  const runId = process.env["WORKFLOW_RUN_ID"];
  const repository = process.env["REPOSITORY"];

  if (!token || !runId || !repository) {
    console.log("CI Doctor: Missing required environment variables. Skipping.");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("CI Doctor: Invalid REPOSITORY format. Expected owner/repo.");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });
  const runIdNum = parseInt(runId, 10);

  // Fetch workflow run
  const { data: run } = await octokit.actions.getWorkflowRun({
    owner,
    repo,
    run_id: runIdNum,
  });

  if (run.conclusion !== "failure") {
    console.log(`CI Doctor: Run ${runId} did not fail (${run.conclusion}). Skipping.`);
    return;
  }

  // Fetch jobs for this run
  const { data: jobsData } = await octokit.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: runIdNum,
  });

  const failedJobs = jobsData.jobs.filter((j) => j.conclusion === "failure");

  // Fetch logs
  let logContent = "";
  try {
    const { data } = await octokit.actions.downloadWorkflowRunLogs({
      owner,
      repo,
      run_id: runIdNum,
    });
    logContent = typeof data === "string" ? data : String(data);
  } catch {
    console.log("CI Doctor: Could not download logs. Using job info only.");
  }

  // Diagnose failures
  const diagnostics = diagnoseFailures(logContent);

  // Determine overall severity
  const severities = diagnostics.map((d) => d.category.severity);
  const overallSeverity = severities.includes("critical")
    ? "critical"
    : severities.includes("high")
      ? "high"
      : severities.includes("medium")
        ? "medium"
        : "low";

  // Collect all labels
  const allLabels = new Set<string>(["ci-doctor"]);
  for (const d of diagnostics) {
    d.category.labels.forEach((l) => allLabels.add(l));
  }

  // Build issue body
  const lines: string[] = [
    "## 🏥 CI Doctor Diagnostic Report",
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Workflow** | ${run.name} |`,
    `| **Run** | [#${run.run_number}](${run.html_url}) |`,
    `| **Branch** | \`${run.head_branch}\` |`,
    `| **Commit** | \`${run.head_sha.slice(0, 7)}\` |`,
    `| **Severity** | ${overallSeverity.toUpperCase()} |`,
    `| **Failed Jobs** | ${failedJobs.length} |`,
    "",
  ];

  if (diagnostics.length > 0) {
    lines.push("## 🔍 Identified Issues", "");

    for (const diag of diagnostics) {
      lines.push(`### ${diag.category.severity === "critical" ? "🚨" : "⚠️"} ${diag.category.name}`);
      lines.push("");

      if (diag.matchedLines.length > 0) {
        lines.push("**Error excerpts:**");
        lines.push("```");
        lines.push(diag.matchedLines.slice(0, 3).join("\n"));
        lines.push("```");
        lines.push("");
      }

      lines.push("**Remediation steps:**");
      for (const step of diag.category.remediation) {
        lines.push(`- [ ] ${step}`);
      }
      lines.push("");
    }
  } else {
    lines.push(
      "## ❓ Unknown Failure",
      "",
      "No specific failure pattern was detected. Manual investigation required.",
      "",
      `Please review the [workflow logs](${run.html_url}) directly.`,
      "",
    );
  }

  if (failedJobs.length > 0) {
    lines.push("## 📋 Failed Jobs", "");
    for (const job of failedJobs) {
      lines.push(`- ❌ **${job.name}** — [View logs](${job.html_url ?? run.html_url})`);
    }
    lines.push("");
  }

  lines.push(
    "---",
    "*Generated by GH-AW CI Doctor — Engagement Level: T2 (Advisor)*",
  );

  const body = lines.join("\n");
  const title = `🏥 CI Failure: ${run.name} #${run.run_number} — ${overallSeverity.toUpperCase()}`;

  // Check for existing open diagnostic issue to avoid duplicates
  const { data: existingIssues } = await octokit.issues.listForRepo({
    owner,
    repo,
    state: "open",
    labels: "ci-doctor",
    per_page: 10,
  });

  const duplicateIssue = existingIssues.find((issue) =>
    issue.title.includes(`#${run.run_number}`)
  );

  if (duplicateIssue) {
    console.log(`CI Doctor: Diagnostic issue already exists (#${duplicateIssue.number}). Skipping.`);
    return;
  }

  // Create diagnostic issue
  const { data: issue } = await octokit.issues.create({
    owner,
    repo,
    title,
    body,
    labels: Array.from(allLabels),
  });

  console.log(`CI Doctor: Created diagnostic issue #${issue.number}`);

  // If there's an associated PR, add a comment linking to the diagnostic
  const prs = run.pull_requests ?? [];
  if (prs.length > 0) {
    const prNumber = prs[0]!.number;
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: `🏥 **CI Doctor** has created a diagnostic report for this failure: #${issue.number}`,
    });
    console.log(`CI Doctor: Linked diagnostic to PR #${prNumber}`);
  }
}

main().catch((err: unknown) => {
  console.error("CI Doctor failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
