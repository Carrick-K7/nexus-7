import type {
  CityMetricCode,
} from "@/city/types";
import type {
  LifecycleEvent,
} from "@/lifecycle";
import type {
  InterventionAction,
  InterventionPlan,
} from "@/planning/types";
import type {
  SimulationMetric,
} from "@/simulation/types";

export const OUTCOME_SCHEMA_VERSION =
  "nexus.outcome.v1" as const;
export const LESSON_SCHEMA_VERSION =
  "nexus.lesson.v1" as const;
export const PLAYBOOK_SCHEMA_VERSION =
  "nexus.response-playbook.v1" as const;
export const LEARNING_PROPOSAL_SCHEMA_VERSION =
  "nexus.learning-proposal.v1" as const;
export const OUTCOME_LEARNING_ACCEPTANCE_SCHEMA_VERSION =
  "nexus.outcome-learning-acceptance.v1" as const;

export type OutcomeVerdict =
  | "beneficial"
  | "harmful"
  | "neutral"
  | "inconclusive";

export type OutcomeWindow = "short" | "medium" | "long";

export interface LateOutcomeEvidence {
  id: string;
  classification: "fact" | "human-judgment";
  source: string;
  metric: SimulationMetric;
  delta: number;
  observedAt: string;
  appliesAtOrAfterTick: number;
  rationale: string;
  synthetic: true;
}

export interface OutcomeGuardrailObservation {
  guardrailId: string;
  metric: CityMetricCode;
  comparison: "minimum" | "maximum";
  threshold: number;
  baselineValue: number;
  baselineBreached: boolean;
  observedValue: number;
  breached: boolean;
  attributableBreach: boolean;
  severity: "warning" | "critical";
  groupIds: string[];
}

export interface OutcomeWindowEvaluation {
  id: string;
  window: OutcomeWindow;
  horizonTicks: number;
  targetMetric: SimulationMetric;
  targetDirection: "increase" | "decrease";
  expectedDelta: number;
  observedDelta: number;
  predictionError: number;
  comparisons: {
    frozenCounterfactualValue: number;
    observedCandidateValue: number;
    historicalSourceValue: number;
    sameSeedSeasonalValue: number;
  };
  groupEffects: Array<{
    groupId: string;
    expectedDelta: number;
    observedDelta: number;
    protected: boolean;
    synthetic: true;
  }>;
  guardrails: OutcomeGuardrailObservation[];
  verdict: OutcomeVerdict;
  confidence: number;
  baselineFingerprint: string;
  observedFingerprint: string;
  repeatedObservedFingerprint: string;
  deterministicReplay: boolean;
  evaluatedAt: string;
}

export interface OutcomeRecord {
  schemaVersion: typeof OUTCOME_SCHEMA_VERSION;
  id: string;
  revision: number;
  correlationId: string;
  causationId: string;
  planId: string;
  incidentId: string;
  diagnosisId: string;
  selectedCandidateId: string;
  evaluator: {
    id: "independent-outcome-evaluator-v1";
    independentFromProposer: true;
    modelProvider: "deterministic-reference";
  };
  frozenContext: {
    planFingerprint: string;
    diagnosisFingerprint: string;
    policyVersion: string;
    objectiveVersion: string;
    guardrailVersion: string;
    sourceWorldFingerprint: string;
    scenarioId: string;
    scenarioFamily: string;
  };
  status: "monitoring" | "completed" | "reopened" | "under-review";
  windows: OutcomeWindowEvaluation[];
  lateEvidence: LateOutcomeEvidence[];
  verdict: OutcomeVerdict;
  lessonDisposition:
    | "lesson-created"
    | "insufficient-to-learn"
    | "requires-review";
  currentLessonId?: string;
  reopenedIncident: boolean;
  evaluatedAt: string;
  syntheticBoundary: string;
  fingerprint: string;
}

export type LessonStatus =
  | "draft"
  | "validated"
  | "deprecated"
  | "invalidated";

export interface LessonRecord {
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  id: string;
  correlationId: string;
  causationId: string;
  sourceOutcomeId: string;
  sourceOutcomeRevision: number;
  sourceOutcomeFingerprint: string;
  planId: string;
  incidentId: string;
  selectedCandidateId: string;
  kind: "success" | "failure" | "rollback" | "inconclusive";
  recommendation: "prefer" | "avoid" | "no-recommendation";
  status: LessonStatus;
  statement: string;
  applicability: {
    scenarioFamily: string;
    targetMetric: SimulationMetric;
    policyVersion: string;
    objectiveVersion: string;
    guardrailVersion: string;
    requiredPlanStatus: "staged";
  };
  invalidationConditions: string[];
  observedEffect: number;
  predictionError: number;
  confidence: number;
  evidenceSourceIds: string[];
  positiveRetrievalEligible: boolean;
  contradictionLessonIds: string[];
  lineage: {
    previousLessonId?: string;
    invalidatedByEvidenceId?: string;
  };
  createdAt: string;
  updatedAt: string;
  synthetic: true;
  fingerprint: string;
}

export interface ResponsePlaybook {
  schemaVersion: typeof PLAYBOOK_SCHEMA_VERSION;
  id: string;
  sourceLessonIds: string[];
  status: "active" | "review-required" | "invalidated";
  name: string;
  context: LessonRecord["applicability"];
  actions: InterventionAction[];
  safeguards: {
    recheckContext: true;
    requireActiveDiagnosticTrust: true;
    requireCapabilityValidation: true;
    requireBudgetReservation: true;
    requireExperimentEvidence: true;
    requireHumanApproval: true;
  };
  invalidationReason?: string;
  createdAt: string;
  updatedAt: string;
  synthetic: true;
  fingerprint: string;
}

export interface PlaybookApplicabilityAssessment {
  schemaVersion: "nexus.playbook-applicability.v1";
  playbookId: string;
  assessedAt: string;
  gates: {
    lessonValid: boolean;
    scenarioFamilyMatches: boolean;
    policyMatches: boolean;
    objectiveMatches: boolean;
    guardrailMatches: boolean;
    diagnosticTrustActive: boolean;
    capabilitiesValid: boolean;
    budgetReserved: boolean;
    experimentPassed: boolean;
    humanApprovalPresent: boolean;
  };
  applicable: boolean;
  failures: string[];
}

export type LearningProposalTarget =
  | "policy"
  | "prompt"
  | "scenario"
  | "test";

export interface GovernedLearningProposal {
  schemaVersion: typeof LEARNING_PROPOSAL_SCHEMA_VERSION;
  id: string;
  sourceLessonIds: string[];
  target: LearningProposalTarget;
  title: string;
  evidenceSummary: string;
  proposedChange: {
    kind: "declarative-change-request";
    scope: string;
    expectedImpact: string;
  };
  status: "awaiting-release-governance" | "rejected";
  governanceRoute: "existing-controlled-iteration";
  requiredGates: [
    "regression-corpus",
    "public-scenarios",
    "isolated-evaluation",
    "human-approval",
    "staged-release",
  ];
  bypassAllowed: false;
  createdBy: string;
  createdAt: string;
  synthetic: true;
  fingerprint: string;
}

export interface OutcomeLearningOverview {
  schemaVersion: "nexus.outcome-learning-overview.v1";
  generatedAt: string;
  outcomes: OutcomeRecord[];
  lessons: LessonRecord[];
  playbooks: ResponsePlaybook[];
  proposals: GovernedLearningProposal[];
  events: LifecycleEvent[];
  gates: {
    completedOutcomeLessonDispositionPercent: number;
    deterministicOutcomeReplayPercent: number;
    harmfulPositiveRetrievalCount: number;
    invalidLessonActivePlaybookCount: number;
    governedProposalBypassCount: number;
    resolvedIncidentOutcomeCoveragePercent: number;
  };
  contradictions: Array<{
    lessonIds: string[];
    context: string;
  }>;
  evidenceBoundary: string;
}

export interface BuildOutcomeInput {
  plan: InterventionPlan;
  scenarioId: string;
  scenarioFamily: string;
  scenarioSeed: string;
  scenarioPolicyVersion: string;
  scenarioConfiguration: import("@/simulation/types").SimulationConfiguration;
  scenarioWorld: import("@/simulation/types").WorldState;
  evaluatedAt: string;
  revision?: number;
  lateEvidence?: LateOutcomeEvidence[];
  previousLessonId?: string;
}

export interface OutcomeLearningAcceptanceReport {
  schemaVersion: typeof OUTCOME_LEARNING_ACCEPTANCE_SCHEMA_VERSION;
  generatedAt: string;
  checks: {
    evaluatorIndependent: boolean;
    threeDelayedWindows: boolean;
    frozenHistoricalSeasonalComparisons: boolean;
    verdictVocabularyCovered: boolean;
    lateHarmRecomputedAndIncidentReopened: boolean;
    allResultKindsRetained: boolean;
    lessonLifecycleCovered: boolean;
    harmfulNeverPositive: boolean;
    invalidationPropagatesToPlaybooks: boolean;
    playbookContextRechecked: boolean;
    governedChangeCannotBypassRelease: boolean;
    deterministicMemoryRebuild: boolean;
    closedIncidentDispositionComplete: boolean;
    humanAttributionReviewSupported: boolean;
    observerLearningSurfaceDeclared: boolean;
  };
  metrics: {
    outcomes: number;
    outcomeWindows: number;
    lessons: number;
    playbooks: number;
    governedProposals: number;
    verdictsCovered: number;
    deterministicReplayPercent: number;
    resolvedIncidentCoveragePercent: number;
    harmfulPositiveRetrievalCount: number;
  };
  failures: string[];
  passed: boolean;
  fingerprint: string;
}
