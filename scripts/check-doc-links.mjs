#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", "node_modules", "dist"]);
const contentExtensions = new Set([".md", ".html"]);
const files = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await collect(path.join(directory, entry.name));
      }
    } else if (contentExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(path.join(directory, entry.name));
    }
  }
}

function extractLinks(content) {
  const links = [];
  const markdown = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  const html = /(?:href|src)=["']([^"']+)["']/gi;

  for (const match of content.matchAll(markdown)) links.push(match[1]);
  for (const match of content.matchAll(html)) links.push(match[1]);
  return links;
}

function unescapeMarkdownDestination(destination) {
  return destination.replace(/\\([()\\])/g, "$1");
}

async function checkLink(sourceFile, rawLink) {
  const link = unescapeMarkdownDestination(rawLink);
  if (
    !link ||
    link.startsWith("#") ||
    /^(?:\.\.\/){2}(?:issues|pulls|discussions)(?:\/|$)/i.test(link) ||
    /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link)
  ) {
    return;
  }

  const pathname = decodeURIComponent(link.split(/[?#]/, 1)[0]);
  if (!pathname) return;

  const target = path.resolve(path.dirname(sourceFile), pathname);
  try {
    await access(target);
  } catch {
    throw new Error(
      `${path.relative(root, sourceFile)}: missing local link "${rawLink}"`,
    );
  }
}

await collect(root);
const failures = [];

for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const link of extractLinks(content)) {
    try {
      await checkLink(file, link);
    } catch (error) {
      failures.push(error.message);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} Markdown/HTML files; no broken local links.`);
}
