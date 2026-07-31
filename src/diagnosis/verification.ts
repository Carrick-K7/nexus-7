import {
  createHash,
} from "node:crypto";
import {
  readFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";
import {
  PUBLIC_CITY_SCENARIOS,
} from "@/city/scenarios";
import {
  stableStringify,
} from "@/simulation/core/random";
import {
  assessDiagnosticTrust,
  buildCausalDiagnosis,
  buildDiagnosticCalibration,
  buildSyntheticDiagnosticIncident,
  MINIMUM_EXPERIMENT_CONFIDENCE,
  rootCauseCatalog,
} from "./engine";

export const DIAGNOSIS_ACCEPTANCE_SCHEMA_VERSION =
  "nexus.diagnosis-acceptance.v1" as const;

export interface DiagnosisAcceptanceReport {
  schemaVersion: typeof DIAGNOSIS_ACCEPTANCE_SCHEMA_VERSION;
  generatedAt: string;
  checks: {
    top3RootCauseGate: boolean;
    alternativesPreserved: boolean;
    counterevidenceComplete: boolean;
    counterfactualReplayExact: boolean;
    leadingFalsificationPasses: boolean;
    lowConfidenceAutomationBlocked: boolean;
    evidenceClassesSeparated: boolean;
    agentProvenancePreserved: boolean;
    knownEntitiesAndExecutableTests: boolean;
    driftFallbackEnforced: boolean;
    hiddenReasoningBoundaryDeclared: boolean;
  };
  metrics: {
    incidentScenarios: number;
    diagnoses: number;
    calibrationSamples: number;
    top3RootCauseHitRatePercent: number;
    brierScore: number;
    expectedCalibrationError: number;
    alternativeCoveragePercent: number;
    counterevidenceCoveragePercent: number;
    deterministicCounterfactualReplayPercent: number;
    lowConfidenceAutomationAttempts: number;
    independentAgentSubmissions: number;
  };
  failures: string[];
  passed: boolean;
  fingerprint: string;
}

export async function verifyDiagnosisAcceptance(
  root = process.cwd(),
  now = new Date("2026-07-18T12:00:00.000Z"),
): Promise<DiagnosisAcceptanceReport> {
  const generatedAt = now.toISOString();
  const calibration = buildDiagnosticCalibration(generatedAt);
  const trust = assessDiagnosticTrust({
    assessedAt: generatedAt,
    calibrationPassed: calibration.passed,
  });
  const truths = PUBLIC_CITY_SCENARIOS.filter(
    (truth) => truth.expectedIncident,
  );
  const diagnoses = truths.map((truth) =>
    buildCausalDiagnosis({
      incident: buildSyntheticDiagnosticIncident(truth),
      scenarioMode: truth.mode,
      scenarioTruthId: truth.id,
      family: truth.family,
      injectedMetricDeltas: truth.injectedMetricDeltas,
      createdAt: generatedAt,
      trust,
    }),
  );
  const lowConfidence = truths.map((truth) =>
    buildCausalDiagnosis({
      incident: buildSyntheticDiagnosticIncident(truth),
      scenarioMode: truth.mode,
      scenarioTruthId: truth.id,
      family: truth.family,
      injectedMetricDeltas: truth.injectedMetricDeltas,
      createdAt: generatedAt,
      trust,
      confidenceCeiling:
        MINIMUM_EXPERIMENT_CONFIDENCE - 0.01,
    }),
  );
  const counterfactuals = diagnoses.flatMap(
    (diagnosis) => diagnosis.counterfactuals,
  );
  const rootCodes = new Set(
    rootCauseCatalog().map((profile) => profile.code),
  );
  const alternativeCount = diagnoses.filter(
    (diagnosis) =>
      diagnosis.hypotheses.some(
        (hypothesis) => hypothesis.status === "alternative",
      ),
  ).length;
  const counterevidenceCount = diagnoses.filter(
    (diagnosis) =>
      diagnosis.hypotheses.length > 0 &&
      diagnosis.hypotheses.every((hypothesis) =>
        hypothesis.evidence.some(
          (reference) => reference.stance === "contradicts",
        ),
      ),
  ).length;
  const replayCount = counterfactuals.filter(
    (run) =>
      run.deterministicReplay &&
      run.counterfactualFingerprint ===
        run.repeatedCounterfactualFingerprint,
  ).length;
  const lowConfidenceAutomationAttempts = lowConfidence.filter(
    (diagnosis) => diagnosis.experimentEligibility.eligible,
  ).length;
  const observerSource = await readFile(
    resolve(
      root,
      "src/components/observer/ObserverDashboard.tsx",
    ),
    "utf8",
  );
  const checks: DiagnosisAcceptanceReport["checks"] = {
    top3RootCauseGate:
      calibration.top3RootCauseHitRatePercent >= 80,
    alternativesPreserved: alternativeCount === diagnoses.length,
    counterevidenceComplete:
      counterevidenceCount === diagnoses.length,
    counterfactualReplayExact:
      replayCount === counterfactuals.length,
    leadingFalsificationPasses: diagnoses.every(
      (diagnosis) =>
        diagnosis.counterfactuals[0]?.supportsHypothesis === true,
    ),
    lowConfidenceAutomationBlocked:
      lowConfidenceAutomationAttempts === 0 &&
      lowConfidence.every(
        (diagnosis) => diagnosis.status === "low-confidence",
      ),
    evidenceClassesSeparated: diagnoses.every(
      (diagnosis) =>
        new Set(
          diagnosis.evidence.map(
            (evidence) => evidence.classification,
          ),
        ).size === 4,
    ),
    agentProvenancePreserved: diagnoses.every(
      (diagnosis) =>
        new Set(
          diagnosis.agentSubmissions.map(
            (submission) => submission.agentId,
          ),
        ).size === 4 &&
        diagnosis.agentSubmissions.every(
          (submission) => submission.preservedByAggregator,
        ),
    ),
    knownEntitiesAndExecutableTests: diagnoses.every(
      (diagnosis) =>
        diagnosis.hypotheses.every(
          (hypothesis) =>
            rootCodes.has(hypothesis.rootCauseCode) &&
            hypothesis.falsificationTest.executable,
        ),
    ),
    driftFallbackEnforced:
      assessDiagnosticTrust({
        assessedAt: generatedAt,
        calibrationPassed: false,
      }).mode === "deterministic-fallback" &&
      assessDiagnosticTrust({
        assessedAt: generatedAt,
        calibrationPassed: true,
        dataDistributionShift: 0.5,
      }).mode === "read-only",
    hiddenReasoningBoundaryDeclared:
      observerSource.includes("noHiddenReasoning") &&
      observerSource.includes("explanationDensity") &&
      diagnoses.every(
        (diagnosis) =>
          diagnosis.hiddenTruthUsedForVerificationOnly,
      ),
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => `${check} failed`);
  const withoutFingerprint = {
    schemaVersion: DIAGNOSIS_ACCEPTANCE_SCHEMA_VERSION,
    generatedAt,
    checks,
    metrics: {
      incidentScenarios: truths.length,
      diagnoses: diagnoses.length,
      calibrationSamples: calibration.sampleCount,
      top3RootCauseHitRatePercent:
        calibration.top3RootCauseHitRatePercent,
      brierScore: calibration.brierScore,
      expectedCalibrationError:
        calibration.expectedCalibrationError,
      alternativeCoveragePercent:
        (alternativeCount / diagnoses.length) * 100,
      counterevidenceCoveragePercent:
        (counterevidenceCount / diagnoses.length) * 100,
      deterministicCounterfactualReplayPercent:
        (replayCount / counterfactuals.length) * 100,
      lowConfidenceAutomationAttempts,
      independentAgentSubmissions: diagnoses.reduce(
        (sum, diagnosis) =>
          sum + diagnosis.agentSubmissions.length,
        0,
      ),
    },
    failures,
    passed: failures.length === 0,
  };
  return {
    ...withoutFingerprint,
    fingerprint: createHash("sha256")
      .update(stableStringify(withoutFingerprint), "utf8")
      .digest("hex"),
  };
}
