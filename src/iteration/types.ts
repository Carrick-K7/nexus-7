import type {
  AgentId,
  CityMetricSnapshot,
  SimulationCommand,
  SimulationMetric,
} from "@/simulation";
import type {
  ExperimentRole,
} from "@/experiments/types";
import type {
  ExternalAttestationReceipt,
} from "@/evidence";
import type {
  DeploymentTelemetry,
} from "@/deployment";
import type {
  ReleaseEnvironment,
  ReleaseEnvironmentPolicy,
} from "@/governance/types";

export type ImprovementStatus =
  | "proposed"
  | "experimenting"
  | "pending-approval"
  | "approved"
  | "rejected"
  | "canary"
  | "promoted"
  | "rolled-back"
  | "failed";

export type QualityGateStatus =
  | "pending"
  | "passed"
  | "failed"
  | "not-applicable";

export interface QualityGateEvidence {
  gate:
    | "schema"
    | "capability"
    | "deterministic-replay"
    | "invariants"
    | "security"
    | "unit-tests"
    | "build"
    | "browser"
    | "external-provenance"
    | "deployment-monitoring";
  status: QualityGateStatus;
  detail: string;
  artifact?: string;
}

export interface ExperimentSpecification {
  id: string;
  targetMetric: SimulationMetric;
  direction: "increase" | "decrease";
  actorId: Exclude<AgentId, "aria">;
  delta: number;
  horizonTicks: number;
  minimumImprovement: number;
  maximumRegression: number;
  intervention: SimulationCommand;
}

export interface ImprovementEvaluation {
  baselineRunId: string;
  candidateRunId: string;
  baselineMetrics: CityMetricSnapshot;
  candidateMetrics: CityMetricSnapshot;
  targetImprovement: number;
  maximumObservedRegression: number;
  deterministicReplay: boolean;
  accepted: boolean;
  reasons: string[];
  completedAt: string;
}

export interface CanaryState {
  runId: string;
  baselineRunId?: string;
  status: "ready" | "monitoring" | "healthy" | "rollback-triggered";
  startedAt: string;
  startTick: number;
  observedTicks: number;
  observationWindow: number;
  startingMetric: number;
  latestMetric: number;
  rollbackThreshold: number;
  startingMetrics: CityMetricSnapshot;
  slo: {
    policy: {
      minimumVerifiedAutonomyLoopRate: number;
      maximumInvariantViolations: number;
      maximumWrongDirectionDelta: number;
      maximumProtectedMetricRegression: number;
      requireDeterministicReplay: boolean;
    };
    observation?: {
      observedAt: string;
      targetDirectionDelta: number;
      maximumProtectedMetricRegression: number;
      verifiedAutonomyLoopRate: number;
      deterministicReplay: boolean;
      invariantViolations: string[];
      breaches: string[];
    };
  };
  alerts: Array<{
    id: string;
    severity: "critical";
    code:
      | "wrong-direction"
      | "protected-regression"
      | "replay-failure"
      | "invariant-violation"
      | "verified-loop";
    message: string;
    triggeredAt: string;
    automaticAction: "discard-canary";
  }>;
  rollbackReason?: string;
}

export interface DeploymentReleaseState {
  adapterId: string;
  deploymentId: string;
  baselineRevision: string;
  candidateRevision: string;
  environment: ReleaseEnvironment;
  policyId: string;
  policyVersion: string;
  trafficStages: number[];
  status: "monitoring" | "healthy" | "rollback-triggered";
  trafficPercent: number;
  observationCount: number;
  observationWindow: number;
  startedAt: string;
  slo: {
    policy: {
      minimumRequestCount: number;
      maximumErrorRatePercent: number;
      maximumP95LatencyMs: number;
      minimumAvailabilityPercent: number;
    };
    samples: Array<
      DeploymentTelemetry & {
        breaches: string[];
      }
    >;
  };
  alerts: Array<{
    id: string;
    severity: "critical";
    code:
      | "insufficient-traffic"
      | "error-rate"
      | "latency"
      | "availability"
      | "platform-health";
    message: string;
    triggeredAt: string;
    automaticAction: "platform-rollback";
  }>;
  rollbackReason?: string;
}

export interface ImprovementProposal {
  id: string;
  workspaceId: string;
  sourceRunId: string;
  revision: number;
  status: ImprovementStatus;
  riskTier: "low" | "medium" | "high" | "critical";
  changeScope: "policy" | "code" | "deployment";
  title: string;
  hypothesis: string;
  trigger: {
    tick: number;
    metric: SimulationMetric;
    value: number;
    score: number;
    evidenceEventIds: string[];
  };
  specification: ExperimentSpecification;
  implementation: {
    branchName: string;
    kind: "policy-variant" | "code-branch" | "deployment-canary";
    summary: string;
    affectedArtifacts: string[];
  };
  releaseArtifact?: {
    name: string;
    repository: string;
    commitSha: string;
    evidenceManifestSha256: string;
    evidenceManifestFingerprint: string;
  };
  targetEnvironment?: ReleaseEnvironment;
  releasePolicy?: {
    policyId: string;
    version: string;
    signed: boolean;
    environment: ReleaseEnvironmentPolicy;
  };
  externalEvidence?: {
    receipt: ExternalAttestationReceipt;
    attachedBy: string;
    attachedAt: string;
  };
  qualityEvidence: QualityGateEvidence[];
  evaluation?: ImprovementEvaluation;
  approval?: {
    decision: "approved" | "rejected";
    actorId: string;
    role: ExperimentRole;
    rationale: string;
    decidedAt: string;
  };
  canary?: CanaryState;
  deployment?: DeploymentReleaseState;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IterationDecisionRecord {
  cursor: number;
  id: string;
  proposalId: string;
  type:
    | "proposal.created"
    | "experiment.started"
    | "experiment.completed"
    | "external-evidence.attached"
    | "approval.granted"
    | "approval.rejected"
    | "canary.started"
    | "rollback.drill.started"
    | "canary.observed"
    | "rollback.triggered"
    | "promotion.completed"
    | "workflow.failed";
  actorId: string;
  role: ExperimentRole;
  detail: Record<string, unknown>;
  createdAt: string;
}

export type ImprovementAction =
  | { type: "run-experiment" }
  | { type: "approve"; rationale?: string }
  | { type: "reject"; rationale?: string }
  | { type: "start-canary" }
  | { type: "observe-canary" }
  | { type: "drill-rollback" }
  | {
      type: "attach-external-evidence";
      receipt: ExternalAttestationReceipt;
    };

export interface ImprovementProposalOptions {
  changeScope?: ImprovementProposal["changeScope"];
  releaseArtifact?: ImprovementProposal["releaseArtifact"];
  targetEnvironment?: ReleaseEnvironment;
}
