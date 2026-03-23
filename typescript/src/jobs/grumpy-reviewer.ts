/**
 * Grumpy Reviewer — Thorough code review with a sarcastic personality.
 *
 * Performs detailed code review on PRs, checking for common anti-patterns
 * (eval(), console.log, any type, empty catch blocks, etc.). Posts reviews
 * with a grumpy but helpful personality.
 *
 * Environment variables:
 *   GITHUB_TOKEN   — GitHub token for API access
 *   PR_NUMBER      — PR number to review
 *   REPOSITORY     — owner/repo string
 *
 * Engagement Level: T2 (Advisor) — posts review comments, no direct edits.
 */

import { Octokit } from "@octokit/rest";

interface CodeSmell {
  name: string;
  pattern: RegExp;
  severity: "error" | "warning" | "info";
  grumpyComment: string;
  suggestion: string;
}

const CODE_SMELLS: CodeSmell[] = [
  {
    name: "eval() usage",
    pattern: /\beval\s*\(/,
    severity: "error",
    grumpyComment: "Oh wonderful, eval(). Because who needs security anyway? 🙄",
    suggestion: "Use JSON.parse() for data, Function constructor for dynamic code (still bad), or better yet, redesign to avoid dynamic code execution entirely.",
  },
  {
    name: "console.log in production",
    pattern: /\bconsole\.(log|debug|info)\s*\(/,
    severity: "warning",
    grumpyComment: "Ah yes, console.log debugging left in the code. Very professional. 🎭",
    suggestion: "Use a proper logging library with log levels, or remove debug statements before merging.",
  },
  {
    name: "any type",
    pattern: /:\s*any\b|as\s+any\b|<any>/,
    severity: "warning",
    grumpyComment: "Using 'any' defeats the entire purpose of TypeScript. Why even bother? 🤦",
    suggestion: "Define proper types. Use 'unknown' with type guards if you truly don't know the type.",
  },
  {
    name: "Empty catch block",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    severity: "error",
    grumpyComment: "An empty catch block. Errors just... disappear into the void. Lovely. 🕳️",
    suggestion: "At minimum, log the error. Better: handle it properly or let it propagate.",
  },
  {
    name: "TODO/FIXME left behind",
    pattern: /\/\/\s*(TODO|FIXME|HACK|XXX):/i,
    severity: "info",
    grumpyComment: "A TODO comment? How about we DO it before merging? Revolutionary idea, I know. 📝",
    suggestion: "Either fix it now or create an issue to track it. Don't let tech debt accumulate.",
  },
  {
    name: "Magic numbers",
    pattern: /[^a-zA-Z0-9_](60{3,}|86400|3600|1000)\b/,
    severity: "info",
    grumpyComment: "Magic numbers! My favorite. What does 86400 mean? Seconds in a day? Your lucky number? 🔮",
    suggestion: "Extract to named constants: const SECONDS_PER_DAY = 86400;",
  },
  {
    name: "Disabled ESLint",
    pattern: /\/[/*]\s*eslint-disable/,
    severity: "warning",
    grumpyComment: "Disabling ESLint? If the linter is wrong, fix the rule. If you're wrong, fix your code. 🚫",
    suggestion: "Address the lint issue properly. If you must disable, add a comment explaining WHY.",
  },
  {
    name: "Hardcoded credentials",
    pattern: /(password|secret|api_key|apikey|token)\s*[:=]\s*['"][^'"]+['"]/i,
    severity: "error",
    grumpyComment: "HARDCODED CREDENTIALS?! 🚨 Please tell me this is a test file. Please. 🙏",
    suggestion: "Use environment variables or a secrets manager. NEVER commit credentials.",
  },
  {
    name: "var keyword",
    pattern: /\bvar\s+\w+/,
    severity: "warning",
    grumpyComment: "var in 2024? Did you time-travel from 2015? We have const and let now. 📅",
    suggestion: "Use 'const' by default, 'let' when reassignment is needed. Never 'var'.",
  },
  {
    name: "== instead of ===",
    pattern: /[^!=]==[^=]/,
    severity: "warning",
    grumpyComment: "Loose equality (==). Enjoy your type coercion surprises! 🎁",
    suggestion: "Use strict equality (===) to avoid type coercion bugs.",
  },
  {
    name: "Nested ternaries",
    pattern: /\?[^:]+:[^?]+\?/,
    severity: "info",
    grumpyComment: "Nested ternaries. Because readable code is overrated. 🧩",
    suggestion: "Extract to an if/else block or a helper function. Your future self will thank you.",
  },
  {
    name: "Suspicious setTimeout/setInterval",
    pattern: /set(Timeout|Interval)\s*\([^,]+,\s*0\s*\)/,
    severity: "info",
    grumpyComment: "setTimeout with 0ms delay. Event loop hacking? There's usually a better way. ⏱️",
    suggestion: "Consider using queueMicrotask(), requestAnimationFrame(), or restructuring your async flow.",
  },
  {
    name: "Function over 50 lines",
    pattern: /function\s+\w+\s*\([^)]*\)\s*\{[\s\S]{2000,}?\}/,
    severity: "info",
    grumpyComment: "This function is longer than my patience. Consider breaking it up. 📏",
    suggestion: "Extract logical chunks into smaller, well-named functions.",
  },
];

const GRUMPY_INTROS = [
  "Alright, let's see what we've got here... *cracks knuckles* 😤",
  "Another PR to review. Joy. Let me put on my reading glasses. 👓",
  "You want a code review? Fine. But I'm not going to sugarcoat anything. 🍬",
  "I've reviewed thousands of PRs. This one... well, let's dive in. 🏊",
  "*Sigh* Here we go again. At least there's coffee. ☕",
];

const GRUMPY_OUTROS_GOOD = [
  "Surprisingly, this isn't terrible. Don't let it go to your head. 😏",
  "I've seen worse. Much worse. You pass... barely. ✅",
  "Clean code? In MY repository? It's more likely than you think. 🎉",
  "Well, would you look at that. Someone actually reads the style guide. 📚",
];

const GRUMPY_OUTROS_BAD = [
  "Please fix these issues. I believe in you. Maybe. Perhaps. 🤔",
  "This needs work. Rome wasn't built in a day, but it also wasn't built with eval(). 🏛️",
  "Back to the drawing board. Or at least back to the linter. 📐",
  "I'm not angry, just disappointed. Okay, maybe a little angry. 😠",
];

interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: CodeSmell["severity"];
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function main(): Promise<void> {
  const token = process.env["GITHUB_TOKEN"];
  const prNumber = process.env["PR_NUMBER"];
  const repository = process.env["REPOSITORY"];

  if (!token || !prNumber || !repository) {
    console.log("Grumpy Reviewer: Missing required environment variables. Skipping.");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("Grumpy Reviewer: Invalid REPOSITORY format. Expected owner/repo.");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });
  const prNum = parseInt(prNumber, 10);

  // Get PR details
  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNum,
  });

  // Get changed files
  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: prNum,
  });

  const reviewComments: ReviewComment[] = [];
  const issuesByFile: Map<string, ReviewComment[]> = new Map();

  // Analyze each file
  for (const file of files) {
    if (file.status === "removed") continue;

    // Only analyze code files
    const codeExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
    if (!codeExtensions.some((ext) => file.filename.endsWith(ext))) continue;

    // Get file content from the PR's head branch
    try {
      const { data: content } = await octokit.repos.getContent({
        owner,
        repo,
        path: file.filename,
        ref: pr.head.sha,
      });

      if (Array.isArray(content) || content.type !== "file" || !("content" in content)) {
        continue;
      }

      const fileContent = Buffer.from(content.content, "base64").toString("utf-8");
      const lines = fileContent.split("\n");

      for (const smell of CODE_SMELLS) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";
          if (smell.pattern.test(line)) {
            const comment: ReviewComment = {
              path: file.filename,
              line: i + 1,
              body: `### ${smell.severity === "error" ? "🚨" : smell.severity === "warning" ? "⚠️" : "💡"} ${smell.name}\n\n${smell.grumpyComment}\n\n**Suggestion:** ${smell.suggestion}`,
              severity: smell.severity,
            };

            reviewComments.push(comment);

            if (!issuesByFile.has(file.filename)) {
              issuesByFile.set(file.filename, []);
            }
            issuesByFile.get(file.filename)!.push(comment);
          }
        }
      }
    } catch {
      console.log(`Grumpy Reviewer: Could not read ${file.filename}. Skipping.`);
    }
  }

  // Build review body
  const errors = reviewComments.filter((c) => c.severity === "error").length;
  const warnings = reviewComments.filter((c) => c.severity === "warning").length;
  const infos = reviewComments.filter((c) => c.severity === "info").length;
  const total = reviewComments.length;

  const intro = pickRandom(GRUMPY_INTROS);
  const outro = total > 5 ? pickRandom(GRUMPY_OUTROS_BAD) : pickRandom(GRUMPY_OUTROS_GOOD);

  const bodyLines = [
    "## 👴 Grumpy Reviewer's Assessment",
    "",
    intro,
    "",
    "### Summary",
    "",
    `| Severity | Count |`,
    `|----------|-------|`,
    `| 🚨 Errors | ${errors} |`,
    `| ⚠️ Warnings | ${warnings} |`,
    `| 💡 Suggestions | ${infos} |`,
    `| **Total** | **${total}** |`,
    "",
  ];

  if (issuesByFile.size > 0) {
    bodyLines.push("### Issues by File", "");

    for (const [filename, issues] of issuesByFile) {
      bodyLines.push(`#### \`${filename}\` (${issues.length} issues)`, "");

      for (const issue of issues) {
        bodyLines.push(`- **Line ${issue.line}**: ${issue.body.split("\n")[0]?.replace("### ", "")}`);
      }

      bodyLines.push("");
    }
  } else {
    bodyLines.push(
      "### No Issues Found! 🎉",
      "",
      "Either this code is actually good, or my patterns need updating.",
      "I'm betting on the latter, but I'll give you the benefit of the doubt... this time.",
      "",
    );
  }

  bodyLines.push(outro, "", "---", "*Generated by GH-AW Grumpy Reviewer — Engagement Level: T2 (Advisor)*");

  const reviewBody = bodyLines.join("\n");

  // Determine review event type
  let event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT" = "COMMENT";
  if (errors > 0) {
    event = "REQUEST_CHANGES";
  } else if (total === 0) {
    event = "APPROVE";
  }

  // Submit review
  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNum,
    body: reviewBody,
    event,
    comments: reviewComments.slice(0, 20).map((c) => ({
      path: c.path,
      line: c.line,
      body: c.body,
    })),
  });

  console.log(`Grumpy Reviewer: Submitted ${event} review on PR #${prNum} with ${total} findings.`);
}

main().catch((err: unknown) => {
  console.error("Grumpy Reviewer failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
