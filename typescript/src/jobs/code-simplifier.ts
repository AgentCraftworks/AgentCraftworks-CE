/**
 * Code Simplifier — Applies simplification rules to recently modified code.
 *
 * Analyzes code changes and suggests modernization patterns. Creates a draft
 * PR with the simplifications applied for human review.
 *
 * Environment variables:
 *   GITHUB_TOKEN   — GitHub token for API access
 *   REPOSITORY     — owner/repo string
 *   TARGET_BRANCH  — Branch to analyze (defaults to main)
 *   LOOKBACK_DAYS  — Days to look back for recent changes (defaults to 7)
 *
 * Engagement Level: T3 (Collaborator) — creates draft PRs with code changes.
 */

import { Octokit } from "@octokit/rest";
import {
  applySimplifications,
  SIMPLIFICATION_RULES,
  type Simplification,
} from "../utils/code-simplifier-rules.js";

interface FileChange {
  path: string;
  content: string;
  originalSha: string;
  simplifications: Simplification[];
  newContent: string;
}

async function main(): Promise<void> {
  const token = process.env["GITHUB_TOKEN"];
  const repository = process.env["REPOSITORY"];
  const targetBranch = process.env["TARGET_BRANCH"] ?? "main";
  const lookbackDays = parseInt(process.env["LOOKBACK_DAYS"] ?? "7", 10);

  if (!token || !repository) {
    console.log("Code Simplifier: Missing required environment variables. Skipping.");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("Code Simplifier: Invalid REPOSITORY format. Expected owner/repo.");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });

  // Get recent commits
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const { data: commits } = await octokit.repos.listCommits({
    owner,
    repo,
    sha: targetBranch,
    since: since.toISOString(),
    per_page: 50,
  });

  if (commits.length === 0) {
    console.log(`Code Simplifier: No commits in the last ${lookbackDays} days. Skipping.`);
    return;
  }

  // Collect recently modified files
  const modifiedFiles = new Set<string>();

  for (const commit of commits) {
    try {
      const { data: commitData } = await octokit.repos.getCommit({
        owner,
        repo,
        ref: commit.sha,
      });

      for (const file of commitData.files ?? []) {
        if (
          file.status !== "removed" &&
          (file.filename.endsWith(".ts") || file.filename.endsWith(".js") || file.filename.endsWith(".tsx") || file.filename.endsWith(".jsx"))
        ) {
          modifiedFiles.add(file.filename);
        }
      }
    } catch {
      // Skip if can't fetch commit details
    }
  }

  if (modifiedFiles.size === 0) {
    console.log("Code Simplifier: No TypeScript/JavaScript files modified recently. Skipping.");
    return;
  }

  console.log(`Code Simplifier: Found ${modifiedFiles.size} recently modified files.`);

  // Analyze files
  const fileChanges: FileChange[] = [];

  for (const filePath of modifiedFiles) {
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: targetBranch,
      });

      if (Array.isArray(data) || data.type !== "file" || !("content" in data)) continue;

      const content = Buffer.from(data.content, "base64").toString("utf-8");
      const { newContent, simplifications } = applySimplifications(content, filePath);

      if (simplifications.length > 0 && newContent !== content) {
        fileChanges.push({
          path: filePath,
          content,
          originalSha: data.sha,
          simplifications,
          newContent,
        });
      }
    } catch {
      console.log(`Code Simplifier: Could not read ${filePath}. Skipping.`);
    }
  }

  if (fileChanges.length === 0) {
    console.log("Code Simplifier: No simplifications found. Code already looks modern! 🎉");
    return;
  }

  const totalSimplifications = fileChanges.reduce((sum, fc) => sum + fc.simplifications.length, 0);
  console.log(`Code Simplifier: Found ${totalSimplifications} simplifications in ${fileChanges.length} files.`);

  // Create branch
  const branchName = `refactor/code-simplify-${Date.now()}`;

  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${targetBranch}`,
  });

  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: refData.object.sha,
  });

  // Update files
  for (const fileChange of fileChanges) {
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: fileChange.path,
      message: `refactor: simplify ${fileChange.path}`,
      content: Buffer.from(fileChange.newContent).toString("base64"),
      sha: fileChange.originalSha,
      branch: branchName,
    });
  }

  // Build PR body
  const ruleStats = new Map<string, number>();
  for (const fc of fileChanges) {
    for (const s of fc.simplifications) {
      ruleStats.set(s.rule, (ruleStats.get(s.rule) ?? 0) + 1);
    }
  }

  const prBody = [
    "## 🧹 Code Simplifier",
    "",
    `This PR applies **${totalSimplifications}** code modernization patterns to **${fileChanges.length}** files.`,
    "",
    "### Applied Rules",
    "",
    "| Rule | Count | Description |",
    "|------|-------|-------------|",
    ...Array.from(ruleStats.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([rule, count]) => {
        const ruleInfo = SIMPLIFICATION_RULES.find((r) => r.name === rule);
        return `| ${rule} | ${count} | ${ruleInfo?.description ?? ""} |`;
      }),
    "",
    "### Changes by File",
    "",
    ...fileChanges.map((fc) => {
      const lines = [
        `#### \`${fc.path}\` (${fc.simplifications.length} changes)`,
        "",
        ...fc.simplifications.slice(0, 5).map(
          (s) => `- **Line ${s.line}** (${s.rule}): \`${s.before}\` → \`${s.after}\``
        ),
      ];
      if (fc.simplifications.length > 5) {
        lines.push(`- ... and ${fc.simplifications.length - 5} more`);
      }
      lines.push("");
      return lines.join("\n");
    }),
    "### Review Notes",
    "",
    "⚠️ **This is a draft PR** — please review the changes carefully:",
    "",
    "- These changes are not guaranteed behavior-preserving; human review required.",
    "- Test thoroughly before merging",
    "- Feel free to cherry-pick individual changes",
    "",
    "---",
    "*Generated by GH-AW Code Simplifier — Engagement Level: T3 (Collaborator)*",
  ].join("\n");

  // Create draft PR
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: `🧹 Code Simplifier: ${totalSimplifications} modernizations`,
    head: branchName,
    base: targetBranch,
    body: prBody,
    draft: true,
  });

  console.log(`Code Simplifier: Created draft PR #${pr.number}`);
}

main().catch((err: unknown) => {
  console.error("Code Simplifier failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
