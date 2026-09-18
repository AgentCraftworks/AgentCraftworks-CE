import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LABEL_MAPPINGS,
  categorizeByTitle,
  categorizeByLabels,
  cleanTitle,
  formatDate,
  categorizePr,
  generateChangelogSection,
  insertChangelogSection,
  buildDocUpdaterPrBody,
  DEFAULT_CHANGELOG_HEADER,
  main,
  type ChangelogEntry,
} from "../../src/jobs/daily-doc-updater.js";
import { captureLogs, withoutJobEnv } from "./helpers.js";

const entry = (over: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  category: "Features",
  emoji: "✨",
  text: "Add thing",
  prNumber: 10,
  author: "alice",
  ...over,
});

describe("jobs/daily-doc-updater", () => {
  describe("categorizeByTitle", () => {
    it("maps conventional-commit prefixes, with optional scope", () => {
      assert.deepEqual(categorizeByTitle("feat: x"), { category: "Features", emoji: "✨" });
      assert.deepEqual(categorizeByTitle("fix(api): x"), { category: "Bug Fixes", emoji: "🐛" });
      assert.deepEqual(categorizeByTitle("docs: x"), { category: "Documentation", emoji: "📚" });
      assert.deepEqual(categorizeByTitle("refactor: x"), { category: "Maintenance", emoji: "♻️" });
      assert.deepEqual(categorizeByTitle("ci: x"), { category: "Maintenance", emoji: "⚙️" });
      assert.deepEqual(categorizeByTitle("!: drop node 18"), { category: "Breaking Changes", emoji: "💥" });
    });

    it("is case-insensitive and returns null for unknown prefixes", () => {
      assert.equal(categorizeByTitle("FEAT: x")?.category, "Features");
      assert.equal(categorizeByTitle("Update README"), null);
    });
  });

  describe("categorizeByLabels", () => {
    it("returns the first mapping in table order", () => {
      assert.deepEqual(categorizeByLabels(["bug", "breaking"]), { category: "Breaking Changes", emoji: "💥" });
      assert.deepEqual(categorizeByLabels(["dependencies"]), { category: "Maintenance", emoji: "📦" });
    });

    it("returns null when no label matches", () => {
      assert.equal(categorizeByLabels(["needs-triage"]), null);
      assert.equal(categorizeByLabels([]), null);
    });

    it("every mapping label is lowercase", () => {
      for (const m of LABEL_MAPPINGS) assert.equal(m.label, m.label.toLowerCase());
    });
  });

  describe("cleanTitle", () => {
    it("strips conventional prefixes and trims", () => {
      assert.equal(cleanTitle("feat(scope):   Add thing  "), "Add thing");
      assert.equal(cleanTitle("FIX: bug"), "bug");
      assert.equal(cleanTitle("!: breaking"), "breaking");
    });

    it("leaves plain titles alone", () => {
      assert.equal(cleanTitle("Plain title"), "Plain title");
    });
  });

  describe("formatDate", () => {
    it("formats as YYYY-MM-DD in UTC", () => {
      assert.equal(formatDate(new Date("2025-03-04T23:59:59Z")), "2025-03-04");
    });
  });

  describe("categorizePr", () => {
    it("prefers labels over the title prefix", () => {
      const e = categorizePr({ number: 5, title: "feat: shiny", labels: ["Bug"], author: "bob" });
      assert.equal(e.category, "Bug Fixes");
      assert.equal(e.text, "shiny");
      assert.equal(e.prNumber, 5);
      assert.equal(e.author, "bob");
    });

    it("falls back to the title, then to Maintenance", () => {
      assert.equal(categorizePr({ number: 1, title: "docs: x", labels: [], author: "a" }).category, "Documentation");
      const fallback = categorizePr({ number: 1, title: "Misc tidy", labels: ["random"], author: "a" });
      assert.equal(fallback.category, "Maintenance");
      assert.equal(fallback.emoji, "🔧");
    });
  });

  describe("generateChangelogSection", () => {
    it("orders categories and omits empty ones", () => {
      const section = generateChangelogSection(
        [
          entry({ category: "Maintenance", emoji: "🔧", text: "Chore", prNumber: 3 }),
          entry({ category: "Breaking Changes", emoji: "💥", text: "Boom", prNumber: 1 }),
          entry({ prNumber: 2 }),
        ],
        "1.2.0",
        new Date("2025-01-15T00:00:00Z"),
      );
      const lines = section.split("\n");
      assert.equal(lines[0], "## [1.2.0] - 2025-01-15");
      const headings = lines.filter((l) => l.startsWith("### "));
      assert.deepEqual(headings, ["### Breaking Changes", "### Features", "### Maintenance"]);
      assert.ok(section.includes("- 💥 Boom (#1) @alice"));
      assert.ok(section.includes("- ✨ Add thing (#2) @alice"));
    });

    it("renders only the heading for no entries", () => {
      const section = generateChangelogSection([], "0.0.1", new Date("2025-01-01T00:00:00Z"));
      assert.equal(section, "## [0.0.1] - 2025-01-01\n");
    });
  });

  describe("insertChangelogSection", () => {
    it("inserts after an existing # Changelog header", () => {
      const current = "# Changelog\n\nintro text\n\n## [1.0.0] - 2024-01-01\n";
      const result = insertChangelogSection(current, "## [1.1.0] - 2025-01-01\n");
      assert.equal(result, "# Changelog\n\n## [1.1.0] - 2025-01-01\n\nintro text\n\n## [1.0.0] - 2024-01-01\n");
    });

    it("prepends a header when none exists", () => {
      const result = insertChangelogSection("## old\n", "## new\n");
      assert.equal(result, "# Changelog\n\n## new\n\n## old\n");
    });

    it("inserts directly after the first blank line of the default header", () => {
      const result = insertChangelogSection(DEFAULT_CHANGELOG_HEADER, "## new\n");
      assert.equal(
        result,
        "# Changelog\n\n## new\n\nAll notable changes to this project will be documented in this file.\n\n",
      );
    });
  });

  describe("buildDocUpdaterPrBody", () => {
    it("counts entries per category", () => {
      const body = buildDocUpdaterPrBody(
        [entry(), entry(), entry({ category: "Bug Fixes" }), entry({ category: "Breaking Changes" })],
        7,
        48,
      );
      assert.match(body, /entries for \*\*7\*\* PRs merged in the last 48 hours/);
      assert.match(body, /- ✨ Features: 2/);
      assert.match(body, /- 🐛 Bug Fixes: 1/);
      assert.match(body, /- 📚 Documentation: 0/);
      assert.match(body, /- 🔧 Maintenance: 0/);
      assert.match(body, /- 💥 Breaking Changes: 1/);
    });
  });

  describe("main", () => {
    it("skips when required env vars are missing", async () => {
      const logs = await withoutJobEnv(() => captureLogs(() => main()));
      assert.deepEqual(logs, ["Daily Doc Updater: Missing required environment variables. Skipping."]);
    });
  });
});
