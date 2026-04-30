# RecordingStudio — CX Capture Tooling

This directory contains the **Customer Experience (CX) capture infrastructure** for AgentCraftworks-CE.
It is required for any PR or issue labelled `cx:required` (see [Definition of Done](../AGENTS.md#definition-of-done--customer-experience-mandatory) in `AGENTS.md`).

## Directory Structure

```
RecordingStudio/
├── AGENTS.md                     ← You are here
├── capture-specs/
│   ├── _template.yaml            ← Copy this to create a new spec
│   └── <feature-slug>.yaml       ← One spec per cx:required feature
└── captures/                     ← Auto-generated screenshots/recordings (gitignored)
```

## Quick Start — Creating a CX Capture Spec

1. Copy the template:
   ```bash
   cp RecordingStudio/capture-specs/_template.yaml \
      RecordingStudio/capture-specs/<feature-slug>.yaml
   ```
2. Fill in all required fields: `source_app`, `description`, `base_url`, `pass_criteria`, `selectors`.
3. Run the synthetic test locally:
   ```bash
   npx playwright test --config RecordingStudio/playwright.config.ts
   ```
4. Add your feature slug to [`cx-capture.yml`](../cx-capture.yml) so it runs on every weekly scan.

## Capture Spec Format

See [`capture-specs/_template.yaml`](capture-specs/_template.yaml) for the full annotated format.

Required top-level fields:

| Field | Description |
|-------|-------------|
| `source_app` | The application or service being tested |
| `description` | Human-readable description of the customer journey |
| `base_url` | Base URL of the running product instance |
| `pass_criteria` | List of assertions that must all succeed |
| `selectors` | Key interactive elements used during recording |

## Running CX Synthetic Tests

> **Note**: The Playwright configuration (`RecordingStudio/playwright.config.ts`) and the weekly
> automation workflow (`ghaw-cx-synthetic.yml`) are planned infrastructure — they will be added
> when the CX synthetic testing pipeline is wired up. In the meantime, contributors can run
> Playwright manually against specs using:

```bash
# Set the base URL (defaults to http://localhost:3000)
export CX_BASE_URL=https://staging.agentcraftworks.example.com

# Run Playwright against the capture specs (requires playwright.config.ts to be present)
npx playwright test --config RecordingStudio/playwright.config.ts

# Run a single spec by slug
npx playwright test --config RecordingStudio/playwright.config.ts \
  --grep "<feature-slug>"
```

## Weekly Automated Run

The `ghaw-cx-synthetic.yml` workflow (planned) will run all specs registered in `cx-capture.yml`
every week once the pipeline is wired up.
Screenshots will be uploaded as workflow artifacts and linked from the PR.

## Full Tooling Documentation

Canonical tooling docs live in `AgentCraftworks/RecordingStudio/AGENTS.md` (the paid product repo).
This file covers the conventions specific to the AgentCraftworks-CE (Community Edition) repo.
