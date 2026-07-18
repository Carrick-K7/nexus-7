# ADR 0012: Coherent City and Incident Model

- Status: Accepted
- Date: 2026-07-18
- Target release: v1.5.0

## Context

The deterministic simulation already supplied a shared world, but several
views still presented independent narrative state and the system had no
versioned vocabulary for derived city metrics, affected synthetic groups,
incident truth, objectives, or guardrails. A threshold could trigger an action,
yet an observer could not reliably connect that action to one cross-domain
incident or measure detection quality against declared scenario truth.

## Decision

1. `nexus.city-ontology.v1` is the canonical city vocabulary. Every metric has
   a stable code, domain, unit, legal range, direction, update frequency,
   owner, source, formula, observability class, and sensitivity list.
2. `nexus.city-snapshot.v1` is a deterministic projection of one simulation
   world. Derived metrics and synthetic stakeholder impacts never create a
   second clock or independently mutable world.
3. Cross-domain effects run in the simulation core and emit
   `city.mechanism.applied` events. React components cannot create business
   time, random city values, or hidden state transitions.
4. Scenario truth is explicit and synthetic. The public corpus contains five
   incident families and four modes per family, including normal cases, hidden
   root causes, delayed symptoms, affected groups, objective conflicts, and
   replay coordinates.
5. Objectives, guardrails, scenario truth, and incidents use a generic
   workspace-scoped lifecycle repository. Record revision and append-only event
   creation are atomic in both memory and PostgreSQL adapters.
6. Incident severity combines affected population share, vulnerable groups,
   duration, and irreversibility. Incident transitions are human-authorized,
   audited, and preserve correlation and causation IDs.
7. Existing operational incidents and city incidents remain separate bounded
   contexts. Operational incidents describe platform health; city incidents
   describe synthetic world conditions.
8. Narrative modules may remain interactive, but must display an explicit
   sandbox boundary and cannot mutate the governed city or produce release
   evidence.

## Consequences

- Observer, Weather, Resource, Trading, Emergency, Analytics, News, and
  Missions can explain their values from one snapshot or domain-event stream.
- Detection precision, recall, delay, and deterministic replay are measurable
  against declared truth rather than inferred from UI copy.
- Future diagnosis, planning, outcomes, lessons, and feedback can reuse the
  lifecycle persistence envelope without adding unrelated aggregate stores.
- Synthetic stakeholder labels prevent simulated impacts from being presented
  as evidence about real people or policy effectiveness.
- The current ontology is additive within version 1. Removing or changing the
  meaning of a metric requires a new major ontology version and migration.
