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

The REST API (`/api/handoffs`, `/api/dial`) is protected by a shared bearer token: every request must send `Authorization: Bearer <token>` matching `GH_CE_API_TOKEN`, compared with a timing-safe equality check. The webhook endpoint (`/api/webhook`) is **not** bearer-protected — it is authenticated by HMAC-SHA256 signature instead. The API fails closed: when `NODE_ENV=production` and `GH_CE_API_TOKEN` is unset, the REST routes return `503` with an operator-facing error rather than serving unauthenticated traffic. In `development`/`test` the routes remain open and a single warning is logged. `/health` is unauthenticated.

## Dependencies

We regularly review and update dependencies. Key security-relevant dependencies:

- `express` — HTTP server
- `jsonwebtoken` — GitHub App JWT authentication
- `@octokit/rest` — GitHub API client
- `ajv` — JSON Schema validation
