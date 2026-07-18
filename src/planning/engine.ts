import {
  createHash,
} from "node:crypto";
import {
  AGENT_DEFINITIONS,
} from "@/simulation/agents/config";
import {
  getMetric,
  setMetric,
} from "@/simulation/core/metrics";
import {
  stableStringify,
} from "@/simulation/core/random";
import {
  replaySimulation,
} from "@/simulation/replay";
import type {
  SimulationMetric,
  WorldState,
} from "@/simulation/types";
import {
  projectCoherentCitySnapshot,
} from "@/city/ontology";
import type {
  CityGuardrail,
} from "@/city/model-types";
import type {
  CausalDiagnosis,
} from "@/diagnosis/types";
import {
  EXPERIMENT_DESIGN_SCHEMA_VERSION,
  INTERVENTION_PLAN_SCHEMA_VERSION,
  INTERVENTION_SCHEMA_VERSION,
  type BuildPlanningInput,
  type CandidateExperimentResult,
  type CandidateExperimentRun,
  type InterventionAction,
  type InterventionCandidate,
  type InterventionExperimentDesign,
  type InterventionPlan,
  type InterventionResourceClaim,
  type ScheduledExperiment,
} from "./types";

interface ActionTemplate {
  agentId: InterventionAction["agentId"];
  metric: SimulationMetric;
  delta: number;
  cost: number;
  resource: InterventionResourceClaim["resource"];
  units: number;
}

const FAMILY_ACTIONS: Record<
  string,
  [ActionTemplate[], ActionTemplate[]]
> = {
  infrastructure: [
    [
      {
        agentId: "civitas",
        metric: "energy",
        delta: 35,
        cost: 45,
        resource: "energy-reserve",
        units: 35,
      },
      {
        agentId: "civitas",
        metric: "traffic",
        delta: -15,
        cost: 15,
        resource: "emergency-capacity",
        units: 10,
      },
    ],
    [
      {
        agentId: "spectre",
        metric: "internet",
        delta: 25,
        cost: 30,
        resource: "network-capacity",
        units: 25,
      },
      {
        agentId: "civitas",
        metric: "medical",
        delta: 12,
        cost: 20,
        resource: "emergency-capacity",
        units: 15,
      },
    ],
  ],
  economic: [
    [
      {
        agentId: "economica",
        metric: "gdp",
        delta: 900,
        cost: 55,
        resource: "public-budget",
        units: 55,
      },
      {
        agentId: "economica",
        metric: "happiness",
        delta: 10,
        cost: 20,
        resource: "public-budget",
        units: 20,
      },
    ],
    [
      {
        agentId: "atlas",
        metric: "crime",
        delta: -15,
        cost: 25,
        resource: "emergency-capacity",
        units: 15,
      },
      {
        agentId: "economica",
        metric: "happiness",
        delta: 12,
        cost: 30,
        resource: "public-budget",
        units: 25,
      },
    ],
  ],
  "public-safety": [
    [
      {
        agentId: "atlas",
        metric: "crime",
        delta: -30,
        cost: 45,
        resource: "emergency-capacity",
        units: 30,
      },
      {
        agentId: "civitas",
        metric: "medical",
        delta: 10,
        cost: 20,
        resource: "emergency-capacity",
        units: 15,
      },
    ],
    [
      {
        agentId: "civitas",
        metric: "traffic",
        delta: -18,
        cost: 25,
        resource: "energy-reserve",
        units: 10,
      },
      {
        agentId: "civitas",
        metric: "medical",
        delta: 15,
        cost: 28,
        resource: "emergency-capacity",
        units: 18,
      },
    ],
  ],
  environment: [
    [
      {
        agentId: "civitas",
        metric: "pollution",
        delta: -30,
        cost: 45,
        resource: "energy-reserve",
        units: 25,
      },
      {
        agentId: "civitas",
        metric: "water",
        delta: 20,
        cost: 25,
        resource: "public-budget",
        units: 20,
      },
    ],
    [
      {
        agentId: "civitas",
        metric: "medical",
        delta: 20,
        cost: 35,
        resource: "emergency-capacity",
        units: 20,
      },
      {
        agentId: "civitas",
        metric: "energy",
        delta: 15,
        cost: 25,
        resource: "energy-reserve",
        units: 15,
      },
    ],
  ],
  "digital-network": [
    [
      {
        agentId: "spectre",
        metric: "internet",
        delta: 40,
        cost: 45,
        resource: "network-capacity",
        units: 35,
      },
      {
        agentId: "civitas",
        metric: "medical",
        delta: 15,
        cost: 25,
        resource: "emergency-capacity",
        units: 15,
      },
    ],
    [
      {
        agentId: "atlas",
        metric: "crime",
        delta: -20,
        cost: 30,
        resource: "emergency-capacity",
        units: 20,
      },
      {
        agentId: "spectre",
        metric: "internet",
        delta: 25,
        cost: 30,
        resource: "network-capacity",
        units: 20,
      },
    ],
  ],
};

const ALLOWED_ACTION_KEYS = new Set([
  "schemaVersion",
  "id",
  "kind",
  "agentId",
  "capability",
  "metric",
  "delta",
  "cost",
  "expectedDelayTicks",
  "preconditions",
  "resources",
  "reversibility",
]);

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

function actionFromTemplate(
  candidateId: string,
  index: number,
  template: ActionTemplate,
): InterventionAction {
  return {
    schemaVersion: INTERVENTION_SCHEMA_VERSION,
    id: `${candidateId}-action-${index + 1}`,
    kind: "adjust-city-metric",
    agentId: template.agentId,
    capability: `metric:${template.metric}`,
    metric: template.metric,
    delta: template.delta,
    cost: template.cost,
    expectedDelayTicks: 1,
    preconditions: [],
    resources: [
      {
        resource: template.resource,
        units: template.units,
        exclusive: false,
      },
    ],
    reversibility: {
      reversible: true,
      inverse: {
        metric: template.metric,
        delta: -template.delta,
      },
    },
  };
}

export function validateInterventionAction(
  action: InterventionAction,
): string[] {
  const errors: string[] = [];
  const unknownKeys = Object.keys(action).filter(
    (key) => !ALLOWED_ACTION_KEYS.has(key),
  );
  if (unknownKeys.length > 0) {
    errors.push(`Unknown action fields: ${unknownKeys.join(", ")}`);
  }
  if (action.schemaVersion !== INTERVENTION_SCHEMA_VERSION) {
    errors.push("Unsupported intervention schema version");
  }
  if (action.kind !== "adjust-city-metric") {
    errors.push("Only declarative adjust-city-metric actions are allowed");
  }
  if (
    !AGENT_DEFINITIONS[action.agentId]?.capabilities.includes(
      action.metric,
    )
  ) {
    errors.push(
      `${action.agentId} lacks capability for ${action.metric}`,
    );
  }
  if (action.capability !== `metric:${action.metric}`) {
    errors.push("Capability must exactly match the target metric");
  }
  if (!Number.isFinite(action.delta) || Math.abs(action.delta) > 2_000) {
    errors.push("Action delta is outside the bounded DSL range");
  }
  if (!Number.isFinite(action.cost) || action.cost < 0) {
    errors.push("Action cost must be a finite non-negative number");
  }
  if (
    action.reversibility.reversible &&
    (
      action.reversibility.inverse.metric !== action.metric ||
      action.reversibility.inverse.delta !== -action.delta
    )
  ) {
    errors.push("Reversible actions require an exact inverse");
  }
  if (
    !action.reversibility.reversible &&
    !action.reversibility.justification.trim()
  ) {
    errors.push("Irreversible actions require justification");
  }
  if (
    action.resources.some(
      (claim) =>
        !Number.isFinite(claim.units) || claim.units <= 0,
    )
  ) {
    errors.push("Resource claims must use positive finite units");
  }
  return errors;
}

export function validateInterventionCandidate(
  candidate: InterventionCandidate,
): string[] {
  const errors = candidate.actions.flatMap(validateInterventionAction);
  if (
    candidate.provenance.length === 0 ||
    candidate.provenance.some(
      (provenance) =>
        !provenance.sourceId.trim() ||
        !provenance.actorId.trim(),
    )
  ) {
    errors.push("Candidate provenance is required");
  }
  if (
    candidate.provenance.some(
      (provenance) => provenance.source === "no-action",
    ) &&
    candidate.actions.length > 0
  ) {
    errors.push("No-action candidate cannot contain actions");
  }
  if (
    candidate.actions.length === 0 &&
    !candidate.provenance.some(
      (provenance) => provenance.source === "no-action",
    )
  ) {
    errors.push("Non-baseline candidates require at least one action");
  }
  return [...new Set(errors)];
}

function candidateFingerprint(
  actions: InterventionAction[],
): string {
  return hash(
    actions
      .map((action) => ({
        kind: action.kind,
        agentId: action.agentId,
        metric: action.metric,
        delta: action.delta,
        resources: action.resources,
        reversibility: action.reversibility,
      }))
      .sort((left, right) =>
        stableStringify(left).localeCompare(stableStringify(right)),
      ),
  );
}

function defaultCandidates(
  input: BuildPlanningInput,
): InterventionCandidate[] {
  const family = input.diagnosis.hypotheses[0]?.family;
  const templates =
    FAMILY_ACTIONS[family] ?? FAMILY_ACTIONS.infrastructure;
  const noAction: InterventionCandidate = {
    id: `${input.planId ?? `plan-${input.diagnosis.id}`}-no-action`,
    name: "No action",
    description:
      "Observe the frozen baseline without applying an intervention.",
    provenance: [
      {
        source: "no-action",
        sourceId: "required-no-action-baseline",
        actorId: "system:experiment-designer",
        submittedAt: input.createdAt,
      },
    ],
    actions: [],
    equivalenceFingerprint: candidateFingerprint([]),
    risk: "low",
    cost: 0,
    expectedInformationGain: 0.35,
    expectedBenefit: 0,
    expectedGroupImpacts: input.stakeholderImpacts.map((impact) => ({
      groupId: impact.groupId,
      expectedDelta: 0,
      protected: impact.vulnerability !== "standard",
      synthetic: true,
    })),
    valid: true,
    validationErrors: [],
    paretoStatus: "frontier",
    dominatedByIds: [],
    rejectionReasons: [],
  };
  const interventions = templates.map((actionTemplates, index) => {
    const id = `${input.planId ?? `plan-${input.diagnosis.id}`}-candidate-${index + 1}`;
    const actions = actionTemplates.map((template, actionIndex) =>
      actionFromTemplate(id, actionIndex, template),
    );
    const candidate: InterventionCandidate = {
      id,
      name:
        index === 0
          ? "Direct cause stabilization"
          : "Protected-service resilience",
      description:
        index === 0
          ? "Act on the leading mechanism with bounded reversible controls."
          : "Protect dependent services while preserving an alternative response.",
      provenance: [
        {
          source:
            index === 0
              ? "deterministic-rule"
              : "validated-model-proposal",
          sourceId:
            index === 0
              ? "planning-policy-1.0.0"
              : "deterministic-model-candidate-1",
          actorId:
            index === 0
              ? "system:planning-policy"
              : "model:deterministic-mock",
          submittedAt: input.createdAt,
        },
      ],
      actions,
      equivalenceFingerprint: candidateFingerprint(actions),
      risk: index === 0 ? "medium" : "low",
      cost: actions.reduce((sum, action) => sum + action.cost, 0),
      expectedInformationGain: index === 0 ? 0.82 : 0.68,
      expectedBenefit: index === 0 ? 0.78 : 0.6,
      expectedGroupImpacts: input.stakeholderImpacts.map(
        (impact) => ({
          groupId: impact.groupId,
          expectedDelta:
            index === 0
              ? impact.vulnerability === "standard"
                ? 5
                : 8
              : impact.vulnerability === "standard"
                ? 3
                : 7,
          protected: impact.vulnerability !== "standard",
          synthetic: true,
        }),
      ),
      valid: true,
      validationErrors: [],
      paretoStatus: "frontier",
      dominatedByIds: [],
      rejectionReasons: [],
    };
    const validationErrors =
      validateInterventionCandidate(candidate);
    return {
      ...candidate,
      valid: validationErrors.length === 0,
      validationErrors,
    };
  });
  return [noAction, ...interventions];
}

export function deduplicateCandidates(
  candidates: InterventionCandidate[],
): InterventionCandidate[] {
  const byFingerprint = new Map<string, InterventionCandidate>();
  for (const candidate of candidates) {
    const existing = byFingerprint.get(
      candidate.equivalenceFingerprint,
    );
    if (!existing) {
      byFingerprint.set(
        candidate.equivalenceFingerprint,
        structuredClone(candidate),
      );
      continue;
    }
    existing.provenance.push(...candidate.provenance);
    existing.provenance = existing.provenance.filter(
      (provenance, index, all) =>
        all.findIndex(
          (item) =>
            item.source === provenance.source &&
            item.sourceId === provenance.sourceId &&
            item.actorId === provenance.actorId,
        ) === index,
    );
  }
  return [...byFingerprint.values()];
}

function dominates(
  left: InterventionCandidate,
  right: InterventionCandidate,
): boolean {
  const leftMinimumGroup = Math.min(
    ...left.expectedGroupImpacts.map(
      (impact) => impact.expectedDelta,
    ),
    0,
  );
  const rightMinimumGroup = Math.min(
    ...right.expectedGroupImpacts.map(
      (impact) => impact.expectedDelta,
    ),
    0,
  );
  const riskScore = { low: 1, medium: 2, high: 3 };
  const noWorse =
    left.expectedBenefit >= right.expectedBenefit &&
    left.cost <= right.cost &&
    riskScore[left.risk] <= riskScore[right.risk] &&
    leftMinimumGroup >= rightMinimumGroup;
  const strictlyBetter =
    left.expectedBenefit > right.expectedBenefit ||
    left.cost < right.cost ||
    riskScore[left.risk] < riskScore[right.risk] ||
    leftMinimumGroup > rightMinimumGroup;
  return noWorse && strictlyBetter;
}

export function markParetoFrontier(
  candidates: InterventionCandidate[],
): InterventionCandidate[] {
  return candidates.map((candidate) => {
    const dominatedByIds = candidates
      .filter(
        (other) =>
          other.id !== candidate.id &&
          other.valid &&
          dominates(other, candidate),
      )
      .map((other) => other.id);
    return {
      ...candidate,
      paretoStatus:
        dominatedByIds.length === 0 ? "frontier" : "dominated",
      dominatedByIds,
      rejectionReasons: [
        ...candidate.rejectionReasons,
        ...(
          dominatedByIds.length > 0
            ? [`Dominated by ${dominatedByIds.join(", ")}.`]
            : []
        ),
      ],
    };
  });
}

export function requiredPlanningApprovals(
  candidate: InterventionCandidate,
): 1 | 2 {
  return candidate.risk === "high" ||
    candidate.actions.some(
      (action) => !action.reversibility.reversible,
    )
    ? 2
    : 1;
}

function targetFromDiagnosis(
  diagnosis: CausalDiagnosis,
): {
  metric: SimulationMetric;
  direction: "increase" | "decrease";
} {
  const fact = diagnosis.evidence.find(
    (evidence) =>
      evidence.classification === "fact" && evidence.metric,
  );
  const metric = fact?.metric ?? "energy";
  const incidentEvidence = diagnosis.incidentSummary.toLowerCase();
  const direction: "increase" | "decrease" =
    (
      ["crime", "traffic", "pollution"].includes(metric) ||
      incidentEvidence.includes("above")
    )
      ? "decrease"
      : "increase";
  return { metric, direction };
}

export function designInterventionExperiment(
  input: BuildPlanningInput,
  planId: string,
  candidates: InterventionCandidate[],
): InterventionExperimentDesign {
  const target = targetFromDiagnosis(input.diagnosis);
  return {
    schemaVersion: EXPERIMENT_DESIGN_SCHEMA_VERSION,
    id: `experiment-design-${planId}`,
    planId,
    baselineCandidateId: candidates.find(
      (candidate) => candidate.actions.length === 0,
    )!.id,
    candidateIds: candidates
      .filter((candidate) => candidate.actions.length > 0)
      .map((candidate) => candidate.id),
    seeds: Array.from(
      { length: 5 },
      (_, index) => `${input.scenarioSeed}-experiment-${index + 1}`,
    ),
    horizonTicks: 60,
    samplingTicks: [1, 15, 30, 60],
    targetMetric: target.metric,
    targetDirection: target.direction,
    frozenObjectiveIds: input.objectives.map(
      (objective) => objective.id,
    ),
    frozenGuardrailIds: input.guardrails.map(
      (guardrail) => guardrail.id,
    ),
    stoppingRules: [
      {
        id: "stop-guardrail",
        type: "guardrail-breach",
        threshold: 1,
        evaluation: "Stop on the first sampled hard guardrail breach.",
        action: "stop-and-reject",
      },
      {
        id: "stop-budget",
        type: "budget-exhausted",
        threshold: input.maximumCost ?? 150,
        evaluation: "Stop before reserved cost exceeds the frozen budget.",
        action: "stop-and-reject",
      },
      {
        id: "stop-benefit",
        type: "benefit-reached",
        threshold: 0.05,
        evaluation: "Permit early acceptance after minimum seeds and positive paired effect.",
        action: "stop-and-accept",
      },
      {
        id: "stop-futility",
        type: "futility",
        threshold: 0,
        evaluation: "Reject after minimum seeds when paired mean cannot improve the target.",
        action: "stop-and-reject",
      },
    ],
    multipleComparisonMethod: "holm-bonferroni",
    regressionToMeanControl: "paired-frozen-baseline",
    naturalCycleControl: "same-seed-same-window",
    minimumCompletedSeeds: 3,
  };
}

function metricValue(
  world: WorldState,
  metric: string,
): number {
  const snapshot = projectCoherentCitySnapshot(world);
  return snapshot.metrics[
    metric as keyof typeof snapshot.metrics
  ].value;
}

function guardrailBreaches(
  world: WorldState,
  guardrails: CityGuardrail[],
  sampledAtTick: number,
): CandidateExperimentRun["guardrailBreaches"] {
  return guardrails.flatMap((guardrail) => {
    const value = metricValue(world, guardrail.metric);
    const breached =
      guardrail.comparison === "minimum"
        ? value < guardrail.threshold
        : value > guardrail.threshold;
    return breached
      ? [
          {
            guardrailId: guardrail.id,
            metric: guardrail.metric,
            value,
            threshold: guardrail.threshold,
            sampledAtTick,
          },
        ]
      : [];
  });
}

export function applyInterventionCandidate(
  world: WorldState,
  candidate: InterventionCandidate,
): WorldState {
  return candidate.actions.reduce((state, action) => {
    const preconditionsPass = action.preconditions.every(
      (precondition) => {
        const value = getMetric(state, precondition.metric);
        return precondition.comparison === "minimum"
          ? value >= precondition.threshold
          : value <= precondition.threshold;
      },
    );
    return preconditionsPass
      ? setMetric(
          state,
          action.metric,
          getMetric(state, action.metric) + action.delta,
        )
      : state;
  }, structuredClone(world));
}

function pairedTargetDelta(
  baseline: WorldState,
  candidate: WorldState,
  design: InterventionExperimentDesign,
): number {
  const baselineValue = getMetric(baseline, design.targetMetric);
  const candidateValue = getMetric(candidate, design.targetMetric);
  return design.targetDirection === "increase"
    ? candidateValue - baselineValue
    : baselineValue - candidateValue;
}

export function executeCandidateExperiment(
  input: BuildPlanningInput,
  design: InterventionExperimentDesign,
  candidate: InterventionCandidate,
): CandidateExperimentResult {
  const runs: CandidateExperimentRun[] = [];
  for (const seed of design.seeds) {
    const candidateInitial = applyInterventionCandidate(
      input.scenarioWorld,
      candidate,
    );
    const initialBreaches = guardrailBreaches(
      candidateInitial,
      input.guardrails,
      design.samplingTicks[0],
    );
    if (initialBreaches.length > 0) {
      const snapshot =
        projectCoherentCitySnapshot(candidateInitial);
      runs.push({
        id: `experiment-run-${candidate.id}-${seed}`,
        candidateId: candidate.id,
        seed,
        baselineFingerprint:
          projectCoherentCitySnapshot(input.scenarioWorld)
            .sourceWorldFingerprint,
        candidateFingerprint: snapshot.sourceWorldFingerprint,
        repeatedCandidateFingerprint:
          snapshot.sourceWorldFingerprint,
        targetDelta: pairedTargetDelta(
          input.scenarioWorld,
          candidateInitial,
          design,
        ),
        guardrailBreaches: initialBreaches,
        stoppedAtTick: design.samplingTicks[0],
        stopReason: "guardrail-breach",
        deterministicReplay: true,
      });
      continue;
    }
    const baseline = replaySimulation(
      input.scenarioWorld,
      {
        seed,
        policyVersion: input.scenarioPolicyVersion,
        configuration: input.scenarioConfiguration,
      },
      design.horizonTicks,
    );
    const candidateRun = replaySimulation(
      candidateInitial,
      {
        seed,
        policyVersion: input.scenarioPolicyVersion,
        configuration: input.scenarioConfiguration,
      },
      design.horizonTicks,
    );
    const repeated = replaySimulation(
      candidateInitial,
      {
        seed,
        policyVersion: input.scenarioPolicyVersion,
        configuration: input.scenarioConfiguration,
      },
      design.horizonTicks,
    );
    const finalBreaches = guardrailBreaches(
      candidateRun.state,
      input.guardrails,
      design.horizonTicks,
    );
    const immediateTargetDelta = pairedTargetDelta(
      input.scenarioWorld,
      candidateInitial,
      design,
    );
    const finalTargetDelta = pairedTargetDelta(
      baseline.state,
      candidateRun.state,
      design,
    );
    runs.push({
      id: `experiment-run-${candidate.id}-${seed}`,
      candidateId: candidate.id,
      seed,
      baselineFingerprint: baseline.fingerprint,
      candidateFingerprint: candidateRun.fingerprint,
      repeatedCandidateFingerprint: repeated.fingerprint,
      targetDelta: round(
        (immediateTargetDelta + finalTargetDelta) / 2,
      ),
      guardrailBreaches: finalBreaches,
      stoppedAtTick: design.horizonTicks,
      stopReason:
        finalBreaches.length > 0
          ? "guardrail-breach"
          : "completed",
      deterministicReplay:
        candidateRun.fingerprint === repeated.fingerprint,
    });
  }
  const completed = runs.filter(
    (run) => run.stopReason === "completed",
  );
  const meanTargetDelta =
    completed.length === 0
      ? 0
      : completed.reduce(
          (sum, run) => sum + run.targetDelta,
          0,
        ) / completed.length;
  const breachCount = runs.reduce(
    (sum, run) => sum + run.guardrailBreaches.length,
    0,
  );
  const noAction = candidate.actions.length === 0;
  const passed =
    breachCount === 0 &&
    runs.every((run) => run.deterministicReplay) &&
    (
      noAction ||
      (
        completed.length >= design.minimumCompletedSeeds &&
        meanTargetDelta > 0
      )
    );
  return {
    candidateId: candidate.id,
    runs,
    meanTargetDelta: round(meanTargetDelta),
    completedSeeds: completed.length,
    guardrailBreachCount: breachCount,
    deterministicReplayPercent:
      (
        runs.filter((run) => run.deterministicReplay).length /
        runs.length
      ) * 100,
    passed,
    conclusion: noAction
      ? "no-action-baseline"
      : breachCount > 0
        ? "guardrail-breach"
        : completed.length < design.minimumCompletedSeeds
          ? "inconclusive"
          : meanTargetDelta > 0
            ? "beneficial"
            : "harmful",
  };
}

export function scheduleInterventionCandidates(
  candidates: InterventionCandidate[],
  results: CandidateExperimentResult[],
  maximumCost: number,
  incidentSeverity: number,
): ScheduledExperiment[] {
  let reserved = 0;
  const reservedClaims: InterventionResourceClaim[] = [];
  const candidatesByScore = candidates
    .filter((candidate) => candidate.actions.length > 0)
    .map((candidate) => ({
      candidate,
      score:
        incidentSeverity * 0.3 +
        candidate.expectedInformationGain * 50 -
        candidate.cost * 0.2 -
        ({ low: 5, medium: 12, high: 25 })[candidate.risk],
    }))
    .sort((left, right) => right.score - left.score);
  return candidatesByScore.map(({ candidate, score }) => {
    const result = results.find(
      (item) => item.candidateId === candidate.id,
    );
    const resourceClaims = candidate.actions.flatMap(
      (action) => action.resources,
    );
    if (!candidate.valid || !result?.passed) {
      return {
        candidateId: candidate.id,
        isolatedWorldId: `isolated-${candidate.id}`,
        priorityScore: round(score),
        status: "rejected",
        reason: !candidate.valid
          ? candidate.validationErrors.join("; ")
          : `Experiment concluded ${result?.conclusion ?? "missing"}.`,
        resourceClaims,
      };
    }
    if (reserved + candidate.cost > maximumCost) {
      return {
        candidateId: candidate.id,
        isolatedWorldId: `isolated-${candidate.id}`,
        priorityScore: round(score),
        status: "queued",
        reason: "Frozen plan budget is insufficient for concurrent reservation.",
        resourceClaims,
      };
    }
    const conflictingClaim = resourceClaims.find((claim) => {
      const existing = reservedClaims.filter(
        (reservedClaim) =>
          reservedClaim.resource === claim.resource,
      );
      return (
        existing.some(
          (reservedClaim) =>
            reservedClaim.exclusive || claim.exclusive,
        ) ||
        existing.reduce(
          (sum, reservedClaim) =>
            sum + reservedClaim.units,
          0,
        ) +
          claim.units >
          100
      );
    });
    if (conflictingClaim) {
      return {
        candidateId: candidate.id,
        isolatedWorldId: `isolated-${candidate.id}`,
        priorityScore: round(score),
        status: "queued",
        reason: `${conflictingClaim.resource} is mutually exclusive or exceeds the frozen resource capacity.`,
        resourceClaims,
      };
    }
    reserved += candidate.cost;
    reservedClaims.push(...structuredClone(resourceClaims));
    return {
      candidateId: candidate.id,
      isolatedWorldId: `isolated-${candidate.id}`,
      priorityScore: round(score),
      status: "scheduled",
      reason: "Validated in an isolated world and reserved within budget.",
      resourceClaims,
    };
  });
}

function selectedCandidate(
  candidates: InterventionCandidate[],
  results: CandidateExperimentResult[],
): InterventionCandidate | undefined {
  return candidates
    .filter(
      (candidate) =>
        candidate.actions.length > 0 &&
        candidate.valid &&
        results.find(
          (result) => result.candidateId === candidate.id,
        )?.passed,
    )
    .sort((left, right) => {
      const leftResult = results.find(
        (result) => result.candidateId === left.id,
      )!;
      const rightResult = results.find(
        (result) => result.candidateId === right.id,
      )!;
      const leftUtility =
        leftResult.meanTargetDelta +
        left.expectedBenefit * 10 -
        left.cost * 0.05;
      const rightUtility =
        rightResult.meanTargetDelta +
        right.expectedBenefit * 10 -
        right.cost * 0.05;
      return rightUtility - leftUtility;
    })[0];
}

export function buildInterventionPlan(
  input: BuildPlanningInput,
): InterventionPlan {
  if (!input.diagnosis.experimentEligibility.eligible) {
    throw new Error(
      "Diagnosis is not eligible for intervention experiments",
    );
  }
  const planId =
    input.planId ?? `intervention-plan-${input.diagnosis.id}`;
  const defaults = defaultCandidates({ ...input, planId });
  const supplied = input.additionalCandidates ?? [];
  const validatedSupplied = supplied.map((candidate) => {
    const validationErrors =
      validateInterventionCandidate(candidate);
    return {
      ...candidate,
      valid: validationErrors.length === 0,
      validationErrors,
      equivalenceFingerprint: candidateFingerprint(
        candidate.actions,
      ),
    };
  });
  const candidates = markParetoFrontier(
    deduplicateCandidates([...defaults, ...validatedSupplied]),
  );
  const validInterventions = candidates.filter(
    (candidate) =>
      candidate.valid && candidate.actions.length > 0,
  );
  if (validInterventions.length < 2) {
    throw new Error(
      "Plan requires no-action plus at least two valid candidates",
    );
  }
  const design = designInterventionExperiment(
    input,
    planId,
    candidates,
  );
  const results = candidates.map((candidate) =>
    executeCandidateExperiment(input, design, candidate),
  );
  const maximumCost = input.maximumCost ?? 150;
  const severity = input.diagnosis.leadingConfidence * 100;
  const schedule = scheduleInterventionCandidates(
    candidates,
    results,
    maximumCost,
    severity,
  );
  const selected = selectedCandidate(candidates, results);
  const reservedCost = schedule
    .filter((item) => item.status === "scheduled")
    .reduce((sum, item) => {
      const candidate = candidates.find(
        (value) => value.id === item.candidateId,
      )!;
      return sum + candidate.cost;
    }, 0);
  const requiredApprovals = selected
    ? requiredPlanningApprovals(selected)
    : 1;
  const withoutFingerprint = {
    schemaVersion: INTERVENTION_PLAN_SCHEMA_VERSION,
    id: planId,
    correlationId: input.diagnosis.correlationId,
    causationId: input.diagnosis.id,
    diagnosis: {
      id: input.diagnosis.id,
      incidentId: input.diagnosis.incidentId,
      leadingConfidence: input.diagnosis.leadingConfidence,
      fingerprint: input.diagnosis.fingerprint,
      experimentEligibility:
        input.diagnosis.experimentEligibility,
    },
    status: "awaiting-approval" as const,
    createdAt: input.createdAt,
    policyVersion: "planning-policy-1.0.0",
    budget: {
      maximumCost,
      reservedCost,
      remainingCost: maximumCost - reservedCost,
    },
    context: {
      diagnosisId: input.diagnosis.id,
      diagnosisFingerprint: input.diagnosis.fingerprint,
      incidentId: input.diagnosis.incidentId,
      objectiveVersion:
        input.objectives[0]?.version ?? "unknown",
      guardrailVersion:
        input.guardrails[0]?.version ?? "unknown",
      objectives: structuredClone(input.objectives),
      guardrails: structuredClone(input.guardrails),
      stakeholderImpacts: structuredClone(
        input.stakeholderImpacts,
      ),
      frozenAt: input.createdAt,
    },
    candidates,
    design,
    results,
    schedule,
    decision: {
      selectedCandidateId: selected?.id,
      decision: "pending" as const,
      approvals: [],
      requiredApprovals,
      rationale: selected
        ? `Selected ${selected.name} for human review after paired multi-seed evidence; no action and every rejected alternative remain visible.`
        : "No candidate passed the frozen experiment and guardrail gates.",
      rejectedCandidates: candidates
        .filter((candidate) => candidate.id !== selected?.id)
        .map((candidate) => {
          const result = results.find(
            (item) => item.candidateId === candidate.id,
          );
          return {
            candidateId: candidate.id,
            reasons: [
              ...candidate.rejectionReasons,
              candidate.actions.length === 0
                ? "No-action remains the comparison baseline."
                : `Paired experiment concluded ${result?.conclusion ?? "missing"}.`,
              candidate.id === selected?.id
                ? ""
                : "Lower decision utility than the selected candidate.",
            ].filter(Boolean),
          };
        }),
    },
    synthetic: true as const,
  };
  return {
    ...withoutFingerprint,
    fingerprint: hash(withoutFingerprint),
  };
}

export function fingerprintInterventionPlan(
  plan: InterventionPlan,
): string {
  const content = Object.fromEntries(
    Object.entries(plan).filter(([key]) => key !== "fingerprint"),
  );
  return hash(content);
}
