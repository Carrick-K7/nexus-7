# Canary SLO, Alerts, and Automatic Rollback

Every approved policy candidate receives two isolated forks from the same
source tick:

```text
source
├── shadow baseline — no candidate intervention
└── canary          — candidate intervention
```

Both forks use the same seed, policy version, configuration, and tick cadence.
This prevents normal city cycles, weather, or seeded randomness from being
mistaken for candidate impact.

## Per-tick SLOs

The canary is evaluated after every tick:

| SLO | Default |
|---|---:|
| Deterministic replay | required |
| Invariant violations | 0 |
| Verified autonomy loop rate | ≥ 90% |
| Wrong-direction target delta vs baseline | ≤ 3 points |
| Protected-metric regression vs baseline | proposal maximum, normally 4 points |

The first breach stops the observation window. NEXUS-7 writes a critical alert
with a stable code, records the SLO sample in the proposal, marks the deployment
monitoring gate failed, appends `rollback.triggered`, and automatically discards
the isolated canary. The source run is never mutated.

Alert codes:

- `wrong-direction`
- `protected-regression`
- `replay-failure`
- `invariant-violation`
- `verified-loop`

## Rollback drill

An admin can select **Run rollback drill** during an active canary. The drill
queues a bounded, wrong-direction operator fault on the canary only. The shadow
baseline receives no fault. The expected result is:

1. the first canary tick breaches `wrong-direction`;
2. a critical alert is stored;
3. automatic action is `discard-canary`;
4. proposal status becomes `rolled-back`;
5. the immutable decision log contains `rollback.drill.started` followed by
   `rollback.triggered`.

## External deployment SLOs

Code and deployment releases use a deployment adapter instead of simulation
forks. Traffic progresses through 5%, 25%, 50%, and 100% only when each sample
meets:

| SLO | Default |
|---|---:|
| Request count | ≥ 100 |
| Error rate | ≤ 1% |
| P95 latency | ≤ 750 ms |
| Availability | ≥ 99.9% |
| Platform health | required |

The first breach calls the external rollback endpoint, returns traffic to 0%,
records the telemetry sample and stable alert codes, and appends
`rollback.triggered`.

The scheduled rollback drill asks the deployment platform to inject a bounded
failure, verifies that telemetry detects it, and measures time to confirmed
zero traffic. Production uses the authenticated HTTP adapter; the in-memory
adapter exists only for deterministic development and contract tests.
