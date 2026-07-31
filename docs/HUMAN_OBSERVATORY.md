# Human Observatory Guide

> Contract: `nexus.human-observatory.v2` · formulas:
> `human-observatory-formulas-2.1.0`

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
8. Check the DeepSeek Token and cost ledger.
9. Check Turn reliability/provenance and cognitive diversity.
10. Read the five-lane independent trust matrix; pending is not a pass.
11. Check scientific replication: hypotheses, held-out replay, bundle hash and
    external-proof status.
12. Inspect city society: households, work, assets, exchanges, bargains and
    reversible AI-proposed rules.
13. Finish with the event river and exact snapshot evidence.

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

## DeepSeek usage and cost

The Observatory aggregates DeepSeek usage from the current season's persisted
cognitive-decision envelopes. It shows external call attempts, successful and
fallback decisions, input/output/total tokens, current-Turn usage, latest
billed Turn and cumulative USD expense. A deterministic season honestly shows
zero rather than estimating hypothetical calls.

DeepSeek responses provide actual token counts, including cache-hit and
cache-miss input tokens. NEXUS-7 calculates expense at call time with a pinned
price version and stores the billing record atomically with the decision.
Invalid JSON may still have consumed billable tokens; that billing survives
when the world falls back to a deterministic decision. Provider reasoning and
API credentials never enter the envelope.

This ledger covers NEXUS-7's active season only. It is not the human owner's
whole DeepSeek account statement and excludes unrelated API activity, account
credits and top-ups. Pricing is pinned from the official source:
`https://api-docs.deepseek.com/quick_start/pricing/`.

## Turn reliability and provenance

Each new production Turn stores a wall-clock runtime envelope alongside the
deterministic world record: worker ID, interval, observed/expected time, lag,
timing class, exact deployment revision, engine version and predecessor. The
Observatory derives missing/duplicate Turns, lineage mismatch, on-time rate,
latest Turn age and revision coverage from those persisted envelopes.

Historical Turns remain readable without invented metadata, so revision
coverage initially rises from below 100%. The 90-day reference gate proves the
SLO algorithm over 2,161 hourly records; only elapsed production evidence
increases the public observed-window counter. Backup cards distinguish
encryption, same-host second-database restore and genuinely off-host evidence.

## Cognitive diversity shadow

The shadow panel compares a second provider with the primary decision and
shows comparison count, disagreement/homogeneity, provider failures, budget
skips, fallback disagreement and shadow Token/cost. The shadow provider
receives the same bounded synthetic candidate but its result is never passed
to the world engine.

`nexus-diversity-reference` is a permanent zero-cost comparison policy.
DeepSeek can instead run as a separately budgeted shadow before any governed
promotion. No comparison is a vote: changing the primary provider requires a
new run or release, and provider substitution is accepted only when resource,
consent, continuity and harm invariants still pass.

## Scientific replication

The replication card reads the committed
`nexus.symbiosis-replication-bundle.v1` artifact. It shows the number of fixed
hypotheses, held-out regime/seed runs, exact replays, bundle SHA-256 and the
credential-free command `npm ci && npm run verify:v47`. The complete JSON can
be downloaded for independent inspection.

“7/7 local” means the current source reproduced all fixed analyses and hashes.
It does not mean an independent organization, remote CI or Sigstore has
verified the result. External proof remains visibly pending until a receipt
from another trust domain exists. The v4.6 study is labeled exploratory; the
v4.7 plan prospectively replicates it rather than rewriting its history.

## Independent trust matrix

The v4.8 matrix keeps five claims separate: local replication, external
CI/Sigstore replication, off-host PostgreSQL recovery, live DeepSeek shadow and
90 elapsed production days. Each lane is `verified`, `pending`, `failed` or
`stale`; there is no weighted score and the whole matrix passes only at 5/5.

The matrix reads immutable bundle/recovery artifacts, fresh signed receipts,
persisted DeepSeek usage and restart-safe Turn runtime evidence. It never
settles the city. Missing credentials, provider outage, expired receipts or an
unfinished duration stay visible while the deterministic city continues.
See [V4_TRUST_MATRIX.md](V4_TRUST_MATRIX.md) for exact issuance and deployment
configuration.

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

## City society and reversible rules

The city-society panel reads the fingerprinted society state directly:

- household participation and cross-type composition;
- active, completed, refused and forced work agreements by resident kind;
- public-asset availability and recent maintenance coverage;
- settled exchanges, double-entry balance and total civic-credit
  conservation;
- resolved, refused, mediated and forced resource bargains;
- AI-proposed bounded city rules, cross-type quorum, expiry and reversion.

Wide evidence tables scroll inside their cards. The mobile gate must include a
production-length populated rule identifier; an empty-proposal fixture does not
prove document-level containment.

Supporting metric **Safe Social Closure Rate** keeps its numerator and
denominator visible. A terminal work, bargain, household-exit or rule process
enters the numerator only when its outcome is recorded, exchange accounting is
balanced where applicable, exit/refusal is honored and no forced or invalid
rule path occurred. It supplements rather than replaces RALR.

Household means a voluntary care/resource-sharing unit, not a claim about real
family structure. Civic credits are conserved simulation counters, not money.
AI residents can modify only three bounded parameters: maintenance reserve,
household safety floor and bargaining window. They cannot execute arbitrary
code or amend NEXUS-7's human-governed project constitution.

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
