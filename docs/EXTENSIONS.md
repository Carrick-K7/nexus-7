# NEXUS-7 Extension Contracts

All extensions must preserve deterministic world mutation, structured evidence,
capability validation, and human promotion boundaries.

## v2 certification profile

v2 certifies seven boundaries through
`nexus.extension-conformance.v2`: agent, model provider, scenario, lifecycle
repository, notification, deployment controller, and outcome evaluator. Every
result declares a version, reference implementation, capabilities, data
access, network requirement, exercised failure modes, checks, and canonical
fingerprint.

Passing the reference suite does not authorize an arbitrary implementation.
An uncertified extension is sandbox-only: it receives synthetic workspace data,
cannot promote a release or approve a decision, and cannot gain network or
secret access beyond its declared profile.

Run all seven profiles with:

```bash
npm run verify:closure
```

## Agent policy

An agent observes immutable state and returns proposals. It never mutates the
world.

```ts
interface AgentPolicy {
  id: PolicyAgentId;
  observe(world: WorldState, context: AgentPolicyContext): AgentObservation[];
  propose(
    observation: AgentObservation,
    world: WorldState,
    context: AgentPolicyContext,
  ): AgentProposal[];
}
```

Requirements:

- only propose metrics in the agent capability contract;
- use the supplied deterministic context, never `Math.random()` or wall time;
- include rationale, expected effect, priority, risk tier, and correlation IDs;
- accept scheduler rejection as a normal result.

Reference: `src/simulation/agents/types.ts`.

## Model provider

A provider returns untrusted structured advice. It cannot return or execute a
world mutation directly.

```ts
interface ModelProvider {
  id: string;
  model: string;
  generateProposal(
    request: ModelProposalRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
}
```

Provider output passes schema, capability, risk, token, cost, and timeout
validation. Medium/high risk needs human approval; critical risk is forbidden.
Replay records the approved command, not a repeated inference.

Reference: `src/simulation/models/types.ts`.

## Scenario

A scenario is JSON matching `SimulationScenario`:

```ts
interface SimulationScenario {
  id: string;
  seed: string;
  policyVersion: string;
  configuration: SimulationConfiguration;
  world: WorldState;
}
```

Requirements:

- globally unique, stable ID;
- explicit seed and policy version;
- tick-zero world satisfying every invariant;
- no executable functions or implicit environment state;
- deterministic replay and readiness test coverage.

Reference: `src/simulation/scenarios/`.

## Experiment repository

Repositories implement atomic aggregate persistence:

```ts
interface ExperimentRepository {
  readonly backend: "memory" | "postgres";
  createRun(record: CreateRunRecord): Promise<ExperimentRun>;
  commitRun(record: CommitRunRecord): Promise<ExperimentRun>;
  listEvents(runId: string, afterCursor?: number): Promise<ExperimentEventRecord[]>;
  createImprovement(...): Promise<ImprovementProposal>;
  commitImprovement(...): Promise<ImprovementProposal>;
}
```

`commitRun` and `commitImprovement` must reject stale expected versions, append
events/decisions without rewriting history, and commit aggregate, snapshot, and
audit changes atomically.

Reference: `src/experiments/repository.ts`.

The v2 repository profile uses the narrower
`nexus.lifecycle-repository.v1` aggregate contract below. It verifies atomic
record/event creation, optimistic conflict rejection, append-only ordering,
workspace isolation, and deterministic reads against the memory reference.
PostgreSQL implementations additionally require the real integration and
backup/restore gate.

## Deployment controller

External deployment systems implement
`nexus.deployment-controller.v1`. Every mutation carries a stable request ID
and idempotency key; every response echoes the contract version and validates
against a strict handle schema. Telemetry timestamps must be monotonic.

Adapters must:

- retry only timeout, 408, 429 and 5xx failures with bounded attempts;
- treat duplicated starts, traffic shifts, promotions and rollbacks as the
  same operation;
- reject partial JSON, mismatched IDs and out-of-order observations;
- make rollback safe after a lost acknowledgement;
- use HTTPS in production and keep bearer tokens server-side.

Run `npm run verify:deployment-contract` against the reference fault fixture.
Passing local conformance is necessary but does not replace evidence from the
real configured controller.

References: `src/deployment/contract.ts`,
`src/deployment/reference-controller.ts`, and
`src/deployment/conformance.ts`.

## Notification

Notification adapters implement the signed webhook envelope
`nexus.signed-webhook.v1`.

Requirements:

- bind the signature to the exact payload bytes and configured secret;
- reject a changed payload, invalid signature, stale timestamp, and wrong
  delivery identity;
- make delivery attempts, retries, receipts, and dead letters observable;
- declare endpoint/network requirements without exposing the secret;
- keep dry-run and reference transports clearly separate from live delivery.

The reference profile signs, verifies, and tampers with a deterministic payload.
Passing it does not prove that a configured remote endpoint received a
notification.

References: `src/operations/signed-webhook.ts` and
`src/operations/intelligence-service.ts`.

## Outcome evaluator

An outcome evaluator implements the `nexus.outcome.v1` evidence contract. It is
independent from proposing Agents and consumes a frozen staged plan and
synthetic scenario context.

Requirements:

- evaluate short, medium, and long windows;
- compare frozen counterfactual, historical, and same-seed seasonal values;
- preserve prediction error, guardrail attribution, group effects, and replay
  fingerprints;
- emit only beneficial, harmful, neutral, or inconclusive;
- accept bounded late evidence as a new revision and propagate invalidation;
- never execute a learned policy or bypass release governance.

The v2 profile runs the complete Outcome Learning acceptance suite rather than
checking an interface shape alone.

References: `src/outcomes/types.ts`, `src/outcomes/engine.ts`, and
`src/outcomes/verification.ts`.

## Lifecycle aggregate

Durable v1.5+ domain objects use the shared `LifecycleRepository` contract:

```ts
interface LifecycleRepository {
  createLifecycleRecord(input: CreateLifecycleRecordInput): Promise<LifecycleRecord>;
  commitLifecycleRecord(input: CommitLifecycleRecordInput): Promise<LifecycleRecord>;
  getLifecycleRecord(recordId: string): Promise<LifecycleRecord | null>;
  listLifecycleRecords(workspaceId: string, query?: LifecycleRecordQuery): Promise<LifecycleRecord[]>;
  appendLifecycleEvent(event: NewLifecycleEvent): Promise<LifecycleEvent>;
  listLifecycleEvents(workspaceId: string, query?: LifecycleEventQuery): Promise<LifecycleEvent[]>;
}
```

Creation and commit must atomically persist one aggregate version and one
append-only event. Implementations reject stale revisions, duplicate record or
event IDs, mismatched organization/workspace/aggregate envelopes, and events
for missing aggregates. New record kinds must also enter migration,
backup/restore, real PostgreSQL integration, authorization, and retention
design.

Reference: `src/lifecycle/`.

## Coherent city scenario

`nexus.city-scenario.v1` extends a deterministic `SimulationScenario` with
controlled synthetic truth:

- one of five stable incident families and four scenario modes;
- explicit injected metric deltas;
- hidden root cause only when an incident is expected;
- symptoms with thresholds and first-observable ticks;
- synthetic affected groups, duration, irreversibility, and objective conflict.

Extensions cannot mutate the base fixture, use wall time/randomness, omit
`synthetic: true`, or present scenario truth as a real-world claim. New metrics
must first enter a versioned ontology with unit, range, owner, source, formula,
observability, and sensitivity metadata.

References: `src/city/types.ts`, `src/city/ontology.ts`, and
`src/city/scenarios.ts`.

## Compatibility policy

- Scenario, run export, report, and readiness schemas are versioned.
- New event fields should be additive within a major release.
- A major version is required to remove event types, metrics, risk tiers, or
  persisted fields.
- Extension tests must run through `npm run check`; PostgreSQL adapters also run
  with `TEST_DATABASE_URL`.
- Removing a v2 boundary, weakening its failure cases, or changing its trust
  privileges requires a new major conformance contract.
