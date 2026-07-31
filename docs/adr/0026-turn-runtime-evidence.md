# ADR-0026: Bind operational evidence to each new Turn

## Context

The deterministic Turn timestamp is simulated Shenzhen time. It cannot prove
when a worker actually ran, whether a Turn was late, or which deployed source
settled it. The season correctly retains its v4.0 origin, but that made later
upgrade continuity difficult to audit. Historical deployment documents and
backups were external to the Turn chain.

## Decision

1. Add an optional runtime-evidence envelope to every newly settled Turn:
   wall-clock record time, expected time, lag/timing class, interval, worker,
   exact deployment revision, engine version/contract and predecessor.
2. Keep this envelope outside the world snapshot fingerprint so identical
   synthetic worlds replay identically at different wall-clock times.
3. Derive a versioned reliability report from persisted Turn JSON: sequence
   gaps, duplicates, lineage mismatch, freshness, on-time rate and revision
   coverage.
4. Treat 2,161 hourly reference records as an algorithm gate only. The public
   production-duration counter advances only from real persisted wall time.
5. Encrypt backup artifacts with authenticated AES-256-GCM and a mode-0600 key.
   Record second-database checksum, row-count, fingerprint and resumed-write
   evidence in a checksum-backed receipt.
6. Keep same-host and off-host restore evidence distinct. An operator may set
   off-host only after the artifact and restore target genuinely leave the
   production host.

## Consequences

- Legacy Turns remain readable and honestly reduce revision coverage until
  enough new evidence accumulates.
- PostgreSQL and memory need no schema migration because Turn JSON is already
  atomic and versioned.
- Restart and upgrade continuity become inspectable without rewriting season
  provenance.
- v4.4 can ship implementation-complete while actual 90-day duration and
  off-host recovery remain explicit external evidence gates.
