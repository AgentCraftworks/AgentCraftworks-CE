import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import type { NextFunction, Request, Response } from "express";
import { getHandoff } from "../services/handoff-service.js";

export const API_SCOPES = [
  "handoffs:read", "handoffs:write", "dial:write", "dial:elevate", "audit:read",
] as const;
export type ApiScope = typeof API_SCOPES[number];

export interface ApiPrincipal {
  readonly name: string;
  readonly scopes: readonly ApiScope[];
  readonly repos: readonly string[];
}

interface HashedPrincipal extends ApiPrincipal {
  readonly sha256: string;
}

export const OPERATOR_PRINCIPAL: ApiPrincipal = {
  name: "operator", scopes: API_SCOPES, repos: ["*/*"],
};

/** Load hash-only credentials; invalid configuration must never grant access. */
export function loadApiPrincipals(env: Record<string, string | undefined>): readonly HashedPrincipal[] {
  const principals: HashedPrincipal[] = [];
  const file = env["GH_CE_API_TOKENS_FILE"];
  if (file) {
    if (statSync(file).size > 1024 * 1024) throw new Error("Token file exceeds size limit");
    const entries: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(entries) || entries.length === 0) throw new Error("Token file must be a nonempty array");
    const names = new Set<string>();
    const hashes = new Set<string>();
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") throw new Error("Invalid token entry");
      const record = entry as Record<string, unknown>;
      const { name, sha256, scopes, repos } = record;
      if (typeof name !== "string" || !/^[a-zA-Z0-9_.-]{1,64}$/.test(name) ||
          name === "operator" || names.has(name) ||
          typeof sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(sha256) ||
          hashes.has(sha256.toLowerCase()) ||
          !Array.isArray(scopes) || !scopes.every(
            (scope: unknown) => typeof scope === "string" && API_SCOPES.some((valid) => valid === scope),
          ) ||
          !Array.isArray(repos) || !repos.every(
            (repo: unknown) => typeof repo === "string" &&
              /^[a-zA-Z0-9_-]+\/(?:[a-zA-Z0-9_.-]+|\*)$/.test(repo),
          ) ||
          Object.keys(record).some((key) => !["name", "sha256", "scopes", "repos"].includes(key))) {
        throw new Error("Invalid or duplicate token entry");
      }
      names.add(name);
      hashes.add(sha256.toLowerCase());
      principals.push({ name, sha256: sha256.toLowerCase(), scopes: scopes as ApiScope[], repos });
    }
  }
  const operator = env["GH_CE_API_TOKEN"];
  if (operator) {
    const sha256 = createHash("sha256").update(operator).digest("hex");
    if (principals.some((principal) => principal.sha256 === sha256)) {
      throw new Error("Operator credential duplicates a scoped credential");
    }
    principals.push({ ...OPERATOR_PRINCIPAL, sha256 });
  }
  return principals;
}

/** Compare every configured digest without returning at the first match. */
export function authenticateApiToken(token: string, principals: readonly HashedPrincipal[]): ApiPrincipal | undefined {
  const digest = createHash("sha256").update(token).digest();
  let matched: ApiPrincipal | undefined;
  for (const principal of principals) {
    if (timingSafeEqual(digest, Buffer.from(principal.sha256, "hex"))) {
      matched = { name: principal.name, scopes: principal.scopes, repos: principal.repos };
    }
  }
  return matched;
}

/** Read the principal established by the authentication middleware, never by a request body. */
export function getApiPrincipal(res: Response): ApiPrincipal | undefined {
  return res.locals["apiPrincipal"] as ApiPrincipal | undefined;
}

/** Repository patterns match a whole owner/repository, case-insensitively. */
export function canAccessRepository(principal: ApiPrincipal, repository: string): boolean {
  if (principal.repos.includes("*/*")) return true;
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) return false;
  const normalized = repository.toLowerCase();
  return principal.repos.some((pattern) => {
    const target = pattern.toLowerCase();
    return target.endsWith("/*") ? normalized.startsWith(target.slice(0, -1)) : normalized === target;
  });
}

/** Enforce operation scopes and repository boundaries before either REST router executes. */
export function authorizeApiRequest(req: Request, res: Response, next: NextFunction): void {
  const principal = getApiPrincipal(res);
  if (!principal) {
    res.status(401).json({ error: "Unauthorized", message: "Authenticated principal required" });
    return;
  }
  const dial = req.baseUrl === "/api/dial";
  const path = req.path.replace(/\/+$/, "") || "/";
  const scope: ApiScope = req.method === "GET" || (dial && path === "/check")
    ? "handoffs:read" : dial ? "dial:write" : "handoffs:write";
  if (!principal.scopes.includes(scope)) {
    res.status(403).json({ error: "Forbidden", code: "insufficient_scope", requiredScope: scope });
    return;
  }

  const repositories: string[] = [];
  if (dial) {
    if (path === "/check") {
      const body: unknown = req.body;
      if (body && typeof body === "object" && "owner" in body && "repo" in body &&
          typeof body.owner === "string" && typeof body.repo === "string") {
        repositories.push(`${body.owner}/${body.repo}`);
      } else {
        res.status(400).json({ error: "Bad Request", message: "owner and repo are required and must be strings" });
        return;
      }
    } else {
      const segments = path.split("/").filter(Boolean);
      if (segments.length === 2) {
        try {
          repositories.push(segments.map((segment) => decodeURIComponent(segment)).join("/"));
        } catch {
          res.status(400).json({ error: "Bad Request", message: "Invalid repository path" });
          return;
        }
      }
    }
  } else if (path === "/" || path === "/stats") {
    if (req.method === "GET") {
      for (const key of ["repo", "repository_full_name"]) {
        const value = req.query[key];
        if (value !== undefined) repositories.push(typeof value === "string" ? value : "");
      }
    } else {
      const body: unknown = req.body;
      repositories.push(body && typeof body === "object" && "repository" in body &&
        typeof body.repository === "string" ? body.repository : "");
    }
  } else {
    let id: string | undefined;
    try {
      id = decodeURIComponent(path.split("/")[1] ?? "");
    } catch {
      res.status(400).json({ error: "Bad Request", message: "Invalid handoff path" });
      return;
    }
    const handoff = id ? getHandoff(id) : undefined;
    if (handoff) repositories.push(handoff.repository_full_name);
  }
  if (repositories.some((repository) => !canAccessRepository(principal, repository))) {
    res.status(403).json({ error: "Forbidden", code: "repository_not_allowed" });
    return;
  }
  next();
}
