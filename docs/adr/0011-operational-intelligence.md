# ADR 0011: Operational Intelligence

- Status: Accepted
- Date: 2026-07-18
- Target release: v1.4.0

## Context

v1.3 made identity, policy, evidence and deployment durable, but operators
still had to inspect unrelated snapshots. There was no shared time-series,
incident deduplication, audited notification delivery, temporary access
recovery, or objective way to certify an external deployment controller.

## Decision

1. Model, deployment, recovery, worker, evidence and policy health use one
   `SloSample` contract. Every sample is workspace-scoped, idempotent, carries
   operational dimensions and can be traced from hour/day buckets to raw IDs.
2. Stable alert codes and dimension hashes aggregate repeated occurrences into
   one incident. A healthy sample can auto-resolve it; later breaches reopen
   the same incident rather than hiding history.
3. Maintenance windows, explicit suppression and occurrence budgets are
   first-class records. Notification delivery is asynchronous, idempotent,
   signed, retried with bounded backoff, and ends in a visible dead letter.
4. Human administration supports fixed delegated duties, separation of
   identity management from access review, periodic evidence-backed access
   campaigns, and automatic revocation.
5. Break-glass access needs two distinct human administrators, expires after
   5–60 minutes, is removed without waiting for a user session refresh, and
   remains open until an independent post-event review is recorded.
6. Deployment controllers implement
   `nexus.deployment-controller.v1`. A reference controller injects timeout,
   duplicate, partial response, out-of-order telemetry and rollback faults.
   Passing conformance is release evidence, not an informal compatibility
   claim.
7. Raw SLO retention is configuration bounded (default 90 days, minimum 30)
   and enforced by the leased operations worker.

## Consequences

- An operator can answer when degradation started, what evidence triggered the
  alert, who was notified, and whether escalation was acknowledged.
- Duplicate samples and retries cannot multiply incidents or external actions.
- Private webhook targets, embedded credentials and non-HTTPS production
  endpoints are rejected before secrets are used.
- Operations and access state are present in memory and PostgreSQL adapters,
  migrations, checksum backups and recovery tests.
- The Operations Center is an observer projection; it does not own operational
  state or bypass service authorization.
- Local reference-controller and synthetic results remain local evidence.
  Production controllers, notification endpoints and identity providers still
  require externally verified receipts.
