# Coherent City and Incident Model

> Contracts: `nexus.city-ontology.v1`, `nexus.city-snapshot.v1`,
> `nexus.city-scenario.v1`, `nexus.city-incident.v1`
> Release: v1.5.0

## Scope

NEXUS-7 models a synthetic city through one deterministic simulation world.
The coherent-city projection adds a versioned metric dictionary, derived
metrics, explicitly synthetic stakeholder impacts, objectives, guardrails,
scenario truth, and durable incidents. It does not claim that simulated
effects predict outcomes for a real city or population.

Nine domains are represented:

- population and districts;
- housing and transport;
- energy and economy;
- public safety and environment;
- digital networks.

The dictionary currently exposes 22 metrics. Each definition includes its
unit, legal range, beneficial direction, update frequency, responsible Agent,
source, formula, observability, and sensitivities. A snapshot includes the
ontology version and a fingerprint of its exact source world.

## Causal mechanisms

The simulation applies five deterministic cross-domain mechanism families:

| Cause | Effects |
|---|---|
| Energy shortage | traffic, GDP, internet |
| Congestion | pollution, GDP, happiness |
| Network outage | GDP, medical capacity |
| Pollution | medical capacity, happiness |
| Water shortage | medical capacity, happiness |

Every application emits `city.mechanism.applied` with the formula, before and
after value, cause metric, effect metric, tick, correlation ID, and causation
ID. Views consume those events; they do not reproduce the formulas.

## Scenario truth and incidents

`PUBLIC_CITY_SCENARIOS` contains 20 deterministic scenarios: five incident
families crossed with `normal`, `single-fault`, `cascade`, and
`conflicting-objectives` modes. Fault scenarios declare:

- a hidden root-cause code and injection tick;
- observable symptoms and first observable ticks;
- injected metric deltas;
- affected synthetic group IDs;
- duration and irreversibility;
- any explicit objective conflict.

Injecting a scenario creates or returns one deduplicated city incident. Its
severity score combines affected population share, vulnerable-group count,
duration, and irreversibility. The initial objective and guardrail versions are
frozen onto the incident.

Human operators can move an incident through:

```text
detected → triaged → investigating → resolved
resolved → detected
```

Invalid transitions, service-account transitions, stale revisions, duplicate
events, cross-workspace envelopes, and malformed inputs fail closed.

## Persistence and API

The generic lifecycle repository stores an aggregate and its initial event
atomically, then uses optimistic revisions to atomically commit each later
state and event. Both adapters implement the same contract:

- process-local memory for development and unit tests;
- PostgreSQL tables `nexus_lifecycle_records` and
  `nexus_lifecycle_events`, installed by migration `0007`.

Lifecycle records and events participate in checksum backup/restore. Restoring
an older v1.0–v1.4 backup treats the absent arrays as empty.

`GET /api/city` returns the default coherent overview. `POST /api/city`
supports the following authenticated actions:

- `overview` with a valid deterministic `WorldState`;
- `inject-scenario`;
- `transition-incident`;
- `create-objective`;
- `create-guardrail`.

All records are organization/workspace scoped. Objective and guardrail
mutation requires a human principal with policy permission; a model or Agent
cannot silently redefine success.

## Observer workflow

Open **Observer → Coherent City Model** to inspect:

1. the synthetic-data boundary;
2. current ontology, scenario, precision, recall, and incident counts;
3. the exact shared-world snapshot and source fingerprint;
4. frozen objective and guardrail counts;
5. the complete metric dictionary;
6. persisted incident truth and affected synthetic population;
7. a deterministic infrastructure-cascade injection.

Weather, Resource, Trading, Emergency, Analytics, News, and Missions read the
shared store/world/event stream. Terminal, Quantum, Satellite, and Hacker are
explicit narrative sandboxes.

## Acceptance

Run:

```bash
npm run verify:city
```

The versioned report at `.artifacts/city-model-acceptance.json` proves:

- 22 complete metrics across all nine domains;
- exact shared-snapshot projection;
- all five mechanism families execute;
- 20 scenarios cover five families and four modes;
- 100% synthetic detection precision, recall, and replay in the reference
  corpus, with no invariant violations;
- governed legacy views use shared state and contain no undeclared random
  business state or component clocks;
- randomized narrative modules display the sandbox boundary.

Unit, PostgreSQL, browser, accessibility, backup, and synthetic acceptance
results prove implementation behavior. They do not validate the ontology,
weights, affected-group model, or interventions for real communities.
