import type {
  LifecycleEvent,
} from "@/lifecycle";
import type {
  ReleaseEnvironment,
} from "@/governance/types";
import type {
  DeploymentCanaryHandle,
  DeploymentTelemetry,
} from "@/deployment/types";

export const CLOSED_LOOP_CASE_SCHEMA_VERSION =
  "nexus.closed-loop-case.v2" as const;
export const CLOSED_LOOP_EVIDENCE_SCHEMA_VERSION =
  "nexus.closed-loop-evidence.v2" as const;
export const CLOSED_LOOP_DEPLOYMENT_SCHEMA_VERSION =
  "nexus.deployment-record.v2" as const;
export const CLOSED_LOOP_CERTIFICATION_SCHEMA_VERSION =
  "nexus.closed-loop-certification.v2" as const;
export const EXTENSION_CONFORMANCE_SCHEMA_VERSION =
  "nexus.extension-conformance.v2" as const;

export const CLOSED_LOOP_STAGE_CODES = [
  "detection",
  "triage",
  "diagnosis",
  "planning",
  "experiment",
  "authorization",
  "deployment",
  "outcome",
  "learning",
  "closure",
] as const;

export type ClosedLoopStageCode =
  (typeof CLOSED_LOOP_STAGE_CODES)[number];

export type ClosedLoopStatus =
  | "detected"
  | "triaged"
  | "diagnosing"
  | "diagnosed"
  | "planned"
  | "experimenting"
  | "awaiting-approval"
  | "staged"
  | "monitoring"
  | "verified-beneficial"
  | "rolled-back"
  | "inconclusive"
  | "learned"
  | "closed"
  | "paused"
  | "blocked"
  | "cancelled"
  | "emergency-stopped"
  | "reopened";

export type ClosedLoopDisposition =
  | "beneficial"
  | "rolled-back"
  | "no-action"
  | "inconclusive"
  | "governance-denied"
  | "cancelled";

export type ClosedLoopEvidenceKind =
  | "observation"
  | "incident"
  | "triage"
  | "hypothesis"
  | "counterfactual"
  | "plan"
  | "experiment"
  | "approval"
  | "artifact-binding"
  | "deployment-telemetry"
  | "rollback"
  | "outcome"
  | "lesson"
  | "learning-proposal"
  | "closure"
  | "no-action"
  | "governance-denial";

export interface ClosedLoopReleaseArtifact {
  schemaVersion: "nexus.release-artifact-binding.v2";
  packageVersion: string;
  repository: string;
  commitSha: string;
  dirty: boolean;
  artifactDigest: string;
  evidenceManifestFingerprint: string;
  trust:
    | "local-uncommitted"
    | "local-committed"
    | "external-attested";
  externalAttestation?: {
    receiptId: string;
    provider: string;
    verifiedAt: string;
    expiresAt: string;
    verified: true;
  };
  boundAt: string;
  fingerprint: string;
}

export interface ClosedLoopEvidence {
  schemaVersion: typeof CLOSED_LOOP_EVIDENCE_SCHEMA_VERSION;
  id: string;
  stage: ClosedLoopStageCode;
  kind: ClosedLoopEvidenceKind;
  sourceRecordId: string;
  correlationId: string;
  causationId?: string;
  releaseArtifactFingerprint: string;
  trust: "local-integrity" | "external-attested";
  payloadDigest: string;
  createdAt: string;
  expiresAt?: string;
  supersedesEvidenceId?: string;
  integrity: {
    algorithm: "sha256";
    digest: string;
    verified: true;
  };
}

export interface ClosedLoopStage {
  code: ClosedLoopStageCode;
  status:
    | "pending"
    | "active"
    | "completed"
    | "skipped"
    | "failed"
    | "compensated";
  owner: {
    kind: "human" | "system";
    role: "viewer" | "operator" | "admin" | "orchestrator";
    id: string;
  };
  deadlineAt: string;
  requiredEvidenceKinds: ClosedLoopEvidenceKind[];
  evidenceIds: string[];
  sourceRecordIds: string[];
  startedAt?: string;
  completedAt?: string;
  note?: string;
}

export interface ClosedLoopLinks {
  scenarioTruthId: string;
  incidentId?: string;
  diagnosisId?: string;
  planId?: string;
  deploymentId?: string;
  outcomeId?: string;
  lessonId?: string;
  learningProposalId?: string;
}

export interface ClosedLoopTransition {
  sequence: number;
  from: ClosedLoopStatus | "none";
  to: ClosedLoopStatus;
  actorId: string;
  command: string;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  evidenceIds: string[];
  occurredAt: string;
  digest: string;
}

export interface ClosedLoopIdempotencyEntry {
  key: string;
  commandDigest: string;
  command: string;
  resultingStatus: ClosedLoopStatus;
  resultingRevision: number;
  completedAt: string;
}

export interface ClosedLoopCompensation {
  id: string;
  trigger:
    | "manual-rollback"
    | "guardrail-breach"
    | "emergency-stop"
    | "cancel"
    | "deadline";
  action: "deployment-rollback" | "release-resources" | "no-external-action";
  sourceDeploymentId?: string;
  inverseEvidenceId?: string;
  status: "completed" | "not-required" | "failed";
  idempotencyKey: string;
  completedAt: string;
  detail: string;
}

export interface ClosedLoopCase {
  schemaVersion: typeof CLOSED_LOOP_CASE_SCHEMA_VERSION;
  id: string;
  organizationId: string;
  workspaceId: string;
  revision: number;
  status: ClosedLoopStatus;
  disposition?: ClosedLoopDisposition;
  title: string;
  scenarioId: string;
  scenarioFamily: string;
  eligibleProblem: boolean;
  detected: boolean;
  ownerId: string;
  correlationId: string;
  causationId: string;
  releaseArtifact: ClosedLoopReleaseArtifact;
  links: ClosedLoopLinks;
  stages: ClosedLoopStage[];
  evidence: ClosedLoopEvidence[];
  transitions: ClosedLoopTransition[];
  idempotency: ClosedLoopIdempotencyEntry[];
  compensations: ClosedLoopCompensation[];
  control: {
    resumeStatus?: ClosedLoopStatus;
    pausedBy?: string;
    pauseReason?: string;
    blockers: Array<{
      code: string;
      detail: string;
      since: string;
    }>;
    emergencyStop: boolean;
    reopenCount: number;
  };
  guardrails: {
    severeEscapeCount: number;
    rollbackRequired: boolean;
    rollbackCompleted: boolean;
    expiredEvidenceBypassCount: number;
  };
  groupImpacts: Array<{
    groupId: string;
    populationSharePercent: number;
    effect: number;
    protected: boolean;
    severeHarm: boolean;
    synthetic: true;
  }>;
  replay: {
    seed: string;
    policyVersion: string;
    sourceWorldFingerprint?: string;
    terminalFingerprint?: string;
    deterministic: boolean;
  };
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  syntheticBoundary: string;
  fingerprint: string;
}

export interface ClosedLoopDeploymentEnvironment {
  environment: ReleaseEnvironment;
  status:
    | "pending"
    | "canary"
    | "healthy"
    | "promoted"
    | "rolled-back"
    | "failed";
  handle?: DeploymentCanaryHandle;
  telemetry: DeploymentTelemetry[];
  startedAt?: string;
  completedAt?: string;
}

export interface ClosedLoopDeploymentRecord {
  schemaVersion: typeof CLOSED_LOOP_DEPLOYMENT_SCHEMA_VERSION;
  id: string;
  caseId: string;
  planId: string;
  correlationId: string;
  causationId: string;
  adapterId: string;
  artifact: ClosedLoopReleaseArtifact;
  environments: ClosedLoopDeploymentEnvironment[];
  status: "staged" | "monitoring" | "healthy" | "rolled-back" | "failed";
  rollbackReason?: string;
  createdAt: string;
  updatedAt: string;
  synthetic: true;
  fingerprint: string;
}

export interface ClosedLoopOverview {
  schemaVersion: "nexus.closed-loop-overview.v2";
  generatedAt: string;
  backend: "memory" | "postgres";
  cases: ClosedLoopCase[];
  deployments: ClosedLoopDeploymentRecord[];
  events: LifecycleEvent[];
  metrics: {
    totalCases: number;
    openCases: number;
    closedCases: number;
    beneficialClosures: number;
    rollbackRatePercent: number;
    humanVetoRatePercent: number;
    oldestUnresolvedHours: number;
    severeGuardrailEscapes: number;
  };
  syntheticBoundary: string;
}

export type CertificationAttack =
  | "none"
  | "wrong-diagnosis"
  | "late-harm"
  | "approval-denied"
  | "expired-evidence"
  | "malicious-input"
  | "injected-deployment-fault";

export interface ClosedLoopCertificationScenario {
  schemaVersion: "nexus.closed-loop-certification-scenario.v2";
  id: string;
  family:
    | "infrastructure"
    | "economic"
    | "public-safety"
    | "environment"
    | "digital-network";
  mode:
    | "normal"
    | "single-fault"
    | "cascade"
    | "conflicting-objectives"
    | "adversarial";
  sourceScenarioId: string;
  eligibleProblem: boolean;
  expectedDetected: boolean;
  expectedDisposition: ClosedLoopDisposition;
  attack: CertificationAttack;
  expectedSafeBehavior: string;
  requiredStageCodes: ClosedLoopStageCode[];
  fixedSeed: string;
  synthetic: true;
}

export interface ClosedLoopCertificationResult {
  scenarioId: string;
  family: ClosedLoopCertificationScenario["family"];
  eligibleProblem: boolean;
  detected: boolean;
  disposition: ClosedLoopDisposition;
  beneficialClosure: boolean;
  closed: boolean;
  stageCompletenessPercent: number;
  causalCompletenessPercent: number;
  deterministicReplay: boolean;
  rollbackRequired: boolean;
  rollbackCompleted: boolean;
  severeGuardrailEscapes: number;
  evidenceIntegrityPercent: number;
  expiredEvidenceBypassCount: number;
  humanVeto: boolean;
  unresolvedAgeHours: number;
  groupImpacts: ClosedLoopCase["groupImpacts"];
  fingerprint: string;
  passed: boolean;
  failures: string[];
}

export type ExtensionBoundary =
  | "agent"
  | "model-provider"
  | "scenario"
  | "repository"
  | "notification"
  | "deployment-controller"
  | "outcome-evaluator";

export interface ExtensionConformanceResult {
  boundary: ExtensionBoundary;
  contractVersion: string;
  referenceImplementation: string;
  checks: Record<string, boolean>;
  failureModesExercised: string[];
  capabilities: string[];
  dataAccess: string[];
  networkRequired: boolean;
  sandboxRequiredWhenUncertified: true;
  passed: boolean;
  fingerprint: string;
}

export interface ExtensionConformanceReport {
  schemaVersion: typeof EXTENSION_CONFORMANCE_SCHEMA_VERSION;
  generatedAt: string;
  results: ExtensionConformanceResult[];
  passedBoundaries: number;
  totalBoundaries: number;
  passed: boolean;
  fingerprint: string;
}

export const V2_THRESHOLDS = {
  verifiedBeneficialClosureRatePercent: 80,
  detectionCoveragePercent: 95,
  deterministicReplayPercent: 99.9,
  acceptedActionCausalCompletenessPercent: 100,
  injectedFaultRollbackPercent: 100,
  closedOutcomeDispositionPercent: 100,
  severeGuardrailEscapes: 0,
  evidenceIntegrityPercent: 100,
  expiredEvidenceBypassCount: 0,
  certificationCorpusCoveragePercent: 100,
} as const;

export interface ClosedLoopCertificationReport {
  schemaVersion: typeof CLOSED_LOOP_CERTIFICATION_SCHEMA_VERSION;
  generatedAt: string;
  thresholds: typeof V2_THRESHOLDS;
  releaseArtifact: ClosedLoopReleaseArtifact;
  corpus: {
    version: "nexus.closed-loop-corpus.v2";
    expectedScenarioCount: 25;
    executedScenarioCount: number;
    fingerprint: string;
    results: ClosedLoopCertificationResult[];
  };
  metrics: {
    verifiedBeneficialClosureRatePercent: number;
    detectionCoveragePercent: number;
    deterministicReplayPercent: number;
    acceptedActionCausalCompletenessPercent: number;
    injectedFaultRollbackPercent: number;
    closedOutcomeDispositionPercent: number;
    severeGuardrailEscapes: number;
    evidenceIntegrityPercent: number;
    expiredEvidenceBypassCount: number;
    certificationCorpusCoveragePercent: number;
  };
  antiGoodhart: {
    denominatorScenarioIds: string[];
    unresolved: {
      count: number;
      oldestHours: number;
      ageBuckets: {
        under24h: number;
        oneToSevenDays: number;
        overSevenDays: number;
      };
    };
    rollbackRatePercent: number;
    humanVetoRatePercent: number;
    groupImpactDistribution: Array<{
      groupId: string;
      observations: number;
      meanEffect: number;
      minimumEffect: number;
      severeHarmCount: number;
      protected: boolean;
    }>;
  };
  checks: {
    fixedCorpusComplete: boolean;
    everyStagePresent: boolean;
    missingStageRejected: boolean;
    forgedEvidenceRejected: boolean;
    wrongArtifactRejected: boolean;
    expiredEvidenceBlocked: boolean;
    idempotentResume: boolean;
    compensationComplete: boolean;
    referenceFlowUsesDurableDomainRecords: boolean;
    unifiedTraceReconstructible: boolean;
    v1CompatibilityPreserved: boolean;
    extensionsConform: boolean;
    localAndExternalTrustSeparated: boolean;
  };
  referenceFlow: {
    caseId: string;
    status: ClosedLoopStatus;
    disposition?: ClosedLoopDisposition;
    linkedRecordKinds: string[];
    stageCodes: ClosedLoopStageCode[];
    deterministicReplay: boolean;
    fingerprint: string;
  };
  extensions: ExtensionConformanceReport;
  externalEvidence: {
    status: "verified" | "pending" | "expired" | "mismatched";
    requiredForProduction: true;
    boundArtifactFingerprint: string;
    receiptId?: string;
    detail: string;
  };
  failures: string[];
  thresholdsMet: boolean;
  implementationComplete: boolean;
  productionVerified: boolean;
  status:
    | "implementation-complete"
    | "implementation-complete-external-evidence-pending"
    | "failed";
  fingerprint: string;
}
