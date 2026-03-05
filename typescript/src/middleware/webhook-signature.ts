/**
 * Webhook Signature Verification Middleware
 *
 * Express middleware that validates the HMAC-SHA256 signature
 * in the `X-Hub-Signature-256` header against the raw request body.
 */

import type { Request, Response, NextFunction } from "express";
import { verifyWebhookSignature } from "../utils/auth.js";

export function verifyWebhookSignatureMiddleware(
  secret?: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const signature = req.headers["x-hub-signature-256"];
      const rawBodyValue =
        (req as unknown as Record<string, unknown>)["rawBody"];

      if (rawBodyValue === undefined || rawBodyValue === null) {
        res.status(500).json({
          error: "Internal Server Error",
          message: "Raw body not available. Ensure express.json({ verify }) is configured.",
        });
        return;
      }

      const rawBody = String(rawBodyValue);

      if (rawBody.trim() === "") {
        res.status(400).json({
          error: "Bad Request",
          message: "Request body cannot be empty",
        });
        return;
      }

      const signatureStr = Array.isArray(signature) ? signature[0] : signature;
      const valid = verifyWebhookSignature(rawBody, signatureStr, secret);

      if (!valid) {
        res.status(401).json({
          error: "Unauthorized",
          message: "Invalid webhook signature",
        });
        return;
      }

      next();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Signature verification failed";

      if (message.includes("GH_CE_WEBHOOK_SECRET is required")) {
        res.status(500).json({
          error: "Internal Server Error",
          message: "Webhook secret not configured",
        });
        return;
      }

      res.status(401).json({
        error: "Unauthorized",
        message: "Webhook signature verification failed",
      });
    }
  };
}
