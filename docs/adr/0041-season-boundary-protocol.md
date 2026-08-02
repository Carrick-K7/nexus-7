# ADR 0041: Season Boundary Protocol

- Status: accepted (2026-08-01)
- Applies to: v4.10.0 and later

## Context

The production season identifier is currently a constant
(`symbiotic-shenzhen-season-2026-q3`) with no rollover semantics. If the
laboratory operates for years, the season label becomes misleading and the
evidence chain has no defined transition. The elapsed-production trust lane is
runtime-envelope based and continues across seasons, but the city world has no
protocol for opening a next season.

## Decision

Define the season boundary protocol as an operator-invoked, deterministic
transition (implemented in `src/symbiosis/season.ts`):

- `nextSeasonId` advances quarter identifiers and wraps years
  (`2026-q3 → 2026-q4 → 2027-q1`).
- `rolloverSeason(previousSettlement)` requires a settled non-genesis head,
  derives the next season id, seed family and start date from the previous
  season's final simulated date, and produces a fresh genesis world with the
  same regime.
- The continuity link is the `SeasonArchive` ledger: previous final
  fingerprint, next genesis fingerprint, final Turn, dates, regime, seed
  family, wall-clock decision time and a self-hash. `verifySeasonArchive`
  rejects tampering, unrecognized season ids and broken ordering.
- Executing a rollover in production is a **human constitutional decision**
  (the archive records `executedBy: "human-constitutional-decision"`); it is
  never automatic.

## Consequences

- The science program can model multi-season studies without touching
  production.
- The elapsed-production lane keeps counting across seasons because it reads
  runtime envelopes, not the season constant.
- Archives are synthetic research evidence, not real policy records.
- The current production season remains unchanged until the human governor
  decides otherwise.
