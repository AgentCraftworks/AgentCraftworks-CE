#!/usr/bin/env node
/**
 * check-workflow-standards.mjs — lint .github/workflows/*.yml against the
 * ORG-STANDARD "Security Requirements for Workflows & Authentication" block
 * in AGENTS.md. Zero dependencies; runs on Node 22+.
 *
 * Fails (exit 1) when a workflow:
 *   1. uses actions/checkout@v1–v5 (standard requires @v6)
 *   2. has no top-level `permissions:` and at least one job lacks job-level `permissions:`
 *   3. declares Engagement Level T3/T4/T5 but references secrets.GITHUB_TOKEN or github.token
 *   4. is missing the `# Engagement Level: Tn (...)` header comment
 *
 * Usage: node scripts/check-workflow-standards.mjs [workflowsDir]
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const workflowsDir = resolve(process.argv[2] ?? join(repoRoot, ".github", "workflows"));

const CHECKOUT_OLD = /uses:\s*["']?actions\/checkout@v[1-5](?:[.\s"']|$)/;
const ENGAGEMENT_HEADER = /^\s*#\s*Engagement Level:\s*T([1-5])\b/;
const IMPLICIT_TOKEN = /\$\{\{\s*(?:secrets\.GITHUB_TOKEN|github\.token)\s*\}\}/;
const TOP_LEVEL_KEY = /^([A-Za-z_][\w-]*):/;
const JOB_KEY = /^ {2}([A-Za-z_][\w-]*):/;
const JOB_PERMISSIONS = /^ {4}permissions:/;

/** Strip trailing YAML comments so commented-out code doesn't trigger rules. */
function stripComment(line) {
  const idx = line.search(/(^|\s)#/);
  return idx === -1 ? line : line.slice(0, idx);
}

function lintWorkflow(file) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const errors = [];

  let engagementLevel = null;
  let hasTopLevelPermissions = false;
  let inJobs = false;
  const jobs = [];

  lines.forEach((raw, i) => {
    const lineNo = i + 1;

    const header = raw.match(ENGAGEMENT_HEADER);
    if (header && engagementLevel === null) engagementLevel = Number(header[1]);

    const code = stripComment(raw);
    if (!code.trim()) return;

    if (CHECKOUT_OLD.test(code)) {
      errors.push(`${lineNo}: actions/checkout must be @v6 (found: ${code.trim()})`);
    }

    const topKey = code.match(TOP_LEVEL_KEY);
    if (topKey) {
      inJobs = topKey[1] === "jobs";
      if (topKey[1] === "permissions") hasTopLevelPermissions = true;
      return;
    }

    if (inJobs) {
      const jobKey = code.match(JOB_KEY);
      if (jobKey) {
        jobs.push({ name: jobKey[1], line: lineNo, hasPermissions: false });
      } else if (JOB_PERMISSIONS.test(code) && jobs.length > 0) {
        jobs[jobs.length - 1].hasPermissions = true;
      }
    }
  });

  if (engagementLevel === null) {
    errors.push("missing `# Engagement Level: Tn (...)` header comment");
  }

  if (!hasTopLevelPermissions) {
    const missing = jobs.filter((j) => !j.hasPermissions);
    if (jobs.length === 0) {
      errors.push("missing top-level `permissions:` block");
    }
    for (const job of missing) {
      errors.push(`${job.line}: job \`${job.name}\` has no \`permissions:\` and workflow has no top-level block`);
    }
  }

  if (engagementLevel !== null && engagementLevel >= 3) {
    lines.forEach((raw, i) => {
      if (IMPLICIT_TOKEN.test(stripComment(raw))) {
        errors.push(
          `${i + 1}: T${engagementLevel} workflow uses implicit GITHUB_TOKEN — use actions/create-github-app-token@v1`,
        );
      }
    });
  }

  return errors;
}

const files = readdirSync(workflowsDir)
  .filter((f) => /\.ya?ml$/.test(f))
  .sort();

let failed = 0;
for (const name of files) {
  const errors = lintWorkflow(join(workflowsDir, name));
  if (errors.length === 0) continue;
  failed += 1;
  console.error(`\n✖ .github/workflows/${name}`);
  for (const e of errors) console.error(`    ${e}`);
}

if (failed > 0) {
  console.error(`\n${failed} of ${files.length} workflow(s) violate ORG-STANDARD. See AGENTS.md → Security Requirements for Workflows & Authentication.`);
  process.exit(1);
}

console.log(`✔ ${files.length} workflow(s) comply with ORG-STANDARD workflow requirements.`);
