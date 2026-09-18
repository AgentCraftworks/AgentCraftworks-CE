/**
 * Shared helpers for GH-AW job tests.
 */

const JOB_ENV_VARS = [
  "GITHUB_TOKEN",
  "REPOSITORY",
  "PR_NUMBER",
  "ISSUE_NUMBER",
  "RUN_ID",
  "WORKFLOW_RUN_ID",
  "CHECK_RUN_ID",
  "DRY_RUN",
  "CREATE_PR",
  "TARGET_DIR",
  "LOOKBACK_HOURS",
] as const;

/**
 * Runs `fn` with every job-related env var removed, restoring the previous
 * values afterwards. Lets us exercise the "missing env → skip" path of each
 * job's `main()` without touching the network.
 */
export async function withoutJobEnv<T>(fn: () => Promise<T>): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const key of JOB_ENV_VARS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/**
 * Captures `console.log` output for the duration of `fn`.
 */
export async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return logs;
}
