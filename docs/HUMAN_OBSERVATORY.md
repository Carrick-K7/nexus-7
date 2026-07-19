# Human Observatory Guide

> Contract: `nexus.human-observatory.v1` · formulas:
> `human-observatory-formulas-1.0.0`

## Purpose

The Human Observatory is the default public entry to NEXUS-7. It turns the
durable all-software world into a progressively disclosed answer to five
questions:

1. what is this experiment;
2. what happened in the latest Turn;
3. which software residents and communities are affected;
4. which resource, institution and relationship path explains the change;
5. which replay, safety and provenance evidence makes the projection credible.

It is an observer, not a mayor. Search, filtering, historical inspection and
evidence export cannot advance, pause, reset or otherwise mutate the live
season. Legacy client-only demonstrations are isolated under the compatibility
section of the navigation.

## One-minute reading order

1. Read the experiment purpose, synthetic boundary and latest Turn.
2. Read **Today in the synthetic city** and its evidence-backed highlights.
3. Check city state, needs, resources, RALR denominator and severe escapes.
4. Compare the three communities and the 30-Turn trend.
5. Follow resources → institutions → units → relationships → RALR.
6. Inspect production stages, then search or filter any of the 260 units.
7. Finish with the event river and exact snapshot evidence.

The 18,248,500 background population is calibration only. The 260 foreground
units are the only individually modeled residents.

## Unit semantics

Every unit exposes all stored needs plus two type-aware summaries:

| Unit kind | primary signal | integrity signal |
|---|---|---|
| synthetic human | synthetic mood from health, safety, belonging, intimacy, autonomy and meaning | food, water, sleep, health, shelter and safety |
| software AI | engagement proxy from autonomy, purpose, recognition and memory integrity | energy, compute, storage, network, cooling, maintenance and memory integrity |
| embodied robot | task-readiness proxy from autonomy, purpose, recognition and maintenance | energy, maintenance, mobility and component integrity |

Each signal is a normalized arithmetic mean of stored need satisfaction.
Overall status is 55% all-needs satisfaction, 20% primary signal and 25%
integrity. A unit whose basic-needs gate fails cannot be labeled stable or
flourishing. These are synthetic model variables, not claims about emotion,
sentience or consciousness.

## Institutions and production

Each of the three communities projects eight institutions from its resource
ledger: food, water, energy, mobility, compute, health, housing and work.
Institution smoothness is:

```text
55% × (1 − resource pressure)
+ 25% × closing reserve / capacity
+ 20% × min(produced / consumed, 1)
```

This projection does not invent legal entities, staff rosters or unrecorded
activity. It answers whether the modeled community service is flowing.

The production view follows eight stages: sensing, orchestration, inputs,
production, logistics, delivery, maintenance and audit. Because every
resident and controller is software, autonomous-control coverage and modeled
stage coverage are exactly 100%, while real-human labor dependency is 0%.
Those boundary values do not fluctuate. Dynamic continuity and the bottleneck
stage come from current resource pressure and ledger conservation.

## Trust rules

- RALR always appears with numerator and denominator.
- A zero denominator remains `null`, never 0% or 100% success.
- A summary links to stored Turn, event, resource or formula evidence.
- No private fields or model reasoning enter the projection.
- All scores are deterministic and replayable from memory or PostgreSQL state.
- The interface and JSON export repeat the non-digital-twin boundary.

The versioned endpoint is:

```text
GET /api/observatory/v1/overview
```

Raw snapshot, event and research-report endpoints remain available for
independent inspection.
