# ADR-0022: Make the Human Observatory the product front door

## Status

Accepted · 2026-07-19

## Context

The durable v4 city was hidden behind a legacy Neo Angeles dashboard whose
population, clock and mutation controls described a different client-only
simulation. City Lens exposed current metrics but did not explain the
experiment, individual unit state, institution flow or production-chain
meaning. A public visitor could see data without understanding the project.

## Decision

The default route renders a bilingual, read-only Human Observatory backed only
by a versioned deterministic projection of the active world. It exposes:

- foreground/background population semantics and all 260 unit states;
- type-aware mood, engagement and durability proxies with no consciousness
  claim;
- community resources and eight projected institutions per community;
- 100% software-control coverage separately from dynamic chain continuity;
- trends, event evidence, causal layers, RALR denominator and replay trust.

Legacy v1/v2 demonstrations remain compatible but are visually grouped away
from the active city. Their local simulation clock does not run while the
Human Observatory is active.

## Consequences

No new persistence is required: memory and PostgreSQL already store every
input and the projection is pure. The public API remains read-only. Every
formula is versioned, documented and tested; changes require a new formula
version. Human-readable summaries may not use ungrounded model prose.
