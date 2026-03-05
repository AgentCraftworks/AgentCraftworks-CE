# Deployment Guide

Complete guide for deploying AgentCraftworks Community Edition to Azure and running locally with Docker.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [GitHub App Setup](#github-app-setup)
- [Local Development](#local-development)
- [Azure Deployment](#azure-deployment)
- [GitHub Secrets for CI/CD](#github-secrets-for-cicd)
- [Repository Protection Rules](#repository-protection-rules)
- [CI/CD Pipeline](#cicd-pipeline)
- [Smoke Tests](#smoke-tests)
- [Production Deployment Checklist](#production-deployment-checklist)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Cost Estimation](#cost-estimation)
- [Cleanup](#cleanup)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

Get AgentCraftworks Community Edition running on Azure with the Azure Developer CLI:

```bash
# 1. Install Azure Developer CLI (if not already installed)
# macOS/Linux:
curl -fsSL https://aka.ms/install-azd.sh | bash
# Windows (PowerShell):
powershell -ex AllSigned -c "Invoke-RestMethod 'https://aka.ms/install-azd.ps1' | Invoke-Expression"

# 2. Clone and navigate
git clone https://github.com/AgentCraftworks/AgentCraftworks-CE.git
cd AgentCraftworks-CE

# 3. Login and initialize
azd auth login
azd init    # Environment name: agentcraftworks-dev, Location: eastus

# 4. Configure secrets
azd env set GH_WEBHOOK_SECRET "$(openssl rand -hex 32)"
azd env set GH_APP_ID "your-app-id"
azd env set GH_APP_PRIVATE_KEY "$(cat path/to/private-key.pem)"

# 5. Deploy (provisions infrastructure + deploys app)
azd up

# 6. Get your URL
azd env get-values | grep TYPESCRIPT_APP_URL
```

After deployment, update your GitHub App webhook URL to `https://<your-url>/api/webhook`.

---

## Prerequisites

### Local Development

- **Node.js 22+** — For TypeScript service
- **Docker Desktop** — For containerized local development
- **Git** — Version control

### Azure Deployment

- **Azure Subscription** — Active subscription with permissions
- **Azure Developer CLI** (`azd`) — Primary deployment tool
- **Azure CLI** (`az`) — Optional, for additional management
- **GitHub Account** — For CI/CD workflows

---

## GitHub App Setup

> Required for both local and Azure deployments.

### Create the App

1. Go to **https://github.com/settings/apps/new**
2. Fill in:
   - **Name:** `AgentCraftworks` (or `AgentCraftworks-Dev` for development)
   - **Homepage URL:** `https://github.com/AgentCraftworks/AgentCraftworks-CE`
   - **Webhook URL:** Leave blank (update after deploy)
   - **Webhook Secret:** Generate one: `openssl rand -hex 32` — **save this value**
3. **Permissions** (Repository):
   - Contents: Read & Write
   - Issues: Read & Write
   - Pull Requests: Read & Write
   - Metadata: Read-only
   - Checks: Read & Write
   - Commit statuses: Read & Write
   - Actions: Read-only
4. **Subscribe to events:** Pull request, Pull request review, Issues, Issue comment, Push
5. Click **Create GitHub App**
6. Note the **App ID**

### Generate Private Key

1. On the app settings page, scroll to **Private keys**
2. Click **Generate a private key**
3. Save the downloaded `.pem` file securely

### Install the App

1. Go to **https://github.com/settings/apps/YOUR_APP/installations**
2. Click **Install**
3. Choose your organization or account
4. Select repos (or all repos)

### Configure Repository Secrets for GitHub Actions Workflows

Several workflows use `actions/create-github-app-token@v1` to generate short-lived
tokens at runtime, replacing long-lived PATs. These workflows **will fail** if
the secrets below are not configured.

#### Workflows that require `GH_APP_ID` + `GH_APP_PRIVATE_KEY`

| Workflow | File | Why It Needs App Token |
|----------|------|-----------------------|
| **CLA Assistant** | `cla.yml` | Write to PR comments, store CLA signatures |
| **Changeset** | `ghaw-changeset.yml` | Create version branches/PRs that trigger downstream CI |
| **Org Standards Sync** | `sync-org-standards.yml` | Read from org `.github` repo, create drift issues |
| **Infrastructure Deploy** | `deploy-azd.yml` | Pass App credentials to Azure deployment |

#### Step-by-Step: Add the Secrets

1. **Find your App ID:**
   - Go to **https://github.com/settings/apps** (or org: **https://github.com/organizations/AgentCraftworks/settings/apps**)
   - Click your app → the **App ID** is shown near the top of the "General" page

2. **Get your Private Key:**
   - On the same app settings page, scroll to **Private keys**
   - If you already generated one, use the downloaded `.pem` file
   - If not, click **Generate a private key** and save the `.pem` file

3. **Add secrets to the repository:**
   - Go to **https://github.com/AgentCraftworks/AgentCraftworks-CE/settings/secrets/actions**
   - Click **New repository secret**

   | Secret Name | Value |
   |-------------|-------|
   | `GH_APP_ID` | The numeric App ID (e.g., `123456`) |
   | `GH_APP_PRIVATE_KEY` | The **entire** contents of the `.pem` file, including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` headers |

   > **Tip:** To copy the full PEM contents on macOS/Linux: `cat your-app.pem | pbcopy`
   > On Windows PowerShell: `Get-Content your-app.pem -Raw | Set-Clipboard`

4. **Verify the secrets are set:**
   - Go to **Settings → Secrets and variables → Actions**
   - You should see both `GH_APP_ID` and `GH_APP_PRIVATE_KEY` listed (values are hidden)

5. **Test by re-running a workflow:**
   - Go to **Actions** → select the failing workflow run → click **Re-run all jobs**
   - The `generate-token` step should now succeed

> **Why GitHub App Token instead of PAT?** App tokens are short-lived (1 hour),
> scoped to the installed repos, auditable, and don't consume a user's token quota.
> They are the recommended approach for GitHub Actions. See [GitHub docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow).

> **Organization-level alternative:** If you want all repos in the org to share one
> App Token, set `GH_APP_ID` and `GH_APP_PRIVATE_KEY` as **organization secrets**
> at **https://github.com/organizations/AgentCraftworks/settings/secrets/actions**
> instead of per-repository.

---

## Local Development

### Option 1: Docker Compose (Recommended)

```bash
# 1. Create environment file
cp .env.example .env
# Edit .env with your GitHub App credentials

# 2. Start all services
docker compose up -d --build

# 3. Check service status
docker compose ps

# 4. View logs
docker compose logs -f
docker compose logs -f typescript-api    # TypeScript only

# 5. Test health endpoint
curl http://localhost:3000/health

# 6. Stop services
docker compose down
```

Services started by Docker Compose:
- **TypeScript API**: http://localhost:3000 (health: `/health`)
- **PostgreSQL 17**: localhost:5432 (db: `agentcraftworks`)
- **Redis 7**: localhost:6379

Expected health response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 30.91,
  "timestamp": "2026-02-27T08:00:00.000Z"
}
```

### Option 2: Native Development

```bash
cd typescript

# Install dependencies
npm install

# Set environment variables
export GH_APP_ID=123456
export GH_APP_PRIVATE_KEY="$(cat path/to/private-key.pem)"
export GH_WEBHOOK_SECRET=your_webhook_secret
export PORT=3000

# Development mode (watch)
npm run dev

# Production build
npm run build
npm start
```

### Building the Docker Image Directly

```bash
cd typescript
docker build -t agentcraftworks-ts .
docker run -p 3000:3000 \
  -e GH_WEBHOOK_SECRET="test-secret" \
  -e GH_APP_ID="test-id" \
  -e GH_APP_PRIVATE_KEY="test-key" \
  agentcraftworks-ts
```

---

## Azure Deployment

### Option 1: Azure Developer CLI (azd) — Recommended

```bash
# 1. Login to Azure
azd auth login

# 2. Initialize (first time only)
azd init

# 3. Set secrets
azd env set GH_APP_ID "123456"
azd env set GH_WEBHOOK_SECRET "your_webhook_secret"
azd env set GH_APP_PRIVATE_KEY "$(cat path/to/private-key.pem)"

# 4. Provision and deploy
azd up

# 5. Deploy updates (after initial provisioning)
azd deploy

# 6. Deploy TypeScript service only
azd deploy typescript-api
```

### What Gets Deployed

```
Resource Group (rg-{env-name})
├── Container Apps Environment (cae-{token})
│   └── TypeScript Container App (ca-ts-{token})
├── Container Registry (acr{token})
├── Key Vault (kv-{token})
│   ├── GH-WEBHOOK-SECRET
│   ├── GH-APP-ID
│   └── GH-APP-PRIVATE-KEY
├── PostgreSQL Flexible Server (psql-{token})
│   └── Database: agentcraftworks
├── Redis Cache (redis-{token})
├── Log Analytics Workspace (log-{token})
└── Managed Identity (TypeScript App)
```

### Managed Identity Configuration

The Container App uses a User-Assigned Managed Identity with:
- **Key Vault Secrets User** role for accessing secrets
- **AcrPull** role for pulling container images

### View Environment Info

```bash
azd env get-values
```

Key outputs: `TYPESCRIPT_APP_URL`, `AZURE_KEY_VAULT_NAME`, `AZURE_CONTAINER_REGISTRY_NAME`, `AZURE_POSTGRES_HOST`, `AZURE_REDIS_HOST`

### Option 2: Manual Azure CLI

For more control, deploy with Azure CLI directly:

```bash
# 1. Login and create resource group
az login
az group create --name agentcraftworks-rg --location eastus

# 2. Create container registry
az acr create --resource-group agentcraftworks-rg --name agentcraftworks --sku Basic

# 3. Build and push image
cd typescript
az acr build --registry agentcraftworks --image typescript-api:latest --file Dockerfile .

# 4. Create Container Apps environment
az containerapp env create --name agentcraftworks-env --resource-group agentcraftworks-rg --location eastus

# 5. Deploy
az containerapp create \
  --name typescript-api \
  --resource-group agentcraftworks-rg \
  --environment agentcraftworks-env \
  --image agentcraftworks.azurecr.io/typescript-api:latest \
  --target-port 3000 \
  --ingress external \
  --env-vars GH_APP_ID=123456 GH_WEBHOOK_SECRET=secretref:webhook-secret
```

---

## GitHub Secrets for CI/CD

Configure these in **Settings → Secrets and variables → Actions → New repository secret**:

### Azure Authentication

| Secret | Description | How to Get |
|--------|-------------|------------|
| `AZURE_CLIENT_ID` | Service Principal Client ID | `az ad sp create-for-rbac` output → `appId` |
| `AZURE_TENANT_ID` | Azure AD Tenant ID | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | Subscription ID | `az account show --query id -o tsv` |

> `deploy-azd.yml` runs with `environment: ${{ github.event.inputs.environment }}`.
> Ensure these Azure OIDC secrets are present in each GitHub environment you use (`dev`, `staging`, `production`), not only at repo level.

### Azure Environment

| Secret | Description | Example |
|--------|-------------|---------|
| `AZURE_ENV_NAME` | Deployment environment name | `agentcraftworks-prod` |
| `AZURE_LOCATION` | Azure region | `eastus` |

### GitHub App (Required for CI/CD Workflows)

| Secret | Description | Required By |
|--------|-------------|-------------|
| `GH_APP_ID` | GitHub App ID (from app settings page) | `cla.yml`, `ghaw-changeset.yml`, `sync-org-standards.yml`, `deploy-azd.yml` |
| `GH_APP_PRIVATE_KEY` | Full PEM file contents including headers | Same as above |
| `GH_WEBHOOK_SECRET` | Webhook validation secret (generate: `openssl rand -hex 32`) | Runtime only (not CI/CD) |
| `POSTGRES_PASSWORD` | PostgreSQL admin password (generate: `openssl rand -base64 32`) | `deploy-azd.yml` |

> **Managing the PostgreSQL password (`POSTGRES_PASSWORD`):**
> Setting `POSTGRES_PASSWORD` as a GitHub environment secret (in `production`, `staging`, and `dev`)
> is the **recommended** approach for stable credential management. The `deploy-azd.yml` workflow
> uses the following priority order:
>
> 1. **`POSTGRES_PASSWORD` secret** — used as-is when set; guarantees a stable, known password.
> 2. **Existing azd environment value** — preserved if already set and no secret is provided;
>    prevents accidental rotation on `deploy`-only runs.
> 3. **Auto-generated password** — a random value is generated with `openssl rand -base64 32`
>    only on the very first provision when neither of the above is available.
>
> To set the secret for each environment, go to
> **Settings → Environments → {environment} → Add secret → `POSTGRES_PASSWORD`**.

### For deploy-production.yml (Docker-based deploy)

These five secrets are automatically resolved after `azd up` and printed to the
`deploy-azd.yml` job summary. Run `deploy-azd.yml` first, then copy the values.

| Secret | Description | Source |
|--------|-------------|--------|
| `AZURE_ACR_NAME` | Azure Container Registry name | `deploy-azd.yml` job summary |
| `AZURE_ACR_LOGIN_SERVER` | ACR login server (e.g., `myacr.azurecr.io`) | `deploy-azd.yml` job summary |
| `AZURE_CONTAINER_APP_NAME` | Container App name | `deploy-azd.yml` job summary |
| `AZURE_RESOURCE_GROUP` | Resource group name | `deploy-azd.yml` job summary |
| `TYPESCRIPT_PROD_URL` | Production URL for smoke tests | `deploy-azd.yml` job summary |

#### Secret Sync — Step-by-Step

After running `deploy-azd.yml` (action: `up (provision + deploy)`, environment: `production`):

1. Open the completed workflow run → click the **deploy** job → scroll to the
   **Publish deployment outputs** step summary.
2. The summary shows a formatted table of all five values and ready-to-run
   `gh secret set` commands.
3. Copy and run the commands from the job summary (requires `gh auth login` with repo write access).
   The job summary contains the exact commands pre-populated with your deployed values, for example:

   ```sh
   gh secret set AZURE_ACR_NAME          --env production --body "acragentXXXXXX"
   gh secret set AZURE_ACR_LOGIN_SERVER  --env production --body "acragentXXXXXX.azurecr.io"
   gh secret set AZURE_RESOURCE_GROUP    --env production --body "rg-agentcraftworks-production"
   gh secret set AZURE_CONTAINER_APP_NAME --env production --body "ca-ts-XXXXXX"
   gh secret set TYPESCRIPT_PROD_URL     --env production --body "https://ca-ts-XXXXXX.region.azurecontainerapps.io"
   ```

   > **Tip:** Copy the pre-populated commands directly from the **Publish deployment outputs**
   > step summary — they contain your actual resource names, not the placeholders above.

4. Re-run `deploy-production.yml` — the preflight check confirms all secrets are
   present before the build starts, and fails fast with an actionable error if any
   are still missing.

### Setting Up Azure Service Principal with Federated Credentials

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
APP_NAME="agentcraftworks-ce-github-actions"

# Create service principal
az ad sp create-for-rbac --name "$APP_NAME" --role contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID"

# Get Application ID
APP_ID=$(az ad sp list --display-name "$APP_NAME" --query "[0].appId" -o tsv)

# Add federated credential for main branch (OIDC — no stored secrets)
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-actions-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:AgentCraftworks/AgentCraftworks-CE:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

---

## Repository Protection Rules

AgentCraftworks Community Edition enforces the following protection rules to ensure quality and stability:

### Branch Protection

Both `main` and `staging` branches are protected with:

- **Required status checks (strict):**
  - `build-and-test` — TypeScript compilation, linting, and tests
  - `cla` — Contributor License Agreement check
- **Additional conditional checks (via rulesets / required workflows):**
  - `ghaw-accessibility-review` — WCAG 2.2 AA conformance (runs on all PRs; posts checklist only when UI/content files are changed)
  - `ghaw-azd-service-tag-check` — Azure service-tag contract validation (runs only for relevant infra changes)
- **Required reviews:**
  - 1 approving review from CODEOWNERS (enforced)
  - Stale reviews dismissed on new commits
- **Admin enforcement:** Enabled (rules apply to admins too)
- **Force-push:** Blocked
- **Branch deletion:** Blocked

### Tag Protection

Version tags matching `v*` are protected via repository ruleset (ID: **13516390**):

- **Updates:** Blocked (tags are immutable once created)
- **Deletion:** Blocked (preserves release history)
- **Enforcement:** Active
- **Bypass actors:** None (no exceptions)

### Environment Protection

#### `staging`

- **Required reviewers:** `@AgentCraftworks/maintainers` team approval
- **Deployment branch policy:** Protected branches only (`main`, `staging`)
- **Purpose:** Validate changes in a production-like environment before promoting to `main`

#### `production`

- **Required reviewers:** `@AgentCraftworks/maintainers` team approval
- **Wait timer:** 1 hour (cooldown period to catch urgent issues)
- **Deployment branch policy:** Protected branches only (`main`, `staging`)
- **Purpose:** Final gate before customer-visible deployment

> **Note:** Environment protection ensures that only authorized maintainers can approve
> deployments to staging and production environments. The `deploy-azd.yml` workflow
> respects these rules automatically when targeting `environment: staging` or
> `environment: production`.

### CODEOWNERS

A `.github/CODEOWNERS` file was added to define required reviewers for all sensitive paths in the repository. This file directly enables the "1 approving review from CODEOWNERS (enforced)" requirement described in the [Branch Protection](#branch-protection) section above.

| Path pattern | Required reviewer(s) |
|---|---|
| `*` (default) | `@AgentCraftworks/maintainers` |
| `/typescript/` | `@AgentCraftworks/maintainers` |
| `/typescript/src/mcp/` | `@AgentCraftworks/maintainers` |
| `/.github/workflows/` | `@AgentCraftworks/maintainers` |
| `/infra/`, `azure.yaml`, `docker-compose.yml` | `@AgentCraftworks/maintainers` |
| `docs/accessibility.md` | `@AgentCraftworks/accessibility-lead` |

### CI Workflow Alignment

Three GitHub Actions workflow job names were updated to **exactly match** the required status check names configured in branch protection. GitHub matches required status checks by job name — a mismatch means a check never satisfies the requirement and PRs are permanently blocked.

| Workflow file | Old job name | New job name |
|---|---|---|
| `.github/workflows/cla.yml` | `cla_assistant` | `cla` |
| `.github/workflows/ghaw-accessibility-review.yml` | `Post Accessibility Checklist` | `ghaw-accessibility-review` |
| `.github/workflows/ghaw-azd-service-tag-check.yml` | `Validate azd service-tag contract` | `ghaw-azd-service-tag-check` |

### Release Script Update

`scripts/tag-release.sh` was updated to use the full product name "AgentCraftworks Community Edition" in annotated tag messages (previously "AgentCraftworks CE"). No behavioral change.

### Governance Changes Verification

Use these steps to verify the protection rules and associated changes are working correctly:

**Branch protection and required status checks:**
```bash
# Confirm job names match required status check names (Settings → Branches → Edit)
# After a PR is opened, the following checks must appear and pass:
#   cla, ghaw-accessibility-review, ghaw-azd-service-tag-check, build-and-test
gh api repos/AgentCraftworks/AgentCraftworks-CE/branches/main \
  --jq '.protection.required_status_checks.contexts'
# Replace 'main' with 'staging' to verify that branch's required checks
```

**CODEOWNERS in effect:**
Open a PR touching `/.github/workflows/` or `/typescript/src/mcp/` and confirm that `@AgentCraftworks/maintainers` is auto-requested as a reviewer.

**Tag protection ruleset:**
```bash
gh api repos/AgentCraftworks/AgentCraftworks-CE/rulesets/13516390 \
  --jq '{name: .name, enforcement: .enforcement}'
# Expected: enforcement: "active"
```

---

## azd Service-Tag Contract

`azd deploy` maps each service in `azure.yaml` to its Azure resource using an
`azd-service-name` tag.  If the tag is missing on the resource, deploy fails
with a service-mapping error.

### How it works

Every entry under `services:` in `azure.yaml` requires a matching tag on the
provisioned Azure resource in `infra/`:

```bicep
// infra/app-ts.bicep
var serviceTags = union(tags, {
  'azd-service-name': 'typescript-api'   // must match the key in azure.yaml
})

resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  tags: serviceTags   // pass serviceTags, not plain tags
  ...
}
```

The service name in the tag (`typescript-api`) must exactly match the key under
`services:` in `azure.yaml`:

```yaml
# azure.yaml
services:
  typescript-api:   # <-- must match 'azd-service-name' tag value
    host: containerapp
    ...
```

### Current service-tag mapping

| azure.yaml service | Bicep file | Tag value |
|--------------------|------------|-----------|
| `typescript-api` | `infra/app-ts.bicep` | `'azd-service-name': 'typescript-api'` |

### Adding a new service

1. Add the service to `azure.yaml` under `services:`.
2. Create (or update) the corresponding Bicep file in `infra/` so the Azure
   resource carries the `azd-service-name` tag:

   ```bicep
   var serviceTags = union(tags, {
     'azd-service-name': '<your-service-name>'
   })
   ```

3. The `ghaw-azd-service-tag-check` CI workflow validates this contract
   automatically on every PR that touches `azure.yaml` or `infra/**`.
   PRs that break the contract are blocked from merging.

---

## CI/CD Pipeline

### Workflows

| Workflow | File | Trigger |
|----------|------|---------|
| **TypeScript CI** | `.github/workflows/ci.yml` | Push, PR |
| **azd deploy** | `.github/workflows/deploy-azd.yml` | Manual (`workflow_dispatch`) |
| **Docker deploy** | `.github/workflows/deploy-production.yml` | Push to `main`, `v*` tags, manual |
| **Changeset** | `.github/workflows/ghaw-changeset.yml` | Push to `main`, manual |
| **CI Coach** | `.github/workflows/ghaw-ci-coach.yml` | CI failure |
| **PR Fix** | `.github/workflows/ghaw-pr-fix.yml` | Check run failure |
| **Workflow Health** | `.github/workflows/ghaw-workflow-health.yml` | Weekday schedule, manual |
| **Test Improver** | `.github/workflows/ghaw-daily-test-improver.yml` | Weekday schedule, manual |
| **CLI Consistency** | `.github/workflows/ghaw-cli-consistency.yml` | PR to `main`, manual |
| **azd Service-Tag Check** | `.github/workflows/ghaw-azd-service-tag-check.yml` | All PRs (exits early when `azure.yaml` / `infra/**` unchanged); push to `main` touching `azure.yaml` or `infra/**` |

### Build Process

1. Checkout code
2. Set up Docker Buildx
3. Login to Azure Container Registry
4. Build and push Docker image with caching
5. Update Azure Container App with new image
6. Run smoke tests

### Deployment Strategy

- **Zero-downtime** — Azure Container Apps handle rolling updates
- **Automatic rollback** — Failed health checks trigger rollback
- **Image tagging** — Each deployment tagged with Git SHA

---

## Smoke Tests

### What They Test

1. **Health endpoint** — Service is running and responsive
2. **Handoff API** — Can create handoffs via REST API

### Running Smoke Tests

```bash
# Local
./scripts/run-smoke-tests.sh local

# Production
TYPESCRIPT_PROD_URL=https://your-app.azurecontainerapps.io ./scripts/run-smoke-tests.sh production

# Directly
cd typescript
BASE_URL=http://localhost:3000 npx tsx smoke-test.ts
```

### Postdeploy Retry Behavior (azd)

The `azure.yaml` `postdeploy` hook runs smoke tests with retries to reduce false negatives during cold start or ingress warm-up:

- Attempts: `5`
- Delay between attempts: `15s`
- Behavior: workflow fails only if all attempts fail

This applies to `azd up` executions used by `.github/workflows/deploy-azd.yml`.

### Expected Output

```
🔍 Running smoke tests against http://localhost:3000
✓ Health endpoint responds (45ms)
✓ Create handoff via API (123ms)
==================================================
Test Summary: Total: 2, Passed: 2, Failed: 0
✅ All smoke tests passed!
```

---

## Production Deployment Checklist

### Pre-Deploy

- [ ] Azure subscription with appropriate permissions
- [ ] Azure CLI / azd installed and configured
- [ ] Docker installed locally (for testing)
- [ ] GitHub App created, private key downloaded, webhook secret generated
- [ ] `.env.example` copied to `.env` with real values
- [ ] Local `docker compose up` runs successfully
- [ ] `curl http://localhost:3000/health` returns 200 OK

### Deploy to Staging

- [ ] `azd init` with staging environment name
- [ ] Secrets configured via `azd env set`
- [ ] `azd up` completes without errors
- [ ] Health endpoint returns 200 OK
- [ ] GitHub App webhook URL updated to staging URL

### Promote to Production

- [ ] Staging validated end-to-end
- [ ] `azd init` with production environment name (or switch with `azd env select`)
- [ ] `azd up` completes without errors
- [ ] Health endpoint returns 200 OK
- [ ] GitHub App webhook URL updated to production URL
- [ ] Create a test PR to verify webhook delivery

---

## Monitoring & Health Checks

### Health Endpoint

`GET /health` returns:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 12345.67,
  "timestamp": "2026-02-27T10:30:00.000Z"
}
```

### View Logs

```bash
az containerapp logs show --name ca-ts-{token} --resource-group rg-{env-name} --follow
```

### Azure Monitor KQL

```bash
az monitor log-analytics query \
  --workspace {workspace-id} \
  --analytics-query "ContainerAppConsoleLogs_CL | where TimeGenerated > ago(1h) | limit 100"
```

Or via Azure Portal: Container App → **Monitoring** → **Logs**.

---

## Cost Estimation

Approximate monthly costs:

| Resource | Tier | Est. Cost |
|----------|------|-----------|
| Container Apps Environment | Consumption | $0 |
| Container App (1 app) | 0.5 vCPU, 1GB RAM | ~$15-25/month |
| Container Registry | Basic | ~$5/month |
| PostgreSQL Flexible Server | Burstable B1ms | ~$15-20/month |
| Redis Cache | Basic C0 | ~$17/month |
| Key Vault | Standard | ~$0.03/month |
| Log Analytics | Pay-as-you-go | ~$5-10/month |
| **Total** | | **~$57-77/month** |

Use the [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/) for precise estimates.

---

## Cleanup

```bash
# Delete all Azure resources
azd down
```

This deletes all Azure resources and cleans up local environment config. **This is irreversible and deletes all data.**

To remove only the app (keep infrastructure):
```bash
az containerapp delete --name ca-ts-{token} --resource-group rg-{env-name}
```

---

## Troubleshooting

### Docker Build Failures

```bash
# Ensure .dockerignore is present, verify context path in docker-compose.yml
docker compose logs typescript-api
```

### Service Won't Start Locally

```bash
# Check env vars are set, verify PostgreSQL is running
docker compose logs -f
```

### Azure Deployment Fails

```bash
# Check login, resource group, ACR credentials
az account show
azd env get-values
az containerapp logs show --name ca-ts-{token} --resource-group rg-{env-name} --tail 100
```

### Container Can't Pull Image

```bash
# Verify managed identity has AcrPull role
az role assignment list --assignee {principal-id} \
  --scope /subscriptions/{sub}/resourceGroups/rg-{env}/providers/Microsoft.ContainerRegistry/registries/acr{token}
```

### Container Can't Access Key Vault

```bash
# Verify managed identity has Key Vault Secrets User role
az role assignment list --assignee {principal-id} \
  --scope /subscriptions/{sub}/resourceGroups/rg-{env}/providers/Microsoft.KeyVault/vaults/kv{token}
```

### GitHub Actions Workflow Fails

1. Check secrets are configured correctly in GitHub
2. Verify Azure credentials / federated credentials haven't expired
3. Check workflow logs for specific error
4. Ensure Docker image builds locally first
5. Verify Azure resource limits aren't exceeded

#### Common OIDC error: missing environment secrets

If `Azure Login (OIDC)` fails with:

`Using auth-type: SERVICE_PRINCIPAL. Not all values are present. Ensure 'client-id' and 'tenant-id' are supplied.`

Check that the target GitHub environment (for example `staging`) includes all required Azure auth secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_LOCATION`

You can verify configured environment secrets with:

```bash
gh api repos/AgentCraftworks/AgentCraftworks-CE/environments/staging/secrets --jq '[.secrets[].name]'
```

#### GitHub API rate limit during workflow triage

If `gh run view` or `gh run list` returns `HTTP 403: API rate limit exceeded`, check reset time before retrying:

```bash
gh api rate_limit --jq '.resources.core | "\(.remaining)/\(.limit) remaining, resets \(.reset | todate)"'
```

### Security Best Practices

1. **Never commit secrets** to source control
2. **Use managed identities** instead of connection strings
3. **Enable diagnostic logging** for all resources
4. **Rebuild containers regularly** for security updates
5. **Consider VNet integration** for production network isolation

---

For more information:
- [README.md](README.md) — Project overview
- [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution guidelines
- [LICENSE](LICENSE) — MIT License
