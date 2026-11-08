import { readFile, writeFile } from "node:fs/promises";

const rootPackagePath = new URL("../package.json", import.meta.url);
const workspacePackagePath = new URL("../typescript/package.json", import.meta.url);
const lockFilePath = new URL("../package-lock.json", import.meta.url);

const [rootPackageText, workspacePackageText, lockFileText] = await Promise.all([
  readFile(rootPackagePath, "utf8"),
  readFile(workspacePackagePath, "utf8"),
  readFile(lockFilePath, "utf8"),
]);

const rootPackage = JSON.parse(rootPackageText);
const workspacePackage = JSON.parse(workspacePackageText);
const lockFile = JSON.parse(lockFileText);

if (typeof workspacePackage.version !== "string" || !workspacePackage.version) {
  throw new Error("typescript/package.json must declare a package version");
}
if (!lockFile.packages?.[""] || !lockFile.packages?.["typescript"]) {
  throw new Error("package-lock.json must include the root and TypeScript workspace");
}

rootPackage.version = workspacePackage.version;
lockFile.version = workspacePackage.version;
lockFile.packages[""].version = workspacePackage.version;
lockFile.packages["typescript"].version = workspacePackage.version;

await Promise.all([
  writeFile(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`),
  writeFile(lockFilePath, `${JSON.stringify(lockFile, null, 2)}\n`),
]);
