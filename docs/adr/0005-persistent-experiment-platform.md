# ADR 0005: Persistent Experiment Platform

- Status: Implemented
- Date: 2026-07-16
- Target release: v0.8.0

## Context

Browser localStorage could preserve one operator's projection, but it could not
provide durable shared runs, authoritative mutation order, concurrent-writer
protection, workspace permissions, resumable event streams, or independently
verifiable experiment reports.

## Decision

Experiment runs are server-owned aggregate records. Every mutation includes the
expected aggregate version and commits atomically with:

- the next serialized deterministic run;
- newly emitted append-only domain events;
- an actor/role audit record;
- a snapshot on the configured interval.

The service supports create, pause, resume, explicit step, scheduler-driven
step, historical fork, incremental event reads, SSE delivery, and verified
report export. Running records are advanced by a protected clock-driver
endpoint, avoiding hidden browser timers as world authority.

The repository contract has two adapters:

- PostgreSQL with JSONB run/snapshot documents, relational metadata, monotonic
  event cursors, transactions, and optimistic version checks;
- in-memory storage with identical semantics for zero-configuration development
  and deterministic unit tests.

PostgreSQL JSONB can reorder object keys. Replay comparison and fingerprints
therefore use a canonical key-sorted serialization while retaining array order.

## Permission boundary

Viewer can read. Operator and admin can create or mutate runs. Every accepted
mutation records the actor ID and role. Header-based local identity is an
integration seam, not production authentication; a deployment must terminate
trusted identity upstream.

## Consequences

- Runs survive browser refresh and can be shared when PostgreSQL is configured.
- Concurrent mutation cannot silently overwrite a newer run version.
- Every report carries its run, event cursor log, snapshots, audit records, and
  replay/causal verification metrics.
- v0.9 can evaluate improvement proposals against durable forked experiments
  instead of mutating the primary world directly.
