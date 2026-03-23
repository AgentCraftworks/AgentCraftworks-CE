/**
 * GitHub App Authentication Utilities
 *
 * Handles:
 *   - JWT generation for GitHub App authentication
 *   - Installation token exchange with caching
 *   - Webhook signature verification
 *   - Octokit instance creation with authentication
 *   - Octokit instance creation for installations
 *
 * Environment variables:
 *   GH_CE_APP_ID         — GitHub App ID (Community Edition)
 *   GH_CE_APP_PRIVATE_KEY — PEM-encoded private key (or base64-encoded)
 *   GH_CE_WEBHOOK_SECRET  — Webhook secret for HMAC-SHA256 verification
 */

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { Octokit } from "@octokit/rest";

// ─── Constants ────────────────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer before expiry
const JWT_EXPIRY_SECONDS = 10 * 60; // 10 minutes (GitHub max)

// ─── Token cache ──────────────────────────────────────────────────────────────────────

interface CachedToken {
  token: string;
  expiresAt: number;
  installationId: number;
}

const tokenCache = new Map<string, CachedToken>();

// ─── JWT Generation ─────────────────────────────────────────────────────────────────

/**
 * Generate a JWT for GitHub App authentication.
 * Used to authenticate as the GitHub App itself (not as an installation).
 */
export function generateAppJwt(
  appId?: string,
  privateKey?: string,
): string {
  const resolvedAppId = appId ?? process.env["GH_CE_APP_ID"];
  let resolvedKey = privateKey ?? process.env["GH_CE_APP_PRIVATE_KEY"];

  if (!resolvedAppId) {
    throw new Error("GH_CE_APP_ID is required (env var or parameter)");
  }
  if (!resolvedKey) {
    throw new Error("GH_CE_APP_PRIVATE_KEY is required (env var or parameter)");
  }

  // Support base64-encoded keys (common in CI/CD)
  if (!resolvedKey.startsWith("-----")) {
    resolvedKey = Buffer.from(resolvedKey, "base64").toString("utf-8");
  }

  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iat: now - 60, // Issued 60 seconds in the past (clock skew tolerance)
    exp: now + JWT_EXPIRY_SECONDS,
    iss: resolvedAppId,
  };

  return jwt.sign(payload, resolvedKey, { algorithm: "RS256" });
}

// ─── Installation Token ────────────────────────────────────────────────────────────

/**
 * Get or create an installation token with caching.
 *
 * Exchanges the GitHub App JWT for an installation access token by calling
 * the GitHub API. Tokens are cached until near expiry to minimize API calls.
 */
export async function getInstallationToken(
  installationId: number,
  appId?: string,
  privateKey?: string,
): Promise<string> {
  const cacheKey = `installation_${installationId}`;
  const cached = tokenCache.get(cacheKey);

  // Return cached token if valid
  if (cached && cached.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    return cached.token;
  }

  // Generate JWT to authenticate as the App
  const appJwt = generateAppJwt(appId, privateKey);

  // Exchange JWT for installation token via GitHub API
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "AgentCraftworks-CE/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to get installation token (${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as { token: string; expires_at: string };
  const token = data.token;
  const expiresAt = new Date(data.expires_at).getTime();

  // Cache the token
  tokenCache.set(cacheKey, {
    token,
    expiresAt,
    installationId,
  });

  return token;
}

// ─── Webhook Signature Verification ──────────────────────────────────────────────

/**
 * Verify webhook payload signature using HMAC-SHA256.
 *
 * @param payload   - Raw request body (string or Buffer)
 * @param signature - Value of `X-Hub-Signature-256` header
 * @param secret    - Webhook secret (defaults to GH_WEBHOOK_SECRET env var)
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string | undefined | null,
  secret?: string,
): boolean {
  const resolvedSecret = secret ?? process.env["GH_CE_WEBHOOK_SECRET"];

  if (!resolvedSecret) {
    throw new Error("GH_CE_WEBHOOK_SECRET is required (env var or parameter)");
  }

  if (!signature) {
    return false;
  }

  const payloadString =
    typeof payload === "string" ? payload : payload.toString("utf-8");

  const hmac = crypto.createHmac("sha256", resolvedSecret);
  const digest = "sha256=" + hmac.update(payloadString).digest("hex");

  const sigBuf = Buffer.from(signature);
  const digBuf = Buffer.from(digest);

  if (sigBuf.length !== digBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, digBuf);
}

// ─── Cache Management ──────────────────────────────────────────────────────────────

/** Clear token cache for a specific installation or all installations. */
export function clearTokenCache(installationId?: number): void {
  if (installationId !== undefined) {
    tokenCache.delete(`installation_${installationId}`);
  } else {
    tokenCache.clear();
  }
}

// ─── Octokit Instance ─────────────────────────────────────────────────────────────

/**
 * Create an authenticated Octokit instance for a specific installation.
 * Uses cached installation tokens.
 */
export async function getInstallationOctokit(
  installationId: number,
  appId?: string,
  privateKey?: string,
): Promise<Octokit> {
  const token = await getInstallationToken(installationId, appId, privateKey);
  
  return new Octokit({
    auth: token,
    userAgent: "AgentCraftworks-CE/1.0",
  });
}


/** Get cache statistics for monitoring. */
export function getCacheStats(): {
  totalCached: number;
  entries: Array<{
    installationId: number;
    expiresIn: number;
    isExpired: boolean;
  }>;
} {
  const entries: Array<{
    installationId: number;
    expiresIn: number;
    isExpired: boolean;
  }> = [];

  for (const value of tokenCache.values()) {
    entries.push({
      installationId: value.installationId,
      expiresIn: Math.round((value.expiresAt - Date.now()) / 1000),
      isExpired: value.expiresAt <= Date.now(),
    });
  }

  return { totalCached: tokenCache.size, entries };
}

// ─── Octokit Instance Creation ────────────────────────────────────────────────────

/**
 * Create an Octokit instance authenticated for a specific repository.
 * 
 * This is a simplified version that uses a demo token or app credentials
 * to create an authenticated Octokit instance. In production, you'd want to
 * find the installation ID for the repo and use that to get a token.
 * 
 * For now, we'll use the App JWT for general API access, which has limited permissions
 * but is sufficient for reading public repository data.
 */
export async function getOctokit(
  owner: string,
  repo: string,
): Promise<Octokit> {
  // If we don't have app credentials, use unauthenticated access
  const appId = process.env["GH_CE_APP_ID"];
  const privateKey = process.env["GH_CE_APP_PRIVATE_KEY"];
  
  if (!appId || !privateKey) {
    // Unauthenticated Octokit for public repos
    return new Octokit({
      userAgent: "AgentCraftworks-CE/1.0",
    });
  }

  // For authenticated access, we'd need the installation ID
  // For now, use App JWT which works for some read operations
  const appJwt = generateAppJwt(appId, privateKey);
  
  return new Octokit({
    auth: appJwt,
    userAgent: "AgentCraftworks-CE/1.0",
  });
}
