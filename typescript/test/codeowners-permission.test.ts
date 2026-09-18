/**
 * CODEOWNERS Parser + Permission Checker — Tests
 *
 * Uses node:test and node:assert/strict.
 * Target: 10+ tests.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  parseCodeowners,
  matchFileToTeams,
  matchFilesToTeams,
} from "../src/utils/codeowners.js";
import {
  checkActionPermission,
} from "../src/middleware/permission-checker.js";
import {
  setDialLevel,
  clearAllDials,
} from "../src/services/autonomy-dial.js";

// ─── CODEOWNERS Parser Tests ────────────────────────────────────────────────

describe("parseCodeowners", () => {
  it("should parse simple CODEOWNERS file", () => {
    const content = `
# Global owners
* @org/code-reviewer

# Frontend
src/frontend/ @org/frontend-team

# Backend
src/backend/ @org/backend-team @org/security
`;
    const rules = parseCodeowners(content, "org");
    assert.equal(rules.length, 3);
    assert.deepEqual(rules[0]!.teams, ["code-reviewer"]);
    assert.deepEqual(rules[1]!.teams, ["frontend-team"]);
    assert.deepEqual(rules[2]!.teams, ["backend-team", "security"]);
  });

  it("should skip comments and blank lines", () => {
    const content = `
# This is a comment

# Another comment
*.ts @org/typescript-team
`;
    const rules = parseCodeowners(content, "org");
    assert.equal(rules.length, 1);
  });

  it("should handle lines with no @-prefixed owners", () => {
    const content = `
*.ts someuser
*.js @org/js-team
`;
    const rules = parseCodeowners(content, "org");
    // Only the @org/js-team rule should be parsed
    assert.equal(rules.length, 1);
    assert.deepEqual(rules[0]!.teams, ["js-team"]);
  });

  it("should strip org prefix from owners", () => {
    const content = `*.ts @myorg/typescript-team`;
    const rules = parseCodeowners(content, "myorg");
    assert.deepEqual(rules[0]!.teams, ["typescript-team"]);
  });

  it("should handle generic @ stripping when no orgName given", () => {
    const content = `*.ts @org/team-a @solo-user`;
    const rules = parseCodeowners(content);
    assert.ok(rules[0]!.teams.includes("team-a"));
    assert.ok(rules[0]!.teams.includes("solo-user"));
  });
});

describe("matchFileToTeams", () => {
  const rules = parseCodeowners(
    `
* @org/default-team
src/frontend/ @org/frontend
src/backend/ @org/backend
*.test.ts @org/test-team
docs/**/*.md @org/docs-team
`,
    "org",
  );

  it("should match wildcard * to any file", () => {
    const teams = matchFileToTeams("README.md", rules);
    assert.ok(teams.includes("default-team"));
  });

  it("should match directory patterns", () => {
    const teams = matchFileToTeams("src/frontend/index.tsx", rules);
    assert.ok(teams.includes("frontend"));
  });

  it("should match extension patterns", () => {
    const teams = matchFileToTeams("src/utils/helper.test.ts", rules);
    assert.ok(teams.includes("test-team"));
  });

  it("should match double-star patterns", () => {
    const teams = matchFileToTeams("docs/api/v2/endpoints.md", rules);
    assert.ok(teams.includes("docs-team"));
  });

  it("should return empty array when no rules match", () => {
    // Create rules with only a specific pattern
    const specificRules = parseCodeowners("src/special/ @org/special-team", "org");
    const teams = matchFileToTeams("other/file.ts", specificRules);
    assert.equal(teams.length, 0);
  });
});

describe("matchFilesToTeams", () => {
  it("should collect teams from multiple files", () => {
    const rules = parseCodeowners(
      `
src/frontend/ @org/frontend
src/backend/ @org/backend
`,
      "org",
    );
    const teams = matchFilesToTeams(
      ["src/frontend/app.tsx", "src/backend/server.ts"],
      rules,
    );
    assert.ok(teams.includes("frontend"));
    assert.ok(teams.includes("backend"));
    assert.equal(teams.length, 2);
  });
});

// ─── Permission Checker Tests ───────────────────────────────────────────────

describe("checkActionPermission", () => {
  beforeEach(() => {
    clearAllDials();
  });

  it("should permit T1 action with default dial level", () => {
    const result = checkActionPermission({
      repoOwner: "owner",
      repoName: "repo",
      agentSlug: "@bot",
      actionType: "view_file",
    });
    assert.equal(result.permitted, true);
    assert.equal(result.tier, "T1");
  });

  it("should deny T5 action even at the CE maximum level (Enterprise-only tier)", () => {
    setDialLevel("owner", "repo", 3, "admin");
    const result = checkActionPermission({
      repoOwner: "owner",
      repoName: "repo",
      agentSlug: "@bot",
      actionType: "merge_pr",
    });
    assert.equal(result.permitted, false);
    assert.equal(result.tier, "T5");
    assert.equal(result.requiredLevel, 5);
    assert.equal(result.dialLevel, 3);
  });

  it("should permit T3 action at the CE maximum level", () => {
    setDialLevel("owner", "repo", 3, "admin");
    const result = checkActionPermission({
      repoOwner: "owner",
      repoName: "repo",
      agentSlug: "@bot",
      actionType: "edit_file",
    });
    assert.equal(result.permitted, true);
    assert.equal(result.tier, "T3");
  });

  it("should throw on missing required fields", () => {
    assert.throws(
      () =>
        checkActionPermission({
          repoOwner: "",
          repoName: "repo",
          agentSlug: "@bot",
          actionType: "view_file",
        }),
      /required/,
    );
  });

  it("should apply env tier cap when provided", () => {
    setDialLevel("owner", "repo", 3, "admin");
    // Production caps at 3, merge_pr requires 5 -> denied
    const result = checkActionPermission({
      repoOwner: "owner",
      repoName: "repo",
      agentSlug: "@bot",
      actionType: "merge_pr",
      envTier: "production",
    });
    assert.equal(result.permitted, false);
  });

  it("should include reason in result", () => {
    setDialLevel("owner", "repo", 3, "admin");
    const result = checkActionPermission({
      repoOwner: "owner",
      repoName: "repo",
      agentSlug: "@bot",
      actionType: "view_file",
    });
    assert.ok(result.reason.length > 0);
    assert.ok(result.reason.includes("permitted"));
  });
});
