import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(root, ...parts), "utf8");

describe("single workspace dependency graph", () => {
  it("has exactly one lockfile and no ignored workspace overrides", () => {
    const lockfiles: string[] = [];
    function visit(directory: string): void {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.name === "package-lock.json") lockfiles.push(relative(root, path));
      }
    }
    visit(root);
    assert.deepEqual(lockfiles, ["package-lock.json"]);
    const manifest = JSON.parse(read("package.json")) as { workspaces: string[] };
    assert.ok(manifest.workspaces.includes("typescript"));
    const workspace = JSON.parse(read("typescript", "package.json")) as Record<string, unknown>;
    assert.equal(workspace["overrides"], undefined);
    const lock = JSON.parse(read("package-lock.json")) as { packages: Record<string, unknown> };
    assert.ok(lock.packages["typescript"]);
  });

  it("uses the root lock in every Actions cache and enforces the high-severity audit gate", () => {
    for (const file of readdirSync(join(root, ".github", "workflows"))) {
      if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
      const workflow = read(".github", "workflows", file);
      assert.ok(!workflow.includes("typescript/package-lock.json"), file);
      for (const match of workflow.matchAll(/cache-dependency-path:\s*(\S+)/g)) {
        assert.equal(match[1], "package-lock.json", file);
      }
    }
    const manifest = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    assert.equal(manifest.scripts["audit:production"], "npm audit --omit=dev --audit-level=high");
    const ci = read(".github", "workflows", "ci.yml");
    assert.match(ci, /- name: Audit production dependencies\s+run: npm run audit:production/);
    assert.ok(!ci.includes("continue-on-error"));
  });

  it("uses root manifests in both Docker stages and root build contexts everywhere", () => {
    const dockerfile = read("typescript", "Dockerfile");
    assert.equal(dockerfile.match(/COPY package\.json package-lock\.json \.\//g)?.length, 2);
    assert.equal(dockerfile.match(/COPY typescript\/package\.json \.\/typescript\/package\.json/g)?.length, 2);
    assert.match(dockerfile, /RUN npm ci --omit=dev/);
    assert.match(dockerfile, /COPY --from=builder \/app\/typescript\/dist \.\/typescript\/dist/);
    assert.match(dockerfile, /CMD \["node", "typescript\/dist\/index\.js"\]/);
    assert.match(read("docker-compose.yml"), /context: \.\s+dockerfile: typescript\/Dockerfile/);
    assert.match(read("azure.yaml"), /context: \.\./);
    for (const file of ["deploy-staging.yml", "deploy-production.yml"]) {
      assert.match(read(".github", "workflows", file), /--file \.\/typescript\/Dockerfile \\\s+\.(?:\s|$)/);
    }
    const ignore = read(".dockerignore");
    assert.ok(ignore.includes("**/node_modules"));
    assert.ok(ignore.includes("**/.env"));
  });
});
