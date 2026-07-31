# ADR 0004: Human-in-the-loop Model Boundary

- Status: Implemented
- Date: 2026-07-16
- Target release: v0.7.0

## Context

The deterministic agent runtime accepted only local policy proposals. Connecting
an external model directly to world mutation would make runs non-reproducible
and would allow malformed, over-budget, or unsafe output to bypass the existing
command guardrails.

## Decision

Models are proposal providers, never world authorities.

Every provider implements an asynchronous `ModelProvider` contract and returns
a structured proposal envelope. The envelope is validated for schema,
capability, token budget, monetary budget, timeout, target metric, delta, and
risk before it can become a simulation command.

The runtime applies this approval policy:

- low risk: eligible for automatic approval;
- medium/high risk: paused and queued for explicit human approval;
- critical risk: forbidden;
- provider failure or invalid output: use the deterministic mock fallback and
  record the reason.

The simulation pauses while a proposal is generated so that the observed tick
cannot race ahead. An approved proposal is converted into a versioned model
command for the next tick. Provider, model, prompt version, policy version,
approval identity, usage, cost, latency, and fallback metadata travel with that
command and its causal events.

## Determinism boundary

Provider inference is not replayed. The approved command is the authoritative
experiment input. Replay consumes that recorded input and therefore remains
deterministic even when the original proposal came from a non-deterministic
provider.

## Consequences

- External models cannot mutate the city directly.
- Human decisions are auditable and reproducible.
- Real providers can be added without weakening the pure simulation core.
- Approval queues must eventually move to server-authoritative durable storage
  to support multiple observers and reliable recovery; that is the v0.8 scope.
