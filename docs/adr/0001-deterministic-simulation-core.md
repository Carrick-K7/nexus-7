# ADR 0001: Deterministic Simulation Core

- Status: Implemented
- Date: 2026-07-16
- Target release: v0.4.0

## Context

NEXUS-7 currently runs the city loop inside a React hook. The loop reads browser
state, calls `Math.random()`, changes Zustand directly, and emits notifications.
Several panels also maintain independent timers and mock data. This makes a run
impossible to reproduce, compare, replay, or evaluate reliably.

The product goal is a verifiable autonomy lab. A deterministic world model is a
prerequisite for agent evaluation, causal traces, scenario tests, and safe model
integration.

## Decision

Move simulation rules into a framework-independent `src/simulation` package.
React will display snapshots and control the clock; it will not own simulation
rules.

The core transition will be a pure function:

```ts
type StepSimulation = (
  state: WorldState,
  commands: SimulationCommand[],
  context: StepContext,
) => StepResult;
```

Given the same state, commands, tick, configuration, and random seed, the result
must be byte-for-byte equivalent.

## Initial data model

```ts
interface WorldState {
  schemaVersion: number;
  scenarioId: string;
  tick: number;
  clock: SimulationClock;
  city: CityState;
  weather: WeatherState;
  economy: EconomyState;
  infrastructure: InfrastructureState;
  security: SecurityState;
  agents: Record<AgentId, AgentRuntimeState>;
}

interface StepContext {
  seed: string;
  policyVersion: string;
  configuration: SimulationConfiguration;
}

interface SimulationCommand {
  id: string;
  tick: number;
  actorId: AgentId | "operator" | "system";
  type: string;
  payload: unknown;
  correlationId: string;
  causationId?: string;
}

interface DomainEvent {
  id: string;
  tick: number;
  type: string;
  payload: unknown;
  correlationId: string;
  causationId?: string;
}

interface StepResult {
  state: WorldState;
  acceptedCommands: SimulationCommand[];
  rejectedCommands: CommandRejection[];
  events: DomainEvent[];
  metrics: MetricSnapshot;
}
```

## Rules

1. No `Date.now()` or `Math.random()` inside simulation rules.
2. Time comes from the simulation clock.
3. Randomness comes from a seeded generator passed through `StepContext`.
4. Agents submit commands; they do not mutate world state.
5. Commands are validated before execution.
6. Every event carries correlation and causation identifiers.
7. State and event schemas are versioned.
8. Scenario fixtures are serializable JSON.
9. UI-only state remains outside `WorldState`.
10. Every core rule has invariant and replay tests.

## Planned module boundaries

```text
src/simulation/
├── core/
│   ├── step.ts
│   ├── clock.ts
│   ├── random.ts
│   └── invariants.ts
├── commands/
├── events/
├── rules/
├── scenarios/
├── metrics/
└── tests/
```

## Migration order

1. Extract time advancement and seeded random generation.
2. Extract city metric patterns.
3. Convert threshold reactions into commands and domain events.
4. Adapt Zustand to consume `StepResult`.
5. Move Weather, Resource, Trading, Emergency, News, and Analytics onto the
   shared world state.
6. Add scenario import/export and deterministic replay.

## Acceptance criteria

- Replaying 1,000 ticks with the same seed yields the same final state and event
  log.
- Invalid commands cannot mutate the world.
- All numeric city metrics satisfy defined bounds.
- React components can be unmounted without stopping or changing a saved run.
- Simulation tests run without JSDOM.

## Consequences

This adds explicit schemas and command handling, but removes hidden coupling
between UI components and domain behavior. It also makes later LLM integration
safer because model output becomes an untrusted proposal that must pass command
validation.

## Implementation evidence

- `src/simulation/core/step.ts` owns deterministic state transitions.
- `src/simulation/scenarios/neo-angeles.json` is the baseline serializable
  scenario.
- `src/simulation/replay.ts` performs exact replay and fingerprinting.
- `src/simulation/serialization.ts` rejects malformed or replay-inconsistent
  imports.
- `src/stores/nexus-store.ts` persists the simulation session and projects
  snapshots into existing UI contracts.
- `src/simulation/simulation.test.ts` verifies 1,000-tick replay, invariants,
  invalid-command isolation, causal links, and import tamper detection in a Node
  test environment.
- `e2e/nexus.spec.ts` verifies pause, step, replay, export/import, reset, and
  continued simulation across view changes in Chromium.
