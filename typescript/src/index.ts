/**
 * AgentCraftworks Open-Source Core
 * Webhook-driven GitHub App for AI agent orchestration
 */

import { createRequire } from "node:module";
import type { Request, Response } from "express";
import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import dialRouter from "./handlers/autonomy-dial-routes.js";
import handoffRouter from "./handlers/handoff-api.js";
import { webhookHandler } from "./handlers/pull-request.js";
import { verifyWebhookSignatureMiddleware } from "./middleware/webhook-signature.js";
import { initHandoffService } from "./services/handoff-service.js";
import { initContextService } from "./services/context-service.js";

// Resolves from both src/ (tsx) and the bundled dist/index.js
const { version: PACKAGE_VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const app = express();

export const DEFAULT_IP_RATE_LIMIT = 2000;

export function getIpRateLimitFromEnv(
  env: Record<string, string | undefined>,
): number {
  const raw = env["GH_WEBHOOK_IP_RATE_LIMIT"];
  if (raw === undefined) return DEFAULT_IP_RATE_LIMIT;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_IP_RATE_LIMIT;
  return parsed;
}

const IP_RATE_LIMIT = getIpRateLimitFromEnv(
  process.env as Record<string, string | undefined>,
);

const ipRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: IP_RATE_LIMIT,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    `ip:${ipKeyGenerator(req.ip ?? "no-ip")}`,
  skipSuccessfulRequests: false,
});

app.use("/api/webhook", ipRateLimiter);

app.use(
  express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as unknown as Record<string, unknown>)["rawBody"] =
        buf.toString("utf-8");
    },
  }),
);

const DEFAULT_WEBHOOK_RATE_LIMIT = 500;
const WEBHOOK_RATE_LIMIT_ENV =
  process.env["GH_WEBHOOK_RATE_LIMIT"] ?? process.env["WEBHOOK_RATE_LIMIT"];
const WEBHOOK_RATE_LIMIT_RAW = parseInt(
  WEBHOOK_RATE_LIMIT_ENV ?? String(DEFAULT_WEBHOOK_RATE_LIMIT),
  10,
);
const WEBHOOK_RATE_LIMIT =
  Number.isNaN(WEBHOOK_RATE_LIMIT_RAW) || WEBHOOK_RATE_LIMIT_RAW <= 0
    ? DEFAULT_WEBHOOK_RATE_LIMIT
    : WEBHOOK_RATE_LIMIT_RAW;

const MAX_INSTALLATION_ID = 1e15;

const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: WEBHOOK_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const payload = req.body as
      | { installation?: { id: number } }
      | undefined;
    const installationId = payload?.installation?.id;
    if (
      installationId &&
      Number.isInteger(installationId) &&
      installationId > 0 &&
      installationId < MAX_INSTALLATION_ID
    ) {
      return `installation:${installationId}`;
    }
    return `ip:${ipKeyGenerator(req.ip ?? "no-ip")}`;
  },
});

initHandoffService();
initContextService();

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: PACKAGE_VERSION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.post(
  "/api/webhook",
  webhookRateLimiter,
  verifyWebhookSignatureMiddleware(),
  async (req: Request, res: Response) => {
    await webhookHandler(req, res);
  },
);

app.use("/api/handoffs", handoffRouter);
app.use("/api/dial", dialRouter);

app.listen(PORT, () => {
  console.log(`AgentCraftworks (TypeScript) listening on port ${PORT}`);
});

export { app };
