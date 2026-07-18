# ADR 0007: Verified Autonomy Contract

- Status: Implemented
- Date: 2026-07-16
- Target release: v1.0.0

## Context

“Observable” is insufficient if the product cannot state exactly what makes an
autonomous action verified or prove the claim across reproducible scenarios.
The previous five-stage trace did not explicitly require replay coordinates or
rollback information.

## Decision

An accepted action counts toward the verified autonomy loop only when it has:

- observation, proposal, command, execution, and evaluation stages;
- valid causal links;
- policy versions on every event;
- guardrail and before/after metrics;
- replay seed, tick, policy version, and command ID;
- inverse rollback delta and restore value.

The v1 release is gated by a public three-scenario suite, canonical replay
comparison, invariant checks, and these aggregate thresholds:

- verified autonomy loop rate at least 90%;
- deterministic replay success at least 99%;
- causal completeness and rollback coverage exactly 100%.

The readiness result is available through a versioned machine-readable API and
the Verification view.

## Consequences

- New policies and providers can lower readiness if they omit evidence.
- PostgreSQL key ordering cannot affect fingerprints because verification uses
  canonical serialization.
- Rollback is now a first-class action-trace requirement, not only a deployment
  workflow concept.
- Public scenario and extension compatibility are documented release contracts.
