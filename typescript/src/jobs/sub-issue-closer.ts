/**
 * Sub-Issue Closer — Automatically closes parent issues when all sub-issues complete.
 *
 * Finds open issues with sub-issues (identified by "[Parent Title]" pattern in title
 * or "has-plan" label), checks if all sub-issues are closed, and auto-closes
 * the parent with a summary comment.
 *
 * Environment variables:
 *   GITHUB_TOKEN   — GitHub token for API access
 *   REPOSITORY     — owner/repo string
 *
 * Engagement Level: T4 (Agent Team) — closes issues automatically.
 */

import { Octokit } from "@octokit/rest";

interface ParentIssue {
  number: number;
  title: string;
  subIssues: SubIssue[];
}

interface SubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  closedAt?: string;
}

function isSubIssueOf(subTitle: string, parentTitle: string): boolean {
  // Check if sub-issue title starts with "[Parent Title]"
  const pattern = `[${parentTitle}]`;
  return subTitle.startsWith(pattern);
}

async function main(): Promise<void> {
  const token = process.env["GITHUB_TOKEN"];
  const repository = process.env["REPOSITORY"];

  if (!token || !repository) {
    console.log("Sub-Issue Closer: Missing required environment variables. Skipping.");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("Sub-Issue Closer: Invalid REPOSITORY format. Expected owner/repo.");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });

  // Find potential parent issues (those with "has-plan" label or that have sub-issues)
  const { data: openIssues } = await octokit.issues.listForRepo({
    owner,
    repo,
    state: "open",
    per_page: 100,
    sort: "updated",
    direction: "desc",
  });

  // Also fetch closed issues for sub-issue matching
  const { data: closedIssues } = await octokit.issues.listForRepo({
    owner,
    repo,
    state: "closed",
    per_page: 100,
    sort: "updated",
    direction: "desc",
  });

  const allIssues = [...openIssues, ...closedIssues];

  // Identify parent issues (those with "has-plan" label)
  const parentCandidates = openIssues.filter((issue) => {
    const labels = issue.labels.map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean);
    return labels.includes("has-plan");
  });

  if (parentCandidates.length === 0) {
    console.log("Sub-Issue Closer: No parent issues with 'has-plan' label found. Skipping.");
    return;
  }

  console.log(`Sub-Issue Closer: Found ${parentCandidates.length} potential parent issues.`);

  const parentsToClose: ParentIssue[] = [];

  for (const parent of parentCandidates) {
    // Find sub-issues for this parent
    const subIssues: SubIssue[] = [];

    for (const issue of allIssues) {
      if (issue.number === parent.number) continue;

      // Check if this issue is a sub-issue of the parent
      if (isSubIssueOf(issue.title, parent.title)) {
        subIssues.push({
          number: issue.number,
          title: issue.title,
          state: issue.state as "open" | "closed",
          closedAt: issue.closed_at ?? undefined,
        });
      }

      // Also check issue body for "Sub-issue of #N" pattern
      if (issue.body?.includes(`Sub-issue of #${parent.number}`)) {
        // Avoid duplicates
        if (!subIssues.some((s) => s.number === issue.number)) {
          subIssues.push({
            number: issue.number,
            title: issue.title,
            state: issue.state as "open" | "closed",
            closedAt: issue.closed_at ?? undefined,
          });
        }
      }
    }

    if (subIssues.length === 0) {
      console.log(`Sub-Issue Closer: No sub-issues found for #${parent.number}. Skipping.`);
      continue;
    }

    const openSubIssues = subIssues.filter((s) => s.state === "open");
    const closedSubIssues = subIssues.filter((s) => s.state === "closed");

    console.log(
      `Sub-Issue Closer: #${parent.number} has ${subIssues.length} sub-issues ` +
        `(${closedSubIssues.length} closed, ${openSubIssues.length} open)`
    );

    // Check if all sub-issues are closed
    if (openSubIssues.length === 0 && closedSubIssues.length > 0) {
      parentsToClose.push({
        number: parent.number,
        title: parent.title,
        subIssues,
      });
    }
  }

  if (parentsToClose.length === 0) {
    console.log("Sub-Issue Closer: No parent issues ready to close. All have open sub-issues.");
    return;
  }

  // Close parent issues
  for (const parent of parentsToClose) {
    // Generate summary comment
    const sortedSubIssues = parent.subIssues.sort((a, b) => {
      const dateA = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const dateB = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return dateA - dateB;
    });

    const summaryLines = [
      "## ✅ All Sub-Issues Complete!",
      "",
      "This issue is being automatically closed because all sub-issues have been completed.",
      "",
      "### Completed Sub-Issues",
      "",
      ...sortedSubIssues.map((sub) => {
        const closedDate = sub.closedAt ? new Date(sub.closedAt).toISOString().split("T")[0] : "unknown";
        return `- [x] #${sub.number} — ${sub.title.replace(/^\[[^\]]+\]\s*\d+\/\d+:\s*/, "")} (closed ${closedDate})`;
      }),
      "",
      "### Summary",
      "",
      `- **Total sub-issues:** ${parent.subIssues.length}`,
      `- **First completed:** ${sortedSubIssues[0]?.closedAt ? new Date(sortedSubIssues[0].closedAt).toISOString().split("T")[0] : "N/A"}`,
      `- **Last completed:** ${sortedSubIssues[sortedSubIssues.length - 1]?.closedAt ? new Date(sortedSubIssues[sortedSubIssues.length - 1]!.closedAt!).toISOString().split("T")[0] : "N/A"}`,
      "",
      "---",
      "*Generated by GH-AW Sub-Issue Closer — Engagement Level: T4 (Agent Team)*",
    ];

    // Post comment
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: parent.number,
      body: summaryLines.join("\n"),
    });

    // Close the issue
    await octokit.issues.update({
      owner,
      repo,
      issue_number: parent.number,
      state: "closed",
      state_reason: "completed",
    });

    // Remove "has-plan" and add "completed" label
    try {
      await octokit.issues.removeLabel({
        owner,
        repo,
        issue_number: parent.number,
        name: "has-plan",
      });
    } catch {
      // Label might not exist
    }

    try {
      await octokit.issues.addLabels({
        owner,
        repo,
        issue_number: parent.number,
        labels: ["completed"],
      });
    } catch {
      // Label might not exist
    }

    console.log(`Sub-Issue Closer: Closed parent issue #${parent.number} with ${parent.subIssues.length} completed sub-issues.`);
  }

  console.log(`Sub-Issue Closer: Closed ${parentsToClose.length} parent issue(s).`);
}

main().catch((err: unknown) => {
  console.error("Sub-Issue Closer failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
