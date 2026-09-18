import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { isDirectRun, runJob } from "../../src/jobs/lib/entrypoint.js";

const thisFile = fileURLToPath(import.meta.url);

describe("jobs/lib/entrypoint", () => {
  describe("isDirectRun", () => {
    it("returns true when the module is the argv[1] entry script", () => {
      const url = pathToFileURL(thisFile).href;
      assert.equal(isDirectRun(url, ["node", thisFile]), true);
    });

    it("returns false when argv[1] is a different file", () => {
      const url = pathToFileURL(thisFile).href;
      assert.equal(isDirectRun(url, ["node", "some/other/script.ts"]), false);
    });

    it("returns false when there is no argv[1]", () => {
      const url = pathToFileURL(thisFile).href;
      assert.equal(isDirectRun(url, ["node"]), false);
    });

    it("returns false for non-file module URLs", () => {
      assert.equal(isDirectRun("data:text/javascript,1", ["node", "x.ts"]), false);
    });

    it("is not a direct run for a job module imported by another script", () => {
      // node --test launches each test file as argv[1]; a job module imported
      // from it must not be considered the entry script.
      const jobUrl = pathToFileURL(resolve(process.cwd(), "src/jobs/changeset.ts")).href;
      assert.equal(isDirectRun(jobUrl), false);
    });
  });

  describe("runJob", () => {
    it("invokes main and does not exit on success", async () => {
      let called = false;
      runJob("Test", async () => {
        called = true;
      });
      await new Promise((r) => setTimeout(r, 5));
      assert.equal(called, true);
    });

    it("logs a labelled error and exits 1 when main rejects", async () => {
      const originalExit = process.exit;
      const originalError = console.error;
      let exitCode: number | undefined;
      const errors: string[] = [];
      process.exit = ((code?: number) => {
        exitCode = code;
        return undefined as never;
      }) as typeof process.exit;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      };

      try {
        runJob("Boom Job", async () => {
          throw new Error("kaboom");
        });
        await new Promise((r) => setTimeout(r, 5));
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }

      assert.equal(exitCode, 1);
      assert.equal(errors.length, 1);
      assert.match(errors[0]!, /Boom Job failed: kaboom/);
    });

    it("stringifies non-Error rejections", async () => {
      const originalExit = process.exit;
      const originalError = console.error;
      const errors: string[] = [];
      process.exit = (() => undefined as never) as typeof process.exit;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      };

      try {
        runJob("Str Job", async () => {
          throw "plain string";
        });
        await new Promise((r) => setTimeout(r, 5));
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }

      assert.match(errors[0]!, /Str Job failed: plain string/);
    });
  });
});
