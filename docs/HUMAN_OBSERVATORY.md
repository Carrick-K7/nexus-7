# Human Observatory Guide

> Contract: `nexus.human-observatory.v2` · formulas:
> `human-observatory-formulas-2.0.0`

## Purpose

The Human Observatory is the default public entry to NEXUS-7. It turns the
durable all-software world into a progressively disclosed answer to five
questions:

1. what is this experiment;
2. what happened in the latest Turn;
3. which humans, AI, robots and communities are affected;
4. which resource, institution and relationship path explains the change;
5. which replay, safety and provenance evidence makes the projection credible.

It is an observer, not a mayor. Search, filtering, historical inspection and
evidence export cannot advance, pause, reset or otherwise mutate the live
season. Legacy client-only demonstrations are isolated under the compatibility
section of the navigation.

The interface does not repeat deployment-mode badges. Its light and dark
palettes preserve the same reading order; the denser cyberpunk atmosphere is
reserved for the other research, safety and compatibility views.

## One-minute reading order

1. Read the experiment purpose, simulation boundary and latest Turn.
2. Open **Living city flow** to see the current persisted resource ledger.
3. Check production, consumption, transfers, inventory and pressure.
4. Read the city briefing, needs, RALR denominator and severe escapes.
5. Compare the three communities and the 30-Turn trend.
6. Follow resources → institutions → residents → relationships → RALR.
7. Inspect production stages, then search or filter any resident.
8. Finish with the event river and exact snapshot evidence.

The 18,248,500 background population is calibration only. The 260 foreground
residents are the only individually modeled humans, AI and robots.

## Resident semantics

There are exactly three public kinds: `human`, `ai` and `robot`. Every resident
exposes all stored needs plus two type-aware summaries:

| Resident kind | primary signal | integrity signal |
|---|---|---|
| human | mood from health, safety, belonging, intimacy, autonomy and meaning | food, water, sleep, health, shelter and safety |
| AI | engagement from autonomy, purpose, recognition and memory integrity | energy, compute, storage, network, cooling, maintenance and memory integrity |
| robot | task readiness from autonomy, purpose, recognition and maintenance | energy, maintenance, mobility and component integrity |

Each signal is a normalized arithmetic mean of stored need satisfaction.
Overall status is 55% all-needs satisfaction, 20% primary signal and 25%
integrity. A resident whose basic-needs gate fails cannot be labeled stable or
flourishing. Human mood is a simulated state variable; AI and robot signals
are not claims about sentience or consciousness.

## Living data flow

Every Turn persists 24 resource-ledger rows: eight resources in each of three
communities. The city map and table read these fields directly:

```text
opening + produced + transferred in
= consumed + transferred out + closing
```

After local production and consumption, the engine deterministically balances
reserve pressure between communities. Every non-zero lane is written to both
source/destination ledgers and a `shared.resource-transfer` event. Inventory
cannot exceed capacity. The observer polls every 15 seconds, but only a
committed Turn can change the world.

This is a real internal simulation data stream, not a live Shenzhen feed.
Public calibration still affects scale only.

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
production, logistics, delivery, maintenance and audit. Because the current
season runs without real-human labor, autonomous-control coverage and modeled
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
GET /api/observatory/v2/overview
```

`/api/observatory/v1/overview` remains read-compatible and maps the three
current kinds to deprecated labels. New observers must use v2.

Raw snapshot, event and research-report endpoints remain available for
independent inspection.
