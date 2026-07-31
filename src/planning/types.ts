import type {
  AgentId,
  SimulationMetric,
} from "@/simulation/types";
import type {
  CityGuardrail,
  CityObjective,
} from "@/city/model-types";
import type {
  SyntheticStakeholderImpact,
} from "@/city/types";
import type {
  CausalDiagnosis,
} from "@/diagnosis/types";
import type {
  LifecycleEvent,
} from "@/lifecycle";

export const INTERVENTION_SCHEMA_VERSION =
  "nexus.intervention.v1" as const;
export const EXPERIMENT_DESIGN_SCHEMA_VERSION =
  "nexus.intervention-experiment.v1" as const;
export const INTERVENTION_PLAN_SCHEMA_VERSION =
  "nexus.intervention-plan.v1" as const;

export type InterventionRisk = "low" | "medium" | "high";

export interface InterventionPrecondition {
  metric: SimulationMetric;
  comparison: "minimum" | "maximum";
  threshold: number;
}

export interface InterventionResourceClaim {
  resource:
    | "energy-reserve"
    | "emergency-capacity"
    | "network-capacity"
    | "public-budget";
  units: number;
  exclusive: boolean;
}

export interface InterventionAction {
  schemaVersion: typeof INTERVENTION_SCHEMA_VERSION;
  id: string;
  kind: "adjust-city-metric";
  agentId: Exclude<AgentId, "aria">;
  capability: `metric:${SimulationMetric}`;
  metric: SimulationMetric;
  delta: number;
  cost: number;
  expectedDelayTicks: number;
  preconditions: InterventionPrecondition[];
  resources: InterventionResourceClaim[];
  reversibility:
    | {
        reversible: true;
        inverse: {
          metric: SimulationMetric;
          delta: number;
        };
      }
    | {
        reversible: false;
        justification: string;
      };
}

export interface CandidateProvenance {
  source:
    | "no-action"
    | "deterministic-rule"
    | "validated-model-proposal"
    | "human";
  sourceId: string;
  actorId: string;
  submittedAt: string;
}

export interface InterventionCandidate {
  id: string;
  name: string;
  description: string;
  provenance: CandidateProvenance[];
  actions: InterventionAction[];
  equivalenceFingerprint: string;
  risk: InterventionRisk;
  cost: number;
  expectedInformationGain: number;
  expectedBenefit: number;
  expectedGroupImpacts: Array<{
    groupId: string;
    expectedDelta: number;
    protected: boolean;
    synthetic: true;
  }>;
  valid: boolean;
  validationErrors: string[];
  paretoStatus: "frontier" | "dominated";
  dominatedByIds: string[];
  rejectionReasons: string[];
}

export interface FrozenPlanningContext {
  diagnosisId: string;
  diagnosisFingerprint: string;
  incidentId: string;
  objectiveVersion: string;
  guardrailVersion: string;
  objectives: CityObjective[];
  guardrails: CityGuardrail[];
  stakeholderImpacts: SyntheticStakeholderImpact[];
  frozenAt: string;
}

export interface ExperimentStoppingRule {
  id: string;
  type:
    | "guardrail-breach"
    | "budget-exhausted"
    | "benefit-reached"
    | "futility";
  threshold: number;
  evaluation: string;
  action: "stop-and-reject" | "stop-and-accept";
}

export interface InterventionExperimentDesign {
  schemaVersion: typeof EXPERIMENT_DESIGN_SCHEMA_VERSION;
  id: string;
  planId: string;
  baselineCandidateId: string;
  candidateIds: string[];
  seeds: string[];
  horizonTicks: number;
  samplingTicks: number[];
  targetMetric: SimulationMetric;
  targetDirection: "increase" | "decrease";
  frozenObjectiveIds: string[];
  frozenGuardrailIds: string[];
  stoppingRules: ExperimentStoppingRule[];
  multipleComparisonMethod: "holm-bonferroni";
  regressionToMeanControl: "paired-frozen-baseline";
  naturalCycleControl: "same-seed-same-window";
  minimumCompletedSeeds: number;
}

export interface CandidateExperimentRun {
  id: string;
  candidateId: string;
  seed: string;
  baselineFingerprint: string;
  candidateFingerprint: string;
  repeatedCandidateFingerprint: string;
  targetDelta: number;
  guardrailBreaches: Array<{
    guardrailId: string;
    metric: string;
    value: number;
    threshold: number;
    sampledAtTick: number;
  }>;
  stoppedAtTick: number;
  stopReason:
    | "completed"
    | "guardrail-breach"
    | "budget-exhausted"
    | "futility"
    | "benefit-reached";
  deterministicReplay: boolean;
}

export interface CandidateExperimentResult {
  candidateId: string;
  runs: CandidateExperimentRun[];
  meanTargetDelta: number;
  completedSeeds: number;
  guardrailBreachCount: number;
  deterministicReplayPercent: number;
  passed: boolean;
  conclusion:
    | "beneficial"
    | "no-action-baseline"
    | "harmful"
    | "guardrail-breach"
    | "inconclusive";
}

export interface ScheduledExperiment {
  candidateId: string;
  isolatedWorldId: string;
  priorityScore: number;
  status: "scheduled" | "queued" | "rejected";
  reason: string;
  resourceClaims: InterventionResourceClaim[];
}

export interface PlanningApproval {
  actorId: string;
  role: "admin";
  approvedAt: string;
  note: string;
}

export interface PlanningDecision {
  selectedCandidateId?: string;
  decision:
    | "pending"
    | "approved"
    | "rejected"
    | "evidence-requested";
  approvals: PlanningApproval[];
  requiredApprovals: number;
  rationale: string;
  rejectedCandidates: Array<{
    candidateId: string;
    reasons: string[];
  }>;
  decidedAt?: string;
}

export interface InterventionPlan {
  schemaVersion: typeof INTERVENTION_PLAN_SCHEMA_VERSION;
  id: string;
  correlationId: string;
  causationId: string;
  diagnosis: Pick<
    CausalDiagnosis,
    | "id"
    | "incidentId"
    | "leadingConfidence"
    | "fingerprint"
    | "experimentEligibility"
  >;
  status:
    | "proposed"
    | "awaiting-approval"
    | "approved"
    | "staged"
    | "rejected"
    | "evidence-requested"
    | "stopped";
  createdAt: string;
  policyVersion: string;
  budget: {
    maximumCost: number;
    reservedCost: number;
    remainingCost: number;
  };
  context: FrozenPlanningContext;
  candidates: InterventionCandidate[];
  design: InterventionExperimentDesign;
  results: CandidateExperimentResult[];
  schedule: ScheduledExperiment[];
  decision: PlanningDecision;
  synthetic: true;
  fingerprint: string;
}

export interface PlanningOverview {
  schemaVersion: "nexus.planning-overview.v1";
  generatedAt: string;
  plans: InterventionPlan[];
  events: LifecycleEvent[];
  gates: {
    plansWithNoActionAndTwoCandidatesPercent: number;
    deterministicExperimentReplayPercent: number;
    firstSampleGuardrailStopPercent: number;
    stagedWithoutApprovalBudgetOrCapability: number;
  };
  evidenceBoundary: string;
}

export interface BuildPlanningInput {
  planId?: string;
  diagnosis: CausalDiagnosis;
  objectives: CityObjective[];
  guardrails: CityGuardrail[];
  stakeholderImpacts: SyntheticStakeholderImpact[];
  scenarioSeed: string;
  scenarioPolicyVersion: string;
  scenarioConfiguration: import("@/simulation/types").SimulationConfiguration;
  scenarioWorld: import("@/simulation/types").WorldState;
  createdAt: string;
  maximumCost?: number;
  additionalCandidates?: InterventionCandidate[];
}
