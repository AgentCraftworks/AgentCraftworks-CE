#!/usr/bin/env node
/**
 * Demo 03 — CODEOWNERS routing preview.
 *
 * Runs the CODEOWNERS parser that ships in CE against the default template the
 * setup PR proposes, and shows which owners a set of changed files would route to.
 *
 * Usage (from typescript/, after `npm install`):
 *   node --import tsx ../docs/demos/03-codeowners-routing/route-preview.mts [file ...]
 *
 * Note: this exercises the parser as a library. Wiring it into the webhook path so
 * pull_request events route by CODEOWNERS (not only by label) is tracked in #266.
 */
import { parseCodeowners, matchFilesToTeams, matchFileToTeams } from "../../../typescript/src/utils/codeowners.ts";
import { DEFAULT_CODEOWNERS_TEMPLATE } from "../../../typescript/src/handlers/installation.ts";

const files =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ["typescript/src/index.ts", "docs/getting-started.md", "infra/main.bicep", "README.md"];

const rules = parseCodeowners(DEFAULT_CODEOWNERS_TEMPLATE);
console.log(`Parsed ${rules.length} CODEOWNERS rules from the default setup-PR template.\n`);

for (const file of files) {
  const owners = matchFileToTeams(file, rules);
  console.log(`${file.padEnd(32)} → ${owners.map((o) => `@${o}`).join(", ") || "(no owner)"}`);
}

const union = matchFilesToTeams(files, rules);
console.log(`\nReviewers for this change set (${files.length} files): ${union.map((o) => `@${o}`).join(", ")}`);
