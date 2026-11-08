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

Webhook endpoints include rate limiting to prevent abuse.

### Automated Security Scanning

The standalone `security-codeql.yml` workflow analyzes JavaScript and TypeScript
with CodeQL's `security-and-quality` queries on pushes and pull requests to
`staging` and `main`, weekly, and on manual dispatch. Results appear in GitHub's
code scanning view. The legacy `codeql.yml` remains until maintainers consolidate
the two workflows; it uses older action versions.

`security-gitleaks.yml` scans all fetched branches and tags, including their full
Git history, on the same triggers. It uses the open-source Gitleaks CLI without an
organization license or additional credentials. Findings fail the job, and secret
values are fully redacted. Reports are not uploaded as public workflow artifacts.
Gitleaks complements GitHub secret scanning; neither guarantees detection of every
credential format. The configuration extends Gitleaks' default rules and excludes
only an exact toolkit phrase in an accessibility-agent table in two documentation
paths, a confirmed historical false positive; it does not exclude entire files or
commits.

`security-scorecard.yml` checks repository security posture on trusted branch
pushes, weekly, and on manual dispatch. Its findings appear in GitHub code scanning.
It does not publish results to the external Scorecard service or run privileged
pull request code. Scores are advisory, not a pass/fail security certification.

`security-bicep.yml` compiles every infrastructure module with
`outputs-should-not-contain-secrets` set to `error` in an isolated copy. It catches
insecure outputs containing secure parameters or credential-listing calls, such
as Redis `listKeys()`, without deploying or modifying infrastructure. This is a
compiler-based guard, not a guarantee that arbitrary literal strings or every
cross-module secret flow will be detected.

### Manual GitHub Security Setup

These workflows do **not** change repository settings. A repository administrator
must complete these steps for this repository and independently for each fork:

1. In **Settings > Security > Advanced Security** (called **Code security** in some
   GitHub interfaces), enable **Secret scanning** and **Push protection**. Resolve
   any organization-policy or plan restrictions instead of bypassing them.
2. Confirm the advanced CodeQL workflow can upload results to code scanning.
   If CodeQL default setup is already enabled, disable default setup before using
   this advanced workflow, following
   [GitHub's advanced CodeQL setup guidance](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/configuring-advanced-setup-for-code-scanning).
3. After a successful run on `staging`, require **CodeQL javascript-typescript**
   through the repository's reviewed branch-protection or ruleset process. Do not
   make the Bicep guard required while existing infrastructure remediation is
   pending. No branch-protection changes are performed by these workflows.
4. Perform the initial full-history scan in a trusted local checkout with all
   branches and tags fetched, using the checksum-verified Gitleaks version pinned
   in `security-gitleaks.yml`:

   Bash:

   ```bash
   git fetch --all --tags
   gitleaks git . --config=.github/security/gitleaks.toml --log-opts="--all" --redact=100 --exit-code=1 \
     --report-format=json --report-path=/private/location/gitleaks-history.json
   ```

   PowerShell:

   ```powershell
   git fetch --all --tags
   gitleaks git . --config=.github/security/gitleaks.toml --log-opts="--all" --redact=100 --exit-code=1 --report-format=json --report-path="C:\private\gitleaks-history.json"
   ```

   Choose an existing private location outside the repository for the report;
   replace the example path before running the command. Record the scan
   date, scanned refs, scanner version, and disposition privately, even if there
   are no findings. Do not post credential values or reports in public issues,
   pull requests, or artifacts. Rotate or revoke exposed credentials before
   considering any history cleanup; redaction or deleting a file does not revoke
   a credential.
5. Confirm secret-scanning alerts and push-protection bypass alerts reach the
   maintainers responsible for incident response. Use
   [GitHub's push protection guidance](https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection)
   to review the available controls.

## Dependencies

We regularly review and update dependencies. Key security-relevant dependencies:

- `express` — HTTP server
- `jsonwebtoken` — GitHub App JWT authentication
- `@octokit/rest` — GitHub API client
- `ajv` — JSON Schema validation
