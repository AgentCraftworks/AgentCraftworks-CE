/**
 * Label-Based Agent Router
 *
 * Routes AI agent work based on GitHub PR labels.
 * Used by the PR handler to determine which agent should receive a handoff.
 *
 * Routing logic (priority order):
 *   - "security-review" → @security-scanner (vulnerability scanning)
 *   - "accessibility-review" → @accessibility-lead (WCAG 2.2 validation team)
 *   - "docs-review" → @docs-reviewer (documentation updates)
 *   - default → @code-reviewer (general code review)
 */

/**
 * Determine the target agent based on PR labels.
 *
 * @param labels Array of label objects from the GitHub PR event
 * @returns The agent identifier (e.g., "@accessibility-lead", "@code-reviewer")
 */
export function routeToAgentByLabel(
  labels: Array<{ name: string }> = [],
): string {
  if (!labels || labels.length === 0) {
    return "@code-reviewer";
  }

  const labelNames = labels.map((l) => l.name.toLowerCase());

  // Security review has highest priority
  if (
    labelNames.includes("security-review") ||
    labelNames.includes("security")
  ) {
    return "@security-scanner";
  }

  // Accessibility review
  if (
    labelNames.includes("accessibility-review") ||
    labelNames.includes("accessibility") ||
    labelNames.includes("wcag")
  ) {
    return "@accessibility-lead";
  }

  // Documentation review
  if (
    labelNames.includes("docs-review") ||
    labelNames.includes("documentation")
  ) {
    return "@docs-reviewer";
  }

  // Default to code reviewer
  return "@code-reviewer";
}

/**
 * Check if a PR has been flagged for accessibility review.
 * Useful for conditional handoff creation or priority adjustment.
 *
 * @param labels Array of label objects from the GitHub PR event
 * @returns true if accessibility-review label is present
 */
export function hasAccessibilityReviewLabel(
  labels: Array<{ name: string }> = [],
): boolean {
  return labels.some(
    (l) =>
      l.name.toLowerCase() === "accessibility-review" ||
      l.name.toLowerCase() === "accessibility" ||
      l.name.toLowerCase() === "wcag",
  );
}

/**
 * Boost handoff priority if accessibility-review is present.
 * Accessibility reviews are critical for compliance.
 *
 * @param labels Array of label objects from the GitHub PR event
 * @param basePriority The initial priority level
 * @returns "high" if accessibility-review is present, otherwise basePriority
 */
export function adjustPriorityByLabel(
  labels: Array<{ name: string }> = [],
  basePriority: "low" | "medium" | "high" | "critical" = "medium",
): "low" | "medium" | "high" | "critical" {
  if (hasAccessibilityReviewLabel(labels)) {
    return "high"; // Accessibility is non-negotiable
  }

  const labelNames = labels.map((l) => l.name.toLowerCase());
  if (labelNames.includes("security-review") || labelNames.includes("security")) {
    return "high";
  }

  return basePriority;
}
