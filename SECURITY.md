# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in AgentCraftworks Core, please report it responsibly:

1. **Do NOT open a public issue** for security vulnerabilities
2. Email the maintainers or use GitHub's private vulnerability reporting feature
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Security Measures

AgentCraftworks Core implements the following security measures:

### Webhook Signature Verification

All incoming GitHub webhooks are verified using HMAC-SHA256 signatures (`X-Hub-Signature-256` header) with timing-safe comparison to prevent timing attacks.

### Engagement Level Governance

The 5-tier engagement level system enforces least-privilege access for AI agents:

- **Production** environments are capped at Level 3 (Peer Programmer)
- **Staging** environments are capped at Level 4 (Agent Team)
- Only **local/dev** environments allow Level 5 (Full Agent Team)

### Action Classification

All agent actions are classified into tiers (T1-T5) and validated against the current engagement level before execution.

### Rate Limiting

Webhook endpoints include rate limiting to prevent abuse.

## Dependencies

We regularly review and update dependencies. Key security-relevant dependencies:

- `express` — HTTP server
- `jsonwebtoken` — GitHub App JWT authentication
- `@octokit/rest` — GitHub API client
- `ajv` — JSON Schema validation
