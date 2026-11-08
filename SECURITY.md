# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

Security fixes are provided for versions marked supported above. Upgrade to a
supported release before requesting a backport for an older version.

## Reporting a Vulnerability

If you discover a security vulnerability in AgentCraftworks Core, please report it responsibly:

1. **Do NOT open a public issue** for security vulnerabilities
2. **Preferred:** Use [GitHub's private vulnerability reporting](https://github.com/AgentCraftworks/AgentCraftworks-CE/security/advisories/new) for this repository
3. **Alternative:** Email **contact@agentcraftworks.com**
4. Include:
   - Description of the vulnerability
   - Affected version or commit and deployment mode
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

Redact bearer tokens, private keys, and personal data from logs and reproduction
artifacts. Do not include live credentials in a report.

We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days.

> **Forkers:** If you've forked this repo, update this section with your own contact information and private vulnerability reporting link.

## Security Measures

AgentCraftworks Core implements the following security measures:

### Webhook Signature Verification

All incoming GitHub webhooks are verified using HMAC-SHA256 signatures (`X-Hub-Signature-256` header) with timing-safe comparison to prevent timing attacks.

### Engagement Level Governance

The 5-tier engagement-level policy defines least-privilege bounds for AI agents:

- The default repository level is 1 (Observer); the default repository ceiling is 3
- Default environment ceilings are local=5, dev=5, staging=4, production=3; operators
  can explicitly configure these ceilings
- The intended levels 4–5 safeguards require independent operator, reviewed
  repository, and authenticated-principal opt-ins; scope enforcement is not yet
  complete on every path
- Protected actions remain denied unless both repository and operator allow-lists
  authorize them

> Levels 4–5 can be configured but are not yet enforced on all job paths.
> See the [engagement-level guide](docs/ENGAGEMENT_LEVELS.md) and [safe enablement checklist](docs/ENABLING_DELEGATED_AUTONOMOUS_SAFELY.md).

### Levels 4–5 Threat Model

Levels 4–5 increase the impact an agent can have on shared repositories. A dial
level alone is not authorization: the environment, repository, global, and pause
bounds still apply, and protected actions require separate allow-lists. Until the
full safety stack reaches G3, do not enable levels 4–5 in production.

| Threat | Control and operational limitation |
|--------|------------------------------------|
| Caller spoofs the environment or actor | The environment tier is server-derived from `GH_CE_ENVIRONMENT`; an unset value uses the production tier. Request-body identity claims such as `updatedBy` are not proof of identity. Scoped-principal enforcement is a separate dependency; the current `operator` audit actor is a placeholder, not authenticated attribution. |
| API token is stolen | A stolen bearer token has the authority of its configured permissions. Keep tokens in a secret store, restrict repository access, and rotate or revoke them immediately after suspected exposure. Never put tokens in audit output. Per-token scopes are not complete until the scoped-principal dependency lands. |
| Repository policy is tampered with | The intended `agentcraftworks.config.yml` ceiling is a reviewed default-branch change protected by CODEOWNERS. Repository-config loading and invalidation are still pending; until they land, use only the operator-controlled repository ceiling and do not treat an unreviewed file as an opt-in. |
| Agent loops or repeated jobs exhaust resources | T4 and T5 action budgets limit writes per repository (defaults: 30 and 5 actions per hour). Budgets are process-local: restarts reset them, and separate replicas do not share counters. They are not a distributed rate governor. |
| High-impact action is requested | Protected actions, including force-push, force-merge, branch-protection bypass, ruleset changes, secret management, and CI changes, are denied unless both repository and operator allow-lists include the action. A higher engagement level does not grant this permission. |
| Agent activity must stop quickly | Set `GH_CE_AGENTS_PAUSED=true` and apply the configuration through the supported reload/restart path. The paused policy forces effective level 1, which permits only T1 read actions. Confirm the effective policy before resuming work. |
| Audit records are altered or lost | The in-memory audit ring is process-local. `GH_CE_AUDIT_FILE` appends JSON Lines but is not tamper-proof or a durable multi-replica store. Restrict host and file access, protect backups, and export records to an independently controlled append-only destination when stronger evidence is required. |

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
