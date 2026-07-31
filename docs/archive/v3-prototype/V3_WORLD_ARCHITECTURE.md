# v3 World Architecture

## Boundary

`src/symbiosis` owns the long-running synthetic Shenzhen aggregate. It does
not replace `src/simulation` or the v2 closed-loop services. v2 remains the
safety kernel and compatibility baseline; v3 world events may later become
inputs to v2 incidents, but neither bounded context silently mutates the other.

```text
frozen public aggregates ── scale only
             ↓
deterministic world engine ── candidate Turn settlement
             ↓
resource / capability / consent / continuity / harm gates
             ↓
memory or PostgreSQL atomic commit ── snapshot + ledgers + events
             ↓
permission projections ── API / future City Lens / reports
```

Only the deterministic engine creates world changes. The repository checks the
expected season head and atomically commits one Turn. Models, UI components,
resident text, and external providers cannot write world state.

## Current vertical slice

- 260 deterministic adult pseudonymous residents with the locked cohort mix;
- three fictional communities in coarse real district locations;
- distinct human and AI/robot need vocabularies;
- eight integer resource ledgers with exact conservation;
- seeded shared events and finite local consequences;
- Asia/Shanghai simulation dates and one-day Turn semantics;
- exact snapshot fingerprint chaining and historical query;
- memory and PostgreSQL repositories with optimistic Turn concurrency;
- hash-partitioned high-frequency PostgreSQL state and ledger tables;
- pseudonymized resident, snapshot, event and descriptive report APIs;
- 365 Turn local replay verification without a model provider.

Relationship state, human input, cognition, SSE, private vault integration and
City Lens are deliberately inactive until their own gates exist.

## Replay coordinates

Every Turn records season seed, distribution version, previous fingerprint,
simulation date, final fingerprint, event count, cognition status and decision
IDs. Random draws use `(seed, turn, channel, sample)`. A saved structured model
decision will be an input artifact; a live re-call can never count as replay.

Resource values are integer domain units. Every ledger enforces:

```text
opening + production + transfer-in
  = consumption + transfer-out + closing
```

Negative closing balances or a mismatched season predecessor fail before
commit.

## Persistence

Migration `0009_symbiotic_shenzhen_world.sql` creates all named v3 tables.
Resident states and resource ledgers are partitioned by season. Backup/restore
includes the parent tables, validates one checksum over canonical rows, routes
restored rows back through partitions, and continues to accept older complete
backup table sets with empty v3 normalization.

PII is outside this schema. `private_memory_refs` stores only vault references,
retention deadlines, authorization flags and non-secret metadata. It must never
contain raw diary or identity vault contents.

## API projection

The current API is read-only. Authentication and workspace isolation reuse the
v2 governance boundary. Responses explicitly exclude private memory. A zero
RALR denominator is `null`, not a successful rate. Public observation remains
closed; these routes are authenticated research projections.

Turn advancement currently exists only as a service/verification seam. A daily
worker must add lease, one-real-day rate limiting, participant input freeze and
operator pause before it can be exposed operationally.
