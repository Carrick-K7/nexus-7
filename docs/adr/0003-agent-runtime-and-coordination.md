# ADR 0003: Agent Runtime and ARIA Coordination

- Status: Implemented
- Date: 2026-07-16
- Target release: v0.6.0

## Context

The deterministic core originally contained threshold checks, task selection,
cooldowns, and command creation in one step function. This made agent behavior
hard to extend and provided no explicit answer when multiple agents wanted to
change the same world metric.

## Decision

Each domain agent implements the same contract:

```text
observe(world, context) -> observations
propose(observation, world, context) -> proposals
```

The runtime gathers all proposals and ARIA schedules them using:

- immutable capability contracts;
- per-agent command budgets;
- a global per-tick command budget;
- cooldown windows;
- agent and proposal priorities;
- maximum risk tiers;
- one winning proposal per target metric.

Rejected proposals receive explicit scheduler codes: budget exceeded, cooldown
active, command conflict, or risk not allowed. Both scheduled and rejected
proposals remain in the causal event log.

## Agent boundaries

- ATLAS controls crime interventions.
- ECONOMICA controls GDP and happiness interventions.
- CIVITAS controls traffic, energy, pollution, water, and medical readiness.
- SPECTRE controls crime intelligence and internet resilience.
- ARIA coordinates; it does not directly mutate world metrics.

## Consequences

The system can now add deterministic mock agents or future model-backed agents
without bypassing validation. ARIA can explain the latest arbitration and accept
human pause/resume commands, while model integration remains deferred until
risk-tiered approval policies exist.
