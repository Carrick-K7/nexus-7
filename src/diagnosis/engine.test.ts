// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  CITY_INCIDENT_SCHEMA_VERSION,
  type CityIncident,
} from "@/city/model-types";
import {
  PUBLIC_CITY_SCENARIOS,
  materializeCityScenario,
} from "@/city/scenarios";
import {
  projectCoherentCitySnapshot,
} from "@/city/ontology";
import {
  getMetric,
} from "@/simulation/core/metrics";
import {
  assessDiagnosticTrust,
  buildCausalDiagnosis,
  buildDiagnosticCalibration,
  MINIMUM_EXPERIMENT_CONFIDENCE,
} from "./engine";

function fixtureIncident(
  scenarioId = "city-infrastructure-cascade",
): {
  incident: CityIncident;
  truth: (typeof PUBLIC_CITY_SCENARIOS)[number];
} {
  const truth = PUBLIC_CITY_SCENARIOS.find(
    (scenario) => scenario.id === scenarioId,
  )!;
  const scenario = materializeCityScenario(truth);
  const snapshot = projectCoherentCitySnapshot(scenario.world);
  return {
    truth,
    incident: {
      schemaVersion: CITY_INCIDENT_SCHEMA_VERSION,
      id: `city-incident-${truth.id}`,
      scenarioTruthId: truth.id,
      correlationId: `corr-${truth.id}`,
      causationId: `scenario-truth-${truth.id}`,
      status: "detected",
      severity: "high",
      summary: truth.title,
      family: truth.family,
      detectedAt: "2026-07-18T12:00:00.000Z",
      detectionTick: 2,
      evidence: truth.observableSymptoms.map((symptom) => ({
        metric: symptom.metric,
        value: getMetric(scenario.world, symptom.metric),
        threshold: symptom.threshold,
        comparison: symptom.comparison,
        sourceWorldFingerprint: snapshot.sourceWorldFingerprint,
      })),
      impact: {
        affectedGroupIds: [...truth.affectedGroupIds],
        populationSharePercent: 44,
        vulnerableGroupCount: 1,
        durationTicks: truth.durationTicks,
        irreversibility: truth.irreversibility,
        severityScore: 66,
      },
      hiddenTruth: truth.hiddenRootCause,
      assignedAgents: ["civitas", "economica"],
      objectiveVersion: "city-objectives-1.0.0",
      guardrailVersion: "city-guardrails-1.0.0",
      synthetic: true,
    },
  };
}

describe("causal diagnosis engine", () => {
  it("preserves alternatives, counterevidence, provenance, and replayable counterfactuals", () => {
    const { incident, truth } = fixtureIncident();
    const trust = assessDiagnosticTrust({
      assessedAt: "2026-07-18T12:00:00.000Z",
      calibrationPassed: true,
    });
    const first = buildCausalDiagnosis({
      incident,
      scenarioMode: truth.mode,
      scenarioTruthId: truth.id,
      family: truth.family,
      injectedMetricDeltas: truth.injectedMetricDeltas,
      createdAt: "2026-07-18T12:00:00.000Z",
      trust,
    });
    const second = buildCausalDiagnosis({
      incident,
      scenarioMode: truth.mode,
      scenarioTruthId: truth.id,
      family: truth.family,
      injectedMetricDeltas: truth.injectedMetricDeltas,
      createdAt: "2026-07-18T12:00:00.000Z",
      trust,
    });

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.status).toBe("diagnosed");
    expect(first.experimentEligibility.eligible).toBe(true);
    expect(first.hypotheses).toHaveLength(3);
    expect(first.hypotheses[1].status).toBe("alternative");
    expect(
      first.hypotheses.every((hypothesis) =>
        hypothesis.evidence.some(
          (reference) => reference.stance === "contradicts",
        ),
      ),
    ).toBe(true);
    expect(first.agentSubmissions).toHaveLength(4);
    expect(
      first.agentSubmissions.every(
        (submission) => submission.preservedByAggregator,
      ),
    ).toBe(true);
    expect(
      first.counterfactuals.every(
        (run) =>
          run.deterministicReplay &&
          run.counterfactualFingerprint ===
            run.repeatedCounterfactualFingerprint,
      ),
    ).toBe(true);
    expect(first.counterfactuals[0].supportsHypothesis).toBe(true);
    expect(
      new Set(
        first.evidence.map((evidence) => evidence.classification),
      ),
    ).toEqual(
      new Set([
        "fact",
        "inference",
        "prediction",
        "human-judgment",
      ]),
    );
  });

  it("blocks low-confidence diagnoses from experiment automation", () => {
    const { incident, truth } = fixtureIncident();
    const diagnosis = buildCausalDiagnosis({
      incident,
      scenarioMode: truth.mode,
      scenarioTruthId: truth.id,
      family: truth.family,
      injectedMetricDeltas: truth.injectedMetricDeltas,
      createdAt: "2026-07-18T12:00:00.000Z",
      trust: assessDiagnosticTrust({
        assessedAt: "2026-07-18T12:00:00.000Z",
        calibrationPassed: true,
      }),
      confidenceCeiling: MINIMUM_EXPERIMENT_CONFIDENCE - 0.01,
    });

    expect(diagnosis.status).toBe("low-confidence");
    expect(diagnosis.experimentEligibility.eligible).toBe(false);
    expect(diagnosis.experimentEligibility.blockers[0]).toMatch(
      /below/,
    );
  });

  it("degrades to deterministic or read-only modes when trust drifts", () => {
    expect(
      assessDiagnosticTrust({
        assessedAt: "2026-07-18T12:00:00.000Z",
        calibrationPassed: false,
      }).mode,
    ).toBe("deterministic-fallback");
    expect(
      assessDiagnosticTrust({
        assessedAt: "2026-07-18T12:00:00.000Z",
        calibrationPassed: true,
        dataDistributionShift: 0.5,
      }).mode,
    ).toBe("read-only");
  });

  it("calibrates across all incident scenarios and hits every hidden root cause in Top-3", () => {
    const report = buildDiagnosticCalibration();

    expect(report.sampleCount).toBe(45);
    expect(report.top3RootCauseHitRatePercent).toBe(100);
    expect(report.brierScore).toBeLessThanOrEqual(0.18);
    expect(report.expectedCalibrationError).toBeLessThanOrEqual(0.25);
    expect(report.passed).toBe(true);
  });
});
