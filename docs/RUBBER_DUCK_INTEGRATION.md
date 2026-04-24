# Rubber Duck Integration — AgentCraftworks CE

> **Date**: April 2026  
> **Status**: CURRENT  
> **Edition**: Community Edition (CE) — open-source (MIT)  
> **Related**: [architecture.md (CE)](./architecture.md) · [GitHub Copilot Rubber Duck](https://github.blog/ai-and-ml/github-copilot/github-copilot-cli-combines-model-families-for-a-second-opinion/)

---

## What Is Rubber Duck?

**GitHub Copilot Rubber Duck** (released April 6, 2026) adds a cross-model-family second opinion to your agent workflow. When your primary agent uses Claude, Rubber Duck runs on GPT-5.4 — catching what the primary agent misses at three key checkpoints:

1. **After drafting a plan** — before execution begins
2. **After a complex implementation** — when 3+ files are changed
3. **After writing tests, before running them** — catching gaps before self-reinforcement

Rubber Duck is available via `gh copilot` with `/experimental` mode enabled in GitHub Copilot CLI.

---

## CE vs. Pro/Enterprise

| Capability | CE (MIT) | Pro/Enterprise |
|-----------|---------|---------------|
| On-demand Rubber Duck via CLI | ✅ | ✅ |
| Peer-to-peer Rubber Duck guidance | ✅ (manual) | ✅ (automatic) |
| `.agentcraftworks.yml` config schema | ✅ | ✅ |
| Automatic FSM `RD_REVIEW` gate | ❌ | ✅ |
| Rate Governor integration | ❌ | ✅ |
| `.squad/rd-reviews/` audit trail | ✅ (manual) | ✅ (automatic) |
| Squad coordinator checkpoint hooks | ✅ | ✅ |
| Environment-aware checkpoint activation | ❌ | ✅ |

In CE, Rubber Duck is available as a **manual on-demand** capability — you or your agents invoke it explicitly. Pro/Enterprise adds automatic activation at FSM checkpoints, Rate Governor integration, and environment-specific policies.

---

## Getting Started (CE)

### Prerequisites

1. Install [GitHub Copilot CLI](https://github.com/features/copilot/cli)
2. Enable experimental mode: run `/experimental` in a Copilot CLI session
3. Select a Claude model in the model picker
4. Ensure GPT-5.4 access is enabled on your account

### Opt Into Rubber Duck in Your Repo

Add a `rubberDuck` block to `.agentcraftworks.yml`:

```yaml
rubberDuck:
  enabled: true
  minEngagementLevel: 3   # Level 3 = Peer Programmer and above
  triggerCheckpoints:
    afterPlan: true
    afterComplexImpl: true
    afterTestWrite: true
  maxCallsPerHour: 10
```

### Opt Out

To disable Rubber Duck for your repo:

```yaml
# .agentcraftworks.yml
rubberDuck:
  enabled: false
```

To disable for a specific squad:

```yaml
# .squad/rubber-duck.yml
enabled: false
```

To skip for a specific task, tell your agent: `"skip rubber duck for this task"`.

---

## Using Rubber Duck in Peer-to-Peer Workflows

In CE, you can manually invoke Rubber Duck at any point by asking your agent:

- `"Rubber duck this plan before we start"`
- `"Get a second opinion on this implementation"`
- `"Review our test coverage with rubber duck before running"`

The agent will invoke Rubber Duck via the Copilot CLI task infrastructure, surface the concerns, and reason over what to change.

### Example — Plan Review

```
You: We're about to implement the new caching layer. Rubber duck the plan first.

Agent: Invoking Rubber Duck on the caching plan...

Rubber Duck found 2 concerns:
  [HIGH] The cache invalidation strategy uses a single global TTL — 
         items written by different services will expire simultaneously, 
         causing a thundering herd when the TTL fires.
  [LOW]  The plan doesn't address cache-aside vs. write-through strategy 
         for the user profile endpoint.

Agent: Revising plan to use per-service TTL jitter (300–600s random offset) 
       and adopting cache-aside for user profiles. Proceeding with revised plan.
```

---

## Squad Coordinator Integration (CE)

If you use the Squad pattern, create `.squad/squad.agent.md` for your coordinator instructions (if it does not already exist), then add this Rubber Duck protocol:

```markdown
## Rubber Duck Review Protocol

Before transitioning from PLANNING to IMPLEMENTATION, check:
- Is rubberDuck.enabled == true in .agentcraftworks.yml?
- Is engagement_level >= 3?

If both: invoke Rubber Duck with:
  checkpoint: "post_plan"
  context: [full plan summary]

Record the review in: .squad/rd-reviews/{timestamp}-post-plan.md
Document what changed and why (or explicitly why not).

Repeat at post_impl (3+ file changes) and post_test (before test run).
```

### Persistent Review Trail

Store all Rubber Duck reviews in `.squad/rd-reviews/` for audit and retrospective:

```
.squad/
  rd-reviews/
    2026-04-17T14-30-00-post-plan.md
    2026-04-17T15-45-00-post-impl.md
    2026-04-17T16-20-00-post-test.md
  decisions.md
  history.md
```

Each review file records:
- Checkpoint type and timestamp
- Context provided to Rubber Duck
- Concerns raised (with severity)
- Agent reasoning: what changed, what was kept, and why

---

## Related Documentation

- [Full Rubber Duck Integration Guide](https://agentcraftworks.com/docs/rubber-duck) (Pro/Enterprise)
- [GitHub Copilot Rubber Duck Blog Post](https://github.blog/ai-and-ml/github-copilot/github-copilot-cli-combines-model-families-for-a-second-opinion/)
- [Engagement Levels](./architecture.md)
- [Contributing to AgentCraftworks CE](../CONTRIBUTING.md)
