export const PROTECTED_ACTIONS = [
  "force_push",
  "force_merge",
  "bypass_branch_protection",
  "modify_rulesets",
  "manage_secrets",
  "modify_ci",
] as const;

export type ProtectedAction = (typeof PROTECTED_ACTIONS)[number];

export function isProtectedAction(action: string): action is ProtectedAction {
  return PROTECTED_ACTIONS.includes(action as ProtectedAction);
}
