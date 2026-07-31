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
household / work / asset / exchange / bargain / civic-rule state machines
             ↓
memory or PostgreSQL atomic commit
             ↓
anonymous read-only projection ── Human Observatory / report APIs
             ↓
portable replication bundle ── held-out results / hashes / proof status
```

Only the deterministic engine changes world state. Models cannot execute
tools, SQL or shell; browser input cannot advance a Turn. PostgreSQL rejects a
settlement whose expected head is stale and commits the Turn, snapshot,
resource ledgers, events, relationships, commitments, episodes and cognitive
decisions atomically. v4.6 adds normalized society records to the same
transaction; the snapshot and normalized projection cannot commit at
different Turns.

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
status and decision IDs. New Turns also carry an additive runtime envelope:
wall-clock record time, expected time/lag, worker, interval, exact deployment
revision and engine contract. This operational evidence does not enter the
world fingerprint. On startup, the latest envelope determines the next due
time; an early worker waits while missing or overdue evidence runs immediately.
An explicit `--once` drill bypasses waiting. Random draws use stable
`(seed, turn, channel, sample)` coordinates. A saved model decision is an input artifact on replay; the
provider is never called again.

The default cognitive policy is deterministic and zero-cost. Optional
DeepSeek V4 Flash/Pro may express one schema-bounded preference. Invalid JSON,
timeout, outage and budget exhaustion produce an explicit deterministic
degradation and never stop the world. Provider reasoning is discarded.
Every returned usage record preserves input, output, cache-hit and cache-miss
tokens plus the call-time pricing version and calculated USD expense. Billed
usage survives a later schema failure and deterministic fallback.

The primary and shadow cognition paths share the versioned bounded output
contract but have separate budgets and request IDs. Only the primary result
can enter settlement. A shadow result is stored inside the same atomic
decision envelope with disagreement, failure and billing evidence; outage or
budget exhaustion never invokes a hidden shadow fallback. The permanent
`nexus-diversity-reference` provider supplies a zero-cost comparison control,
and DeepSeek may be configured as shadow before any governed promotion.

## Reversible city society

`society.ts` owns six synthetic civic mechanisms:

1. voluntary care households with forming, strain, honored exit and
   dissolution states;
2. reversible work agreements with proposal, refusal, completion and
   termination paths;
3. community energy storage, compute clusters and repair workshops whose
   condition affects production and is restored by settled maintenance work;
4. double-entry civic-credit exchanges whose total supply is conserved;
5. resource bargains with refusal, counteroffer, mediation, withdrawal and
   settlement paths;
6. city-rule proposals made only by AI residents against a bounded parameter
   DSL, with cross-type quorum evidence, expiry and automatic reversion.

These are simulated institutions, not real households, jobs, property,
currency or law. A city-rule proposal can change only maintenance reserve,
household safety floor or bargaining window within hard bounds. It cannot
execute code, alter the project constitution or approve a software release.
Every transition emits a `society` world event and enters the snapshot
fingerprint.

## Persistence

Migration `0009_symbiotic_shenzhen_world.sql` defines the city schema.
Migration `0010_ai_only_world.sql` hardens databases created by the v3
prototype: it refuses to proceed if any participant-avatar row exists, removes
the unused human-intent/private-memory tables. Migration
`0011_resident_taxonomy.sql` atomically migrates legacy labels and restricts
resident kinds to `human`, `ai` and `robot`. Migration
`0012_richer_city_society.sql` adds the society event layer and normalized
record table. Legacy snapshots are deterministically hydrated at their
existing Turn and gain fingerprinted society state only at the next atomic
settlement.

Checksum backup/restore covers only active tables. AES-256-GCM envelopes use a
mode-0600 32-byte key file and authenticate the complete backup before
decryption. A checksum-backed recovery receipt binds the encrypted artifact
hash to its embedded backup checksum and records location,
row-count/fingerprint equality and a resumed write on a second database.
Same-host evidence is explicitly distinct from off-host evidence. Empty backups from the v3
prototype remain readable, but any deprecated participant table containing
rows is rejected instead of silently importing or discarding personal data.

v4.8 adds no display database. `nexus.symbiosis-trust-matrix.v1` projects the
committed replication bundle, optional signed external receipts, recovery
envelope, persisted provider decisions and runtime Turn chain. Its five lanes
are independent observations and never enter world settlement. An off-host
claim additionally requires distinct source/target host fingerprints and a
fresh receipt whose Sigstore subject digest matches the recovery envelope.

## Observation

The Human Observatory is a pure projection over the same memory/PostgreSQL
world contract. `nexus.human-observatory.v2` exposes every pseudonymous
resident, the 24 persisted resource-ledger rows, inter-community transfer
lanes, community institutions, production continuity, trends, event lineage,
RALR, DeepSeek usage/cost, cognitive diversity, wall-clock reliability and
evidence. It also projects household participation, work distribution, asset
maintenance, exchange balance, bargaining outcomes and reversible city rules.
The companion `/api/observatory/v2/trust` projection exposes the independent
local/external/recovery/provider/elapsed gates without mutating either bounded
context.
Formula version `human-observatory-formulas-2.1.0` binds every derived score.
V1 remains a read-only label compatibility projection.

Each Turn first settles local production and consumption, then balances
resource reserve pressure between communities. Transfer lanes are included in
both conserved ledgers and append-only events before the atomic commit.

There is no second display database, identity plane, private diary,
participant input, resident login or public mutation API. The old client-only
simulation is a compatibility sandbox and does not run while the live
observatory is active.

## Scientific replication

`replication.ts` is a read-only research harness over the deterministic engine.
It does not become a second city engine and cannot alter production state. It
runs four held-out seeds under all three fixed regimes, twice per scenario,
then records per-run RALR denominators, refusal/coercion/safety, society
invariants, the eight-character world fingerprint and a complete-result
SHA-256. A separately exercised cognitive path compares deterministic primary,
diversity shadow and diversity-primary substitution.

`scripts/run-v47-replication.ts` hashes the source, lockfile and calibration
inputs, builds `nexus.symbiosis-replication-bundle.v1`, and either publishes it
or reproduces the committed bundle exactly. The artifact is immutable static
evidence, not mutable business state, so it requires neither a second memory/
PostgreSQL repository nor a migration. Its public projection includes no raw
resident trace, private field, provider key or model reasoning.
