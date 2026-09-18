/**
 * URL Modernizer — Finds outdated URLs in markdown files and applies migrations.
 *
 * Scans markdown files for URLs that match known migration patterns
 * (http->https, docs.microsoft.com->learn.microsoft.com, master->main branch
 * references, etc.) and creates PRs or issues with the suggested updates.
 *
 * Note: This tool does NOT perform live network checks or validate whether URLs
 * resolve successfully. It applies heuristic regex-based replacements for
 * well-known URL migrations only.
 *
 * Environment variables:
 *   GITHUB_TOKEN  — GitHub token for API access
 *   REPOSITORY    — owner/repo string
 *   TARGET_BRANCH — Branch to scan (defaults to main)
 *   CREATE_PR     — If "true", creates a PR with fixes; otherwise creates an issue
 *
 * Engagement Level: T3 (Collaborator) — can create PRs with file edits.
 */

import { Octokit } from "@octokit/rest";
import { isDirectRun, runJob } from "./lib/entrypoint.js";

export interface UrlReplacement {
  pattern: RegExp;
  replacement: string;
  reason: string;
}

export interface OutdatedUrl {
  file: string;
  line: number;
  url: string;
  issue: string;
  suggestedFix?: string;
}

export const URL_REPLACEMENTS: UrlReplacement[] = [
  {
    pattern: /^http:\/\/(?!localhost|127\.0\.0\.1)/,
    replacement: "https://",
    reason: "Upgrade to HTTPS for security",
  },
  {
    pattern: /(?<=https?:\/\/(?:www\.)?)docs\.microsoft\.com(?=\/|$)/g,
    replacement: "learn.microsoft.com",
    reason: "Microsoft Docs migrated to Microsoft Learn",
  },
  {
    pattern: /(?<=https?:\/\/)aka\.ms\/deprecated(?=[?#/\s]|$)/g,
    replacement: "learn.microsoft.com",
    reason: "Deprecated aka.ms link",
  },
  {
    pattern: /github\.com\/([^/]+)\/([^/]+)\/blob\/master\//,
    replacement: "github.com/$1/$2/blob/main/",
    reason: "Many repos renamed master to main",
  },
  {
    pattern: /(?<=https?:\/\/(?:www\.)?)travis-ci\.org(?=\/|$)/g,
    replacement: "travis-ci.com",
    reason: "Travis CI migrated to .com",
  },
  {
    pattern: /githubusercontent\.com\/([^/]+)\/([^/]+)\/master\//,
    replacement: "githubusercontent.com/$1/$2/main/",
    reason: "Raw GitHub URLs — master to main",
  },
];

export const MARKDOWN_URL_REGEX = /\[([^\]]*)\]\(([^)]+)\)|<(https?:\/\/[^>]+)>|(https?:\/\/[^\s\)]+)/g;

export function extractUrls(content: string): Array<{ url: string; line: number }> {
  const results: Array<{ url: string; line: number }> = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    let match;
    MARKDOWN_URL_REGEX.lastIndex = 0;

    while ((match = MARKDOWN_URL_REGEX.exec(line)) !== null) {
      const url = match[2] ?? match[3] ?? match[4];
      if (url && url.startsWith("http")) {
        results.push({ url, line: i + 1 });
      }
    }
  }

  return results;
}

export function suggestReplacement(url: string): { newUrl: string; reason: string } | null {
  for (const rule of URL_REPLACEMENTS) {
    // Some patterns are global; reset so `.test()` isn't affected by a previous call.
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(url)) {
      rule.pattern.lastIndex = 0;
      return {
        newUrl: url.replace(rule.pattern, rule.replacement),
        reason: rule.reason,
      };
    }
  }
  return null;
}

export function applyReplacements(content: string): { newContent: string; changes: number } {
  const urls = extractUrls(content);
  let newContent = content;
  let changes = 0;

  const processedUrls = new Set<string>();

  for (const { url } of urls) {
    if (processedUrls.has(url)) continue;
    processedUrls.add(url);

    const suggestion = suggestReplacement(url);
    if (suggestion && suggestion.newUrl !== url) {
      // Count all occurrences and replace them as literal strings
      const parts = newContent.split(url);
      const occurrences = parts.length - 1;
      newContent = parts.join(suggestion.newUrl);
      changes += occurrences;
    }
  }

  return { newContent, changes };
}

/** Lists every URL in a markdown file that matches a known migration rule. */
export function findOutdatedUrls(file: string, content: string): OutdatedUrl[] {
  const outdated: OutdatedUrl[] = [];
  for (const { url, line } of extractUrls(content)) {
    const suggestion = suggestReplacement(url);
    if (suggestion) {
      outdated.push({
        file,
        line,
        url,
        issue: suggestion.reason,
        suggestedFix: suggestion.newUrl,
      });
    }
  }
  return outdated;
}

export function buildUrlPrBody(outdatedUrls: OutdatedUrl[]): { title: string; body: string } {
  const body = [
    "## 🔗 URL Modernizer Auto-Update",
    "",
    "This PR automatically updates outdated URLs in markdown files using known migration patterns.",
    "",
    "> **Note:** These changes are heuristic-based regex replacements (e.g. http→https, docs.microsoft.com→learn.microsoft.com). No live network validation is performed.",
    "",
    "### Changes",
    "",
    ...outdatedUrls.map(
      (outdatedUrl) => `- **${outdatedUrl.file}:${outdatedUrl.line}**: ${outdatedUrl.issue}\n  - \`${outdatedUrl.url}\` → \`${outdatedUrl.suggestedFix}\``
    ),
    "",
    "---",
    "*Generated by GH-AW URL Modernizer — Engagement Level: T3 (Collaborator)*",
  ].join("\n");

  return { title: `🔗 Modernize ${outdatedUrls.length} outdated URLs`, body };
}

export function buildUrlIssueBody(outdatedUrls: OutdatedUrl[]): { title: string; body: string } {
  const body = [
    "## 🔗 URL Modernizer Report",
    "",
    `Found **${outdatedUrls.length}** URLs that match known migration patterns and may need updating.`,
    "",
    "> **Note:** These are heuristic-based suggestions only. No live network validation was performed.",
    "",
    "### Outdated URLs Found",
    "",
    "| File | Line | Reason | Current URL | Suggested URL |",
    "|------|------|--------|-------------|---------------|",
    ...outdatedUrls.map(
      (outdatedUrl) =>
        `| \`${outdatedUrl.file}\` | ${outdatedUrl.line} | ${outdatedUrl.issue} | ${outdatedUrl.url} | ${outdatedUrl.suggestedFix ?? "N/A"} |`
    ),
    "",
    "### How to Apply",
    "",
    "Run the URL modernizer with `CREATE_PR=true` to auto-generate a PR, or manually update the URLs above.",
    "",
    "---",
    "*Generated by GH-AW URL Modernizer — Engagement Level: T3 (Collaborator)*",
  ].join("\n");

  return { title: `🔗 URL Modernizer: ${outdatedUrls.length} URLs may need updating`, body };
}

export async function main(): Promise<void> {
  const token = process.env["GITHUB_TOKEN"];
  const repository = process.env["REPOSITORY"];
  const targetBranch = process.env["TARGET_BRANCH"] ?? "main";
  const createPr = process.env["CREATE_PR"] === "true";

  if (!token || !repository) {
    console.log("URL Modernizer: Missing required environment variables. Skipping.");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("URL Modernizer: Invalid REPOSITORY format. Expected owner/repo.");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });

  // Get repo tree to find markdown files
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${targetBranch}`,
  });

  const { data: tree } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: refData.object.sha,
    recursive: "true",
  });

  const markdownFiles = tree.tree.filter(
    (item) => item.type === "blob" && item.path?.endsWith(".md")
  );

  if (markdownFiles.length === 0) {
    console.log("URL Modernizer: No markdown files found. Skipping.");
    return;
  }

  console.log(`URL Modernizer: Found ${markdownFiles.length} markdown files to scan.`);

  const outdatedUrls: OutdatedUrl[] = [];
  const filesToUpdate: Map<string, { content: string; sha: string }> = new Map();

  for (const file of markdownFiles) {
    if (!file.path) continue;

    const { data: fileData } = await octokit.repos.getContent({
      owner,
      repo,
      path: file.path,
      ref: targetBranch,
    });

    if (Array.isArray(fileData) || fileData.type !== "file" || !("content" in fileData)) {
      continue;
    }

    const content = Buffer.from(fileData.content, "base64").toString("utf-8");
    outdatedUrls.push(...findOutdatedUrls(file.path, content));

    // Check for replaceable URLs
    const { newContent, changes } = applyReplacements(content);
    if (changes > 0) {
      filesToUpdate.set(file.path, { content: newContent, sha: fileData.sha });
    }
  }

  if (outdatedUrls.length === 0) {
    console.log("URL Modernizer: No outdated URLs found. All links are up to date!");
    return;
  }

  console.log(`URL Modernizer: Found ${outdatedUrls.length} URLs to modernize.`);

  if (createPr && filesToUpdate.size > 0) {
    // Create a branch and PR with updates
    const branchName = `chore/modernize-urls-${Date.now()}`;

    // Create branch
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    });

    // Update files
    for (const [filePath, { content, sha }] of filesToUpdate) {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: `chore: modernize URLs in ${filePath}`,
        content: Buffer.from(content).toString("base64"),
        sha,
        branch: branchName,
      });
    }

    // Create PR
    const { title, body: prBody } = buildUrlPrBody(outdatedUrls);

    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title,
      head: branchName,
      base: targetBranch,
      body: prBody,
      draft: true,
    });

    console.log(`URL Modernizer: Created PR #${pr.number} with updates.`);
  } else {
    // Create an issue with findings
    const { title, body: issueBody } = buildUrlIssueBody(outdatedUrls);

    const { data: issue } = await octokit.issues.create({
      owner,
      repo,
      title,
      body: issueBody,
      labels: ["documentation", "url-modernizer"],
    });

    console.log(`URL Modernizer: Created issue #${issue.number} with findings.`);
  }
}

if (isDirectRun(import.meta.url)) runJob("URL Modernizer", main);
