/**
 * CODEOWNERS Parser
 *
 * Parses GitHub CODEOWNERS file content and matches file paths to teams.
 * Simplified port of the reference JS codebase (codeowners.js).
 *
 * Instead of picomatch, uses simple glob matching:
 *   - Directory patterns (ending with /): startsWith matching
 *   - Exact file patterns: exact match
 *   - Wildcard (*): simple glob expansion
 *   - Double-star (**): recursive directory matching
 */

// ─── Types ────────────────────────────────────────────────────────────────────────────

export interface CodeownersRule {
  /** The original pattern from the CODEOWNERS file */
  pattern: string;
  /** Teams/owners associated with this pattern */
  teams: string[];
  /** Matcher function for testing file paths */
  matcher: (filePath: string) => boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────────────

/**
 * Parse CODEOWNERS file content into rules.
 *
 * Format per line:
 *   <pattern> <@owner1> <@owner2> ...
 *
 * Lines starting with # are comments. Blank lines are skipped.
 * Owners starting with @ are extracted; the @ prefix (and optional org/ prefix)
 * is stripped to produce team names.
 */
export function parseCodeowners(
  content: string,
  orgName?: string,
): CodeownersRule[] {
  const lines = content.split(/\r?\n/);
  const rules: CodeownersRule[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const parts = trimmed.split(/\s+/);
    const pattern = parts.shift();
    if (!pattern) continue;

    const owners = parts.filter((p) => p.startsWith("@"));

    // Strip @org/ prefix if orgName is provided
    let teams: string[];
    if (orgName) {
      const escapedOrg = escapeRegex(orgName);
      const orgPattern = new RegExp(`^@${escapedOrg}/`);
      teams = owners
        .map((o) => o.replace(orgPattern, ""))
        .filter((t) => t.length > 0);
    } else {
      // Strip any @org/ prefix generically, or just the @
      teams = owners
        .map((o) => {
          // @org/team -> team
          const slashIdx = o.indexOf("/");
          if (slashIdx >= 0) {
            return o.slice(slashIdx + 1);
          }
          // @team -> team
          return o.slice(1);
        })
        .filter((t) => t.length > 0);
    }

    if (teams.length > 0) {
      rules.push({
        pattern,
        teams,
        matcher: buildMatcher(pattern),
      });
    }
  }

  return rules;
}

/**
 * Match a file path to teams using parsed CODEOWNERS rules.
 * Returns all matching teams (union of all matching rules).
 */
export function matchFileToTeams(
  filePath: string,
  rules: CodeownersRule[],
): string[] {
  const teams = new Set<string>();

  for (const rule of rules) {
    if (rule.matcher(filePath)) {
      for (const team of rule.teams) {
        teams.add(team);
      }
    }
  }

  return Array.from(teams);
}

/**
 * Match multiple file paths to teams.
 */
export function matchFilesToTeams(
  filePaths: string[],
  rules: CodeownersRule[],
): string[] {
  const teams = new Set<string>();

  for (const fp of filePaths) {
    for (const team of matchFileToTeams(fp, rules)) {
      teams.add(team);
    }
  }

  return Array.from(teams);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────────────

/**
 * Build a simple matcher function for a CODEOWNERS pattern.
 *
 * Supports:
 *   - Exact file paths: "src/index.ts"
 *   - Directory patterns ending with /: "src/services/" matches anything under it
 *   - Leading / is stripped (CODEOWNERS paths are repo-relative)
 *   - Star (*): matches any sequence of non-/ characters
 *   - Double-star (**): matches any sequence including /
 *   - Extension patterns: "*.ts" matches any .ts file at any depth
 */
function buildMatcher(pattern: string): (filePath: string) => boolean {
  // Normalize: strip leading /
  const hasLeadingSlash = pattern.startsWith("/");
  const normalized = hasLeadingSlash ? pattern.slice(1) : pattern;

  // Directory pattern: "dir/" matches anything under dir/
  if (normalized.endsWith("/")) {
    const prefix = normalized;
    return (fp: string) => {
      const normalizedFp = fp.startsWith("/") ? fp.slice(1) : fp;
      return normalizedFp.startsWith(prefix);
    };
  }

  // In CODEOWNERS, patterns without a "/" match at any depth.
  // e.g. "*.test.ts" matches "src/utils/helper.test.ts"
  // Patterns with "/" are anchored to the repo root.
  const containsSlash = normalized.includes("/");

  // Convert glob pattern to regex
  const regexStr = globToRegex(normalized);

  if (!containsSlash) {
    // Match the filename portion at any depth: either the full path or just the basename
    const regex = new RegExp(`(?:^|/)${regexStr}$`);
    return (fp: string) => {
      const normalizedFp = fp.startsWith("/") ? fp.slice(1) : fp;
      return regex.test(normalizedFp);
    };
  }

  const regex = new RegExp(`^${regexStr}$`);
  return (fp: string) => {
    const normalizedFp = fp.startsWith("/") ? fp.slice(1) : fp;
    return regex.test(normalizedFp);
  };
}

/**
 * Convert a simple glob pattern to a regex string.
 */
function globToRegex(glob: string): string {
  let result = "";
  let i = 0;

  while (i < glob.length) {
    const char = glob[i];

    if (char === "*" && glob[i + 1] === "*") {
      // ** matches any path segment(s)
      if (glob[i + 2] === "/") {
        result += "(?:.*/)?";
        i += 3;
      } else {
        result += ".*";
        i += 2;
      }
    } else if (char === "*") {
      // * matches anything except /
      result += "[^/]*";
      i++;
    } else if (char === "?") {
      result += "[^/]";
      i++;
    } else {
      // Escape regex special characters
      result += escapeRegex(char ?? "");
      i++;
    }
  }

  return result;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
