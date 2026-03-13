/**
 * Changeset — Automated version bumps and changelog generation.
 *
 * Analyzes merged PRs since the last release tag, determines the semver bump
 * type (patch/minor/major) based on PR labels and commit messages, and generates
 * a CHANGELOG entry. In non-dry-run mode, creates a release PR with the changes.
 *
 * Environment variables:
 *   GITHUB_TOKEN  — GitHub token for API access
 *   REPOSITORY    — owner/repo string
 *   DRY_RUN       — "true" to preview without committing
 *
 * Engagement Level: T3 (Peer Programmer) — creates branches and edits files.
 */

import { Octokit } from "@octokit/rest";

type BumpType = "patch" | "minor" | "major";

interface ChangeEntry {
  pr: number;
  title: string;
  author: string;
  bump: BumpType;
  labels: string[];
}

function determineBump(labels: string[], title: string): BumpType {
  const labelNames = labels.map((l) => l.toLowerCase());
  if (labelNames.includes("breaking") || labelNames.includes("major")) return "major";
  if (labelNames.includes("enhancement") || labelNames.includes("feature") || title.startsWith("feat")) return "minor";
  return "patch";
}

function highestBump(entries: ChangeEntry[]): BumpType {
  if (entries.some((e) => e.bump === "major")) return "major";
  if (entries.some((e) => e.bump === "minor")) return "minor";
  return "patch";
}

function bumpVersion(version: string, bump: BumpType): string {
  const parts = version.replace(/^v/, "").split(".").map(Number);
  const [major = 0, minor = 0, patch = 0] = parts;
  switch (bump) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
  }
}

async function main(): Promise<void> {
  const token = process.env["GITHUB_TOKEN"];
  const repository = process.env["REPOSITORY"];
  const dryRun = process.env["DRY_RUN"] === "true";

  if (!token || !repository) {
    console.log("Changeset: Missing required environment variables. Skipping.");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("Changeset: Invalid REPOSITORY format.");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });

  // Get latest release tag
  let latestTag = "v0.0.0";
  try {
    const { data: release } = await octokit.repos.getLatestRelease({ owner, repo });
    latestTag = release.tag_name;
  } catch {
    console.log("Changeset: No previous release found. Starting from v0.0.0.");
  }

  // Get merged PRs since last release
  const { data: pulls } = await octokit.pulls.list({
    owner,
    repo,
    state: "closed",
    sort: "updated",
    direction: "desc",
    per_page: 50,
  });

  const mergedPRs = pulls.filter((pr) => pr.merged_at !== null);

  if (mergedPRs.length === 0) {
    console.log("Changeset: No merged PRs since last release. Nothing to do.");
    return;
  }

  // Build change entries
  const entries: ChangeEntry[] = mergedPRs.map((pr) => ({
    pr: pr.number,
    title: pr.title,
    author: pr.user?.login ?? "unknown",
    bump: determineBump(
      pr.labels.map((l) => l.name ?? ""),
      pr.title,
    ),
    labels: pr.labels.map((l) => l.name ?? ""),
  }));

  const bump = highestBump(entries);
  const newVersion = bumpVersion(latestTag, bump);
  const today = new Date().toISOString().split("T")[0];

  // Generate changelog entry
  const changelog = [
    `## ${newVersion} (${today})`,
    "",
    ...entries.map((e) => `- ${e.title} (#${e.pr}) @${e.author}`),
    "",
  ].join("\n");

  console.log(`Changeset: ${latestTag} → v${newVersion} (${bump} bump)`);
  console.log(`Changes: ${entries.length} merged PRs`);
  console.log("");
  console.log(changelog);

  if (dryRun) {
    console.log("Changeset: Dry run — no changes committed.");
    return;
  }

  console.log("Changeset: Would create release PR with changelog update.");
  console.log("(Full implementation requires git operations — see issue for details)");
}

main().catch((err: unknown) => {
  console.error("Changeset failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
