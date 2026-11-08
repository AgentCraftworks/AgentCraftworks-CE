/**
 * CODEOWNERS Parser
 *
 * Parses GitHub CODEOWNERS file content and matches file paths to teams.
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
 * Lines starting with # are comments. Blank lines are skipped. A rule with no
 * owners is retained because it overrides owners from earlier matching rules.
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
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const parts = splitCodeownersLine(trimmed);
    const pattern = parts.shift();
    if (!pattern) continue;
    if (pattern.startsWith("\\#") || pattern.startsWith("!")) continue;

    const inlineCommentIndex = parts.findIndex((part) =>
      part.startsWith("#"),
    );
    const ownerParts =
      inlineCommentIndex < 0 ? parts : parts.slice(0, inlineCommentIndex);
    if (ownerParts.some((part) => !part.startsWith("@"))) continue;
    const owners = ownerParts;

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

    rules.push({
      pattern,
      teams,
      matcher: buildMatcher(pattern),
    });
  }

  return rules;
}

/**
 * Match a file path to teams using GitHub's last-matching-rule-wins behavior.
 */
export function matchFileToTeams(
  filePath: string,
  rules: CodeownersRule[],
): string[] {
  let matchedRule: CodeownersRule | undefined;

  for (const rule of rules) {
    if (rule.matcher(filePath)) {
      matchedRule = rule;
    }
  }

  return matchedRule ? [...matchedRule.teams] : [];
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
 * Build a matcher following CODEOWNERS' gitignore-like path rules.
 */
function buildMatcher(pattern: string): (filePath: string) => boolean {
  const rooted = pattern.startsWith("/");
  const normalized = rooted ? pattern.slice(1) : pattern;
  const directoryPattern = normalized.endsWith("/");
  const body = directoryPattern ? normalized.slice(0, -1) : normalized;
  const anchored = rooted || body.includes("/");
  const glob = globToRegex(body);
  const regex = new RegExp(
    `${anchored ? "^" : "(?:^|/)"}${glob}${directoryPattern ? "/.*" : ""}$`,
  );

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

    if (char === "\\") {
      const escaped = glob[i + 1];
      if (escaped !== undefined) {
        result += escapeRegex(escaped);
        i += 2;
      } else {
        result += "\\\\";
        i += 1;
      }
    } else if (
      char === "*" &&
      glob[i + 1] === "*" &&
      (i === 0 || glob[i - 1] === "/") &&
      glob[i + 2] === "/"
    ) {
      result += "(?:[^/]+/)*";
      i += 3;
    } else if (char === "*" && glob[i + 1] === "*") {
      result += ".*";
      i += 2;
    } else if (char === "*") {
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
 * Split a CODEOWNERS line on unescaped whitespace while retaining escapes for
 * the glob compiler.
 */
function splitCodeownersLine(line: string): string[] {
  const parts: string[] = [];
  let part = "";
  let escaped = false;

  for (const char of line) {
    if (escaped) {
      part += char;
      escaped = false;
    } else if (char === "\\") {
      part += char;
      escaped = true;
    } else if (/\s/.test(char)) {
      if (part) {
        parts.push(part);
        part = "";
      }
    } else {
      part += char;
    }
  }

  if (part) parts.push(part);
  return parts;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
