#!/usr/bin/env node
/**
 * check-ghaw-config.mjs — guards against schedule drift between
 * `.github/ghaw-config.json` (source of truth), the matching
 * `.github/workflows/<id>.yml`, and the schedule table in `docs/GHAW_WORKFLOWS.md`.
 *
 * Usage: node scripts/check-ghaw-config.mjs
 * Exit code 0 = in sync, 1 = drift or missing files.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, ".github", "ghaw-config.json");
const docsPath = join(root, "docs", "GHAW_WORKFLOWS.md");

/** Extracts every `cron:` expression from a workflow YAML file. */
export function extractWorkflowCrons(yaml) {
  return [...yaml.matchAll(/^\s*-?\s*cron:\s*["']?([^"'\n#]+?)["']?\s*(?:#.*)?$/gm)].map((m) => m[1].trim());
}

/** Finds the docs table row for a workflow and returns its Trigger cell, or null. */
export function findDocsTriggerCell(markdown, displayName) {
  const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const row = markdown.match(new RegExp(`^\\|\\s*\\*\\*${escaped}\\*\\*\\s*\\|([^|]*)\\|`, "m"));
  return row ? row[1].trim() : null;
}

/** Returns a list of human-readable problems (empty when in sync). */
export function checkGhawConfig({ config, readWorkflow, docs }) {
  const problems = [];

  for (const wf of config.workflows ?? []) {
    const cron = wf.schedule?.cron;
    if (!cron) continue;

    const yaml = readWorkflow(wf.id);
    if (yaml === null) {
      problems.push(`${wf.id}: workflow file .github/workflows/${wf.id}.yml not found`);
    } else {
      const crons = extractWorkflowCrons(yaml);
      if (!crons.includes(cron)) {
        problems.push(`${wf.id}: workflow cron ${JSON.stringify(crons)} != config cron "${cron}"`);
      }
    }

    const displayName = wf.name.replace(/^GH-AW:\s*/, "");
    const trigger = findDocsTriggerCell(docs, displayName);
    if (trigger !== null && !trigger.includes(cron)) {
      problems.push(`${wf.id}: docs trigger cell "${trigger}" does not mention config cron "${cron}"`);
    }
  }

  return problems;
}

function main() {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const docs = readFileSync(docsPath, "utf8");
  const readWorkflow = (id) => {
    const p = join(root, ".github", "workflows", `${id}.yml`);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };

  const problems = checkGhawConfig({ config, readWorkflow, docs });
  if (problems.length > 0) {
    console.error("ghaw-config drift detected:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    console.error("\n.github/ghaw-config.json is the source of truth; update the workflow/docs to match.");
    process.exit(1);
  }
  console.log("ghaw-config: workflows and docs are in sync with .github/ghaw-config.json");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
