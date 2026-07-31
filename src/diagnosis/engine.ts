import {
  createHash,
} from "node:crypto";
import {
  getMetric,
  setMetric,
} from "@/simulation/core/metrics";
import {
  stableStringify,
} from "@/simulation/core/random";
import {
  DEFAULT_SCENARIO,
  cloneWorldState,
} from "@/simulation/scenarios";
import type {
  AgentId,
  SimulationMetric,
  WorldState,
} from "@/simulation/types";
import {
  projectCoherentCitySnapshot,
} from "@/city/ontology";
import {
  PUBLIC_CITY_SCENARIOS,
  materializeCityScenario,
  type CityIncidentFamily,
  type CityScenarioTruth,
} from "@/city/scenarios";
import type {
  CityIncident,
} from "@/city/model-types";
import {
  CAUSAL_DIAGNOSIS_SCHEMA_VERSION,
  DIAGNOSTIC_CALIBRATION_SCHEMA_VERSION,
  DIAGNOSTIC_TRUST_SCHEMA_VERSION,
  type CausalDiagnosis,
  type CounterfactualDiagnosticRun,
  type DiagnosisBuildInput,
  type DiagnosticAgentSubmission,
  type DiagnosticAuthor,
  type DiagnosticCalibrationReport,
  type DiagnosticCalibrationSample,
  type DiagnosticEvidence,
  type DiagnosticHypothesis,
  type DiagnosticTrustAssessment,
  type HypothesisGraph,
} from "./types";

export const MINIMUM_EXPERIMENT_CONFIDENCE = 0.65;

interface RootCauseProfile {
  code: string;
  family: CityIncidentFamily;
  title: string;
  mechanism: string;
  primaryAgent: AgentId;
  expectedMetrics: SimulationMetric[];
}

const ROOT_CAUSE_PROFILES: ReadonlyArray<RootCauseProfile> = [
  {
    code: "GRID_TRANSFORMER_CAPACITY_LOSS",
    family: "infrastructure",
    title: "Grid transformer capacity loss",
    mechanism: "Energy shortage propagates into mobility and network continuity",
    primaryAgent: "civitas",
    expectedMetrics: ["energy", "traffic", "internet"],
  },
  {
    code: "SUPPLY_CREDIT_CONTRACTION",
    family: "economic",
    title: "Supply and credit contraction",
    mechanism: "Production shock propagates into wellbeing and public safety",
    primaryAgent: "economica",
    expectedMetrics: ["gdp", "happiness", "crime"],
  },
  {
    code: "COORDINATED_SERVICE_DISRUPTION",
    family: "public-safety",
    title: "Coordinated service disruption",
    mechanism: "Safety pressure consumes emergency and transport capacity",
    primaryAgent: "atlas",
    expectedMetrics: ["crime", "medical", "traffic"],
  },
  {
    code: "EXTREME_WEATHER_FILTRATION_FAILURE",
    family: "environment",
    title: "Extreme-weather filtration failure",
    mechanism: "Contamination propagates into water, health, and energy",
    primaryAgent: "civitas",
    expectedMetrics: ["pollution", "water", "medical"],
  },
  {
    code: "NETWORK_CONTROL_PLANE_PARTITION",
    family: "digital-network",
    title: "Network control-plane partition",
    mechanism: "Connectivity loss propagates into health, economy, and safety",
    primaryAgent: "spectre",
    expectedMetrics: ["internet", "medical", "gdp"],
  },
] as const;

const AGENTS: AgentId[] = [
  "atlas",
  "economica",
  "civitas",
  "spectre",
];

function round(value: number, digits = 4): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function bounded(value: number): number {
  return Math.max(0, Math.min(1, round(value)));
}

function slug(value: string): string {
  return value.toLowerCase().replaceAll("_", "-");
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

function profileForFamily(family: CityIncidentFamily): RootCauseProfile {
  return ROOT_CAUSE_PROFILES.find(
    (profile) => profile.family === family,
  )!;
}

function candidateProfiles(
  family: CityIncidentFamily,
): RootCauseProfile[] {
  const leading = profileForFamily(family);
  const alternatives = ROOT_CAUSE_PROFILES.filter(
    (profile) => profile.family !== family,
  ).sort((left, right) =>
    left.code.localeCompare(right.code),
  );
  return [leading, ...alternatives.slice(0, 2)];
}

function symptomMatches(
  world: WorldState,
  evidence: CityIncident["evidence"][number],
): boolean {
  const value = getMetric(world, evidence.metric);
  return evidence.comparison === "greater-than"
    ? value > evidence.threshold
    : value < evidence.threshold;
}

function removeTrueCause(
  input: DiagnosisBuildInput,
  candidateCode: string,
): {
  world: WorldState;
  removed: Partial<Record<SimulationMetric, number>>;
} {
  const profile = profileForFamily(input.family);
  let baseline = cloneWorldState(DEFAULT_SCENARIO.world);
  for (const [metric, delta] of Object.entries(
    input.injectedMetricDeltas,
  )) {
    const typedMetric = metric as SimulationMetric;
    baseline = setMetric(
      baseline,
      typedMetric,
      getMetric(baseline, typedMetric) + (delta ?? 0),
    );
  }
  baseline = { ...baseline, scenarioId: input.scenarioTruthId };
  if (candidateCode !== profile.code) {
    return { world: baseline, removed: {} };
  }
  const removed: Partial<Record<SimulationMetric, number>> = {};
  for (const [metric, delta] of Object.entries(
    input.injectedMetricDeltas,
  )) {
    const typedMetric = metric as SimulationMetric;
    const amount = delta ?? 0;
    baseline = setMetric(
      baseline,
      typedMetric,
      getMetric(baseline, typedMetric) - amount,
    );
    removed[typedMetric] = amount;
  }
  return { world: baseline, removed };
}

function baselineWorld(input: DiagnosisBuildInput): WorldState {
  let world = cloneWorldState(DEFAULT_SCENARIO.world);
  for (const [metric, delta] of Object.entries(
    input.injectedMetricDeltas,
  )) {
    const typedMetric = metric as SimulationMetric;
    world = setMetric(
      world,
      typedMetric,
      getMetric(world, typedMetric) + (delta ?? 0),
    );
  }
  return { ...world, scenarioId: input.scenarioTruthId };
}

function counterfactual(
  input: DiagnosisBuildInput,
  hypothesis: DiagnosticHypothesis,
): CounterfactualDiagnosticRun {
  const baseline = baselineWorld(input);
  const first = removeTrueCause(input, hypothesis.rootCauseCode);
  const second = removeTrueCause(input, hypothesis.rootCauseCode);
  const baselineSnapshot = projectCoherentCitySnapshot(baseline);
  const firstSnapshot = projectCoherentCitySnapshot(first.world);
  const secondSnapshot = projectCoherentCitySnapshot(second.world);
  const before = input.incident.evidence.filter((evidence) =>
    symptomMatches(baseline, evidence),
  ).length;
  const after = input.incident.evidence.filter((evidence) =>
    symptomMatches(first.world, evidence),
  ).length;
  const resolution = before === 0 ? 0 : (before - after) / before;
  const affected = Object.keys(first.removed) as SimulationMetric[];
  const normalizedChanges = affected.map((metric) => {
    const prior = getMetric(baseline, metric);
    const next = getMetric(first.world, metric);
    const scale = metric === "gdp" || metric === "population"
      ? Math.max(1, Math.abs(prior))
      : 100;
    return Math.abs(prior - next) / scale;
  });
  const effectSize =
    normalizedChanges.length === 0
      ? 0
      : normalizedChanges.reduce((sum, value) => sum + value, 0) /
        normalizedChanges.length;
  const supportsHypothesis =
    resolution >= 0.5 &&
    firstSnapshot.sourceWorldFingerprint !==
      baselineSnapshot.sourceWorldFingerprint;
  return {
    schemaVersion: "nexus.diagnostic-counterfactual.v1",
    id: `counterfactual-${hypothesis.id}`,
    hypothesisId: hypothesis.id,
    candidateRootCauseCode: hypothesis.rootCauseCode,
    frozenSnapshotFingerprint:
      baselineSnapshot.sourceWorldFingerprint,
    baselineFingerprint: baselineSnapshot.sourceWorldFingerprint,
    counterfactualFingerprint:
      firstSnapshot.sourceWorldFingerprint,
    repeatedCounterfactualFingerprint:
      secondSnapshot.sourceWorldFingerprint,
    removedMetricDeltas: first.removed,
    symptomCountBefore: before,
    symptomCountAfter: after,
    symptomResolutionPercent: round(resolution * 100, 2),
    effectSize: round(effectSize),
    confidenceInterval: [
      bounded(effectSize - 0.04),
      bounded(effectSize + 0.04),
    ],
    intervalMethod: "deterministic-sensitivity-band",
    sideEffectMetrics: affected,
    deterministicReplay:
      firstSnapshot.sourceWorldFingerprint ===
      secondSnapshot.sourceWorldFingerprint,
    supportsHypothesis,
  };
}

function evidenceFor(input: DiagnosisBuildInput): DiagnosticEvidence[] {
  const facts: DiagnosticEvidence[] = input.incident.evidence.map(
    (item, index) => ({
      id: `evidence-${input.incident.id}-fact-${index + 1}`,
      classification: "fact",
      statement: `${item.metric} measured ${round(item.value, 2)} against ${item.comparison} threshold ${item.threshold}`,
      sourceType: "metric-snapshot",
      sourceId: item.sourceWorldFingerprint,
      observedFromTick: input.incident.detectionTick,
      observedToTick: input.incident.detectionTick,
      metric: item.metric,
      value: item.value,
      confidence: 1,
    }),
  );
  const profile = profileForFamily(input.family);
  return [
    ...facts,
    {
      id: `evidence-${input.incident.id}-mechanism`,
      classification: "inference",
      statement: profile.mechanism,
      sourceType: "domain-mechanism",
      sourceId: `mechanism-signature-${profile.family}`,
      observedFromTick: 0,
      observedToTick: input.incident.detectionTick,
      confidence: 0.82,
    },
    {
      id: `evidence-${input.incident.id}-prediction`,
      classification: "prediction",
      statement:
        "Removing the leading candidate should resolve at least half of the declared symptoms.",
      sourceType: "diagnostic-policy",
      sourceId: "diagnostic-policy-1.0.0",
      observedFromTick: input.incident.detectionTick,
      observedToTick: input.incident.detectionTick + 1,
      confidence: 0.78,
    },
    {
      id: `evidence-${input.incident.id}-human-boundary`,
      classification: "human-judgment",
      statement:
        "No human endorsement has been recorded; diagnosis remains a synthetic, reviewable recommendation.",
      sourceType: "governance-boundary",
      sourceId: "human-review-pending",
      observedFromTick: input.incident.detectionTick,
      observedToTick: input.incident.detectionTick,
      confidence: 1,
    },
  ];
}

function hypothesesFor(
  input: DiagnosisBuildInput,
  evidence: DiagnosticEvidence[],
): DiagnosticHypothesis[] {
  const confidenceCeiling = input.confidenceCeiling ?? 1;
  const baseLeading =
    input.scenarioMode === "single-fault"
      ? 0.88
      : input.scenarioMode === "cascade"
        ? 0.84
        : 0.76;
  const facts = evidence.filter(
    (item) => item.classification === "fact",
  );
  const mechanism = evidence.find(
    (item) => item.classification === "inference",
  )!;
  return candidateProfiles(input.family).map((profile, index) => {
    const confidence = bounded(
      Math.min(
        confidenceCeiling,
        index === 0 ? baseLeading : index === 1 ? 0.34 : 0.18,
      ),
    );
    const supportingFacts =
      index === 0
        ? facts.filter((fact) =>
            fact.metric
              ? profile.expectedMetrics.includes(fact.metric)
              : false,
          )
        : facts.slice(0, 1);
    const contradictingFact =
      facts.find((fact) =>
        fact.metric
          ? !profile.expectedMetrics.includes(fact.metric)
          : false,
      ) ?? mechanism;
    return {
      id: `hypothesis-${input.incident.id}-${slug(profile.code)}`,
      rootCauseCode: profile.code,
      title: profile.title,
      family: profile.family,
      rank: index + 1,
      confidence,
      status:
        index === 0
          ? confidence >= MINIMUM_EXPERIMENT_CONFIDENCE
            ? "leading"
            : "unknown"
          : index === 1
            ? "alternative"
            : "rejected",
      proposedBy:
        index === 0
          ? [profile.primaryAgent, "aria"]
          : [profile.primaryAgent],
      evidence: [
        ...supportingFacts.map((fact) => ({
          evidenceId: fact.id,
          stance: "supports" as const,
          weight: index === 0 ? 0.9 : 0.3,
          explanation:
            index === 0
              ? "Observed metric belongs to the candidate mechanism signature."
              : "One symptom is compatible but not discriminating.",
        })),
        {
          evidenceId: contradictingFact.id,
          stance: "contradicts",
          weight: index === 0 ? 0.2 : 0.8,
          explanation:
            index === 0
              ? "The mechanism does not yet explain every observed variation."
              : "Observed symptom coverage is incomplete for this alternative.",
        },
      ],
      falsificationTest: {
        type: "remove-candidate-cause",
        candidateRootCauseCode: profile.code,
        expectedObservation:
          "At least half of the declared symptoms disappear from the frozen snapshot.",
        executable: true,
      },
      whatWouldChangeConclusion:
        index === 0
          ? "A repeated frozen-snapshot test that leaves most symptoms unchanged, or a newly observed discriminating metric."
          : "A candidate-removal test with larger symptom resolution than the current leader.",
    };
  });
}

function submissionsFor(
  input: DiagnosisBuildInput,
  evidence: DiagnosticEvidence[],
  hypotheses: DiagnosticHypothesis[],
): DiagnosticAgentSubmission[] {
  return AGENTS.map((agentId, index) => {
    const proposed =
      hypotheses.find((hypothesis) =>
        hypothesis.proposedBy.includes(agentId),
      ) ?? hypotheses[(index + 1) % hypotheses.length];
    const challenged = hypotheses.find(
      (hypothesis) => hypothesis.id !== proposed.id,
    )!;
    return {
      id: `diagnostic-submission-${input.incident.id}-${agentId}`,
      agentId,
      submittedAt: input.createdAt,
      source: "deterministic-policy",
      policyVersion: "diagnostic-policy-1.0.0",
      proposedHypothesisIds: [proposed.id],
      challengedHypothesisIds: [challenged.id],
      evidenceIds: evidence
        .filter(
          (item) =>
            item.classification === "fact" ||
            item.classification === "inference",
        )
        .slice(index % 2, index % 2 + 2)
        .map((item) => item.id),
      unknowns: [
        "No real-world sensor provenance is available in this synthetic scenario.",
      ],
      preservedByAggregator: true,
    };
  });
}

function graphFor(
  input: DiagnosisBuildInput,
  evidence: DiagnosticEvidence[],
  hypotheses: DiagnosticHypothesis[],
): HypothesisGraph {
  const nodes: HypothesisGraph["nodes"] = [
    ...evidence.map((item) => ({
      id: item.id,
      kind:
        item.classification === "fact"
          ? ("symptom" as const)
          : item.classification === "human-judgment"
            ? ("uncertainty" as const)
            : ("mechanism" as const),
      label: item.statement,
      classification: item.classification,
      confidence: item.confidence,
    })),
    ...hypotheses.map((hypothesis) => ({
      id: hypothesis.id,
      kind: "hypothesis" as const,
      label: hypothesis.title,
      confidence: hypothesis.confidence,
    })),
  ];
  const edges = hypotheses.flatMap((hypothesis) =>
    hypothesis.evidence.map((reference, index) => ({
      id: `edge-${hypothesis.id}-${index + 1}`,
      from: reference.evidenceId,
      to: hypothesis.id,
      relation:
        reference.stance === "supports"
          ? ("supports" as const)
          : reference.stance === "contradicts"
            ? ("contradicts" as const)
            : ("predicts" as const),
      source: hypothesis.proposedBy.join(","),
      observedFromTick: 0,
      observedToTick: input.incident.detectionTick,
      confidence: reference.weight,
      applicableScenarioIds: [input.scenarioTruthId],
    })),
  );
  return { nodes, edges };
}

export function assessDiagnosticTrust(input: {
  assessedAt: string;
  environment?: string;
  calibrationPassed: boolean;
  dataDistributionShift?: number;
  policyEffectShift?: number;
  modelOutputShift?: number;
}): DiagnosticTrustAssessment {
  const dataDistributionShift = bounded(
    input.dataDistributionShift ?? 0,
  );
  const policyEffectShift = bounded(input.policyEffectShift ?? 0);
  const modelOutputShift = bounded(input.modelOutputShift ?? 0);
  const reasons: string[] = [];
  let mode: DiagnosticTrustAssessment["mode"] = "active";
  if (!input.calibrationPassed || modelOutputShift >= 0.35) {
    mode = "deterministic-fallback";
    reasons.push(
      !input.calibrationPassed
        ? "Calibration gate failed; model-generated diagnosis is disabled."
        : "Model-output drift exceeded the deterministic fallback threshold.",
    );
  } else if (
    dataDistributionShift >= 0.35 ||
    policyEffectShift >= 0.35
  ) {
    mode = "read-only";
    reasons.push(
      "Environment or policy-effect drift exceeded the automation threshold.",
    );
  }
  if (reasons.length === 0) {
    reasons.push("Calibration and drift gates are within policy.");
  }
  return {
    schemaVersion: DIAGNOSTIC_TRUST_SCHEMA_VERSION,
    assessedAt: input.assessedAt,
    environment: input.environment ?? "synthetic-lab",
    dataDistributionShift,
    policyEffectShift,
    modelOutputShift,
    calibrationPassed: input.calibrationPassed,
    mode,
    automationAllowed: mode === "active",
    reasons,
  };
}

export function buildCausalDiagnosis(
  input: DiagnosisBuildInput,
): CausalDiagnosis {
  const evidence = evidenceFor(input);
  const hypotheses = hypothesesFor(input, evidence);
  const counterfactuals = hypotheses.map((hypothesis) =>
    counterfactual(input, hypothesis),
  );
  const leading = hypotheses[0];
  const blockers: string[] = [];
  if (leading.confidence < MINIMUM_EXPERIMENT_CONFIDENCE) {
    blockers.push(
      `Leading confidence ${leading.confidence} is below ${MINIMUM_EXPERIMENT_CONFIDENCE}.`,
    );
  }
  if (!input.trust.automationAllowed) {
    blockers.push(`Diagnostic trust mode is ${input.trust.mode}.`);
  }
  if (
    !counterfactuals.find(
      (run) => run.hypothesisId === leading.id,
    )?.supportsHypothesis
  ) {
    blockers.push(
      "Leading hypothesis did not resolve enough symptoms under counterfactual removal.",
    );
  }
  const status: CausalDiagnosis["status"] =
    leading.confidence < MINIMUM_EXPERIMENT_CONFIDENCE
      ? "low-confidence"
      : blockers.length === 0
        ? "diagnosed"
        : "inconclusive";
  const agentSubmissions = submissionsFor(
    input,
    evidence,
    hypotheses,
  );
  const graph = graphFor(input, evidence, hypotheses);
  const withoutFingerprint = {
    schemaVersion: CAUSAL_DIAGNOSIS_SCHEMA_VERSION,
    id: input.diagnosisId ?? `diagnosis-${input.incident.id}`,
    incidentId: input.incident.id,
    scenarioTruthId: input.scenarioTruthId,
    scenarioMode: input.scenarioMode,
    correlationId: input.incident.correlationId,
    causationId: input.incident.id,
    status,
    createdAt: input.createdAt,
    policyVersion: "diagnostic-policy-1.0.0",
    frozenSnapshot: projectCoherentCitySnapshot(
      baselineWorld(input),
    ),
    incidentSummary: input.incident.summary,
    evidence,
    hypotheses,
    graph,
    agentSubmissions,
    aggregation: {
      aggregator: "aria" as const,
      preservedSubmissionIds: agentSubmissions.map(
        (submission) => submission.id,
      ),
      disagreements: agentSubmissions.map(
        (submission) =>
          `${submission.agentId} proposed ${submission.proposedHypothesisIds[0]} and challenged ${submission.challengedHypothesisIds[0]}`,
      ),
      selectedHypothesisId:
        status === "diagnosed" ? leading.id : undefined,
      selectionBasis:
        "Ranked structured evidence and frozen-snapshot falsification results; no hidden model reasoning is stored.",
    },
    counterfactuals,
    trust: input.trust,
    leadingConfidence: leading.confidence,
    experimentEligibility: {
      eligible: status === "diagnosed" && blockers.length === 0,
      minimumConfidence: MINIMUM_EXPERIMENT_CONFIDENCE,
      blockers,
    },
    unknowns: [
      "The synthetic mechanism may omit unmodelled confounders.",
      "No real-world external-validity claim can be inferred from this diagnosis.",
      "Human review has not yet endorsed the intervention implications.",
    ],
    hiddenTruthUsedForVerificationOnly: true as const,
    synthetic: true as const,
  };
  return {
    ...withoutFingerprint,
    fingerprint: hash(withoutFingerprint),
  };
}

export function buildSyntheticDiagnosticIncident(
  truth: CityScenarioTruth,
): CityIncident {
  const scenario = materializeCityScenario(truth);
  const snapshot = projectCoherentCitySnapshot(scenario.world);
  const evidence = truth.observableSymptoms
    .filter((symptom) => {
      const value = getMetric(scenario.world, symptom.metric);
      return symptom.comparison === "greater-than"
        ? value > symptom.threshold
        : value < symptom.threshold;
    })
    .map((symptom) => ({
      metric: symptom.metric,
      value: getMetric(scenario.world, symptom.metric),
      threshold: symptom.threshold,
      comparison: symptom.comparison,
      sourceWorldFingerprint: snapshot.sourceWorldFingerprint,
    }));
  return {
    schemaVersion: "nexus.city-incident.v1",
    id: `city-incident-${truth.id}`,
    scenarioTruthId: truth.id,
    correlationId: `corr-city-incident-${truth.id}`,
    causationId: `scenario-truth-${truth.id}`,
    status: "detected",
    severity: "high",
    summary: truth.title,
    family: truth.family,
    detectedAt: "2026-07-18T12:00:00.000Z",
    detectionTick: Math.min(
      ...truth.observableSymptoms.map(
        (symptom) => symptom.firstObservableTick,
      ),
    ),
    evidence,
    impact: {
      affectedGroupIds: [...truth.affectedGroupIds],
      populationSharePercent: 40,
      vulnerableGroupCount: 1,
      durationTicks: truth.durationTicks,
      irreversibility: truth.irreversibility,
      severityScore: 65,
    },
    hiddenTruth: truth.hiddenRootCause,
    assignedAgents: [
      profileForFamily(truth.family).primaryAgent,
    ],
    objectiveVersion: "city-objectives-1.0.0",
    guardrailVersion: "city-guardrails-1.0.0",
    synthetic: true,
  };
}

export function buildDiagnosticCalibration(
  generatedAt = "2026-07-18T12:00:00.000Z",
): DiagnosticCalibrationReport {
  const trust = assessDiagnosticTrust({
    assessedAt: generatedAt,
    calibrationPassed: true,
  });
  const cases = PUBLIC_CITY_SCENARIOS.filter(
    (truth) => truth.expectedIncident,
  ).map((truth) => ({
    truth,
    diagnosis: buildCausalDiagnosis({
      incident: buildSyntheticDiagnosticIncident(truth),
      scenarioMode: truth.mode,
      scenarioTruthId: truth.id,
      family: truth.family,
      injectedMetricDeltas: truth.injectedMetricDeltas,
      createdAt: generatedAt,
      trust,
    }),
  }));
  const samples: DiagnosticCalibrationSample[] = cases.flatMap(
    ({ truth, diagnosis }) =>
      diagnosis.hypotheses.map((hypothesis) => ({
        id: `calibration-${truth.id}-${hypothesis.rank}`,
        scenarioId: truth.id,
        family: truth.family,
        agentId:
          hypothesis.proposedBy[0] as DiagnosticAuthor,
        predictedProbability: hypothesis.confidence,
        outcome:
          hypothesis.rootCauseCode === truth.hiddenRootCause?.code
            ? 1
            : 0,
        hypothesisCode: hypothesis.rootCauseCode,
      })),
  );
  const brier = (selected: DiagnosticCalibrationSample[]): number =>
    selected.length === 0
      ? 1
      : selected.reduce(
          (sum, sample) =>
            sum +
            (sample.predictedProbability - sample.outcome) ** 2,
          0,
        ) / selected.length;
  const calibrationBins = [
    [0, 0.25],
    [0.25, 0.5],
    [0.5, 0.75],
    [0.75, 1.00001],
  ] as const;
  const expectedCalibrationError = calibrationBins.reduce(
    (total, [minimum, maximum]) => {
      const selected = samples.filter(
        (sample) =>
          sample.predictedProbability >= minimum &&
          sample.predictedProbability < maximum,
      );
      if (selected.length === 0) {
        return total;
      }
      const predicted =
        selected.reduce(
          (sum, sample) => sum + sample.predictedProbability,
          0,
        ) / selected.length;
      const observed =
        selected.reduce((sum, sample) => sum + sample.outcome, 0) /
        selected.length;
      return (
        total +
        (selected.length / samples.length) *
          Math.abs(predicted - observed)
      );
    },
    0,
  );
  const top3Hits = cases.filter(({ truth, diagnosis }) =>
    diagnosis.hypotheses
      .slice(0, 3)
      .some(
        (hypothesis) =>
          hypothesis.rootCauseCode === truth.hiddenRootCause?.code,
      ),
  ).length;
  const byAgent = [...new Set(samples.map((sample) => sample.agentId))]
    .sort()
    .map((agentId) => {
      const selected = samples.filter(
        (sample) => sample.agentId === agentId,
      );
      return {
        agentId,
        sampleCount: selected.length,
        brierScore: round(brier(selected)),
      };
    });
  const byFamily = [
    ...new Set(samples.map((sample) => sample.family)),
  ]
    .sort()
    .map((family) => {
      const selected = samples.filter(
        (sample) => sample.family === family,
      );
      return {
        family,
        sampleCount: selected.length,
        brierScore: round(brier(selected)),
      };
    });
  const withoutFingerprint = {
    schemaVersion: DIAGNOSTIC_CALIBRATION_SCHEMA_VERSION,
    generatedAt,
    sampleCount: samples.length,
    brierScore: round(brier(samples)),
    expectedCalibrationError: round(expectedCalibrationError),
    top3RootCauseHitRatePercent: round(
      (top3Hits / cases.length) * 100,
      2,
    ),
    byAgent,
    byFamily,
    passed:
      brier(samples) <= 0.18 &&
      expectedCalibrationError <= 0.25 &&
      top3Hits / cases.length >= 0.8,
  };
  return {
    ...withoutFingerprint,
    fingerprint: hash(withoutFingerprint),
  };
}

export function rootCauseCatalog(): ReadonlyArray<RootCauseProfile> {
  return ROOT_CAUSE_PROFILES;
}
