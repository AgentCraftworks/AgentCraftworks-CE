# Fork & Rename Guide

This guide helps you deploy your own instance of AgentCraftworks Community Edition — whether you keep the AgentCraftworks name or rebrand it entirely.

## Choose Your Path

### Path A: Deploy as AgentCraftworks CE

You want to run the project as-is, under the AgentCraftworks name.

**You still need:**
- Your own GitHub App (App ID, private key, webhook secret)
- Your own Azure subscription (if deploying to Azure)
- Your own CODEOWNERS teams (or replace with individual GitHub usernames)

Follow the [Quick Start](#quick-start-for-forks) below, then skip to the [Required Changes (All Forks)](#required-changes-all-forks) section.

### Path B: Fork and Rebrand

You want to rename the project and run it under your own brand.

Follow the [Quick Start](#quick-start-for-forks) below, then work through **both** the [Required Changes](#required-changes-all-forks) and [Rebranding Changes](#rebranding-changes) sections.

> **License note:** The MIT license requires you to preserve the original copyright notice in the LICENSE file. You may add your own copyright line above it. Beyond that, you are free to rebrand.

---

## Quick Start for Forks

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/YOUR-ORG/YOUR-REPO.git
cd YOUR-REPO/typescript
npm install

# 2. Create your GitHub App (see "GitHub App Setup" below)

# 3. Configure environment
cp .env.example .env
# Edit .env with YOUR GitHub App credentials

# 4. Build and start
npm run build
npm start
```

---

## GitHub App Setup

You need your own GitHub App — you cannot reuse the AgentCraftworks org's app credentials.

1. Go to **https://github.com/settings/apps/new** (or your org's app settings)
2. Fill in:
   - **Name:** Whatever you like — e.g., `YourOrg-AgentGov`, `MyTeam-CE`, or keep `AgentCraftworks`. The name is cosmetic (it appears in PR check statuses and installation screens).
   - **Homepage URL:** Your fork's URL (e.g., `https://github.com/YOUR-ORG/YOUR-REPO`)
   - **Webhook URL:** Leave blank (update after deploy)
   - **Webhook Secret:** Generate one: `openssl rand -hex 32` — save this value
3. **Permissions** (Repository):
   - Contents: Read & Write
   - Issues: Read & Write
   - Pull Requests: Read & Write
   - Metadata: Read-only
   - Checks: Read & Write
   - Commit statuses: Read & Write
   - Actions: Read-only
4. **Subscribe to events:** Pull request, Pull request review, Issues, Issue comment, Push
5. Click **Create GitHub App** and note the **App ID**
6. Generate a **Private Key** on the app settings page

Set these as environment variables:
```bash
GH_CE_APP_ID=your_app_id
GH_CE_APP_PRIVATE_KEY="$(cat path/to/private-key.pem)"
GH_CE_WEBHOOK_SECRET=your_webhook_secret
```

---

## Required Changes (All Forks)

These changes are **required** regardless of whether you rebrand. Without them, parts of the repo will fail.

### 1. CODEOWNERS (blocks PRs if not updated)

**File:** `.github/CODEOWNERS`

Replace `@AgentCraftworks/maintainers` and `@AgentCraftworks/accessibility-lead` with your own GitHub teams or usernames.

```diff
-* @AgentCraftworks/maintainers
+* @your-org/your-team
```

If you don't have GitHub teams, use individual usernames:
```
* @your-github-username
```

### 2. Workflows to Disable or Update

Several workflows are specific to the AgentCraftworks organization and will fail on forks.

**Delete or disable these workflows** (they reference AgentCraftworks org infrastructure):

| File | Why |
|------|-----|
| `.github/workflows/sync-org-standards.yml` | Fetches from `AgentCraftworks/.github` — will 404 on your fork |
| `.github/workflows/ghaw-staging-refresh.yml` | Assumes AgentCraftworks staging infrastructure |
| `.github/workflows/ghaw-secret-rotation-reminder.yml` | References org-specific rotation policy |
| `.github/workflows/ghaw-changeset.yml` | Requires org-specific App token setup |

**Update or remove the CLA workflow** (see [CLA Decision](#3-cla-decision) below):

| File | Action |
|------|--------|
| `.github/workflows/cla.yml` | Update or delete (see below) |

**These workflows are fork-safe** (work after you configure your own secrets):

| File | What to configure |
|------|-------------------|
| `.github/workflows/ci.yml` | Works out of the box |
| `.github/workflows/codeql.yml` | Works out of the box |
| `.github/workflows/deploy-azd.yml` | Set your Azure OIDC secrets (see DEPLOYMENT.md) |
| `.github/workflows/deploy-production.yml` | Set your Azure + ACR secrets |

To disable a workflow without deleting it, add `workflow_dispatch` as the only trigger:
```yaml
on:
  workflow_dispatch:  # Manual-only — effectively disabled
```

### 3. CLA Decision

The Contributor License Agreement grants rights to **AICraftworks LLC**. You have three options:

**Option A: Remove the CLA (simplest)**
1. Delete `.github/workflows/cla.yml`
2. Delete `.github/CLA.md`
3. Remove the CLA section from `CONTRIBUTING.md`
4. If your repo has branch protection requiring the `cla` status check, remove it from required checks

**Option B: Replace with your own CLA**
1. Edit `.github/CLA.md` — replace "AICraftworks LLC" with your entity name, update the contact email
2. Edit `.github/workflows/cla.yml`:
   - Update `path-to-document` URL to point to your fork's CLA
   - Update `allowlist` to include your bot accounts
   - Update the App ID/Private Key secret names if you renamed them
3. Update `CONTRIBUTING.md` accordingly

**Option C: Keep it (contributing upstream)**
Only if you intend to contribute changes back to the original AgentCraftworks repo. The CLA stays as-is.

### 4. ghaw-config.json

**File:** `.github/ghaw-config.json`

Update the `org` and `repo` fields:
```json
{
  "org": "YOUR-ORG",
  "repo": "YOUR-REPO"
}
```

### 5. Azure Deployment (if using Azure)

If deploying to Azure, update the federated credential subject in your service principal to match your fork:

```bash
# The subject must match YOUR repo, not AgentCraftworks
"subject": "repo:YOUR-ORG/YOUR-REPO:ref:refs/heads/main"
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for full Azure setup instructions.

---

## Rebranding Changes

These are **cosmetic** changes for teams that want to fully rebrand. The application works without them, but your users will see "AgentCraftworks" branding in logs, PRs, and generated content.

### File-by-File Checklist

| File | What to Change | Impact |
|------|---------------|--------|
| `package.json` | `name`, `author` fields | NPM metadata |
| `typescript/package.json` | `name` (`@agentcraftworks/core`), `author` | NPM package name |
| `azure.yaml` | `name`, `metadata.template` | Azure deployment resource naming |
| `docker-compose.yml` | `POSTGRES_DB`, `POSTGRES_USER` and healthcheck | Database naming |
| `.env.example` | Database credentials, comments | Dev environment |
| `typescript/src/index.ts` | Startup console.log message | Log output |
| `typescript/src/mcp/server.ts` | MCP server console.error banner | Log output |
| `typescript/src/utils/auth.ts` | `User-Agent` header string | GitHub API identification |
| `typescript/src/handlers/installation.ts` | Branch name (`agentcraftworks/setup-codeowners`), PR title/body, generated CODEOWNERS footer | User-facing PR content |
| `infra/app-ts.bicep` | Container app name, database name defaults | Azure resource naming |
| `infra/postgres.bicep` | `administratorLogin`, database name | Azure Postgres naming |
| `scripts/tag-release.sh` | Tag annotation text, release URL | Release process |
| `README.md` | Project name, clone URL, enterprise links | Public documentation |
| `DEPLOYMENT.md` | Clone URLs, org URLs, resource names | Deployment docs |
| `CONTRIBUTING.md` | Project name references | Contributor docs |
| `SECURITY.md` | Project name | Security policy |
| `AGENTS.md` | Project name, repo references | AI agent instructions |
| `LICENSE` | You may add your copyright above the existing one | Legal |

### Source Code Branding

The key places where "AgentCraftworks" appears in runtime behavior:

```typescript
// typescript/src/index.ts — startup banner
console.log(`AgentCraftworks (TypeScript) listening on port ${PORT}`);

// typescript/src/utils/auth.ts — GitHub API User-Agent header
headers: { "User-Agent": "AgentCraftworks-Hackathon/1.0", ... }

// typescript/src/handlers/installation.ts — generated PR content
const SETUP_BRANCH = "agentcraftworks/setup-codeowners";
const PR_TITLE = "🤖 AgentCraftworks: Add default CODEOWNERS routing";

// typescript/src/mcp/server.ts — MCP server banner
console.error("AgentCraftworks MCP server (TypeScript) running on stdio");
```

---

## What You Can Skip

These are informational references that won't cause failures:
- Architecture docs in `docs/` that mention AgentCraftworks by name
- The `AGENTS.md` org boundary table (educational context for AI agents)
- Comments in source code that reference AgentCraftworks concepts
