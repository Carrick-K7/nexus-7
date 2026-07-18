// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENARIO,
  applyCityMetrics,
  buildActionTraces,
  calculateActionTraceMetrics,
  cloneWorldState,
  inspectWorldInvariants,
  parseSimulationRun,
  replaySimulation,
  serializeSimulationRun,
  stableStringify,
  stepSimulation,
} from "@/simulation";
import type {
  SimulationCommand,
  StepContext,
} from "@/simulation";

function createContext(seed = DEFAULT_SCENARIO.seed): StepContext {
  return {
    seed,
    policyVersion: DEFAULT_SCENARIO.policyVersion,
    configuration: structuredClone(DEFAULT_SCENARIO.configuration),
  };
}

describe("deterministic simulation core", () => {
  it("replays 1,000 ticks byte-for-byte with the same seed", () => {
    const initialState = cloneWorldState(DEFAULT_SCENARIO.world);
    const first = replaySimulation(initialState, createContext(), 1_000);
    const second = replaySimulation(initialState, createContext(), 1_000);

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.state).toEqual(first.state);
    expect(second.events).toEqual(first.events);
    expect(inspectWorldInvariants(first.state)).toEqual([]);
  });

  it("produces a different run when the seed changes", () => {
    const initialState = cloneWorldState(DEFAULT_SCENARIO.world);
    const first = replaySimulation(initialState, createContext("seed-alpha"), 100);
    const second = replaySimulation(initialState, createContext("seed-beta"), 100);

    expect(second.fingerprint).not.toBe(first.fingerprint);
  });

  it("canonicalizes object keys for database-safe replay fingerprints", () => {
    const left = { city: { crime: 12, energy: 91 }, tick: 5 };
    const right = { tick: 5, city: { energy: 91, crime: 12 } };

    expect(stableStringify(left)).toBe(stableStringify(right));
  });

  it("rejects invalid commands without changing the resulting world", () => {
    const initialState = cloneWorldState(DEFAULT_SCENARIO.world);
    const invalidCommand: SimulationCommand = {
      id: "invalid-atlas-energy-command",
      tick: 1,
      actorId: "atlas",
      type: "adjust-metric",
      payload: {
        metric: "energy",
        delta: 10,
        reason: "Attempt a forbidden infrastructure mutation",
      },
      correlationId: "corr-invalid-command",
      source: "operator",
    };

    const baseline = stepSimulation(initialState, [], createContext());
    const rejected = stepSimulation(
      initialState,
      [invalidCommand],
      createContext(),
    );

    expect(rejected.state).toEqual(baseline.state);
    expect(rejected.acceptedCommands).toEqual(baseline.acceptedCommands);
    expect(rejected.rejectedCommands).toHaveLength(1);
    expect(rejected.rejectedCommands[0].code).toBe("FORBIDDEN_CAPABILITY");
  });

  it("links threshold observations to the resulting agent action", () => {
    const initialState = applyCityMetrics(
      cloneWorldState(DEFAULT_SCENARIO.world),
      { crime: 95 },
    );
    const result = stepSimulation(initialState, [], createContext());
    const observation = result.events.find(
      (event) =>
        event.type === "observation.threshold" &&
        event.payload.metric === "crime",
    );
    const action = result.events.find(
      (event) =>
        event.type === "agent.action" &&
        event.payload.actorId === "atlas" &&
        event.payload.metric === "crime",
    );
    const proposal = result.events.find(
      (event) =>
        event.type === "agent.proposal" &&
        event.payload.agentId === "atlas",
    );
    const evaluation = result.events.find(
      (event) =>
        event.type === "action.evaluated" &&
        event.payload.actorId === "atlas",
    );

    expect(observation).toBeDefined();
    expect(proposal).toBeDefined();
    expect(action).toBeDefined();
    expect(evaluation).toBeDefined();
    expect(action?.correlationId).toBe(observation?.correlationId);
    expect(proposal?.causationId).toBe(observation?.id);
    expect(action?.causationId).toBe(action?.payload.commandId);
    expect(evaluation?.causationId).toBe(action?.id);
    expect(action?.payload.guardrail).toBe("accepted");
    expect(action?.payload.rollback).toMatchObject({
      available: true,
      metric: "crime",
    });
    expect(action?.payload.replay).toMatchObject({
      seed: DEFAULT_SCENARIO.seed,
      policyVersion: DEFAULT_SCENARIO.policyVersion,
    });
    expect(Number(action?.payload.after)).toBeLessThan(
      Number(action?.payload.before),
    );

    const traces = buildActionTraces(result.events);
    const atlasTrace = traces.find((trace) => trace.agentId === "atlas");
    expect(atlasTrace?.completeness).toBe(100);
    expect(atlasTrace?.causalLinksComplete).toBe(true);
    expect(calculateActionTraceMetrics(traces).verifiedAutonomyLoopRate).toBe(
      100,
    );
    expect(calculateActionTraceMetrics(traces).rollbackCoverage).toBe(100);
  });

  it("exports only runs that pass deterministic import validation", () => {
    const initialState = cloneWorldState(DEFAULT_SCENARIO.world);
    const replay = replaySimulation(initialState, createContext(), 25);
    const serialized = serializeSimulationRun({
      schemaVersion: 1,
      seed: DEFAULT_SCENARIO.seed,
      policyVersion: DEFAULT_SCENARIO.policyVersion,
      configuration: structuredClone(DEFAULT_SCENARIO.configuration),
      initialState,
      world: replay.state,
      events: replay.events,
      operatorCommands: [],
    });

    expect(parseSimulationRun(serialized).world).toEqual(replay.state);

    const tampered = JSON.parse(serialized) as {
      world: { security: { crime: number } };
    };
    tampered.world.security.crime += 1;

    expect(() => parseSimulationRun(JSON.stringify(tampered))).toThrow(
      "deterministic replay validation",
    );
  });

  it("keeps human operator commands outside the autonomy-loop denominator", () => {
    const result = stepSimulation(
      cloneWorldState(DEFAULT_SCENARIO.world),
      [
        {
          id: "operator-command",
          tick: 1,
          actorId: "operator",
          type: "adjust-metric",
          payload: {
            metric: "traffic",
            delta: 2,
            reason: "Human-directed diagnostic",
          },
          correlationId: "operator-diagnostic",
          source: "operator",
        },
      ],
      createContext(),
    );
    const metrics = calculateActionTraceMetrics(
      buildActionTraces(result.events),
    );

    expect(metrics.totalActions).toBe(0);
    expect(
      buildActionTraces(result.events).some(
        (trace) => trace.agentId === "operator",
      ),
    ).toBe(true);
    expect(metrics.verifiedAutonomyLoopRate).toBe(100);
  });
});
