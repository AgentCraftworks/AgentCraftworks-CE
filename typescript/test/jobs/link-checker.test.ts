import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  URL_REPLACEMENTS,
  extractUrls,
  suggestReplacement,
  applyReplacements,
  findOutdatedUrls,
  buildUrlPrBody,
  buildUrlIssueBody,
  main,
  type OutdatedUrl,
} from "../../src/jobs/link-checker.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

describe("jobs/link-checker", () => {
  describe("extractUrls", () => {
    it("extracts markdown links, autolinks and bare URLs with line numbers", () => {
      const md = [
        "See [docs](https://example.com/docs).",
        "Autolink: <https://example.com/auto>",
        "Bare https://example.com/bare and more",
        "Relative [link](./local.md) is ignored",
      ].join("\n");
      assert.deepEqual(extractUrls(md), [
        { url: "https://example.com/docs", line: 1 },
        { url: "https://example.com/auto", line: 2 },
        { url: "https://example.com/bare", line: 3 },
      ]);
    });

    it("returns [] for content without URLs", () => {
      assert.deepEqual(extractUrls("nothing here"), []);
    });
  });

  describe("suggestReplacement", () => {
    it("upgrades http to https except for localhost", () => {
      assert.deepEqual(suggestReplacement("http://example.com/x"), {
        newUrl: "https://example.com/x",
        reason: "Upgrade to HTTPS for security",
      });
      assert.equal(suggestReplacement("http://localhost:3000/x"), null);
      assert.equal(suggestReplacement("http://127.0.0.1/x"), null);
    });

    it("migrates docs.microsoft.com to learn.microsoft.com, repeatedly", () => {
      // Regression: global regex lastIndex must not leak between calls.
      for (const path of ["/a", "/b", "/c"]) {
        const s = suggestReplacement(`https://docs.microsoft.com${path}`);
        assert.equal(s?.newUrl, `https://learn.microsoft.com${path}`);
      }
    });

    it("rewrites master branch URLs to main", () => {
      assert.equal(
        suggestReplacement("https://github.com/o/r/blob/master/README.md")?.newUrl,
        "https://github.com/o/r/blob/main/README.md",
      );
      assert.equal(
        suggestReplacement("https://raw.githubusercontent.com/o/r/master/f.txt")?.newUrl,
        "https://raw.githubusercontent.com/o/r/main/f.txt",
      );
    });

    it("returns null for modern URLs", () => {
      assert.equal(suggestReplacement("https://learn.microsoft.com/x"), null);
      assert.equal(suggestReplacement("https://github.com/o/r/blob/main/x"), null);
    });

    it("every replacement rule has a reason", () => {
      for (const r of URL_REPLACEMENTS) assert.ok(r.reason.length > 0);
    });
  });

  describe("applyReplacements", () => {
    it("replaces every occurrence and counts them", () => {
      const md = "a http://example.com b\nc http://example.com d\ne https://fine.example f";
      const { newContent, changes } = applyReplacements(md);
      assert.equal(changes, 2);
      assert.equal(newContent, "a https://example.com b\nc https://example.com d\ne https://fine.example f");
    });

    it("is a no-op for modern content", () => {
      const md = "https://learn.microsoft.com/x";
      assert.deepEqual(applyReplacements(md), { newContent: md, changes: 0 });
    });
  });

  describe("findOutdatedUrls", () => {
    it("reports file, line, reason and suggestion per outdated URL", () => {
      const found = findOutdatedUrls("docs/a.md", "ok https://ok.example\n[x](http://old.example/p)");
      assert.deepEqual(found, [
        {
          file: "docs/a.md",
          line: 2,
          url: "http://old.example/p",
          issue: "Upgrade to HTTPS for security",
          suggestedFix: "https://old.example/p",
        },
      ]);
    });
  });

  describe("report builders", () => {
    const outdated: OutdatedUrl[] = [
      { file: "a.md", line: 3, url: "http://x", issue: "Upgrade", suggestedFix: "https://x" },
      { file: "b.md", line: 1, url: "http://y", issue: "Upgrade" },
    ];

    it("buildUrlPrBody lists changes", () => {
      const { title, body } = buildUrlPrBody(outdated);
      assert.equal(title, "🔗 Modernize 2 outdated URLs");
      assert.match(body, /- \*\*a\.md:3\*\*: Upgrade\n  - `http:\/\/x` → `https:\/\/x`/);
      assert.match(body, /No live network validation is performed/);
    });

    it("buildUrlIssueBody renders a table with N\/A for missing fixes", () => {
      const { title, body } = buildUrlIssueBody(outdated);
      assert.equal(title, "🔗 URL Modernizer: 2 URLs may need updating");
      assert.match(body, /\| `a\.md` \| 3 \| Upgrade \| http:\/\/x \| https:\/\/x \|/);
      assert.match(body, /\| `b\.md` \| 1 \| Upgrade \| http:\/\/y \| N\/A \|/);
      assert.match(body, /CREATE_PR=true/);
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.deepEqual(logs, ["URL Modernizer: Missing required environment variables. Skipping."]);
    });
  });
});
