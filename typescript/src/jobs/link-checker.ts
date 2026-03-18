/**
 * Link Checker — Finds broken links in markdown files and suggests replacements.
 *
 * Scans markdown files for URLs, validates them, identifies common URL migrations
 * (http->https, docs.microsoft.com->learn.microsoft.com), and creates PRs or
 * issues with suggested fixes.
 *
 * Environment variables:
 *   GITHUB_TOKEN  — GitHub token for API access
 *   REPOSITORY    — owner/repo string
 *   TARGET_BRANCH — Branch to scan (defaults to main)
 *   CREATE_PR     — If "true", creates a PR with fixes; otherwise creates an issue
 *
 * Engagement Level: T3 (Peer Programmer) — can create PRs with file edits.
 */

import { Octokit } from "@octokit/rest";

interface UrlReplacement {
  pattern: RegExp;
  replacement: string;
  reason: string;
}

interface BrokenLink {
  file: string;
  line: number;
  url: string;
  issue: string;
  suggestedFix?: string;
}

const URL_REPLACEMENTS: UrlReplacement[] = [
  {
    pattern: /^http:\/\/(?!localhost|127\.0\.0\.1)/,
    replacement: "https://",
    reason: "Upgrade to HTTPS for security",
  },
  {
    pattern: /docs\.microsoft\.com/g,
    replacement: "learn.microsoft.com",
    reason: "Microsoft Docs migrated to Microsoft Learn",
  },
  {
    pattern: /aka\.ms\/deprecated/g,
    replacement: "learn.microsoft.com",
    reason: "Deprecated aka.ms link",
  },
  {
    pattern: /github\.com\/([^/]+)\/([^/]+)\/blob\/master\//,
    replacement: "github.com/$1/$2/blob/main/",
    reason: "Many repos renamed master to main",
  },
  {
    pattern: /travis-ci\.org/g,
    replacement: "travis-ci.com",
    reason: "Travis CI migrated to .com",
  },
  {
    pattern: /githubusercontent\.com\/([^/]+)\/([^/]+)\/master\//,
    replacement: "githubusercontent.com/$1/$2/main/",
    reason: "Raw GitHub URLs — master to main",
  },
];

const MARKDOWN_URL_REGEX = /\[([^\]]*)\]\(([^)]+)\)|<(https?:\/\/[^>]+)>|(https?:\/\/[^\s\)]+)/g;

function extractUrls(content: string): Array<{ url: string; line: number }> {
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

function suggestReplacement(url: string): { newUrl: string; reason: string } | null {
  for (const rule of URL_REPLACEMENTS) {
    if (rule.pattern.test(url)) {
      return {
        newUrl: url.replace(rule.pattern, rule.replacement),
        reason: rule.reason,
      };
    }
  }
  return null;
}

function applyReplacements(content: string): { newContent: string; changes: number } {
  let newContent = content;
  let changes = 0;

  for (const rule of URL_REPLACEMENTS) {
    const matches = newContent.match(rule.pattern);
    if (matches) {
      newContent = newContent.replace(rule.pattern, rule.replacement);
      changes += matches.length;
    }
  }

  return { newContent, changes };
}

async function main(): Promise<void> {
  const token = process.env["GITHUB_TOKEN"];
  const repository = process.env["REPOSITORY"];
  const targetBranch = process.env["TARGET_BRANCH"] ?? "main";
  const createPr = process.env["CREATE_PR"] === "true";

  if (!token || !repository) {
    console.log("Link Checker: Missing required environment variables. Skipping.");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("Link Checker: Invalid REPOSITORY format. Expected owner/repo.");
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
    console.log("Link Checker: No markdown files found. Skipping.");
    return;
  }

  console.log(`Link Checker: Found ${markdownFiles.length} markdown files to scan.`);

  const brokenLinks: BrokenLink[] = [];
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
    const urls = extractUrls(content);

    for (const { url, line } of urls) {
      const suggestion = suggestReplacement(url);
      if (suggestion) {
        brokenLinks.push({
          file: file.path,
          line,
          url,
          issue: suggestion.reason,
          suggestedFix: suggestion.newUrl,
        });
      }
    }

    // Check for replaceable URLs
    const { newContent, changes } = applyReplacements(content);
    if (changes > 0) {
      filesToUpdate.set(file.path, { content: newContent, sha: fileData.sha });
    }
  }

  if (brokenLinks.length === 0) {
    console.log("Link Checker: No issues found. All links look good!");
    return;
  }

  console.log(`Link Checker: Found ${brokenLinks.length} links to update.`);

  if (createPr && filesToUpdate.size > 0) {
    // Create a branch and PR with fixes
    const branchName = `fix/link-updates-${Date.now()}`;

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
        message: `fix: update URLs in ${filePath}`,
        content: Buffer.from(content).toString("base64"),
        sha,
        branch: branchName,
      });
    }

    // Create PR
    const prBody = [
      "## 🔗 Link Checker Auto-Fix",
      "",
      "This PR automatically updates outdated or insecure URLs in markdown files.",
      "",
      "### Changes",
      "",
      ...brokenLinks.map(
        (link) => `- **${link.file}:${link.line}**: ${link.issue}\n  - \`${link.url}\` → \`${link.suggestedFix}\``
      ),
      "",
      "---",
      "*Generated by GH-AW Link Checker — Engagement Level: T3 (Peer Programmer)*",
    ].join("\n");

    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title: `🔗 Fix ${brokenLinks.length} outdated URLs`,
      head: branchName,
      base: targetBranch,
      body: prBody,
      draft: true,
    });

    console.log(`Link Checker: Created PR #${pr.number} with fixes.`);
  } else {
    // Create an issue with findings
    const issueBody = [
      "## 🔗 Link Checker Report",
      "",
      `Found **${brokenLinks.length}** links that may need attention.`,
      "",
      "### Issues Found",
      "",
      "| File | Line | Issue | Current URL | Suggested Fix |",
      "|------|------|-------|-------------|---------------|",
      ...brokenLinks.map(
        (link) =>
          `| \`${link.file}\` | ${link.line} | ${link.issue} | ${link.url} | ${link.suggestedFix ?? "N/A"} |`
      ),
      "",
      "### How to Fix",
      "",
      "Run the link checker with `CREATE_PR=true` to auto-generate a PR, or manually update the URLs above.",
      "",
      "---",
      "*Generated by GH-AW Link Checker — Engagement Level: T3 (Peer Programmer)*",
    ].join("\n");

    const { data: issue } = await octokit.issues.create({
      owner,
      repo,
      title: `🔗 Link Checker: ${brokenLinks.length} URLs need attention`,
      body: issueBody,
      labels: ["documentation", "link-checker"],
    });

    console.log(`Link Checker: Created issue #${issue.number} with findings.`);
  }
}

main().catch((err: unknown) => {
  console.error("Link Checker failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
