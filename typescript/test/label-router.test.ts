/**
 * Label Router — Tests
 *
 * Tests the label-based agent routing logic for PR handoffs.
 * Accessibility-review labels trigger routing to @accessibility-lead.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  routeToAgentByLabel,
  hasAccessibilityReviewLabel,
  adjustPriorityByLabel,
} from "../src/services/label-router.js";

// ─── routeToAgentByLabel ────────────────────────────────────────────────────

describe("routeToAgentByLabel", () => {
  it("returns @code-reviewer for empty labels", () => {
    assert.equal(routeToAgentByLabel([]), "@code-reviewer");
  });

  it("returns @code-reviewer for undefined labels", () => {
    const labels: any = undefined;
    assert.equal(routeToAgentByLabel(labels), "@code-reviewer");
  });

  it("returns @code-reviewer for null labels", () => {
    const labels: any = null;
    assert.equal(routeToAgentByLabel(labels), "@code-reviewer");
  });

  // ─── Accessibility routing ───────────────────────────────────────────────

  it("routes to @accessibility-lead for accessibility-review label", () => {
    const labels = [{ name: "accessibility-review" }];
    assert.equal(routeToAgentByLabel(labels), "@accessibility-lead");
  });

  it("routes to @accessibility-lead for accessibility label", () => {
    const labels = [{ name: "accessibility" }];
    assert.equal(routeToAgentByLabel(labels), "@accessibility-lead");
  });

  it("routes to @accessibility-lead for wcag label", () => {
    const labels = [{ name: "wcag" }];
    assert.equal(routeToAgentByLabel(labels), "@accessibility-lead");
  });

  it("is case-insensitive for accessibility labels", () => {
    assert.equal(routeToAgentByLabel([{ name: "ACCESSIBILITY-REVIEW" }]), "@accessibility-lead");
    assert.equal(routeToAgentByLabel([{ name: "Accessibility" }]), "@accessibility-lead");
    assert.equal(routeToAgentByLabel([{ name: "WCAG" }]), "@accessibility-lead");
  });

  it("prioritizes security over accessibility (security highest priority)", () => {
    const labels = [
      { name: "security-review" },
      { name: "accessibility-review" },
    ];
    assert.equal(routeToAgentByLabel(labels), "@security-scanner");
  });

  // ─── Security routing ────────────────────────────────────────────────────

  it("routes to @security-scanner for security-review label", () => {
    const labels = [{ name: "security-review" }];
    assert.equal(routeToAgentByLabel(labels), "@security-scanner");
  });

  it("routes to @security-scanner for security label", () => {
    const labels = [{ name: "security" }];
    assert.equal(routeToAgentByLabel(labels), "@security-scanner");
  });

  // ─── Documentation routing ───────────────────────────────────────────────

  it("routes to @docs-reviewer for docs-review label", () => {
    const labels = [{ name: "docs-review" }];
    assert.equal(routeToAgentByLabel(labels), "@docs-reviewer");
  });

  it("routes to @docs-reviewer for documentation label", () => {
    const labels = [{ name: "documentation" }];
    assert.equal(routeToAgentByLabel(labels), "@docs-reviewer");
  });

  // ─── Priority order ──────────────────────────────────────────────────────

  it("follows priority: security > accessibility > docs > code", () => {
    // security beats accessibility
    assert.equal(
      routeToAgentByLabel([{ name: "security" }, { name: "accessibility" }]),
      "@security-scanner"
    );
    // accessibility beats docs
    assert.equal(
      routeToAgentByLabel([{ name: "documentation" }, { name: "accessibility" }]),
      "@accessibility-lead"
    );
    // security beats docs directly
    assert.equal(
      routeToAgentByLabel([{ name: "security" }, { name: "documentation" }]),
      "@security-scanner"
    );
    // docs beats default
    assert.equal(
      routeToAgentByLabel([{ name: "documentation" }, { name: "bug" }]),
      "@docs-reviewer"
    );
  });

  it("returns @code-reviewer for unrecognized labels", () => {
    const labels = [{ name: "bug" }, { name: "enhancement" }, { name: "help wanted" }];
    assert.equal(routeToAgentByLabel(labels), "@code-reviewer");
  });
});

// ─── hasAccessibilityReviewLabel ────────────────────────────────────────────

describe("hasAccessibilityReviewLabel", () => {
  it("returns false for empty labels", () => {
    assert.equal(hasAccessibilityReviewLabel([]), false);
  });

  it("returns false for undefined labels", () => {
    assert.equal(hasAccessibilityReviewLabel(undefined as unknown as Array<{ name: string }>), false);
  });

  it("returns true for accessibility-review label", () => {
    assert.equal(hasAccessibilityReviewLabel([{ name: "accessibility-review" }]), true);
  });

  it("returns true for accessibility label", () => {
    assert.equal(hasAccessibilityReviewLabel([{ name: "accessibility" }]), true);
  });

  it("returns true for wcag label", () => {
    assert.equal(hasAccessibilityReviewLabel([{ name: "wcag" }]), true);
  });

  it("is case-insensitive", () => {
    assert.equal(hasAccessibilityReviewLabel([{ name: "ACCESSIBILITY-REVIEW" }]), true);
    assert.equal(hasAccessibilityReviewLabel([{ name: "Accessibility" }]), true);
    assert.equal(hasAccessibilityReviewLabel([{ name: "WCAG" }]), true);
  });

  it("returns false for non-accessibility labels", () => {
    const labels = [{ name: "bug" }, { name: "security" }, { name: "documentation" }];
    assert.equal(hasAccessibilityReviewLabel(labels), false);
  });

  it("returns true when accessibility label is among others", () => {
    const labels = [{ name: "bug" }, { name: "accessibility" }, { name: "enhancement" }];
    assert.equal(hasAccessibilityReviewLabel(labels), true);
  });
});

// ─── adjustPriorityByLabel ──────────────────────────────────────────────────

describe("adjustPriorityByLabel", () => {
  it("returns basePriority for empty labels", () => {
    assert.equal(adjustPriorityByLabel([], "low"), "low");
    assert.equal(adjustPriorityByLabel([], "medium"), "medium");
  });

  it("returns medium as default basePriority", () => {
    assert.equal(adjustPriorityByLabel([]), "medium");
  });

  it("boosts to high for accessibility-review label", () => {
    assert.equal(adjustPriorityByLabel([{ name: "accessibility-review" }], "low"), "high");
    assert.equal(adjustPriorityByLabel([{ name: "accessibility-review" }], "medium"), "high");
  });

  it("boosts to high for accessibility label", () => {
    assert.equal(adjustPriorityByLabel([{ name: "accessibility" }], "low"), "high");
  });

  it("boosts to high for wcag label", () => {
    assert.equal(adjustPriorityByLabel([{ name: "wcag" }], "low"), "high");
  });

  it("boosts to high for security-review label", () => {
    assert.equal(adjustPriorityByLabel([{ name: "security-review" }], "low"), "high");
  });

  it("boosts to high for security label", () => {
    assert.equal(adjustPriorityByLabel([{ name: "security" }], "low"), "high");
  });

  it("does not boost for documentation labels", () => {
    assert.equal(adjustPriorityByLabel([{ name: "documentation" }], "low"), "low");
    assert.equal(adjustPriorityByLabel([{ name: "docs-review" }], "medium"), "medium");
  });

  it("does not boost for unrecognized labels", () => {
    const labels = [{ name: "bug" }, { name: "enhancement" }];
    assert.equal(adjustPriorityByLabel(labels, "low"), "low");
  });

  it("downgrades critical to high for accessibility label", () => {
    // Current behavior: accessibility-related labels boost to at most "high",
    // even when the base priority is "critical".
    assert.equal(adjustPriorityByLabel([{ name: "accessibility" }], "critical"), "high");
  });

  it("is case-insensitive for boost labels", () => {
    assert.equal(adjustPriorityByLabel([{ name: "ACCESSIBILITY" }], "low"), "high");
    assert.equal(adjustPriorityByLabel([{ name: "SECURITY-REVIEW" }], "low"), "high");
  });
});
