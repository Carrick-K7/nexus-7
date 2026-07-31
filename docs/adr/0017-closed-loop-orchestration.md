# ADR 0017: Durable Closed-Loop Orchestration

- Status: Accepted
- Date: 2026-07-18
- Target release: v2.0.0

## Context

By v1.9, each domain could persist and verify its own part of the autonomy
laboratory, but no aggregate owned the complete incident-to-learning progress.
A UI demo could call those modules in sequence without proving restart safety,
stage prerequisites, compensation, artifact continuity, or a traceable final
disposition.

## Decision

1. Add one `ClosedLoopCase` lifecycle aggregate with ten fixed ordered stages.
   It stores coordination state and stable links, while every domain keeps
   ownership of its incident, diagnosis, plan, deployment, outcome, lesson,
   and proposal.
2. Every stage declares owner, activation-relative deadline, required evidence,
   and source records. Missing, reordered, unsupported skipped, or incomplete
   stages fail verification.
3. Commands use digest-bound idempotency keys and lifecycle optimistic
   revisions. External deployment operations must also be idempotent.
4. Evidence is append-only, fingerprinted, artifact-bound, expiring, and
   supersedable only through a new human-revalidation envelope.
5. Human pause, resume, cancel, rollback, reopen, and emergency stop are part
   of the state machine. Service accounts cannot exercise human control.
6. A deployment fault or post-deployment timeout rolls back first. A rollback
   is not closed until independent outcome evidence and a retained lesson exist.
7. Normal scenarios close through an explicit no-action disposition. Harm,
   uncertainty, governance denial, and cancellation cannot be renamed as
   benefit.
8. Cases and deployments use the shared memory/PostgreSQL lifecycle contract,
   versioned API, bilingual Observer projection, backup/restore path, and
   workspace permissions.

## Consequences

- Restart and concurrent-command behavior is defined by persisted revisions
  rather than web-process memory.
- The orchestrator can be replaced without moving rules out of the owning
  domains.
- Cross-domain partial failure remains possible between an external action and
  aggregate commit; idempotent adapters plus compensation make retry safe and
  retain the discrepancy as evidence.
- The fixed stage model is intentionally strict for v2. Removing a stage
  requires a new major contract rather than weakening the verifier.
- A synthetic closed loop remains laboratory evidence only.
