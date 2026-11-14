---
status: DRAFT
---

# Community Edition quickstart and doctor UX

The local quickstart and doctor commands are planned under I-1. Their implementation
depends on E-1. This document describes the intended experience; the exact published
package and command invocation must come from the verified E-1 CLI.

## Quickstart

The first useful win should take no more than ten minutes:

- Create a local sample repository with deterministic fixtures.
- Replay a labeled simulation of the handoff lifecycle.
- Explain the resulting records without implying that an agent was dispatched.
- Avoid requiring a GitHub App or repository write access for the local simulation.

## Doctor

The environment check should inspect Node.js, required environment variables, token
availability, GitHub App permissions, port availability, and the MCP handshake. Each
failure should identify the limiting check and a concrete next step. It must not print
secret values or claim that a check passed when it could not be verified.

## Codespaces

The repository's `.devcontainer` provides Node.js 22, installs dependencies, and builds
the current server. It does not configure credentials or start the server automatically.
The public README links to that Codespaces environment.

## Completion checks

- E-1 supplies and validates the package name and CLI invocation before this text is
  promoted to shipped instructions.
- The fixture replay is deterministic and demonstrates `pending → active → completed`.
- Doctor output distinguishes missing configuration from checks that could not be
  verified and never echoes credentials.
- A fresh Codespace can install and build the repository without secrets.
