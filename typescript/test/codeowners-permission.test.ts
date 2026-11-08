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
import { configureRuntimePolicy } from "../src/config/runtime.js";
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
    assert.equal(rules.length, 1);
    assert.deepEqual(rules[0]!.teams, ["js-team"]);
  });

  it("retains a matching pattern with no owners", () => {
    const rules = parseCodeowners("private/**", "org");
    assert.equal(rules.length, 1);
    assert.deepEqual(rules[0]!.teams, []);
  });

  it("parses escaped spaces and hashes in patterns", () => {
    const rules = parseCodeowners(String.raw`path/with\ space/\#draft.md @org/docs`);
    assert.equal(rules.length, 1);
    assert.deepEqual(rules[0]!.teams, ["docs"]);
    assert.deepEqual(
      matchFileToTeams("path/with space/#draft.md", rules),
      ["docs"],
    );
  });

  it("ignores inline comments after owners", () => {
    const rules = parseCodeowners(
      "*.js @org/javascript # inline comment",
      "org",
    );
    assert.equal(rules.length, 1);
    assert.deepEqual(rules[0]!.teams, ["javascript"]);
  });

  it("ignores escaped leading hashes and unsupported negation patterns", () => {
    const rules = parseCodeowners(
      String.raw`\#draft.md @org/ignored` + "\n!private/** @org/ignored",
      "org",
    );
    assert.deepEqual(rules, []);
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
  it("uses only the last matching rule, not the union of matching owners", () => {
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

    assert.deepEqual(matchFileToTeams("README.md", rules), ["default-team"]);
    assert.deepEqual(
      matchFileToTeams("src/frontend/index.tsx", rules),
      ["frontend"],
    );
    assert.deepEqual(
      matchFileToTeams("src/utils/helper.test.ts", rules),
      ["test-team"],
    );
    assert.deepEqual(
      matchFileToTeams("docs/api/v2/endpoints.md", rules),
      ["docs-team"],
    );
  });

  it("shows why a catch-all must precede a specific rule", () => {
    const rules = parseCodeowners("*.ts @org/typescript\n* @org/default", "org");
    assert.deepEqual(matchFileToTeams("src/index.ts", rules), ["default"]);
  });

  it("allows a later ownerless pattern to clear an earlier match", () => {
    const rules = parseCodeowners("* @org/default\nprivate/**");
    assert.deepEqual(matchFileToTeams("private/credentials.json", rules), []);
  });

  it("matches an unanchored pattern at any directory depth", () => {
    const rules = parseCodeowners("*.ts @org/typescript", "org");
    assert.deepEqual(
      matchFileToTeams("src/deep/module.ts", rules),
      ["typescript"],
    );
  });

  it("anchors slash-containing and leading-slash patterns at the repository root", () => {
    const rules = parseCodeowners(
      "src/*.ts @org/src\n/root-only.ts @org/root",
      "org",
    );
    assert.deepEqual(matchFileToTeams("src/index.ts", rules), ["src"]);
    assert.deepEqual(matchFileToTeams("nested/src/index.ts", rules), []);
    assert.deepEqual(matchFileToTeams("root-only.ts", rules), ["root"]);
    assert.deepEqual(matchFileToTeams("nested/root-only.ts", rules), []);
  });

  it("matches a trailing-slash directory at any depth unless it contains a slash", () => {
    const rules = parseCodeowners(
      "generated/ @org/generated\nsrc/private/ @org/private",
      "org",
    );
    assert.deepEqual(
      matchFileToTeams("nested/generated/output.js", rules),
      ["generated"],
    );
    assert.deepEqual(
      matchFileToTeams("src/private/key.ts", rules),
      ["private"],
    );
    assert.deepEqual(matchFileToTeams("nested/src/private/key.ts", rules), []);
  });

  it("matches ** across zero or more path segments while * stays within one segment", () => {
    const rules = parseCodeowners(
      "**/README.md @org/readme\nsrc/**/*.ts @org/source\nsrc/*.js @org/direct",
      "org",
    );
    assert.deepEqual(matchFileToTeams("README.md", rules), ["readme"]);
    assert.deepEqual(matchFileToTeams("docs/README.md", rules), ["readme"]);
    assert.deepEqual(matchFileToTeams("src/index.ts", rules), ["source"]);
    assert.deepEqual(
      matchFileToTeams("src/deep/nested/index.ts", rules),
      ["source"],
    );
    assert.deepEqual(matchFileToTeams("src/nested/index.js", rules), []);
    assert.deepEqual(matchFileToTeams("src/index.js", rules), ["direct"]);
  });

  it("should return empty array when no rules match", () => {
    // Create rules with only a specific pattern
    const specificRules = parseCodeowners("src/special/ @org/special-team", "org");
    const teams = matchFileToTeams("other/file.ts", specificRules);
    assert.equal(teams.length, 0);
  });

  it("unions the winning owners across multiple files", () => {
    const rules = parseCodeowners(
      "* @org/default\nsrc/** @org/source\nsrc/private/**",
      "org",
    );
    assert.deepEqual(
      matchFilesToTeams(
        ["src/index.ts", "src/private/key.ts", "README.md"],
        rules,
      ),
      ["source", "default"],
    );
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
    configureRuntimePolicy({
      GH_CE_ENVIRONMENT: "local",
      GH_CE_REPO_CEILINGS: "owner/repo=5",
    });
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

  it("should deny T5 action with low dial level", () => {
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
  });

  it("should deny T5 action without a reviewed repository ceiling", () => {
    setDialLevel("owner", "repo", 5, "admin");
    const result = checkActionPermission({
      repoOwner: "owner",
      repoName: "repo",
      agentSlug: "@bot",
      actionType: "merge_pr",
    });
    assert.equal(result.permitted, false);
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

  it("should apply the server-configured environment ceiling", () => {
    setDialLevel("owner", "repo", 5, "admin");
    configureRuntimePolicy({
      GH_CE_ENVIRONMENT: "production",
      GH_CE_REPO_CEILINGS: "owner/repo=5",
    });
    // Production caps at 3, merge_pr requires 5 -> denied
    const result = checkActionPermission({
      repoOwner: "owner",
      repoName: "repo",
      agentSlug: "@bot",
      actionType: "merge_pr",
    });
    assert.equal(result.permitted, false);
  });

  it("should include reason in result", () => {
    setDialLevel("owner", "repo", 5, "admin");
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
