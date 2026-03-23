/**
 * Code Simplifier — Applies simplification rules to recently modified code.
 *
 * Analyzes code changes and suggests modernization patterns: optional chaining,
 * nullish coalescing, template literals, array methods, etc. Creates a draft
 * PR with the simplifications applied.
 *
 * Environment variables:
 *   GITHUB_TOKEN   — GitHub token for API access
 *   REPOSITORY     — owner/repo string
 *   TARGET_BRANCH  — Branch to analyze (defaults to main)
 *   LOOKBACK_DAYS  — Days to look back for recent changes (defaults to 7)
 *
 * Engagement Level: T3 (Peer Programmer) — creates draft PRs with code changes.
 */

import { Octokit } from "@octokit/rest";

interface SimplificationRule {
  name: string;
  description: string;
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  testBefore: string;
  testAfter: string;
}

const SIMPLIFICATION_RULES: SimplificationRule[] = [
  {
    name: "Optional Chaining",
    description: "Replace manual null checks with optional chaining (?.).",
    pattern: /(\w+)\s*&&\s*\1\.(\w+)/g,
    replacement: "$1?.$2",
    testBefore: "user && user.name",
    testAfter: "user?.name",
  },
  {
    name: "Nullish Coalescing",
    description: "Replace || with ?? for null/undefined checks.",
    pattern: /(\w+(?:\.\w+)*)\s*\|\|\s*(['"`][^'"`]*['"`]|\d+|true|false|null|\[\]|\{\})/g,
    replacement: "$1 ?? $2",
    testBefore: "value || 'default'",
    testAfter: "value ?? 'default'",
  },
  {
    name: "Template Literals",
    description: "Replace string concatenation with template literals.",
    pattern: /(['"])([^'"]*)\1\s*\+\s*(\w+)\s*\+\s*(['"])([^'"]*)\4/g,
    replacement: "`$2${$3}$5`",
    testBefore: "'Hello ' + name + '!'",
    testAfter: "`Hello ${name}!`",
  },
  {
    name: "Object Property Shorthand",
    description: "Use shorthand when property name matches variable name.",
    pattern: /\{\s*(\w+):\s*\1\s*\}/g,
    replacement: "{ $1 }",
    testBefore: "{ name: name }",
    testAfter: "{ name }",
  },
  {
    name: "Array.includes",
    description: "Replace indexOf !== -1 with includes().",
    pattern: /(\w+(?:\.\w+)*)\.indexOf\(([^)]+)\)\s*!==?\s*-1/g,
    replacement: "$1.includes($2)",
    testBefore: "arr.indexOf(x) !== -1",
    testAfter: "arr.includes(x)",
  },
  {
    name: "Array.includes (negative)",
    description: "Replace indexOf === -1 with !includes().",
    pattern: /(\w+(?:\.\w+)*)\.indexOf\(([^)]+)\)\s*===?\s*-1/g,
    replacement: "!$1.includes($2)",
    testBefore: "arr.indexOf(x) === -1",
    testAfter: "!arr.includes(x)",
  },
  {
    name: "Exponentiation Operator",
    description: "Replace Math.pow with ** operator.",
    pattern: /Math\.pow\(([^,]+),\s*([^)]+)\)/g,
    replacement: "($1 ** $2)",
    testBefore: "Math.pow(2, 3)",
    testAfter: "(2 ** 3)",
  },
  {
    name: "Object.keys().length",
    description: "Clarify empty object check.",
    pattern: /Object\.keys\((\w+)\)\.length\s*===?\s*0/g,
    replacement: "Object.keys($1).length === 0 /* isEmpty */",
    testBefore: "Object.keys(obj).length === 0",
    testAfter: "Object.keys(obj).length === 0 /* isEmpty */",
  },
  {
    name: "Arrow Function Implicit Return",
    description: "Simplify single-expression arrow functions.",
    pattern: /=>\s*\{\s*return\s+([^;{}]+);\s*\}/g,
    replacement: "=> $1",
    testBefore: "() => { return x + 1; }",
    testAfter: "() => x + 1",
  },
  {
    name: "Destructuring Assignment",
    description: "Use destructuring for multiple property access.",
    pattern: /const\s+(\w+)\s*=\s*(\w+)\.(\w+);\s*const\s+(\w+)\s*=\s*\2\.(\w+);/g,
    replacement: "const { $3: $1, $5: $4 } = $2;",
    testBefore: "const name = user.name; const age = user.age;",
    testAfter: "const { name, age } = user;",
  },
  {
    name: "String.startsWith",
    description: "Replace indexOf === 0 with startsWith().",
    pattern: /(\w+(?:\.\w+)*)\.indexOf\(([^)]+)\)\s*===?\s*0/g,
    replacement: "$1.startsWith($2)",
    testBefore: "str.indexOf('prefix') === 0",
    testAfter: "str.startsWith('prefix')",
  },
  {
    name: "Boolean Conversion",
    description: "Simplify double negation to Boolean().",
    pattern: /!!\s*(\w+(?:\.\w+)*)/g,
    replacement: "Boolean($1)",
    testBefore: "!!value",
    testAfter: "Boolean(value)",
  },
  {
    name: "Number Conversion",
    description: "Replace parseInt without radix with Number().",
    pattern: /parseInt\((\w+(?:\.\w+)*)\)(?!\s*,)/g,
    replacement: "Number($1)",
    testBefore: "parseInt(str)",
    testAfter: "Number(str)",
  },
];

interface Simplification {
  file: string;
  line: number;
  rule: string;
  before: string;
  after: string;
}

interface FileChange {
  path: string;
  content: string;
  originalSha: string;
  simplifications: Simplification[];
  newContent: string;
}

function applySimplifications(content: string, filePath: string): { newContent: string; simplifications: Simplification[] } {
  let newContent = content;
  const simplifications: Simplification[] = [];
  const lines = content.split("\n");

  for (const rule of SIMPLIFICATION_RULES) {
    const matches = content.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags));

    for (const match of matches) {
      if (!match.index) continue;

      // Find line number
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;

      // Skip if in a comment
      const line = lines[lineNumber - 1] ?? "";
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

      const before = match[0];
      const after = typeof rule.replacement === "function"
        ? rule.replacement(match[0], ...(match.slice(1) as string[]))
        : match[0].replace(rule.pattern, rule.replacement);

      if (before !== after) {
        simplifications.push({
          file: filePath,
          line: lineNumber,
          rule: rule.name,
          before: before.trim(),
          after: after.trim(),
        });
      }
    }

    // Apply the rule globally
    if (typeof rule.replacement === "string") {
      newContent = newContent.replace(rule.pattern, rule.replacement);
    }
  }

  return { newContent, simplifications };
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
    "- Some transformations may change behavior (e.g., `||` vs `??` for falsy values)",
    "- Test thoroughly before merging",
    "- Feel free to cherry-pick individual changes",
    "",
    "---",
    "*Generated by GH-AW Code Simplifier — Engagement Level: T3 (Peer Programmer)*",
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
