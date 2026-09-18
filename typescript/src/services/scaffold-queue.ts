/**
 * Scaffold Queue
 *
 * A small in-process, fire-and-forget work queue used by the installation
 * handler to scaffold CODEOWNERS pull requests *after* the webhook response
 * has been sent.  GitHub aborts webhook deliveries after 10 seconds, so any
 * multi-repository work must run outside the request/response cycle.
 *
 * ── Single-replica assumption ────────────────────────────────────────────────
 * The queue lives in process memory.  It is NOT persisted and NOT shared
 * between replicas:
 *   - If the process restarts (deploy, crash, scale-in) while jobs are queued
 *     or running, the remaining work is lost.  Scaffolding is idempotent, so a
 *     webhook redelivery from the GitHub App settings page safely resumes it.
 *   - `SCAFFOLD_CONCURRENCY` bounds concurrency *per replica*.  With N
 *     replicas the effective GitHub API concurrency is N × SCAFFOLD_CONCURRENCY.
 * CE is designed to run as a single replica.  See DEPLOYMENT.md
 * ("Background scaffolding & replicas") for the operational guidance.
 * ────────────────────────────────────────────────────────────────────────────
 */

// ─── Structured logging ───────────────────────────────────────────────────────

export interface LogFields {
  msg: string;
  correlationId?: string;
  [key: string]: unknown;
}

export type Logger = (level: "info" | "warn" | "error", fields: LogFields) => void;

/**
 * Default structured logger: one JSON object per line so Azure Monitor /
 * Log Analytics can index the fields (including `correlationId`).
 */
export const defaultLogger: Logger = (level, fields) => {
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...fields });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
};

// ─── Environment helpers ──────────────────────────────────────────────────────

/**
 * Read a positive integer from the environment, falling back to `fallback`
 * when the variable is absent, non-numeric, or not positive.
 */
export function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const DEFAULT_SCAFFOLD_CONCURRENCY = 3;
export const DEFAULT_SCAFFOLD_MAX_REPOS = 25;

// ─── Queue ────────────────────────────────────────────────────────────────────

export type QueueJob = () => Promise<void>;

export interface ScaffoldQueueOptions {
  /** Maximum number of jobs executing at once. Defaults to `SCAFFOLD_CONCURRENCY` or 3. */
  concurrency?: number;
  logger?: Logger;
}

/**
 * Bounded-concurrency FIFO job queue.
 *
 * `enqueue()` never throws and never blocks the caller: jobs start on the next
 * tick and any rejection is caught and logged so an unhandled rejection can
 * never take the webhook server down.  Tests (and graceful shutdown hooks)
 * can `await queue.onIdle()` to observe completion.
 */
export class ScaffoldQueue {
  private readonly concurrency: number;
  private readonly logger: Logger;
  private readonly pending: QueueJob[] = [];
  private running = 0;
  private idleResolvers: Array<() => void> = [];

  constructor(options: ScaffoldQueueOptions = {}) {
    this.concurrency =
      options.concurrency ??
      readPositiveIntEnv("SCAFFOLD_CONCURRENCY", DEFAULT_SCAFFOLD_CONCURRENCY);
    this.logger = options.logger ?? defaultLogger;
  }

  /** Number of jobs waiting to start. */
  get size(): number {
    return this.pending.length;
  }

  /** Number of jobs currently executing. */
  get active(): number {
    return this.running;
  }

  /** Configured concurrency limit. */
  get limit(): number {
    return this.concurrency;
  }

  /** Schedule a job. Returns immediately; the job runs on a later tick. */
  enqueue(job: QueueJob): void {
    this.pending.push(job);
    // Defer so the caller (the webhook handler) can send its response first.
    setImmediate(() => this.pump());
  }

  /** Resolves once the queue is empty and no job is running. */
  onIdle(): Promise<void> {
    if (this.pending.length === 0 && this.running === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private pump(): void {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      if (!job) break;
      this.running += 1;
      void job()
        .catch((err: unknown) => {
          this.logger("error", {
            msg: "scaffold queue job failed",
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          this.running -= 1;
          if (this.pending.length === 0 && this.running === 0) {
            const resolvers = this.idleResolvers;
            this.idleResolvers = [];
            for (const resolve of resolvers) resolve();
          } else {
            this.pump();
          }
        });
    }
  }
}

let sharedQueue: ScaffoldQueue | undefined;

/** Process-wide queue shared by all webhook deliveries. */
export function getScaffoldQueue(): ScaffoldQueue {
  if (!sharedQueue) {
    sharedQueue = new ScaffoldQueue();
  }
  return sharedQueue;
}

// ─── Rate-limit back-off ──────────────────────────────────────────────────────

export interface BackoffOptions {
  /** Total attempts including the first. Defaults to 3. */
  maxAttempts?: number;
  /** Base delay for exponential back-off when no server hint is present. Defaults to 1000 ms. */
  baseDelayMs?: number;
  /** Upper bound for any single wait. Defaults to 60 000 ms. */
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Clock in epoch milliseconds; injectable for tests. */
  now?: () => number;
  logger?: Logger;
  correlationId?: string;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** True for GitHub primary (429) and secondary (403) rate-limit responses. */
export function isRateLimitError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("status" in err)) return false;
  const status = (err as { status: unknown }).status;
  return status === 403 || status === 429;
}

/**
 * Extract a rate-limit wait hint (in ms) from an Octokit `RequestError`.
 *
 * Honours, in order:
 *   1. `retry-after` (seconds) — sent for secondary rate limits.
 *   2. `x-ratelimit-reset` (epoch seconds) when `x-ratelimit-remaining` is 0.
 * Returns `undefined` when neither header is usable.
 */
export function rateLimitDelayMs(err: unknown, now: number): number | undefined {
  const headers = extractHeaders(err);
  if (!headers) return undefined;

  const retryAfter = headers["retry-after"];
  if (retryAfter !== undefined) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }

  const remaining = headers["x-ratelimit-remaining"];
  const reset = headers["x-ratelimit-reset"];
  if (remaining === "0" && reset !== undefined) {
    const resetEpochSeconds = Number(reset);
    if (Number.isFinite(resetEpochSeconds)) {
      return Math.max(0, resetEpochSeconds * 1000 - now);
    }
  }

  return undefined;
}

function extractHeaders(err: unknown): Record<string, string> | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const candidate =
    (err as { response?: { headers?: unknown } }).response?.headers ??
    (err as { headers?: unknown }).headers;
  if (typeof candidate !== "object" || candidate === null) return undefined;
  const normalised: Record<string, string> = {};
  for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    normalised[key.toLowerCase()] = String(value);
  }
  return normalised;
}

/**
 * Run `fn`, retrying on 403/429 with exponential back-off.
 *
 * Server-provided hints (`retry-after`, `x-ratelimit-reset`) take precedence
 * over the computed delay.  Any other error is rethrown immediately; after
 * `maxAttempts` the last rate-limit error is rethrown.
 */
export async function withRateLimitBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: BackoffOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const logger = options.logger ?? defaultLogger;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err: unknown) {
      if (!isRateLimitError(err) || attempt >= maxAttempts) {
        throw err;
      }
      const hinted = rateLimitDelayMs(err, now());
      const computed = baseDelayMs * 2 ** (attempt - 1);
      const delay = Math.min(hinted ?? computed, maxDelayMs);
      logger("warn", {
        msg: "rate limited — backing off",
        correlationId: options.correlationId,
        attempt,
        maxAttempts,
        delayMs: delay,
        hinted: hinted !== undefined,
        status: (err as { status?: number }).status,
      });
      await sleep(delay);
    }
  }
}
