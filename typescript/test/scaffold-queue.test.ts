/**
 * Scaffold Queue — Tests
 *
 * Covers the in-process bounded-concurrency queue and the rate-limit
 * back-off helper used by the installation handler.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ScaffoldQueue,
  getScaffoldQueue,
  isRateLimitError,
  rateLimitDelayMs,
  readPositiveIntEnv,
  withRateLimitBackoff,
  DEFAULT_SCAFFOLD_CONCURRENCY,
  type Logger,
  type LogFields,
} from "../src/services/scaffold-queue.js";

const silent: Logger = () => {};

function withEnv<T>(name: string, value: string | undefined, fn: () => T): T {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

// ─── readPositiveIntEnv ───────────────────────────────────────────────────────

describe("readPositiveIntEnv", () => {
  it("returns the fallback when unset", () => {
    withEnv("SCAFFOLD_TEST_VAR", undefined, () => {
      assert.equal(readPositiveIntEnv("SCAFFOLD_TEST_VAR", 7), 7);
    });
  });

  it("parses a positive integer", () => {
    withEnv("SCAFFOLD_TEST_VAR", "12", () => {
      assert.equal(readPositiveIntEnv("SCAFFOLD_TEST_VAR", 7), 12);
    });
  });

  it("falls back for zero, negative, or non-numeric values", () => {
    for (const bad of ["0", "-3", "abc", " "]) {
      withEnv("SCAFFOLD_TEST_VAR", bad, () => {
        assert.equal(readPositiveIntEnv("SCAFFOLD_TEST_VAR", 7), 7, `value '${bad}'`);
      });
    }
  });
});

// ─── ScaffoldQueue ────────────────────────────────────────────────────────────

describe("ScaffoldQueue", () => {
  it("defaults concurrency to SCAFFOLD_CONCURRENCY or 3", () => {
    withEnv("SCAFFOLD_CONCURRENCY", undefined, () => {
      assert.equal(new ScaffoldQueue({ logger: silent }).limit, DEFAULT_SCAFFOLD_CONCURRENCY);
      assert.equal(DEFAULT_SCAFFOLD_CONCURRENCY, 3);
    });
    withEnv("SCAFFOLD_CONCURRENCY", "5", () => {
      assert.equal(new ScaffoldQueue({ logger: silent }).limit, 5);
    });
  });

  it("enqueue returns before the job runs", async () => {
    const queue = new ScaffoldQueue({ concurrency: 1, logger: silent });
    let ran = false;
    queue.enqueue(async () => {
      ran = true;
    });
    assert.equal(ran, false);
    assert.equal(queue.size, 1);
    await queue.onIdle();
    assert.equal(ran, true);
  });

  it("never exceeds the concurrency limit", async () => {
    const queue = new ScaffoldQueue({ concurrency: 2, logger: silent });
    let inFlight = 0;
    let peak = 0;
    for (let i = 0; i < 8; i++) {
      queue.enqueue(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 3));
        inFlight--;
      });
    }
    await queue.onIdle();
    assert.equal(peak, 2);
    assert.equal(queue.active, 0);
    assert.equal(queue.size, 0);
  });

  it("logs and swallows job rejections so the queue keeps draining", async () => {
    const errors: LogFields[] = [];
    const queue = new ScaffoldQueue({
      concurrency: 1,
      logger: (level, fields) => {
        if (level === "error") errors.push(fields);
      },
    });
    const order: string[] = [];
    queue.enqueue(async () => {
      throw new Error("boom");
    });
    queue.enqueue(async () => {
      order.push("second");
    });
    await queue.onIdle();
    assert.deepEqual(order, ["second"]);
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.["error"], "boom");
  });

  it("onIdle resolves immediately for an empty queue", async () => {
    const queue = new ScaffoldQueue({ concurrency: 1, logger: silent });
    await queue.onIdle();
  });

  it("supports jobs that enqueue further jobs before going idle", async () => {
    const queue = new ScaffoldQueue({ concurrency: 1, logger: silent });
    const seen: number[] = [];
    queue.enqueue(async () => {
      seen.push(1);
      queue.enqueue(async () => {
        seen.push(2);
      });
    });
    await queue.onIdle();
    assert.deepEqual(seen, [1, 2]);
  });

  it("getScaffoldQueue returns a process-wide singleton", () => {
    assert.equal(getScaffoldQueue(), getScaffoldQueue());
  });
});

// ─── Rate-limit helpers ───────────────────────────────────────────────────────

describe("isRateLimitError", () => {
  it("recognises 403 and 429", () => {
    assert.equal(isRateLimitError({ status: 403 }), true);
    assert.equal(isRateLimitError({ status: 429 }), true);
  });

  it("rejects other statuses and non-objects", () => {
    assert.equal(isRateLimitError({ status: 404 }), false);
    assert.equal(isRateLimitError({ status: 500 }), false);
    assert.equal(isRateLimitError(new Error("x")), false);
    assert.equal(isRateLimitError(null), false);
    assert.equal(isRateLimitError("403"), false);
  });
});

describe("rateLimitDelayMs", () => {
  it("prefers retry-after (seconds)", () => {
    const err = { status: 403, response: { headers: { "retry-after": "30" } } };
    assert.equal(rateLimitDelayMs(err, 0), 30_000);
  });

  it("uses x-ratelimit-reset when remaining is 0", () => {
    const now = 1_700_000_000_000;
    const err = {
      status: 403,
      response: {
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(now / 1000 + 45) },
      },
    };
    assert.equal(rateLimitDelayMs(err, now), 45_000);
  });

  it("ignores x-ratelimit-reset when requests remain", () => {
    const err = {
      status: 403,
      response: { headers: { "x-ratelimit-remaining": "10", "x-ratelimit-reset": "1" } },
    };
    assert.equal(rateLimitDelayMs(err, 0), undefined);
  });

  it("clamps a reset time in the past to zero", () => {
    const err = {
      status: 429,
      headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1" },
    };
    assert.equal(rateLimitDelayMs(err, 5_000_000), 0);
  });

  it("returns undefined without headers", () => {
    assert.equal(rateLimitDelayMs({ status: 403 }, 0), undefined);
    assert.equal(rateLimitDelayMs(null, 0), undefined);
  });
});

describe("withRateLimitBackoff", () => {
  it("returns the result on first success without sleeping", async () => {
    const sleeps: number[] = [];
    const result = await withRateLimitBackoff(async () => "ok", {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      logger: silent,
    });
    assert.equal(result, "ok");
    assert.deepEqual(sleeps, []);
  });

  it("honours retry-after on 403 and then succeeds", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = await withRateLimitBackoff(
      async () => {
        calls++;
        if (calls === 1) {
          throw Object.assign(new Error("abuse"), {
            status: 403,
            response: { headers: { "retry-after": "2" } },
          });
        }
        return "done";
      },
      { sleep: async (ms) => { sleeps.push(ms); }, logger: silent },
    );
    assert.equal(result, "done");
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [2000]);
  });

  it("uses exponential back-off when no hint is present", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await withRateLimitBackoff(
      async () => {
        calls++;
        if (calls < 3) throw Object.assign(new Error("429"), { status: 429 });
        return calls;
      },
      { sleep: async (ms) => { sleeps.push(ms); }, baseDelayMs: 100, logger: silent },
    );
    assert.deepEqual(sleeps, [100, 200]);
  });

  it("caps hinted delays at maxDelayMs", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await withRateLimitBackoff(
      async () => {
        calls++;
        if (calls === 1) {
          throw Object.assign(new Error("x"), {
            status: 403,
            response: { headers: { "retry-after": "3600" } },
          });
        }
        return true;
      },
      { sleep: async (ms) => { sleeps.push(ms); }, maxDelayMs: 5000, logger: silent },
    );
    assert.deepEqual(sleeps, [5000]);
  });

  it("stops after maxAttempts (default 3) and rethrows the rate-limit error", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRateLimitBackoff(
          async () => {
            calls++;
            throw Object.assign(new Error("still limited"), { status: 403 });
          },
          { sleep: async () => {}, logger: silent },
        ),
      /still limited/,
    );
    assert.equal(calls, 3);
  });

  it("does not retry non-rate-limit errors", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRateLimitBackoff(
          async () => {
            calls++;
            throw Object.assign(new Error("nope"), { status: 500 });
          },
          { sleep: async () => {}, logger: silent },
        ),
      /nope/,
    );
    assert.equal(calls, 1);
  });

  it("emits a structured warn log with the correlation id on each retry", async () => {
    const warns: LogFields[] = [];
    let calls = 0;
    await withRateLimitBackoff(
      async () => {
        calls++;
        if (calls === 1) throw Object.assign(new Error("x"), { status: 429 });
        return 1;
      },
      {
        sleep: async () => {},
        correlationId: "installation:1:o/r",
        logger: (level, fields) => {
          if (level === "warn") warns.push(fields);
        },
      },
    );
    assert.equal(warns.length, 1);
    assert.equal(warns[0]?.["correlationId"], "installation:1:o/r");
    assert.equal(warns[0]?.["attempt"], 1);
    assert.equal(warns[0]?.["status"], 429);
  });
});
