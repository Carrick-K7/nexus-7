# v4 AI-Only World Architecture

## Boundary

`src/symbiosis` owns the long-running simulated Shenzhen world. Its only
resident kinds are 200 humans, 36 AI and 24 robots. Humans are modeled as
humans, not as a separate “synthetic human” kind. The current season is fully
software-run and has no real participant, account, avatar or identity link.

The v2 closed-loop domains remain the operational safety kernel. Their human
administrator concepts govern software release and emergency responsibility;
they are not residents and do not inject intent into the city.

```text
frozen public aggregates ── scale/topology only
             ↓
deterministic world engine ── candidate Turn
             ↓
resource / capability / consent / continuity / harm gates
             ↓
bounded cognition ── structured preference only
             ↓
memory or PostgreSQL atomic commit
             ↓
anonymous read-only projection ── Human Observatory / report APIs
```

Only the deterministic engine changes world state. Models cannot execute
tools, SQL or shell; browser input cannot advance a Turn. PostgreSQL rejects a
settlement whose expected head is stale and commits the Turn, snapshot,
resource ledgers, events, relationships, commitments, episodes and cognitive
decisions atomically.

## Runtime

The production topology has four parts:

1. Next.js serves the observer interface and read projections on loopback;
2. one `worker:symbiosis` process advances a simulated day per interval;
3. PostgreSQL stores the durable season and evidence stream;
4. Caddy terminates TLS and exposes only GET/HEAD/OPTIONS publicly.

`NEXUS_AUTH_MODE=public-observer` resolves every public request to the same
fixed viewer. Asserted identity and role headers are ignored. Mutations fail
authorization in the application and are rejected again at the public proxy.
OIDC and signed-proxy modes remain available only for a separately deployed
operator control plane.

## Replay and cognition

Every Turn binds its season seed, distribution version, predecessor
fingerprint, simulation date, final fingerprint, event count, cognition
status and decision IDs. Random draws use stable `(seed, turn, channel,
sample)` coordinates. A saved model decision is an input artifact on replay;
the provider is never called again.

The default cognitive policy is deterministic and zero-cost. Optional
DeepSeek V4 Flash/Pro may express one schema-bounded preference. Invalid JSON,
timeout, outage and budget exhaustion produce an explicit deterministic
degradation and never stop the world. Provider reasoning is discarded.
Every returned usage record preserves input, output, cache-hit and cache-miss
tokens plus the call-time pricing version and calculated USD expense. Billed
usage survives a later schema failure and deterministic fallback.

## Persistence

Migration `0009_symbiotic_shenzhen_world.sql` defines the city schema.
Migration `0010_ai_only_world.sql` hardens databases created by the v3
prototype: it refuses to proceed if any participant-avatar row exists, removes
the unused human-intent/private-memory tables. Migration
`0011_resident_taxonomy.sql` atomically migrates legacy labels and restricts
resident kinds to `human`, `ai` and `robot`.

Checksum backup/restore covers only active tables. Empty backups from the v3
prototype remain readable, but any deprecated participant table containing
rows is rejected instead of silently importing or discarding personal data.

## Observation

The Human Observatory is a pure projection over the same memory/PostgreSQL
world contract. `nexus.human-observatory.v2` exposes every pseudonymous
resident, the 24 persisted resource-ledger rows, inter-community transfer
lanes, community institutions, production continuity, trends, event lineage,
RALR, DeepSeek usage/cost and evidence. Formula version
`human-observatory-formulas-2.0.0` binds every derived score. V1 remains a
read-only label compatibility projection.

Each Turn first settles local production and consumption, then balances
resource reserve pressure between communities. Transfer lanes are included in
both conserved ledgers and append-only events before the atomic commit.

There is no second display database, identity plane, private diary,
participant input, resident login or public mutation API. The old client-only
simulation is a compatibility sandbox and does not run while the live
observatory is active.
