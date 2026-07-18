import {
  createHash,
} from "node:crypto";
import {
  projectCoherentCitySnapshot,
} from "@/city/ontology";
import {
  stableStringify,
} from "@/simulation/core/random";
import {
  getMetric,
  setMetric,
} from "@/simulation/core/metrics";
import {
  replaySimulation,
} from "@/simulation/replay";
import {
  applyInterventionCandidate,
  validateInterventionCandidate,
} from "@/planning/engine";
import type {
  InterventionPlan,
} from "@/planning/types";
import {
  LEARNING_PROPOSAL_SCHEMA_VERSION,
  LESSON_SCHEMA_VERSION,
  OUTCOME_SCHEMA_VERSION,
  PLAYBOOK_SCHEMA_VERSION,
  type BuildOutcomeInput,
  type GovernedLearningProposal,
  type LateOutcomeEvidence,
  type LessonRecord,
  type OutcomeGuardrailObservation,
  type OutcomeRecord,
  type OutcomeVerdict,
  type OutcomeWindow,
  type OutcomeWindowEvaluation,
  type PlaybookApplicabilityAssessment,
  type ResponsePlaybook,
} from "./types";

const WINDOWS: Array<{
  window: OutcomeWindow;
  horizonTicks: number;
  confidence: number;
}> = [
  { window: "short", horizonTicks: 15, confidence: 0.68 },
  { window: "medium", horizonTicks: 60, confidence: 0.82 },
  { window: "long", horizonTicks: 180, confidence: 0.92 },
];

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

function fingerprinted<T extends { fingerprint: string }>(
  value: T,
): T {
  return {
    ...value,
    fingerprint: hash({ ...value, fingerprint: undefined }),
  };
}

function selectedCandidate(plan: InterventionPlan) {
  const candidate = plan.candidates.find(
    (item) => item.id === plan.decision.selectedCandidateId,
  );
  if (!candidate || candidate.actions.length === 0) {
    throw new Error(
      "Outcome evaluation requires a selected intervention candidate",
    );
  }
  return candidate;
}

function selectedResult(plan: InterventionPlan) {
  const result = plan.results.find(
    (item) => item.candidateId === plan.decision.selectedCandidateId,
  );
  if (!result?.passed) {
    throw new Error(
      "Outcome evaluation requires passing frozen experiment evidence",
    );
  }
  return result;
}

function applyLateEvidence(
  world: BuildOutcomeInput["scenarioWorld"],
  evidence: LateOutcomeEvidence[],
  horizonTicks: number,
) {
  return evidence
    .filter(
      (item) => item.appliesAtOrAfterTick <= horizonTicks,
    )
    .reduce(
      (state, item) =>
        setMetric(
          state,
          item.metric,
          getMetric(state, item.metric) + item.delta,
        ),
      structuredClone(world),
    );
}

function guardrailsFor(
  plan: InterventionPlan,
  world: BuildOutcomeInput["scenarioWorld"],
  baselineWorld: BuildOutcomeInput["scenarioWorld"],
): OutcomeGuardrailObservation[] {
  const snapshot = projectCoherentCitySnapshot(world);
  const baselineSnapshot =
    projectCoherentCitySnapshot(baselineWorld);
  return plan.context.guardrails.map((guardrail) => {
    const observedValue =
      snapshot.metrics[guardrail.metric].value;
    const baselineValue =
      baselineSnapshot.metrics[guardrail.metric].value;
    const baselineBreached =
      guardrail.comparison === "minimum"
        ? baselineValue < guardrail.threshold
        : baselineValue > guardrail.threshold;
    const breached =
      guardrail.comparison === "minimum"
        ? observedValue < guardrail.threshold
        : observedValue > guardrail.threshold;
    const materiallyWorseThanBaseline =
      guardrail.comparison === "minimum"
        ? observedValue < baselineValue - 0.5
        : observedValue > baselineValue + 0.5;
    return {
      guardrailId: guardrail.id,
      metric: guardrail.metric,
      comparison: guardrail.comparison,
      threshold: guardrail.threshold,
      baselineValue,
      baselineBreached,
      observedValue,
      breached,
      attributableBreach:
        breached &&
        (!baselineBreached || materiallyWorseThanBaseline),
      severity: guardrail.severity,
      groupIds: [...guardrail.groupIds],
    };
  });
}

function verdictFor(
  observedDelta: number,
  guardrails: OutcomeGuardrailObservation[],
  deterministicReplay: boolean,
): OutcomeVerdict {
  if (
    guardrails.some(
      (guardrail) =>
        guardrail.attributableBreach &&
        guardrail.severity === "critical",
    )
  ) {
    return "harmful";
  }
  if (!deterministicReplay) {
    return "inconclusive";
  }
  if (observedDelta >= 1) {
    return "beneficial";
  }
  if (observedDelta <= -1) {
    return "harmful";
  }
  return Math.abs(observedDelta) <= 0.25
    ? "neutral"
    : "inconclusive";
}

function evaluateWindow(
  input: BuildOutcomeInput,
  window: (typeof WINDOWS)[number],
): OutcomeWindowEvaluation {
  const candidate = selectedCandidate(input.plan);
  const result = selectedResult(input.plan);
  const context = {
    seed: `${input.scenarioSeed}-outcome-${window.window}`,
    policyVersion: input.scenarioPolicyVersion,
    configuration: input.scenarioConfiguration,
  };
  const baseline = replaySimulation(
    input.scenarioWorld,
    context,
    window.horizonTicks,
  );
  const candidateInitial = applyInterventionCandidate(
    input.scenarioWorld,
    candidate,
  );
  const candidateRun = replaySimulation(
    candidateInitial,
    context,
    window.horizonTicks,
  );
  const repeated = replaySimulation(
    candidateInitial,
    context,
    window.horizonTicks,
  );
  const observedState = applyLateEvidence(
    candidateRun.state,
    input.lateEvidence ?? [],
    window.horizonTicks,
  );
  const repeatedState = applyLateEvidence(
    repeated.state,
    input.lateEvidence ?? [],
    window.horizonTicks,
  );
  const baselineValue = getMetric(
    baseline.state,
    input.plan.design.targetMetric,
  );
  const candidateValue = getMetric(
    observedState,
    input.plan.design.targetMetric,
  );
  const observedDelta =
    input.plan.design.targetDirection === "increase"
      ? candidateValue - baselineValue
      : baselineValue - candidateValue;
  const guardrails = guardrailsFor(
    input.plan,
    observedState,
    baseline.state,
  );
  const observedFingerprint = hash({
    replay: candidateRun.fingerprint,
    state: observedState,
    lateEvidence: input.lateEvidence ?? [],
  });
  const repeatedObservedFingerprint = hash({
    replay: repeated.fingerprint,
    state: repeatedState,
    lateEvidence: input.lateEvidence ?? [],
  });
  const deterministicReplay =
    observedFingerprint === repeatedObservedFingerprint;
  const expectedDelta = result.meanTargetDelta;
  const effectScale =
    expectedDelta === 0 ? 0 : observedDelta / expectedDelta;
  return {
    id: `${input.plan.id}-outcome-${window.window}`,
    window: window.window,
    horizonTicks: window.horizonTicks,
    targetMetric: input.plan.design.targetMetric,
    targetDirection: input.plan.design.targetDirection,
    expectedDelta,
    observedDelta: round(observedDelta),
    predictionError: round(observedDelta - expectedDelta),
    comparisons: {
      frozenCounterfactualValue: round(baselineValue),
      observedCandidateValue: round(candidateValue),
      historicalSourceValue: round(
        getMetric(
          input.scenarioWorld,
          input.plan.design.targetMetric,
        ),
      ),
      sameSeedSeasonalValue: round(baselineValue),
    },
    groupEffects: candidate.expectedGroupImpacts.map(
      (impact) => ({
        ...impact,
        observedDelta: round(
          impact.expectedDelta * effectScale,
        ),
      }),
    ),
    guardrails,
    verdict: verdictFor(
      observedDelta,
      guardrails,
      deterministicReplay,
    ),
    confidence: deterministicReplay ? window.confidence : 0,
    baselineFingerprint: baseline.fingerprint,
    observedFingerprint,
    repeatedObservedFingerprint,
    deterministicReplay,
    evaluatedAt: input.evaluatedAt,
  };
}

function overallVerdict(
  windows: OutcomeWindowEvaluation[],
): OutcomeVerdict {
  if (
    windows.some(
      (window) =>
        window.verdict === "harmful" ||
        window.guardrails.some(
          (guardrail) =>
            guardrail.attributableBreach &&
            guardrail.severity === "critical",
        ),
    )
  ) {
    return "harmful";
  }
  const long = windows.find(
    (window) => window.window === "long",
  );
  if (
    long?.verdict === "beneficial" &&
    windows.every(
      (window) =>
        window.verdict === "beneficial" ||
        window.verdict === "neutral",
    )
  ) {
    return "beneficial";
  }
  return long?.verdict ?? "inconclusive";
}

export function fingerprintOutcome(
  outcome: OutcomeRecord,
): string {
  return hash({ ...outcome, fingerprint: undefined });
}

export function buildOutcome(
  input: BuildOutcomeInput,
): OutcomeRecord {
  if (input.plan.status !== "staged") {
    throw new Error(
      "Independent outcome evaluation requires a staged plan",
    );
  }
  const candidate = selectedCandidate(input.plan);
  const validationErrors =
    validateInterventionCandidate(candidate);
  if (validationErrors.length > 0) {
    throw new Error(
      `Selected intervention is no longer valid: ${validationErrors.join("; ")}`,
    );
  }
  const windows = WINDOWS.map((window) =>
    evaluateWindow(input, window),
  );
  const verdict = overallVerdict(windows);
  const revision = input.revision ?? 1;
  const outcome: OutcomeRecord = {
    schemaVersion: OUTCOME_SCHEMA_VERSION,
    id: `outcome-${input.plan.id}`,
    revision,
    correlationId: input.plan.correlationId,
    causationId: input.plan.id,
    planId: input.plan.id,
    incidentId: input.plan.context.incidentId,
    diagnosisId: input.plan.context.diagnosisId,
    selectedCandidateId: candidate.id,
    evaluator: {
      id: "independent-outcome-evaluator-v1",
      independentFromProposer: true,
      modelProvider: "deterministic-reference",
    },
    frozenContext: {
      planFingerprint: input.plan.fingerprint,
      diagnosisFingerprint:
        input.plan.context.diagnosisFingerprint,
      policyVersion: input.plan.policyVersion,
      objectiveVersion: input.plan.context.objectiveVersion,
      guardrailVersion: input.plan.context.guardrailVersion,
      sourceWorldFingerprint:
        projectCoherentCitySnapshot(input.scenarioWorld)
          .sourceWorldFingerprint,
      scenarioId: input.scenarioId,
      scenarioFamily: input.scenarioFamily,
    },
    status:
      (input.lateEvidence?.length ?? 0) > 0
        ? "reopened"
        : "completed",
    windows,
    lateEvidence: structuredClone(input.lateEvidence ?? []),
    verdict,
    lessonDisposition:
      verdict === "inconclusive"
        ? "insufficient-to-learn"
        : "lesson-created",
    reopenedIncident: (input.lateEvidence?.length ?? 0) > 0,
    evaluatedAt: input.evaluatedAt,
    syntheticBoundary:
      "Outcome effects are deterministic synthetic comparisons, not evidence that an intervention would affect a real city or population.",
    fingerprint: "",
  };
  outcome.fingerprint = fingerprintOutcome(outcome);
  return outcome;
}

export function deriveLesson(
  outcome: OutcomeRecord,
  previousLessonId?: string,
): LessonRecord {
  const long =
    outcome.windows.find((window) => window.window === "long") ??
    outcome.windows.at(-1);
  if (!long) {
    throw new Error("Outcome has no evaluation windows");
  }
  const recommendation =
    outcome.verdict === "beneficial"
      ? "prefer"
      : outcome.verdict === "harmful"
        ? "avoid"
        : "no-recommendation";
  const criticalAttributedHarm = outcome.windows.some(
    (window) =>
      window.guardrails.some(
        (guardrail) =>
          guardrail.attributableBreach &&
          guardrail.severity === "critical",
      ),
  );
  const lessonId = `lesson-${outcome.id}-r${outcome.revision}`;
  const lesson: LessonRecord = {
    schemaVersion: LESSON_SCHEMA_VERSION,
    id: lessonId,
    correlationId: outcome.correlationId,
    causationId: outcome.id,
    sourceOutcomeId: outcome.id,
    sourceOutcomeRevision: outcome.revision,
    sourceOutcomeFingerprint: outcome.fingerprint,
    planId: outcome.planId,
    incidentId: outcome.incidentId,
    selectedCandidateId: outcome.selectedCandidateId,
    kind:
      outcome.verdict === "beneficial"
        ? "success"
        : outcome.verdict === "harmful"
          ? criticalAttributedHarm
            ? "rollback"
            : "failure"
          : "inconclusive",
    recommendation,
    status:
      outcome.verdict === "beneficial" ||
      outcome.verdict === "harmful"
        ? "validated"
        : "draft",
    statement:
      outcome.verdict === "beneficial"
        ? `Prefer the bounded intervention only when the frozen ${outcome.frozenContext.scenarioFamily} context still applies.`
        : outcome.verdict === "harmful"
          ? "Avoid this intervention in the recorded context; harmful and guardrail evidence takes precedence over early improvement."
          : "Evidence is insufficient for a reusable recommendation.",
    applicability: {
      scenarioFamily: outcome.frozenContext.scenarioFamily,
      targetMetric: long.targetMetric,
      policyVersion: outcome.frozenContext.policyVersion,
      objectiveVersion: outcome.frozenContext.objectiveVersion,
      guardrailVersion: outcome.frozenContext.guardrailVersion,
      requiredPlanStatus: "staged",
    },
    invalidationConditions: [
      "A later observation reverses the long-horizon verdict.",
      "Diagnostic, objective, guardrail, policy, or ontology context changes.",
      "A protected group or critical guardrail shows previously missing harm.",
      "Deterministic replay or source evidence can no longer be verified.",
    ],
    observedEffect: long.observedDelta,
    predictionError: long.predictionError,
    confidence: long.confidence,
    evidenceSourceIds: [
      ...outcome.windows.map((window) => window.id),
      ...outcome.lateEvidence.map((evidence) => evidence.id),
    ],
    positiveRetrievalEligible:
      recommendation === "prefer" &&
      outcome.verdict === "beneficial",
    contradictionLessonIds: [],
    lineage: { previousLessonId },
    createdAt: outcome.evaluatedAt,
    updatedAt: outcome.evaluatedAt,
    synthetic: true,
    fingerprint: "",
  };
  return fingerprinted(lesson);
}

export function invalidateLesson(
  lesson: LessonRecord,
  evidenceId: string,
  updatedAt: string,
): LessonRecord {
  return fingerprinted({
    ...lesson,
    status: "invalidated",
    positiveRetrievalEligible: false,
    lineage: {
      ...lesson.lineage,
      invalidatedByEvidenceId: evidenceId,
    },
    updatedAt,
    fingerprint: "",
  });
}

export function deprecateLesson(
  lesson: LessonRecord,
  updatedAt: string,
): LessonRecord {
  if (lesson.status !== "validated") {
    throw new Error(
      "Only a validated lesson can be deprecated",
    );
  }
  return fingerprinted({
    ...lesson,
    status: "deprecated",
    positiveRetrievalEligible: false,
    updatedAt,
    fingerprint: "",
  });
}

export function buildResponsePlaybook(
  lesson: LessonRecord,
  plan: InterventionPlan,
  createdAt: string,
): ResponsePlaybook {
  if (
    lesson.status !== "validated" ||
    lesson.recommendation !== "prefer" ||
    !lesson.positiveRetrievalEligible
  ) {
    throw new Error(
      "Only a validated beneficial lesson can create an active playbook",
    );
  }
  const candidate = selectedCandidate(plan);
  return fingerprinted({
    schemaVersion: PLAYBOOK_SCHEMA_VERSION,
    id: `playbook-${lesson.id}`,
    sourceLessonIds: [lesson.id],
    status: "active",
    name: `${lesson.applicability.scenarioFamily} bounded response`,
    context: structuredClone(lesson.applicability),
    actions: structuredClone(candidate.actions),
    safeguards: {
      recheckContext: true,
      requireActiveDiagnosticTrust: true,
      requireCapabilityValidation: true,
      requireBudgetReservation: true,
      requireExperimentEvidence: true,
      requireHumanApproval: true,
    },
    createdAt,
    updatedAt: createdAt,
    synthetic: true,
    fingerprint: "",
  });
}

export function invalidatePlaybook(
  playbook: ResponsePlaybook,
  reason: string,
  updatedAt: string,
): ResponsePlaybook {
  return fingerprinted({
    ...playbook,
    status: "invalidated",
    invalidationReason: reason,
    updatedAt,
    fingerprint: "",
  });
}

export function assessPlaybookApplicability(input: {
  playbook: ResponsePlaybook;
  lesson: LessonRecord;
  plan: InterventionPlan;
  scenarioFamily: string;
  diagnosticTrustActive: boolean;
  assessedAt: string;
}): PlaybookApplicabilityAssessment {
  const candidate = selectedCandidate(input.plan);
  const result = selectedResult(input.plan);
  const schedule = input.plan.schedule.find(
    (item) => item.candidateId === candidate.id,
  );
  const gates = {
    lessonValid:
      input.playbook.status === "active" &&
      input.lesson.status === "validated" &&
      input.lesson.positiveRetrievalEligible,
    scenarioFamilyMatches:
      input.playbook.context.scenarioFamily ===
      input.scenarioFamily,
    policyMatches:
      input.playbook.context.policyVersion ===
      input.plan.policyVersion,
    objectiveMatches:
      input.playbook.context.objectiveVersion ===
      input.plan.context.objectiveVersion,
    guardrailMatches:
      input.playbook.context.guardrailVersion ===
      input.plan.context.guardrailVersion,
    diagnosticTrustActive: input.diagnosticTrustActive,
    capabilitiesValid:
      validateInterventionCandidate(candidate).length === 0,
    budgetReserved:
      schedule?.status === "scheduled" &&
      input.plan.budget.remainingCost >= 0,
    experimentPassed: result.passed,
    humanApprovalPresent:
      input.plan.decision.decision === "approved" &&
      input.plan.decision.approvals.length >=
        input.plan.decision.requiredApprovals,
  };
  const failures = Object.entries(gates)
    .filter(([, passed]) => !passed)
    .map(([gate]) => gate);
  return {
    schemaVersion: "nexus.playbook-applicability.v1",
    playbookId: input.playbook.id,
    assessedAt: input.assessedAt,
    gates,
    applicable: failures.length === 0,
    failures,
  };
}

export function buildGovernedLearningProposal(input: {
  lesson: LessonRecord;
  target: GovernedLearningProposal["target"];
  title: string;
  expectedImpact: string;
  actorId: string;
  createdAt: string;
}): GovernedLearningProposal {
  if (
    input.lesson.status !== "validated" ||
    input.lesson.recommendation === "no-recommendation"
  ) {
    throw new Error(
      "Only a validated directional lesson may propose a change",
    );
  }
  const proposal: GovernedLearningProposal = {
    schemaVersion: LEARNING_PROPOSAL_SCHEMA_VERSION,
    id: `learning-proposal-${input.lesson.id}-${input.target}`,
    sourceLessonIds: [input.lesson.id],
    target: input.target,
    title: input.title,
    evidenceSummary:
      `${input.lesson.statement} Source outcome ${input.lesson.sourceOutcomeId} ` +
      `effect ${input.lesson.observedEffect}, confidence ${input.lesson.confidence}.`,
    proposedChange: {
      kind: "declarative-change-request",
      scope: input.target,
      expectedImpact: input.expectedImpact,
    },
    status: "awaiting-release-governance",
    governanceRoute: "existing-controlled-iteration",
    requiredGates: [
      "regression-corpus",
      "public-scenarios",
      "isolated-evaluation",
      "human-approval",
      "staged-release",
    ],
    bypassAllowed: false,
    createdBy: input.actorId,
    createdAt: input.createdAt,
    synthetic: true,
    fingerprint: "",
  };
  return fingerprinted(proposal);
}

export function rebuildLessonRegistry(
  outcomes: OutcomeRecord[],
): LessonRecord[] {
  const latest = new Map<string, OutcomeRecord>();
  for (const outcome of [...outcomes].sort(
    (left, right) =>
      left.id.localeCompare(right.id) ||
      left.revision - right.revision,
  )) {
    latest.set(outcome.id, outcome);
  }
  const lessons = [...latest.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((outcome) => deriveLesson(outcome));
  return lessons.map((lesson) => {
    const contradictions = lessons
      .filter(
        (candidate) =>
          candidate.id !== lesson.id &&
          candidate.applicability.scenarioFamily ===
            lesson.applicability.scenarioFamily &&
          candidate.applicability.targetMetric ===
            lesson.applicability.targetMetric &&
          candidate.recommendation !== lesson.recommendation &&
          candidate.recommendation !== "no-recommendation",
      )
      .map((candidate) => candidate.id);
    return fingerprinted({
      ...lesson,
      contradictionLessonIds: contradictions,
      fingerprint: "",
    });
  });
}
