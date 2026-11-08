# Squad SDK 1.1.0 compatibility spike

**Status:** G-1 recommendation: **GO, with gate conditions**  
**Scope:** Read-only compatibility evaluation for `@bradygaster/squad-sdk@1.1.0`  
**Evaluated:** 2026-11-07  
**Decision boundary:** This is not approval to merge the dependency, deploy a squad, or bypass CE governance.

## Recommendation

The package is technically usable in the CE Node 22 / ESM / strict-TypeScript environment. The exact 1.1.0 package installed without tracked dependency changes; CE typecheck, build, and tests passed; the SDK's ESM entry points and representative Windows path checks worked; and npm audit reported no vulnerabilities.

Proceed to design G-2 through G-7 only after the plan's G5 prerequisites are met: D-13 approval and U-4 alignment. Keep CE as the policy and audit control plane: every agent action must still pass through CE authorization and handoff logic. Do not import model-resolver profiles, HydraFusion, multi-squad coordination, or the Redis Rate Governor into CE under this recommendation. The upstream 1.0.1-to-1.1.0 release-specific API delta is not sufficiently documented to call the upgrade unconditionally safe; verify the exact integration contract during G-2/G-3.

## Existing CE usage

- `typescript/package.json` and its lockfile do not depend on `@bradygaster/squad-sdk`; no TypeScript source imports the SDK.
- `.squad/rubber-duck.yml` is the only `.squad/` runtime configuration found. It configures the manual Rubber Duck review capability; it is not an SDK integration.
- Squad Coordinator and other Squad references in the repository are documentation. The README contains a Squad Coordinator capability row, while existing docs distinguish CE's current manual capability from additional coordinator integration. This spike does not change those claims.

## Compatibility results

| Area | Finding |
|---|---|
| Exact package | `@bradygaster/squad-sdk@1.1.0` installed with `npm install --no-save --package-lock=false`. Root and TypeScript `package.json`/lockfiles remained unchanged. |
| License | MIT, per the published package manifest. |
| Node | `engines.node` is `>=22.5.0`; the test runtime was Node 22.22.0. |
| Module format | ESM-only (`type: module`, `import` exports, no `require` export). CE is already ESM, so this is not a current blocker. CommonJS consumers would need an adapter or migration. |
| TypeScript | A temporary fixture importing `resolveSquad` and the `SquadConfig` type compiled with CE's strict, bundler-resolution tsconfig. The fixture was removed after the check. This validates basic declaration compatibility, not the unimplemented coordinator-to-governance adapter. |
| Build and tests | `npm run typecheck`, `npm run build`, and `npm test` passed with the SDK installed in the scratch worktree. No SDK runtime behavior is exercised by CE's existing test suite. |
| Windows paths | On Windows, `resolveSquad()` found the repository's `.squad` directory; `ensureSquadPath()` accepted a path inside it and rejected a path outside it; `deriveProjectKey()` converted `C:\workspace\my-repo` to `my-repo`. These are focused helper checks, not a cross-platform CI matrix. |
| Package size | `npm pack --dry-run` reported 1,080,471 bytes packed and 4,508,273 bytes unpacked (about 1.03 MiB / 4.30 MiB). |
| Dependency audit | A temporary lock-only project containing the exact SDK pin resolved 107 packages (7 production, 101 optional). `npm audit` reported 0 vulnerabilities at all severities. |
| Install warnings | npm emitted deprecation warnings for OpenTelemetry packages, including `@opentelemetry/sdk-trace-node` and `@opentelemetry/sdk-trace-base` (recommended replacements are `@opentelemetry/sdk-trace`) and the unsupported `@opentelemetry/propagator-jaeger`. These are maintenance warnings, not audit vulnerabilities. |

## API changes and remaining uncertainty

There are no existing CE SDK call sites to break or migrate. The package is ESM-only, so CommonJS `require()` is unsupported; that is compatible with CE's current ESM configuration. The SDK changelog also contains a breaking note that `createCommunicationAdapter()` is now asynchronous and returns `Promise<CommunicationAdapter>`; any future caller must `await` it.

The SDK package changelog has `Unreleased` and `0.10.0` headings, rather than a release-specific 1.1.0 migration section. Therefore it does not establish a complete API delta from 1.0.1 to 1.1.0. The GitHub release lookup for `v1.1.0` did not return a release entry. In particular, do not assume the model-profile/resolver contract from the release announcement is exposed or stable in the SDK without an exact import/type test.

## Comparison with paid SGM-0

The paid Squad 1.1.0 strategy bundle records a paid-repository 1.0.1 pin and an adapter that maps one `defaultModel` preference (with a fixed fallback). It explicitly says that no 1.1.0 `modelProfile` contract or unified resolver was verified, and that existing governance hooks are not proof that every future model leg or fallback is intercepted. Its SGM-0 readiness checklist also calls for exact CLI/SDK API, precedence/fallback, and governance-parity evidence.

This CE spike confirms package metadata, basic ESM/type compatibility, dependency audit, package size, and focused Windows path behavior. It does **not** close the paid bundle's model-selection, fallback, or governance-parity questions, nor does it test the paid repository's adapter. CE should not consume those unverified model-selection capabilities as part of this workstream.

## Capabilities worth evaluating for CE

- Typed configuration parsing and validation, if the SDK can be adapted to the CE `.squad/` schema without replacing CE's policy checks.
- Coordinator, routing, and session fan-out primitives to avoid reimplementing orchestration, with CE creating handoffs and authorizing every action before execution.
- SDK tools for routing/status/decisions/skills and its storage or session abstractions, limited to features that preserve CE's single-squad, single-node scope.
- Runtime observability and cost/context accounting only where it complements CE's local audit and action budgets.

The SDK's README notes that `squad_route` requires fan-out dependencies and creates sessions. That path needs an explicit CE gate/adapter; the SDK must not become an alternate dispatch or privilege path. The CE plan's exclusions for model-resolver profiles, HydraFusion, multi-squad S2S, and Redis-backed Rate Governor remain in force.

## G-2 through G-7 effort

The CE plan's baseline estimates total 7 AEU. The range below keeps those estimates and adds a small reserve for integration and cross-platform evidence; it is not authorization to begin before the gates align.

| Work package | CE plan baseline | Spike planning range | Main uncertainty |
|---|---:|---:|---|
| G-2: exact pin, Dependabot group, preview compatibility job | 0.5 | 0.5 | Confirm lockfile reproducibility and isolate the non-blocking preview job. |
| G-3: config, coordinator, gated handoff/action routing | 3 | 3–4 | SDK routing/session contracts and the CE enforcement adapter. |
| G-4: MCP squad tools | 1 | 1 | Keep tool outputs aligned with existing MCP schemas and state ownership. |
| G-5: Linux/Windows/macOS and end-to-end tests | 1 | 1–1.5 | Existing Windows path checks are not a CI matrix or workflow test. |
| G-6: docs, sample team, Academy lab | 1 | 1 | Sample must demonstrate real CE handoff and denial behavior. |
| G-7: `/health`, MCP metadata, release notes | 0.5 | 0.5 | Keep SDK version metadata synchronized with the exact pin. |
| **Total** | **7** | **7–8.5** | |

## Gate disposition

**G-1 technical recommendation: GO. G5: NOT YET SATISFIED.** The spike supplies the compatibility evidence needed for a bounded next design step, but G5 still requires D-13 approval and U-4 alignment by the named human approvers. Once those are recorded, begin with a small G-2/G-3 integration contract that proves CE authorization and handoff behavior before adding MCP tools or documentation.

### References

- [Squad SDK 1.1.0 on npm](https://www.npmjs.com/package/@bradygaster/squad-sdk/v/1.1.0)
- [Squad v1.1.0 source tag](https://github.com/bradygaster/squad/releases/tag/v1.1.0)
- [Paid Squad 1.1.0 strategy overview](https://github.com/AgentCraftworks/AgentCraftworks/blob/staging/docs/futures/strategy/squad-1.1.0/README.md)
- [Paid SGM-0 sources and gaps](https://github.com/AgentCraftworks/AgentCraftworks/blob/staging/docs/futures/strategy/squad-1.1.0/02-SOURCES_AND_GAPS.md)
- [Paid SGM-0 readiness plan](https://github.com/AgentCraftworks/AgentCraftworks/blob/staging/docs/futures/strategy/squad-1.1.0/05-READINESS_AND_IMPLEMENTATION_PLAN.md)
- CE implementation plan, §5.9 WS-G and §6 G5
