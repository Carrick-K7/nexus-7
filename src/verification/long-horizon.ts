import {
  buildActionTraces,
  calculateActionTraceMetrics,
  cloneWorldState,
  fingerprint,
  inspectWorldInvariants,
  isReplayEquivalent,
  replaySimulation,
  stepSimulation,
} from "@/simulation";
import {
  PUBLIC_SCENARIOS,
} from "@/simulation/scenarios";
import type {
  DomainEvent,
  SimulationScenario,
} from "@/simulation/types";

export interface LongHorizonReport {
  schemaVersion: 1;
  scenarioId: string;
  seed: string;
  policyVersion: string;
  ticks: number;
  finalTick: number;
  eventCount: number;
  acceptedActions: number;
  verifiedActions: number;
  deterministicReplay: boolean;
  invariantViolations: string[];
  verifiedAutonomyLoopRate: number;
  causalTraceCompleteness: number;
  rollbackCoverage: number;
  meetsStabilityGate: boolean;
  fingerprint: string;
}

export function verifyLongHorizon(
  scenario: SimulationScenario = PUBLIC_SCENARIOS[0],
  ticks = 10_000,
): LongHorizonReport {
  const context = {
    seed: scenario.seed,
    policyVersion: scenario.policyVersion,
    configuration: structuredClone(scenario.configuration),
  };
  let state = cloneWorldState(scenario.world);
  const events: DomainEvent[] = [];
  const violations = new Set<string>();

  for (let index = 0; index < ticks; index += 1) {
    const result = stepSimulation(state, [], context);
    state = result.state;
    events.push(...result.events);
    for (const violation of inspectWorldInvariants(state)) {
      violations.add(`tick ${state.tick}: ${violation}`);
    }
  }

  const replay = replaySimulation(
    cloneWorldState(scenario.world),
    context,
    ticks,
  );
  const traces = buildActionTraces(events);
  const metrics = calculateActionTraceMetrics(traces);
  const deterministicReplay = isReplayEquivalent(state, events, replay);
  const reportWithoutFingerprint = {
    schemaVersion: 1 as const,
    scenarioId: scenario.id,
    seed: scenario.seed,
    policyVersion: scenario.policyVersion,
    ticks,
    finalTick: state.tick,
    eventCount: events.length,
    acceptedActions: metrics.totalActions,
    verifiedActions: metrics.verifiedActions,
    deterministicReplay,
    invariantViolations: [...violations],
    verifiedAutonomyLoopRate: metrics.verifiedAutonomyLoopRate,
    causalTraceCompleteness: metrics.causalTraceCompleteness,
    rollbackCoverage: metrics.rollbackCoverage,
    meetsStabilityGate:
      deterministicReplay &&
      violations.size === 0 &&
      state.tick === scenario.world.tick + ticks &&
      metrics.verifiedAutonomyLoopRate >= 90 &&
      metrics.causalTraceCompleteness === 100 &&
      metrics.rollbackCoverage === 100,
  };
  return {
    ...reportWithoutFingerprint,
    fingerprint: fingerprint(reportWithoutFingerprint),
  };
}
