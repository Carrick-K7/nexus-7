# ADR 0002: Causal Observation Model

- Status: Implemented
- Date: 2026-07-16
- Target release: v0.5.0

## Context

Deterministic replay can prove that a run is reproducible, but a raw event list
does not tell a human why an autonomous action was selected or whether it helped.
NEXUS-7 needs an observation contract that remains useful when rule-based agents
are later replaced by model-backed proposals.

## Decision

Every policy-generated action uses one correlation ID and records five stages:

1. observation;
2. proposal;
3. validated command;
4. execution event;
5. evaluation.

The causal links are explicit:

```text
observation event
  -> proposal event
    -> command
      -> execution event
        -> evaluation event
```

An Action Trace groups these records by correlation ID. A verified autonomy loop
is accepted only when all five stages are present and each causation reference
points to the preceding stage.

## Observer behavior

- The Observer Dashboard reports verified-loop, causal-completeness, evaluation,
  and replay-integrity metrics.
- A trace exposes the proposal rationale, expected delta, command payload,
  guardrail result, before/after values, actual delta, and evaluation outcome.
- Historical tick inspection replays from the initial state rather than reading
  mutable UI history.
- Counterfactual comparison replays the same scenario and commands with another
  seed, then reports metric, event, and action deltas.
- EvolutionLog prefers structured iteration manifests and uses Git history only
  as a fallback.

## Consequences

The event log is larger, but it can now support audit, comparison, and later
human approval. Agent proposals remain untrusted: only validated commands may
change the world.
