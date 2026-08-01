# ADR 0038: Normalize human-observatory evidence scales

- Status: accepted
- Date: 2026-08-01
- Release: v4.8.10

## Context

Production browser verification exposed two misleading projections. Relationship
trust is stored as a score from 0 through 100, but the Human Observatory passed
the score to a percent formatter that expects a rate from 0 through 1. A real
average of `71.05` therefore rendered as `7105%`. The backup/restore card also
called the evidence a pass when a same-database restore had passed even if the
persisted backup evidence was stale.

## Decision

The v2 observatory boundary converts the relationship score to a normalized
rate and advances its formula version to
`human-observatory-formulas-2.2.0`. Stored relationships and the underlying
symbiosis report remain on their existing 0–100 score contract. The v1
compatibility projection retains its historical 0–100 value.

The backup/restore card now combines backup freshness and second-database
restore state for its headline. It separately exposes backup freshness, age,
restore, encryption and off-host status. A false component takes precedence
over a missing component; otherwise missing evidence remains pending.

## Consequences

- Human readers see `71%`, not `7105%`, for the current relationship signal.
- API consumers can bind the corrected rate to the new formula version.
- A stale backup can no longer hide behind a successful same-host restore.
- No city state, settlement, trust lane or recovery evidence is changed.
