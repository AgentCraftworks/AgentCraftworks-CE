# GitHub Copilot Instructions — AgentCraftworks-CE

> Repository-specific Copilot instructions for this public Community Edition repository.

## Documentation taxonomy

- Use `docs/` for documentation about implemented, shipping capabilities.
- Use `docs/futures/` for proposals and plans that are not yet implemented; follow the
  status and placement rules in the root `AGENTS.md`.
- Keep public documentation and examples self-contained in this repository. Do not route
  contributors to private SharePoint sites, personal sync folders, or internal repositories.

## Capability language

- Describe deterministic automation as automation. Call a job AI-powered only when it
  actually invokes an AI model.
- A recorded handoff is a stateful record; it does not dispatch an agent or prove that
  requested work was executed.
- Community Edition's engagement model spans levels 1–5, with a default repository level
  of 1 — Observer. Levels 4–5 can be configured but are not yet enforced on all job paths.
- Enterprise differentiation is organizational scale, including organization-wide policy,
  centralized ceilings, durable multi-replica state, compliance evidence, and multi-squad
  coordination. Do not describe Enterprise as the only edition with engagement levels 4–5.
