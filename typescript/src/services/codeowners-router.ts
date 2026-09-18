/**
 * CODEOWNERS Router
 *
 * Turns a pull request's changed files into a routing decision using the
 * repository's CODEOWNERS file. Falls back to label routing when CODEOWNERS is
 * missing or matches nothing.
 *
 * Routing precedence: CODEOWNERS → labels → none (default @code-reviewer).
 *
 * GitHub API usage (all via `octokit.request()`):
 *   - GET /repos/{owner}/{repo}/pulls/{pull_number}/files   (paginated, ≤300 files)
 *   - GET /repos/{owner}/{repo}/contents/{path}              (cached 5 min per repo)
 */

import {
  parseCodeowners,
  matchFilesToTeams,
  type CodeownersRule,
} from "../utils/codeowners.js";
import { routeToAgentByLabel } from "./label-router.js";

// ─── Types ────────────────────────────────────────────────────────────────────────────

/** Minimal Octokit surface used here — keeps tests free of the real client. */
export interface OctokitLike {
  request: (route: string, params?: Record<string, unknown>) => Promise<{
    data: unknown;
  }>;
}

export type RoutingSource = "codeowners" | "labels" | "none";

export interface RoutingDecision {
  /** Owner names matched from CODEOWNERS (org prefix stripped). Empty unless source is codeowners. */
  teams: string[];
  /** Agent slugs to hand off to, primary first. */
  agents: string[];
  source: RoutingSource;
  /** Changed file paths considered (empty when files could not be fetched). */
  files: string[];
  /** Matched owners that were declared as org teams (`@org/team`) in CODEOWNERS. */
  teamSlugs: string[];
}

export interface LoadedCodeowners {
  path: string;
  rules: CodeownersRule[];
  /** Owner names (org prefix stripped) that were written as `@org/team`. */
  teamSlugs: Set<string>;
}

// ─── Constants ────────────────────────────────────────────────────────────────────────

export const CODEOWNERS_PATHS = [
  ".github/CODEOWNERS",
  "CODEOWNERS",
  "docs/CODEOWNERS",
] as const;

export const CODEOWNERS_CACHE_TTL_MS = 5 * 60 * 1000;
const FILES_PER_PAGE = 100;
const MAX_FILES = 300;
export const DEFAULT_AGENT = "@code-reviewer";

// ─── Cache ────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
  value: LoadedCodeowners | null;
  expiresAt: number;
}

const codeownersCache = new Map<string, CacheEntry>();

/** Clear the CODEOWNERS cache (for tests). */
export function clearCodeownersCache(): void {
  codeownersCache.clear();
}

// ─── GitHub fetches ───────────────────────────────────────────────────────────────────

/**
 * Fetch the changed file paths for a PR, paginating up to 300 files.
 */
export async function fetchChangedFiles(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string[]> {
  const files: string[] = [];
  const maxPages = Math.ceil(MAX_FILES / FILES_PER_PAGE);

  for (let page = 1; page <= maxPages; page++) {
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
      { owner, repo, pull_number: pullNumber, per_page: FILES_PER_PAGE, page },
    );
    const batch = Array.isArray(data)
      ? (data as Array<{ filename?: string }>)
      : [];

    for (const f of batch) {
      if (typeof f.filename === "string") files.push(f.filename);
    }

    if (batch.length < FILES_PER_PAGE) break;
  }

  return files.slice(0, MAX_FILES);
}

/**
 * Load and parse CODEOWNERS from the first recognised location.
 * Results (including "not found") are cached per repo for 5 minutes.
 */
export async function loadCodeowners(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  now: number = Date.now(),
): Promise<LoadedCodeowners | null> {
  const key = `${owner}/${repo}`;
  const cached = codeownersCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let loaded: LoadedCodeowners | null = null;

  for (const path of CODEOWNERS_PATHS) {
    try {
      const { data } = await octokit.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        { owner, repo, path },
      );
      const content = decodeContent(data);
      if (content === null) continue;

      loaded = {
        path,
        rules: parseCodeowners(content),
        teamSlugs: extractTeamSlugs(content),
      };
      break;
    } catch (err: unknown) {
      if (isNotFound(err)) continue;
      throw err;
    }
  }

  codeownersCache.set(key, {
    value: loaded,
    expiresAt: now + CODEOWNERS_CACHE_TTL_MS,
  });

  return loaded;
}

// ─── Routing ──────────────────────────────────────────────────────────────────────────

/**
 * Pure routing step: given matched owners and PR labels, produce a decision.
 */
export function decideRouting(
  teams: string[],
  labels: Array<{ name: string }>,
  files: string[] = [],
  teamSlugs: Set<string> = new Set(),
): RoutingDecision {
  if (teams.length > 0) {
    return {
      teams,
      agents: teams.map(teamToAgent),
      source: "codeowners",
      files,
      teamSlugs: teams.filter((t) => teamSlugs.has(t)),
    };
  }

  if (labels.length > 0) {
    return {
      teams: [],
      agents: [routeToAgentByLabel(labels)],
      source: "labels",
      files,
      teamSlugs: [],
    };
  }

  return {
    teams: [],
    agents: [DEFAULT_AGENT],
    source: "none",
    files,
    teamSlugs: [],
  };
}

/**
 * Resolve routing for a PR. When `octokit` is null (no installation or no
 * app credentials) CODEOWNERS is skipped and label routing applies.
 */
export async function resolveRouting(params: {
  octokit: OctokitLike | null;
  owner: string;
  repo: string;
  pullNumber: number;
  labels: Array<{ name: string }>;
}): Promise<RoutingDecision> {
  const { octokit, owner, repo, pullNumber, labels } = params;
  if (!octokit) return decideRouting([], labels);

  const codeowners = await loadCodeowners(octokit, owner, repo);
  if (!codeowners) return decideRouting([], labels);

  const files = await fetchChangedFiles(octokit, owner, repo, pullNumber);
  const teams = matchFilesToTeams(files, codeowners.rules);

  return decideRouting(teams, labels, files, codeowners.teamSlugs);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────────────

/** CODEOWNERS owner `frontend-team` → agent slug `@frontend-team`. */
export function teamToAgent(team: string): string {
  return team.startsWith("@") ? team : `@${team}`;
}

function decodeContent(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const file = data as { type?: string; content?: string; encoding?: string };
  if (file.type && file.type !== "file") return null;
  if (typeof file.content !== "string") return null;
  if (file.encoding && file.encoding !== "base64") return file.content;
  return Buffer.from(file.content, "base64").toString("utf-8");
}

/**
 * Owners written as `@org/team` are GitHub teams; bare `@login` are users.
 * `parseCodeowners` strips both prefixes, so recover the distinction here.
 */
function extractTeamSlugs(content: string): Set<string> {
  const slugs = new Set<string>();
  const re = /(?:^|\s)@[^\s/]+\/([^\s]+)/g;
  for (const match of content.matchAll(re)) {
    const slug = match[1];
    if (slug) slugs.add(slug);
  }
  return slugs;
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { status?: number }).status === 404
  );
}
