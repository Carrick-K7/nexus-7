# v4 AI-Only World Architecture

## Boundary

`src/symbiosis` owns the long-running synthetic Shenzhen world. Every
foreground resident is software: 200 synthetic-human archetypes, 36 software
AI residents and 24 embodied-robot residents. “Synthetic human” describes a
modeled need profile, not a person, account, avatar, proxy or identity link.

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
anonymous read-only projection ── City Lens / report APIs
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

## Persistence

Migration `0009_symbiotic_shenzhen_world.sql` defines the AI-only schema.
Migration `0010_ai_only_world.sql` hardens databases created by the v3
prototype: it refuses to proceed if any participant-avatar row exists, removes
the unused human-intent/private-memory tables and restricts resident kinds to
the three software types.

Checksum backup/restore covers only active tables. Empty backups from the v3
prototype remain readable, but any deprecated participant table containing
rows is rejected instead of silently importing or discarding personal data.

## Observation

City Lens and the versioned APIs expose pseudonyms, needs, resource pressure,
relationships, consent state, commitments, outcomes, event lineage, RALR,
safety escapes and model cost. There is no identity plane, private diary,
participant input, resident login or public mutation API.

The map is progressive enhancement. Accessible tables and reports remain the
authoritative projection if WebGL or map tiles fail.
