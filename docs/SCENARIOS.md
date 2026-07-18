# Public Reproducible Scenarios

NEXUS-7 v1 ships three JSON scenarios under `src/simulation/scenarios/`.

| Scenario | Purpose | Initial pressure |
|---|---|---|
| `neo-angeles-baseline` | Normal operating baseline | Moderate traffic and pollution |
| `neo-angeles-grid-stress` | Infrastructure coordination | Traffic above 80, energy below 40 |
| `neo-angeles-civic-recovery` | Multi-domain crisis recovery | Crime and pollution above thresholds |

Every scenario uses `policy-1.0.0`, an explicit seed, a tick-zero world, and the
same serialized configuration contract. The readiness suite replays each
scenario twice for 250 ticks and compares canonical state/event fingerprints.

Add a scenario by:

1. creating a complete JSON fixture;
2. registering it in `src/simulation/scenarios/index.ts`;
3. verifying tick-zero invariants;
4. adding its purpose and expected stressors here;
5. running `src/verification/readiness.test.ts`.

The public catalog is exported as `PUBLIC_SCENARIOS`; callers can select a safe
clone with `getScenario(id)`.

## Coherent-city truth corpus

v1.5 adds a separate `PUBLIC_CITY_SCENARIOS` catalog under
`src/city/scenarios.ts`. It preserves the three v1 readiness fixtures and adds
20 truth-labelled diagnostic scenarios:

| Family | Modes |
|---|---|
| infrastructure | normal, single fault, cascade, conflicting objectives |
| economic | normal, single fault, cascade, conflicting objectives |
| public safety | normal, single fault, cascade, conflicting objectives |
| environment | normal, single fault, cascade, conflicting objectives |
| digital network | normal, single fault, cascade, conflicting objectives |

Each `nexus.city-scenario.v1` record declares deterministic injection deltas,
observable symptoms and delay, affected synthetic groups, duration,
irreversibility, objective conflicts, and—when an incident is expected—a
hidden synthetic root cause.

`verifyCityScenarioCatalog()` materializes and replays every scenario, checks
world invariants, and reports precision, recall, mean detection delay, and
replay success. The word “truth” here refers only to the controlled synthetic
fixture; it is not ground truth about a real city.

Adding a coherent-city scenario requires preserving the five-family/four-mode
coverage matrix, explicit `synthetic: true`, deterministic replay, and a
documented detection expectation.
