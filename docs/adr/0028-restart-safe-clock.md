# ADR 0028: Restart-safe Turn clock

- Status: Accepted
- Date: 2026-07-29
- Scope: v4 production Turn orchestration

## Context

The original worker settled immediately on every process start and only then
slept for one interval. Production ran correctly while uninterrupted, but a
restart before the persisted next due time created an extra simulated day.
Runtime evidence exposed the early settlement but did not prevent it.

## Decision

Normal startup reads the latest Turn. If it has runtime evidence, the worker
computes `recordedAt + configured interval` and waits for the remainder before
settlement. Missing evidence and overdue schedules run immediately. `--once`
is the explicit recovery-drill bypass.

The interval parser rejects non-finite values and intervals below 60 seconds
before either the service or worker loop starts. Existing early-restart samples
remain append-only evidence and are excluded from on-time counts.

## Consequences

- routine restarts no longer accelerate simulation time;
- downtime longer than one interval settles one Turn on restart rather than
  silently replaying an unbounded backlog;
- cadence changes use the new configured interval from the latest recorded
  timestamp;
- explicit drills remain possible and auditable.
