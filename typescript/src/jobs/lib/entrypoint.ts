/**
 * Entry-point detection for GH-AW job scripts.
 *
 * Every job in `src/jobs/` is executed directly via `npx tsx src/jobs/<name>.ts`
 * in its workflow, but tests import the same modules to exercise their pure
 * helpers. `isDirectRun` lets a module run `main()` only when it is the
 * process entry script, so importing it stays side-effect free.
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function normalize(path: string): string {
  let resolved: string;
  try {
    resolved = realpathSync(path);
  } catch {
    resolved = resolve(path);
  }
  // Windows paths are case-insensitive and may differ in drive-letter casing.
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * Returns true when `moduleUrl` (pass `import.meta.url`) is the script that
 * Node was launched with (`process.argv[1]`).
 */
export function isDirectRun(
  moduleUrl: string,
  argv: readonly string[] = process.argv,
): boolean {
  const entry = argv[1];
  if (!entry) return false;
  if (!moduleUrl.startsWith("file:")) return false;
  try {
    return normalize(entry) === normalize(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

/**
 * Standard bootstrap used by every job: run `main`, log a labelled error and
 * exit non-zero on failure.
 */
export function runJob(label: string, main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    console.error(`${label} failed:`, err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
