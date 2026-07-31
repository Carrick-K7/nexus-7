import {
  buildActionTraces,
  calculateActionTraceMetrics,
} from "@/simulation/observation/traces";
import {
  fingerprint,
} from "@/simulation/core/random";
import {
  inspectWorldInvariants,
} from "@/simulation/core/invariants";
import {
  isReplayEquivalent,
  replaySimulation,
} from "@/simulation/replay";
import {
  PUBLIC_SCENARIOS,
} from "@/simulation/scenarios";
import type {
  SimulationScenario,
} from "@/simulation/types";

export const V1_THRESHOLDS = {
  verifiedAutonomyLoopRate: 90,
  deterministicReplaySuccess: 99,
  causalTraceCompleteness: 100,
  rollbackCoverage: 100,
} as const;

export interface ScenarioReadinessResult {
  scenarioId: string;
  seed: string;
  policyVersion: string;
  ticks: number;
  deterministicReplay: boolean;
  invariantViolations: string[];
  acceptedActions: number;
  verifiedActions: number;
  verifiedAutonomyLoopRate: number;
  causalTraceCompleteness: number;
  rollbackCoverage: number;
  fingerprint: string;
}

export interface AutonomyReadinessReport {
  schemaVersion: 1;
  thresholds: typeof V1_THRESHOLDS;
  aggregate: {
    publicScenarios: number;
    totalTicks: number;
    acceptedActions: number;
    verifiedActions: number;
    deterministicReplaySuccess: number;
    verifiedAutonomyLoopRate: number;
    causalTraceCompleteness: number;
    rollbackCoverage: number;
    invariantViolations: number;
  };
  scenarios: ScenarioReadinessResult[];
  meetsV1: boolean;
  fingerprint: string;
}

export function verifyAutonomyReadiness(
  scenarios: SimulationScenario[] = PUBLIC_SCENARIOS,
  ticksPerScenario = 250,
): AutonomyReadinessReport {
  const scenarioResults = scenarios.map((scenario) => {
    const context = {
      seed: scenario.seed,
      policyVersion: scenario.policyVersion,
      configuration: structuredClone(scenario.configuration),
    };
    const first = replaySimulation(
      structuredClone(scenario.world),
      context,
      ticksPerScenario,
    );
    const second = replaySimulation(
      structuredClone(scenario.world),
      context,
      ticksPerScenario,
    );
    const traces = buildActionTraces(first.events);
    const traceMetrics = calculateActionTraceMetrics(traces);

    return {
      scenarioId: scenario.id,
      seed: scenario.seed,
      policyVersion: scenario.policyVersion,
      ticks: ticksPerScenario,
      deterministicReplay:
        first.fingerprint === second.fingerprint &&
        isReplayEquivalent(first.state, first.events, second),
      invariantViolations: inspectWorldInvariants(first.state),
      acceptedActions: traceMetrics.totalActions,
      verifiedActions: traceMetrics.verifiedActions,
      verifiedAutonomyLoopRate:
        traceMetrics.verifiedAutonomyLoopRate,
      causalTraceCompleteness: traceMetrics.causalTraceCompleteness,
      rollbackCoverage: traceMetrics.rollbackCoverage,
      fingerprint: first.fingerprint,
    };
  });

  const acceptedActions = scenarioResults.reduce(
    (total, scenario) => total + scenario.acceptedActions,
    0,
  );
  const verifiedActions = scenarioResults.reduce(
    (total, scenario) => total + scenario.verifiedActions,
    0,
  );
  const causalCompleteActions = scenarioResults.reduce(
    (total, scenario) =>
      total +
      (scenario.causalTraceCompleteness / 100) * scenario.acceptedActions,
    0,
  );
  const rollbackReadyActions = scenarioResults.reduce(
    (total, scenario) =>
      total + (scenario.rollbackCoverage / 100) * scenario.acceptedActions,
    0,
  );
  const deterministicRuns = scenarioResults.filter(
    (scenario) => scenario.deterministicReplay,
  ).length;
  const invariantViolations = scenarioResults.reduce(
    (total, scenario) => total + scenario.invariantViolations.length,
    0,
  );
  const aggregate = {
    publicScenarios: scenarioResults.length,
    totalTicks: scenarioResults.length * ticksPerScenario,
    acceptedActions,
    verifiedActions,
    deterministicReplaySuccess:
      scenarioResults.length === 0
        ? 100
        : (deterministicRuns / scenarioResults.length) * 100,
    verifiedAutonomyLoopRate:
      acceptedActions === 0 ? 100 : (verifiedActions / acceptedActions) * 100,
    causalTraceCompleteness:
      acceptedActions === 0
        ? 100
        : (causalCompleteActions / acceptedActions) * 100,
    rollbackCoverage:
      acceptedActions === 0
        ? 100
        : (rollbackReadyActions / acceptedActions) * 100,
    invariantViolations,
  };
  const meetsV1 =
    scenarioResults.length >= 3 &&
    aggregate.verifiedAutonomyLoopRate >=
      V1_THRESHOLDS.verifiedAutonomyLoopRate &&
    aggregate.deterministicReplaySuccess >=
      V1_THRESHOLDS.deterministicReplaySuccess &&
    aggregate.causalTraceCompleteness >=
      V1_THRESHOLDS.causalTraceCompleteness &&
    aggregate.rollbackCoverage >= V1_THRESHOLDS.rollbackCoverage &&
    invariantViolations === 0;

  const reportWithoutFingerprint = {
    schemaVersion: 1 as const,
    thresholds: V1_THRESHOLDS,
    aggregate,
    scenarios: scenarioResults,
    meetsV1,
  };
  return {
    ...reportWithoutFingerprint,
    fingerprint: fingerprint(reportWithoutFingerprint),
  };
}
