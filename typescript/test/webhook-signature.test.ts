/**
 * Webhook Signature Verification — Tests
 *
 * Tests the HMAC-SHA256 signature verification used for GitHub webhooks.
 * Uses node:test and node:assert/strict.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyWebhookSignature, clearTokenCache } from "../src/utils/auth.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-webhook-secret-12345";

/** Create a valid HMAC-SHA256 signature for a payload */
function sign(payload: string, secret: string = TEST_SECRET): string {
  const hmac = crypto.createHmac("sha256", secret);
  return "sha256=" + hmac.update(payload).digest("hex");
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("verifyWebhookSignature", () => {
  it("should return true for a valid signature", () => {
    const payload = '{"action":"opened"}';
    const signature = sign(payload);
    const result = verifyWebhookSignature(payload, signature, TEST_SECRET);
    assert.equal(result, true);
  });

  it("should return false for an invalid signature", () => {
    const payload = '{"action":"opened"}';
    const badSignature = "sha256=0000000000000000000000000000000000000000000000000000000000000000";
    const result = verifyWebhookSignature(payload, badSignature, TEST_SECRET);
    assert.equal(result, false);
  });

  it("should return false when signature is null", () => {
    const payload = '{"action":"opened"}';
    const result = verifyWebhookSignature(payload, null, TEST_SECRET);
    assert.equal(result, false);
  });

  it("should return false when signature is undefined", () => {
    const payload = '{"action":"opened"}';
    const result = verifyWebhookSignature(payload, undefined, TEST_SECRET);
    assert.equal(result, false);
  });

  it("should return false when signature is empty string", () => {
    const payload = '{"action":"opened"}';
    const result = verifyWebhookSignature(payload, "", TEST_SECRET);
    assert.equal(result, false);
  });

  it("should throw when secret is not provided and env var is missing", () => {
    const originalSecret = process.env["GH_CE_WEBHOOK_SECRET"];
    delete process.env["GH_CE_WEBHOOK_SECRET"];
    try {
      assert.throws(
        () => verifyWebhookSignature("payload", "sha256=abc"),
        /GH_CE_WEBHOOK_SECRET is required/,
      );
    } finally {
      if (originalSecret !== undefined) {
        process.env["GH_CE_WEBHOOK_SECRET"] = originalSecret;
      }
    }
  });

  it("should verify Buffer payloads correctly", () => {
    const payloadStr = '{"action":"synchronize"}';
    const payloadBuf = Buffer.from(payloadStr, "utf-8");
    const signature = sign(payloadStr);
    const result = verifyWebhookSignature(payloadBuf, signature, TEST_SECRET);
    assert.equal(result, true);
  });

  it("should reject when payload is tampered", () => {
    const original = '{"action":"opened"}';
    const tampered = '{"action":"closed"}';
    const signature = sign(original);
    const result = verifyWebhookSignature(tampered, signature, TEST_SECRET);
    assert.equal(result, false);
  });

  it("should reject when wrong secret is used", () => {
    const payload = '{"action":"opened"}';
    const signature = sign(payload, "wrong-secret");
    const result = verifyWebhookSignature(payload, signature, TEST_SECRET);
    assert.equal(result, false);
  });

  it("should reject signature with wrong prefix", () => {
    const payload = '{"action":"opened"}';
    const hmac = crypto.createHmac("sha256", TEST_SECRET);
    const digest = hmac.update(payload).digest("hex");
    const badSig = "sha1=" + digest;
    const result = verifyWebhookSignature(payload, badSig, TEST_SECRET);
    assert.equal(result, false);
  });

  it("should handle empty payload", () => {
    const payload = "";
    const signature = sign(payload);
    const result = verifyWebhookSignature(payload, signature, TEST_SECRET);
    assert.equal(result, true);
  });

  it("should handle large payloads", () => {
    const payload = "x".repeat(100_000);
    const signature = sign(payload);
    const result = verifyWebhookSignature(payload, signature, TEST_SECRET);
    assert.equal(result, true);
  });

  it("should use GH_CE_WEBHOOK_SECRET env var when secret is not provided", () => {
    const originalSecret = process.env["GH_CE_WEBHOOK_SECRET"];
    process.env["GH_CE_WEBHOOK_SECRET"] = TEST_SECRET;
    try {
      const payload = '{"test":"env"}';
      const signature = sign(payload);
      const result = verifyWebhookSignature(payload, signature);
      assert.equal(result, true);
    } finally {
      if (originalSecret !== undefined) {
        process.env["GH_CE_WEBHOOK_SECRET"] = originalSecret;
      } else {
        delete process.env["GH_CE_WEBHOOK_SECRET"];
      }
    }
  });
});

// ─── Cache management ──────────────────────────────────────────────────────────────

describe("clearTokenCache", () => {
  it("should not throw when clearing an empty cache", () => {
    assert.doesNotThrow(() => clearTokenCache());
  });

  it("should not throw when clearing a specific installation", () => {
    assert.doesNotThrow(() => clearTokenCache(12345));
  });
});
