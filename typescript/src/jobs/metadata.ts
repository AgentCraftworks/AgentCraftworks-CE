export type JobKind = "deterministic" | "model-assisted";

export interface JobMetadata {
  id: string;
  kind: JobKind;
}

export const JOB_METADATA = [
  { id: "changeset", kind: "deterministic" },
  { id: "ci-coach", kind: "deterministic" },
  { id: "ci-doctor", kind: "deterministic" },
  { id: "cli-consistency-checker", kind: "deterministic" },
  { id: "code-simplifier", kind: "deterministic" },
  { id: "daily-doc-updater", kind: "deterministic" },
  { id: "daily-test-improver", kind: "deterministic" },
  { id: "grumpy-reviewer", kind: "deterministic" },
  { id: "issue-triage", kind: "deterministic" },
  { id: "link-checker", kind: "deterministic" },
  { id: "plan-command", kind: "deterministic" },
  { id: "pr-fix", kind: "deterministic" },
  { id: "sub-issue-closer", kind: "deterministic" },
  { id: "workflow-health-manager", kind: "deterministic" },
] as const satisfies readonly JobMetadata[];
