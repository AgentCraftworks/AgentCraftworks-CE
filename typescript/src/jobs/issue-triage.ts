/**
 * Issue Triage — Auto-labels new issues based on content analysis.
 *
 * Analyzes issue title and body to detect category (bug, enhancement, documentation,
 * security), detects potential spam, finds similar existing issues, and posts
 * an analysis comment with recommendations.
 *
 * Environment variables:
 *   GITHUB_TOKEN   — GitHub token for API access
 *   ISSUE_NUMBER   — Issue number to triage
 *   REPOSITORY     — owner/repo string
 *
 * Engagement Level: T2 (Advisor) — adds labels and comments, no code modifications.
 */

import { Octokit } from "@octokit/rest";

interface LabelRule {
  label: string;
  keywords: string[];
  patterns: RegExp[];
  priority: number;
}

const LABEL_RULES: LabelRule[] = [
  {
    label: "bug",
    keywords: ["bug", "error", "crash", "broken", "doesn't work", "not working", "fails", "issue", "problem"],
    patterns: [/error:/i, /exception/i, /stack trace/i, /unexpected behavior/i, /regression/i],
    priority: 1,
  },
  {
    label: "enhancement",
    keywords: ["feature", "enhancement", "request", "add", "improve", "would be nice", "suggestion", "propose"],
    patterns: [/feature request/i, /would like/i, /should support/i, /please add/i, /it would be great/i],
    priority: 2,
  },
  {
    label: "documentation",
    keywords: ["docs", "documentation", "readme", "typo", "example", "tutorial", "guide", "clarify"],
    patterns: [/update.*docs?/i, /documentation.*missing/i, /unclear/i, /\.md\b/i],
    priority: 3,
  },
  {
    label: "security",
    keywords: ["security", "vulnerability", "cve", "exploit", "injection", "xss", "csrf", "auth"],
    patterns: [/CVE-\d+/i, /security issue/i, /vulnerable/i, /sensitive data/i],
    priority: 0, // Highest priority
  },
  {
    label: "question",
    keywords: ["how to", "how do", "question", "help", "confused", "explain", "what is"],
    patterns: [/how can i/i, /is it possible/i, /what does/i, /can someone/i, /\?$/],
    priority: 4,
  },
  {
    label: "performance",
    keywords: ["slow", "performance", "memory", "cpu", "optimize", "speed", "latency", "timeout"],
    patterns: [/takes too long/i, /out of memory/i, /high cpu/i, /bottleneck/i],
    priority: 2,
  },
  {
    label: "good first issue",
    keywords: ["simple", "easy", "beginner", "starter", "straightforward"],
    patterns: [/good first/i, /help wanted/i, /easy fix/i],
    priority: 5,
  },
];

const SPAM_INDICATORS = [
  /\b(buy|sell|discount|free money|click here|subscribe)\b/i,
  /\b(casino|lottery|prize|winner)\b/i,
  /\b(viagra|crypto|bitcoin|trading)\b/i,
  /(.)\1{10,}/, // Repeated characters
  /\b[A-Z]{20,}\b/, // Long caps sequences
  /(http[s]?:\/\/[^\s]+){5,}/, // Many URLs
];

interface TriageResult {
  suggestedLabels: string[];
  isSpam: boolean;
  spamReasons: string[];
  similarIssues: Array<{ number: number; title: string; similarity: number }>;
  category: string;
  confidence: number;
}

function calculateSimilarity(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\s+/));
  const bWords = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...aWords].filter((x) => bWords.has(x)));
  const union = new Set([...aWords, ...bWords]);
  return intersection.size / union.size;
}

function analyzeIssue(title: string, body: string): Omit<TriageResult, "similarIssues"> {
  const content = `${title} ${body}`.toLowerCase();
  const suggestedLabels: string[] = [];
  let bestCategory = "needs-triage";
  let bestPriority = 999;
  let totalMatches = 0;

  // Check label rules
  for (const rule of LABEL_RULES) {
    const keywordMatches = rule.keywords.filter((kw) => content.includes(kw)).length;
    const patternMatches = rule.patterns.filter((p) => p.test(content)).length;
    const matches = keywordMatches + patternMatches * 2; // Patterns weighted higher

    if (matches > 0) {
      suggestedLabels.push(rule.label);
      totalMatches += matches;

      if (rule.priority < bestPriority) {
        bestPriority = rule.priority;
        bestCategory = rule.label;
      }
    }
  }

  // Check for spam
  const spamReasons: string[] = [];
  for (const pattern of SPAM_INDICATORS) {
    if (pattern.test(content)) {
      spamReasons.push(`Matches spam pattern: ${pattern.source.slice(0, 30)}...`);
    }
  }

  // Additional spam checks
  if (body.length > 0 && (body.match(/http/g) ?? []).length > body.length / 100) {
    spamReasons.push("Excessive URLs in body");
  }

  if (title.length < 5 && body.length < 20) {
    spamReasons.push("Very short content");
  }

  const confidence = Math.min(100, totalMatches * 15);

  return {
    suggestedLabels,
    isSpam: spamReasons.length >= 2,
    spamReasons,
    category: bestCategory,
    confidence,
  };
}

async function main(): Promise<void> {
  const token = process.env["GITHUB_TOKEN"];
  const issueNumber = process.env["ISSUE_NUMBER"];
  const repository = process.env["REPOSITORY"];

  if (!token || !issueNumber || !repository) {
    console.log("Issue Triage: Missing required environment variables. Skipping.");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("Issue Triage: Invalid REPOSITORY format. Expected owner/repo.");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });
  const issueNum = parseInt(issueNumber, 10);

  // Fetch the issue
  const { data: issue } = await octokit.issues.get({
    owner,
    repo,
    issue_number: issueNum,
  });

  // Skip if already labeled (except needs-triage)
  const existingLabels = issue.labels
    .map((l) => (typeof l === "string" ? l : l.name))
    .filter(Boolean) as string[];

  const significantLabels = existingLabels.filter((l) => l !== "needs-triage");
  if (significantLabels.length > 0) {
    console.log(`Issue Triage: Issue #${issueNum} already has labels. Skipping.`);
    return;
  }

  // Analyze issue
  const analysis = analyzeIssue(issue.title, issue.body ?? "");

  // Find similar issues
  const { data: recentIssues } = await octokit.issues.listForRepo({
    owner,
    repo,
    state: "all",
    per_page: 50,
    sort: "created",
    direction: "desc",
  });

  const similarIssues = recentIssues
    .filter((i) => i.number !== issueNum)
    .map((i) => ({
      number: i.number,
      title: i.title,
      similarity: calculateSimilarity(issue.title, i.title),
    }))
    .filter((i) => i.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  const result: TriageResult = {
    ...analysis,
    similarIssues,
  };

  // Build analysis comment
  const lines: string[] = [
    "## 🏷️ Issue Triage Analysis",
    "",
  ];

  if (result.isSpam) {
    lines.push(
      "### ⚠️ Potential Spam Detected",
      "",
      "This issue has been flagged as potential spam for the following reasons:",
      "",
      ...result.spamReasons.map((r) => `- ${r}`),
      "",
      "A maintainer should review and close if confirmed spam.",
      "",
    );
  }

  lines.push(
    `### Category: **${result.category}**`,
    `Confidence: ${result.confidence}%`,
    "",
  );

  if (result.suggestedLabels.length > 0) {
    lines.push(
      "### Suggested Labels",
      "",
      result.suggestedLabels.map((l) => `\`${l}\``).join(", "),
      "",
    );
  }

  if (result.similarIssues.length > 0) {
    lines.push(
      "### Similar Issues",
      "",
      "These existing issues might be related:",
      "",
      ...result.similarIssues.map(
        (i) => `- #${i.number} — ${i.title} (${Math.round(i.similarity * 100)}% similar)`
      ),
      "",
    );
  }

  lines.push(
    "---",
    "*Generated by GH-AW Issue Triage — Engagement Level: T2 (Advisor)*",
  );

  const body = lines.join("\n");

  // Apply labels
  if (result.suggestedLabels.length > 0 && !result.isSpam) {
    try {
      await octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issueNum,
        labels: result.suggestedLabels,
      });
      console.log(`Issue Triage: Applied labels to #${issueNum}: ${result.suggestedLabels.join(", ")}`);
    } catch (err) {
      console.log(`Issue Triage: Could not apply some labels (they may not exist): ${err}`);
    }
  }

  if (result.isSpam) {
    try {
      await octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issueNum,
        labels: ["spam", "needs-review"],
      });
    } catch {
      // Labels might not exist
    }
  }

  // Post comment
  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNum,
    body,
  });

  console.log(`Issue Triage: Posted analysis to issue #${issueNum}`);
}

main().catch((err: unknown) => {
  console.error("Issue Triage failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
