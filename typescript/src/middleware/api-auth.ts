/**
 * REST API Guards — bearer-token authentication and per-IP rate limiting
 *
 * Protects the non-webhook REST surface (`/api/handoffs`, `/api/dial`).
 * The webhook endpoint keeps its own HMAC + installation-keyed limiter.
 *
 * Auth model (Community Edition): a single shared bearer token supplied via
 * `GH_CE_API_TOKEN`. Callers send `Authorization: Bearer <token>`.
 *
 * Fail-closed semantics when the token is not configured:
 *  - explicit development/test → allow, logging a warning once
 *  - any other NODE_ENV → 503 with an operator-facing error
 */

import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

type Env = Record<string, string | undefined>;

export const API_TOKEN_ENV = "GH_CE_API_TOKEN";
export const API_RATE_LIMIT_ENV = "API_RATE_LIMIT";
export const DEFAULT_API_RATE_LIMIT = 60;
export const TRUST_PROXY_ENV = "GH_CE_TRUST_PROXY";

/** Trust only operator-specified ingress addresses, never arbitrary forwarded headers. */
export function configureApiProxy(app: Express, env: Env = process.env): void {
  const raw = env[TRUST_PROXY_ENV];
  if (!raw) {
    app.set("trust proxy", false);
    return;
  }
  const addresses = raw.split(",").map((address) => address.trim());
  for (const address of addresses) {
    const parts = address.split("/");
    const family = isIP(parts[0] ?? "");
    const prefix = parts[1];
    if (!family || parts.length > 2 ||
        (prefix !== undefined && (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error(`${TRUST_PROXY_ENV} must contain trusted proxy IP addresses or nonzero CIDR ranges`);
    }
  }
  app.set("trust proxy", addresses);
}

export interface ApiAuthOptions {
  /** Environment source; defaults to `process.env`. Read per request so rotation needs no restart. */
  env?: Env;
  /** Structured logger sink; defaults to `console.warn`. */
  warn?: (entry: Record<string, unknown>) => void;
}

/** Constant-time comparison that does not leak length information via early exit. */
export function tokensMatch(presented: string, expected: string): boolean {
  const presentedBytes = Buffer.from(presented, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  const size = Math.max(presentedBytes.length, expectedBytes.length) + 4;
  const a = Buffer.alloc(size);
  const b = Buffer.alloc(size);
  // Encoding the length prevents zero padding from making distinct credentials equal.
  a.writeUInt32BE(presentedBytes.length);
  b.writeUInt32BE(expectedBytes.length);
  presentedBytes.copy(a, 4);
  expectedBytes.copy(b, 4);
  return timingSafeEqual(a, b);
}

/** Extract the bearer credential from an Authorization header, or null. */
export function extractBearerToken(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(raw);
  return match?.[1] ?? null;
}

export function createApiAuthMiddleware(options: ApiAuthOptions = {}): RequestHandler {
  const env = options.env ?? (process.env as Env);
  const warn =
    options.warn ??
    ((entry: Record<string, unknown>): void => {
      console.warn(JSON.stringify(entry));
    });
  let warnedUnconfigured = false;

  return (req: Request, res: Response, next: NextFunction): void => {
    const expected = env[API_TOKEN_ENV];

    if (expected === undefined || expected === "") {
      if (env["NODE_ENV"] !== "development" && env["NODE_ENV"] !== "test") {
        res.status(503).json({
          error: "Service Unavailable",
          message: `REST API authentication is not configured. Set ${API_TOKEN_ENV} to enable /api/handoffs and /api/dial.`,
          code: "api_token_not_configured",
        });
        return;
      }
      if (!warnedUnconfigured) {
        warnedUnconfigured = true;
        warn({
          msg: "REST API running without authentication",
          reason: `${API_TOKEN_ENV} is unset`,
          nodeEnv: env["NODE_ENV"] ?? "undefined",
          hint: "Allowed only in explicit development/test; set the token before deploying.",
        });
      }
      next();
      return;
    }

    const presented = extractBearerToken(req.headers["authorization"]);
    if (presented === null) {
      res
        .status(401)
        .set("WWW-Authenticate", 'Bearer realm="agentcraftworks-api"')
        .json({
          error: "Unauthorized",
          message: "Missing bearer token",
        });
      return;
    }

    if (!tokensMatch(presented, expected)) {
      res
        .status(401)
        .set("WWW-Authenticate", 'Bearer realm="agentcraftworks-api", error="invalid_token"')
        .json({
          error: "Unauthorized",
          message: "Invalid bearer token",
        });
      return;
    }

    next();
  };
}

export function getApiRateLimitFromEnv(env: Env): number {
  const raw = env[API_RATE_LIMIT_ENV];
  if (raw === undefined) return DEFAULT_API_RATE_LIMIT;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_API_RATE_LIMIT;
  return parsed;
}

export function createApiRateLimiter(env: Env = process.env as Env): RequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    max: getApiRateLimitFromEnv(env),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request): string =>
      `api-ip:${ipKeyGenerator(req.ip ?? "no-ip")}`,
    message: {
      error: "Too Many Requests",
      message: "REST API rate limit exceeded. Retry after the window resets.",
    },
  });
}

/** Default instances bound to `process.env` for use in `index.ts`. */
export const apiRateLimiter: RequestHandler = createApiRateLimiter();
export const apiAuth: RequestHandler = createApiAuthMiddleware();
