export type GrumpyReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export function selectGrumpyReviewEvent(
  inspectedFiles: number,
  errors: number,
  totalFindings: number,
): GrumpyReviewEvent {
  if (errors > 0) return "REQUEST_CHANGES";
  if (inspectedFiles > 0 && totalFindings === 0) return "APPROVE";
  return "COMMENT";
}
