/**
 * Daily Doc Updater — Updates CHANGELOG.md based on merged PRs.
 *
 * Scans PRs merged in the last 24 hours, categorizes them (features, fixes,
 * docs, chores), and creates a PR to update CHANGELOG.md with the new entries.
 *
 * Environment variables:
 *   GITHUB_TOKEN   — GitHub token for API access
 *   REPOSITORY     — owner/repo string
 *   TARGET_BRANCH  — Branch to update (defaults to main)
 *   LOOKBACK_HOURS — Hours to look back for merged PRs (defaults to 24)
 *
 * Engagement Level: T3 (Peer Programmer) — creates PRs with file edits.
 */

import { Octokit } from "@octokit/rest";

interface ChangelogEntry {
  category: "Features" | "Bug Fixes" | "Documentation" | "Maintenance" | "Breaking Changes";
  emoji: string;
  text: string;
  prNumber: number;
  author: string;
}

interface LabelMapping {
  label: string;
  category: ChangelogEntry["category"];
  emoji: string;
}

const LABEL_MAPPINGS: LabelMapping[] = [
  { label: "breaking", category: "Breaking Changes", emoji: "💥" },
  { label: "breaking-change", category: "Breaking Changes", emoji: "💥" },
  { label: "feature", category: "Features", emoji: "✨" },
  { label: "enhancement", category: "Features", emoji: "✨" },
  { label: "feat", category: "Features", emoji: "✨" },
  { label: "bug", category: "Bug Fixes", emoji: "🐛" },
  { label: "fix", category: "Bug Fixes", emoji: "🐛" },
  { label: "bugfix", category: "Bug Fixes", emoji: "🐛" },
  { label: "documentation", category: "Documentation", emoji: "📚" },
  { label: "docs", category: "Documentation", emoji: "📚" },
  { label: "chore", category: "Maintenance", emoji: "🔧" },
  { label: "maintenance", category: "Maintenance", emoji: "🔧" },
  { label: "dependencies", category: "Maintenance", emoji: "📦" },
  { label: "ci", category: "Maintenance", emoji: "⚙️" },
];

const TITLE_PATTERNS: Array<{ pattern: RegExp; category: ChangelogEntry["category"]; emoji: string }> = [
  { pattern: /^feat(\(.*\))?:/i, category: "Features", emoji: "✨" },
  { pattern: /^feature(\(.*\))?:/i, category: "Features", emoji: "✨" },
  { pattern: /^fix(\(.*\))?:/i, category: "Bug Fixes", emoji: "🐛" },
  { pattern: /^bugfix(\(.*\))?:/i, category: "Bug Fixes", emoji: "🐛" },
  { pattern: /^docs(\(.*\))?:/i, category: "Documentation", emoji: "📚" },
  { pattern: /^chore(\(.*\))?:/i, category: "Maintenance", emoji: "🔧" },
  { pattern: /^ci(\(.*\))?:/i, category: "Maintenance", emoji: "⚙️" },
  { pattern: /^refactor(\(.*\))?:/i, category: "Maintenance", emoji: "♻️" },
  { pattern: /^breaking(\(.*\))?:/i, category: "Breaking Changes", emoji: "💥" },
  { pattern: /^!:/i, category: "Breaking Changes", emoji: "💥" },
];

function categorizeByTitle(title: string): { category: ChangelogEntry["category"]; emoji: string } | null {
  for (const { pattern, category, emoji } of TITLE_PATTERNS) {
    if (pattern.test(title)) {
      return { category, emoji };
    }
  }
  return null;
}

function categorizeByLabels(labels: string[]): { category: ChangelogEntry["category"]; emoji: string } | null {
  for (const mapping of LABEL_MAPPINGS) {
    if (labels.includes(mapping.label)) {
      return { category: mapping.category, emoji: mapping.emoji };
    }
  }
  return null;
}

function cleanTitle(title: string): string {
  // Remove conventional commit prefix
  return title
    .replace(/^(feat|fix|docs|chore|ci|refactor|breaking|bugfix|feature)(\(.*\))?:\s*/i, "")
    .replace(/^!:\s*/, "")
    .trim();
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

function generateChangelogSection(entries: ChangelogEntry[], version: string): string {
  const lines: string[] = [
    `## [${version}] - ${formatDate(new Date())}`,
    "",
  ];

  const categories: ChangelogEntry["category"][] = [
    "Breaking Changes",
    "Features",
    "Bug Fixes",
    "Documentation",
    "Maintenance",
  ];

  for (const category of categories) {
    const categoryEntries = entries.filter((e) => e.category === category);
    if (categoryEntries.length === 0) continue;

    lines.push(`### ${category}`, "");

    for (const entry of categoryEntries) {
      lines.push(`- ${entry.emoji} ${entry.text} (#${entry.prNumber}) @${entry.author}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const token = process.env["GITHUB_TOKEN"];
  const repository = process.env["REPOSITORY"];
  const targetBranch = process.env["TARGET_BRANCH"] ?? "main";
  const lookbackHours = parseInt(process.env["LOOKBACK_HOURS"] ?? "24", 10);

  if (!token || !repository) {
    console.log("Daily Doc Updater: Missing required environment variables. Skipping.");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("Daily Doc Updater: Invalid REPOSITORY format. Expected owner/repo.");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });

  // Calculate cutoff time
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - lookbackHours);

  // Fetch recently closed PRs
  const { data: prs } = await octokit.pulls.list({
    owner,
    repo,
    state: "closed",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  });

  // Filter to merged PRs within the lookback window
  const mergedPrs = prs.filter((pr) => {
    if (!pr.merged_at) return false;
    const mergedAt = new Date(pr.merged_at);
    return mergedAt >= cutoff;
  });

  if (mergedPrs.length === 0) {
    console.log(`Daily Doc Updater: No PRs merged in the last ${lookbackHours} hours. Skipping.`);
    return;
  }

  console.log(`Daily Doc Updater: Found ${mergedPrs.length} merged PRs.`);

  // Categorize PRs
  const entries: ChangelogEntry[] = [];

  for (const pr of mergedPrs) {
    const labels = pr.labels.map((l) => l.name?.toLowerCase() ?? "").filter(Boolean);

    // Try to categorize by labels first, then by title
    let categorization = categorizeByLabels(labels) ?? categorizeByTitle(pr.title);

    // Default to Maintenance if we can't categorize
    if (!categorization) {
      categorization = { category: "Maintenance", emoji: "🔧" };
    }

    entries.push({
      category: categorization.category,
      emoji: categorization.emoji,
      text: cleanTitle(pr.title),
      prNumber: pr.number,
      author: pr.user?.login ?? "unknown",
    });
  }

  // Determine version (use date-based for daily updates)
  const version = `Unreleased`;

  // Generate new changelog section
  const newSection = generateChangelogSection(entries, version);

  // Fetch current CHANGELOG.md
  let currentChangelog = "";
  let changelogSha: string | undefined;
  const changelogPath = "CHANGELOG.md";

  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: changelogPath,
      ref: targetBranch,
    });

    if (!Array.isArray(data) && data.type === "file" && "content" in data) {
      currentChangelog = Buffer.from(data.content, "base64").toString("utf-8");
      changelogSha = data.sha;
    }
  } catch {
    // CHANGELOG doesn't exist, we'll create it
    currentChangelog = "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n";
  }

  // Insert new section after the header
  const headerMatch = currentChangelog.match(/^# Changelog.*?\n\n/s);
  let updatedChangelog: string;

  if (headerMatch) {
    const headerEnd = headerMatch.index! + headerMatch[0].length;
    updatedChangelog =
      currentChangelog.slice(0, headerEnd) +
      newSection +
      "\n" +
      currentChangelog.slice(headerEnd);
  } else {
    updatedChangelog = "# Changelog\n\n" + newSection + "\n" + currentChangelog;
  }

  // Create a branch
  const branchName = `docs/changelog-${formatDate(new Date())}`;

  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${targetBranch}`,
  });

  try {
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    });
  } catch {
    // Branch might already exist from earlier run today
    console.log(`Daily Doc Updater: Branch ${branchName} may already exist. Attempting to update.`);
  }

  // Update or create CHANGELOG.md
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: changelogPath,
    message: `docs: update CHANGELOG for ${formatDate(new Date())}`,
    content: Buffer.from(updatedChangelog).toString("base64"),
    sha: changelogSha,
    branch: branchName,
  });

  // Create PR
  const prBody = [
    "## 📝 Daily Changelog Update",
    "",
    `This PR adds changelog entries for **${mergedPrs.length}** PRs merged in the last ${lookbackHours} hours.`,
    "",
    "### Summary",
    "",
    `- ✨ Features: ${entries.filter((e) => e.category === "Features").length}`,
    `- 🐛 Bug Fixes: ${entries.filter((e) => e.category === "Bug Fixes").length}`,
    `- 📚 Documentation: ${entries.filter((e) => e.category === "Documentation").length}`,
    `- 🔧 Maintenance: ${entries.filter((e) => e.category === "Maintenance").length}`,
    `- 💥 Breaking Changes: ${entries.filter((e) => e.category === "Breaking Changes").length}`,
    "",
    "---",
    "*Generated by GH-AW Daily Doc Updater — Engagement Level: T3 (Peer Programmer)*",
  ].join("\n");

  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: `📝 Update CHANGELOG for ${formatDate(new Date())}`,
    head: branchName,
    base: targetBranch,
    body: prBody,
  });

  console.log(`Daily Doc Updater: Created PR #${pr.number}`);
}

main().catch((err: unknown) => {
  console.error("Daily Doc Updater failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
