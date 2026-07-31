# v1 Verification Contract

The machine-readable report is available at:

```text
GET /api/verification
```

The release-time evidence captured by the final v1 gate is also stored at
`public/data/v1-readiness.json`.

It runs the public scenario suite and returns thresholds, aggregate metrics,
per-scenario results, invariant violations, and a canonical report fingerprint.

## Release thresholds

| Metric | v1 threshold |
|---|---:|
| Verified autonomy loop rate | ≥ 90% |
| Deterministic replay success | ≥ 99% |
| Accepted-action causal trace completeness | 100% |
| Accepted-action rollback coverage | 100% |
| Final-state invariant violations | 0 |

An accepted action is verified only if it contains:

- triggering observation;
- versioned proposal and validated command;
- guardrail result;
- before/after metrics;
- causal links through evaluation;
- deterministic replay coordinates: seed, tick, policy, command;
- an inverse rollback delta and restore value.

The aggregate uses accepted actions as its denominator. Rejected proposals are
reported separately and do not inflate the verified action rate.

## Human-visible verification

The Verification view shows the same API result, scenario-by-scenario status,
threshold comparisons, and report fingerprint. Observer exposes live verified
loop and rollback coverage for the current browser simulation.

## Scope

The report verifies the deterministic simulation, agent runtime, causal
evidence, and rollback metadata across the published scenarios. It does not
claim that a future third-party model, authentication gateway, scheduler, or
deployment environment is correct without its own integration evidence.
