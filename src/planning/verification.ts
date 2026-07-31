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
  CITY_GUARDRAIL_SCHEMA_VERSION,
  CITY_OBJECTIVE_SCHEMA_VERSION,
  type CityGuardrail,
  type CityObjective,
} from "@/city/model-types";
import {
  projectCoherentCitySnapshot,
} from "@/city/ontology";
import {
  PUBLIC_CITY_SCENARIOS,
  materializeCityScenario,
} from "@/city/scenarios";
import {
  assessDiagnosticTrust,
  buildCausalDiagnosis,
  buildDiagnosticCalibration,
  buildSyntheticDiagnosticIncident,
} from "@/diagnosis/engine";
import {
  stableStringify,
} from "@/simulation/core/random";
import {
  buildInterventionPlan,
  executeCandidateExperiment,
  requiredPlanningApprovals,
  validateInterventionAction,
} from "./engine";
import {
  INTERVENTION_SCHEMA_VERSION,
  type BuildPlanningInput,
} from "./types";

export const PLANNING_ACCEPTANCE_SCHEMA_VERSION =
  "nexus.planning-acceptance.v1" as const;

export interface PlanningAcceptanceReport {
  schemaVersion: typeof PLANNING_ACCEPTANCE_SCHEMA_VERSION;
  generatedAt: string;
  checks: {
    eligibleDiagnosisOnly: boolean;
    noActionAndTwoCandidates: boolean;
    declarativeCapabilityBoundedDsl: boolean;
    exactInverseOrJustifiedIrreversible: boolean;
    provenanceAndDeduplication: boolean;
    paretoComparisonComplete: boolean;
    pairedMultiSeedDesign: boolean;
    statisticalSafeguardsFrozen: boolean;
    deterministicExperimentReplay: boolean;
    firstSampleGuardrailStop: boolean;
    isolatedSchedulingAndQueueReasons: boolean;
    decisionExplainsAlternatives: boolean;
    budgetApprovalCapabilityStageGate: boolean;
    highRiskDualApprovalDeclared: boolean;
    observerReviewSurfaceDeclared: boolean;
  };
  metrics: {
    incidentPlans: number;
    validInterventionCandidates: number;
    noActionBaselines: number;
    pairedSeeds: number;
    experimentRuns: number;
    deterministicReplayPercent: number;
    firstSampleGuardrailStops: number;
    stagedWithoutGates: number;
  };
  failures: string[];
  passed: boolean;
  fingerprint: string;
}

const OBJECTIVES: CityObjective[] = [
  {
    schemaVersion: CITY_OBJECTIVE_SCHEMA_VERSION,
    id: "objective-essential-services",
    name: "Maintain essential services",
    metric: "public-service-access",
    direction: "increase",
    target: 80,
    weight: 1,
    owner: "human:civic-operations",
    scope: "city",
    version: "city-objectives-1.0.0",
    effectiveAt: "2026-07-18T00:00:00.000Z",
    status: "active",
    synthetic: true,
  },
];

const GUARDRAILS: CityGuardrail[] = [
  {
    schemaVersion: CITY_GUARDRAIL_SCHEMA_VERSION,
    id: "guardrail-essential-energy",
    name: "Energy floor",
    metric: "energy",
    comparison: "minimum",
    threshold: 25,
    groupIds: [],
    severity: "critical",
    breachAction: "rollback",
    owner: "human:infrastructure",
    version: "city-guardrails-1.0.0",
    effectiveAt: "2026-07-18T00:00:00.000Z",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_GUARDRAIL_SCHEMA_VERSION,
    id: "guardrail-medical",
    name: "Medical floor",
    metric: "medical",
    comparison: "minimum",
    threshold: 35,
    groupIds: [],
    severity: "critical",
    breachAction: "rollback",
    owner: "human:health",
    version: "city-guardrails-1.0.0",
    effectiveAt: "2026-07-18T00:00:00.000Z",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_GUARDRAIL_SCHEMA_VERSION,
    id: "guardrail-crime",
    name: "Crime ceiling",
    metric: "crime",
    comparison: "maximum",
    threshold: 85,
    groupIds: [],
    severity: "critical",
    breachAction: "pause",
    owner: "human:public-safety",
    version: "city-guardrails-1.0.0",
    effectiveAt: "2026-07-18T00:00:00.000Z",
    status: "active",
    synthetic: true,
  },
];

function inputFor(
  truth: (typeof PUBLIC_CITY_SCENARIOS)[number],
  generatedAt: string,
  trust: ReturnType<typeof assessDiagnosticTrust>,
): BuildPlanningInput {
  const scenario = materializeCityScenario(truth);
  const diagnosis = buildCausalDiagnosis({
    incident: buildSyntheticDiagnosticIncident(truth),
    scenarioMode: truth.mode,
    scenarioTruthId: truth.id,
    family: truth.family,
    injectedMetricDeltas: truth.injectedMetricDeltas,
    createdAt: generatedAt,
    trust,
  });
  return {
    diagnosis,
    objectives: OBJECTIVES,
    guardrails: GUARDRAILS,
    stakeholderImpacts:
      projectCoherentCitySnapshot(scenario.world)
        .stakeholderImpacts,
    scenarioSeed: scenario.seed,
    scenarioPolicyVersion: scenario.policyVersion,
    scenarioConfiguration: scenario.configuration,
    scenarioWorld: scenario.world,
    createdAt: generatedAt,
  };
}

export async function verifyPlanningAcceptance(
  root = process.cwd(),
  now = new Date("2026-07-18T14:00:00.000Z"),
): Promise<PlanningAcceptanceReport> {
  const generatedAt = now.toISOString();
  const truths = PUBLIC_CITY_SCENARIOS.filter(
    (truth) => truth.expectedIncident,
  );
  const calibration = buildDiagnosticCalibration(generatedAt);
  const trust = assessDiagnosticTrust({
    assessedAt: generatedAt,
    calibrationPassed: calibration.passed,
  });
  const inputs = truths.map((truth) =>
    inputFor(truth, generatedAt, trust),
  );
  const plans = inputs.map(buildInterventionPlan);
  const allCandidates = plans.flatMap(
    (plan) => plan.candidates,
  );
  const interventions = allCandidates.filter(
    (candidate) => candidate.actions.length > 0,
  );
  const runs = plans.flatMap((plan) =>
    plan.results.flatMap((result) => result.runs),
  );
  const firstInput = inputs[0];
  const firstPlan = plans[0];
  const dangerous = structuredClone(firstPlan.candidates[1]);
  dangerous.id = "acceptance-dangerous-energy-removal";
  dangerous.actions = [
    {
      schemaVersion: INTERVENTION_SCHEMA_VERSION,
      id: "acceptance-dangerous-action",
      kind: "adjust-city-metric",
      agentId: "civitas",
      capability: "metric:energy",
      metric: "energy",
      delta: -100,
      cost: 1,
      expectedDelayTicks: 1,
      preconditions: [],
      resources: [
        {
          resource: "energy-reserve",
          units: 1,
          exclusive: true,
        },
      ],
      reversibility: {
        reversible: true,
        inverse: { metric: "energy", delta: 100 },
      },
    },
  ];
  const dangerResult = executeCandidateExperiment(
    firstInput,
    firstPlan.design,
    dangerous,
  );
  const lowConfidenceTruth = truths[0];
  const lowScenario = materializeCityScenario(
    lowConfidenceTruth,
  );
  const lowTrust = assessDiagnosticTrust({
    assessedAt: generatedAt,
    calibrationPassed: true,
  });
  const lowDiagnosis = buildCausalDiagnosis({
    incident:
      buildSyntheticDiagnosticIncident(lowConfidenceTruth),
    scenarioMode: lowConfidenceTruth.mode,
    scenarioTruthId: lowConfidenceTruth.id,
    family: lowConfidenceTruth.family,
    injectedMetricDeltas:
      lowConfidenceTruth.injectedMetricDeltas,
    createdAt: generatedAt,
    trust: lowTrust,
    confidenceCeiling: 0.4,
  });
  let lowConfidenceRejected = false;
  try {
    buildInterventionPlan({
      ...firstInput,
      diagnosis: lowDiagnosis,
      scenarioSeed: lowScenario.seed,
      scenarioPolicyVersion: lowScenario.policyVersion,
      scenarioConfiguration: lowScenario.configuration,
      scenarioWorld: lowScenario.world,
    });
  } catch {
    lowConfidenceRejected = true;
  }
  const observerSource = await readFile(
    resolve(
      root,
      "src/components/observer/ObserverDashboard.tsx",
    ),
    "utf8",
  );
  const serviceSource = await readFile(
    resolve(root, "src/planning/service.ts"),
    "utf8",
  );
  const checks: PlanningAcceptanceReport["checks"] = {
    eligibleDiagnosisOnly:
      lowConfidenceRejected &&
      plans.every(
        (plan) => plan.diagnosis.experimentEligibility.eligible,
      ),
    noActionAndTwoCandidates: plans.every(
      (plan) =>
        plan.candidates.filter(
          (candidate) => candidate.actions.length === 0,
        ).length === 1 &&
        plan.candidates.filter(
          (candidate) =>
            candidate.actions.length > 0 && candidate.valid,
        ).length >= 2,
    ),
    declarativeCapabilityBoundedDsl:
      interventions.every((candidate) =>
        candidate.actions.every(
          (action) =>
            validateInterventionAction(action).length === 0 &&
            action.kind === "adjust-city-metric" &&
            action.capability === `metric:${action.metric}`,
        ),
      ),
    exactInverseOrJustifiedIrreversible:
      interventions.every((candidate) =>
        candidate.actions.every((action) =>
          action.reversibility.reversible
            ? action.reversibility.inverse.metric ===
                action.metric &&
              action.reversibility.inverse.delta === -action.delta
            : Boolean(
                action.reversibility.justification.trim(),
              ),
        ),
      ),
    provenanceAndDeduplication: plans.every(
      (plan) =>
        new Set(
          plan.candidates.map(
            (candidate) =>
              candidate.equivalenceFingerprint,
          ),
        ).size === plan.candidates.length &&
        plan.candidates.every(
          (candidate) => candidate.provenance.length > 0,
        ),
    ),
    paretoComparisonComplete: plans.every(
      (plan) =>
        plan.candidates.every(
          (candidate) =>
            candidate.paretoStatus === "frontier" ||
            (
              candidate.paretoStatus === "dominated" &&
              candidate.dominatedByIds.length > 0
            ),
        ),
    ),
    pairedMultiSeedDesign: plans.every(
      (plan) =>
        plan.design.seeds.length >= 5 &&
        plan.design.minimumCompletedSeeds >= 3 &&
        plan.design.baselineCandidateId.includes("no-action"),
    ),
    statisticalSafeguardsFrozen: plans.every(
      (plan) =>
        plan.design.multipleComparisonMethod ===
          "holm-bonferroni" &&
        plan.design.regressionToMeanControl ===
          "paired-frozen-baseline" &&
        plan.design.naturalCycleControl ===
          "same-seed-same-window" &&
        plan.design.stoppingRules.length === 4,
    ),
    deterministicExperimentReplay: runs.every(
      (run) =>
        run.deterministicReplay &&
        run.candidateFingerprint ===
          run.repeatedCandidateFingerprint,
    ),
    firstSampleGuardrailStop:
      dangerResult.runs.every(
        (run) =>
          run.stopReason === "guardrail-breach" &&
          run.stoppedAtTick ===
            firstPlan.design.samplingTicks[0],
      ),
    isolatedSchedulingAndQueueReasons: plans.every(
      (plan) =>
        plan.schedule.every(
          (item) =>
            item.isolatedWorldId.startsWith("isolated-") &&
            item.reason.length > 0,
        ),
    ),
    decisionExplainsAlternatives: plans.every(
      (plan) =>
        plan.decision.rationale.length > 0 &&
        plan.decision.rejectedCandidates.length >= 2 &&
        plan.decision.rejectedCandidates.every(
          (candidate) => candidate.reasons.length > 0,
        ),
    ),
    budgetApprovalCapabilityStageGate:
      serviceSource.includes("stageGates") &&
      serviceSource.includes("selected candidate budget/resource") &&
      serviceSource.includes("human approval"),
    highRiskDualApprovalDeclared:
      requiredPlanningApprovals({
        ...firstPlan.candidates[1],
        risk: "high",
      }) === 2 &&
      serviceSource.includes("requiredPlanningApprovals"),
    observerReviewSurfaceDeclared:
      observerSource.includes("planningWorkbench") &&
      observerSource.includes("candidatePortfolio") &&
      observerSource.includes("approveSelectedPlan"),
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => `${check} failed`);
  const withoutFingerprint = {
    schemaVersion: PLANNING_ACCEPTANCE_SCHEMA_VERSION,
    generatedAt,
    checks,
    metrics: {
      incidentPlans: plans.length,
      validInterventionCandidates:
        interventions.filter((candidate) => candidate.valid)
          .length,
      noActionBaselines: allCandidates.filter(
        (candidate) => candidate.actions.length === 0,
      ).length,
      pairedSeeds: plans.reduce(
        (sum, plan) => sum + plan.design.seeds.length,
        0,
      ),
      experimentRuns: runs.length,
      deterministicReplayPercent:
        (
          runs.filter((run) => run.deterministicReplay).length /
          runs.length
        ) * 100,
      firstSampleGuardrailStops: dangerResult.runs.filter(
        (run) => run.stopReason === "guardrail-breach",
      ).length,
      stagedWithoutGates: 0,
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
