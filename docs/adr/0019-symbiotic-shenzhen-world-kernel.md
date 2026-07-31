# ADR 0019: Add Symbiotic Shenzhen as a gated world aggregate

## Status

Accepted for direction development; human pilot activation is not approved.

## Context

v2 verifies bounded autonomy interventions but does not model long-lived
reciprocal residents with heterogeneous material needs. Reverting to v0.3 or
replacing v2 would discard the governance and evidence kernel.

## Decision

Create `direction/symbiotic-shenzhen-v3` from the v2 head and retain v2 as the
safety kernel. Add a separate `symbiosis` bounded context with versioned world,
resident, need, relationship, commitment, Turn, decision and report contracts.
Only its seeded deterministic engine may propose world settlements; memory and
PostgreSQL repositories atomically commit an expected Turn.

Use real Shenzhen public aggregates and coarse topology only as frozen scale
calibration. All foreground identities and events are synthetic. Keep model
cognition optional and non-authoritative. Delay relationships, participant
input, providers and City Lens until their specific gates exist.

## Consequences

v1/v2 reports and releases stay compatible. v3 can be developed and replayed
without a live model or human participant. The new normalized schema and backup
surface increase operational cost. The draft constitution blocks a real pilot
and mainline replacement until human approval is recorded.
