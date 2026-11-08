# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in AgentCraftworks Core, please report it responsibly:

1. **Do NOT open a public issue** for security vulnerabilities
2. **Preferred:** Use [GitHub's private vulnerability reporting](https://github.com/AgentCraftworks/AgentCraftworks-CE/security/advisories/new) for this repository
3. **Alternative:** Email **contact@agentcraftworks.com**
4. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days.

> **Forkers:** If you've forked this repo, update this section with your own contact information and private vulnerability reporting link.

## Security Measures

AgentCraftworks Core implements the following security measures:

### Webhook Signature Verification

All incoming GitHub webhooks are verified using HMAC-SHA256 signatures (`X-Hub-Signature-256` header) with timing-safe comparison to prevent timing attacks.

### Engagement Level Governance

The 5-tier engagement level system enforces least-privilege access for AI agents:

- **Production** environments are capped at Level 3 (Collaborator)
- **Staging** environments are capped at Level 4 (Delegated)
- Only **local/dev** environments allow Level 5 (Autonomous)

### Action Classification

All agent actions are classified into tiers (T1-T5) and validated against the current engagement level before execution.

### Rate Limiting

Webhook endpoints include rate limiting to prevent abuse, keyed by GitHub App installation ID (falling back to client IP). The REST API (`/api/handoffs`, `/api/dial`) has a separate per-IP limiter (`API_RATE_LIMIT`, default 60 requests/minute).

### REST API Authentication

The REST API (`/api/handoffs`, `/api/dial`) requires the shared bearer token configured in `GH_CE_API_TOKEN`, compared using equally sized, length-encoded buffers and timing-safe equality. The webhook endpoint (`/api/webhook`) instead requires an HMAC-SHA256 signature. Without a token, only explicit `NODE_ENV=development` or `NODE_ENV=test` allows requests and logs a warning; every other value, including unset and staging, returns `503`. `/health` remains unauthenticated.

Forwarded client addresses are ignored unless `GH_CE_TRUST_PROXY` contains operator-verified ingress IP addresses or CIDRs. Configure these behind Azure ingress to isolate client rate-limit buckets. Never trust arbitrary forwarding headers, all-address ranges, or numeric hop counts.

For least-privilege access, set `GH_CE_API_TOKENS_FILE` to a JSON array of hash-only credentials. Each entry has `name`, `sha256`, `scopes`, and `repos`. Supported scopes are `handoffs:read`, `handoffs:write`, `dial:write`, `dial:elevate`, and `audit:read`. Repository patterns are exact `owner/repo` names or `owner/*`; matching is case-insensitive and never crosses owner boundaries. Dial reads and permission checks use `handoffs:read`. `dial:elevate` and `audit:read` are available to downstream governance work; this baseline does not add an audit endpoint or enforce elevation policy.

Invalid credentials return `401`; authenticated callers with a wrong scope or repository return `403`. Unfiltered handoff lists and statistics contain only authorized repositories. Dial `updatedBy` and structured `dial.changed` events use the authenticated principal name, ignoring caller-supplied attribution. The compatibility `GH_CE_API_TOKEN` is principal `operator` with every scope and repository; use it only for trusted operator access. Token-file errors fail closed with `503`, even when the compatibility token is present. Tokens and token hashes are never logged.

## Dependencies

We regularly review and update dependencies. Key security-relevant dependencies:

The root `package-lock.json` is the only dependency lockfile. `typescript` is an npm workspace; install from the repository root with `npm ci`. Root dependency overrides apply to CI and both Docker stages.

CI runs `npm run audit:production`, which fails on high or critical production dependency advisories. It uses `npm audit --omit=dev --audit-level=high`. Dependabot groups security and version updates at the root. The dependencies installed in production have no remaining reported advisories in the security baseline. New advisories must be fixed or explicitly evaluated, not bypassed.

- `express` — HTTP server
- `jsonwebtoken` — GitHub App JWT authentication
- `@octokit/rest` — GitHub API client
- `ajv` — JSON Schema validation
