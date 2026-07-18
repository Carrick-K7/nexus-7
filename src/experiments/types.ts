import type {
  DomainEvent,
  SimulationRunExport,
} from "@/simulation";

export type ExperimentRole = "viewer" | "operator" | "admin";
export type ExperimentPrincipalType =
  | "human"
  | "service-account"
  | "system";
export type ExperimentPermission =
  | "workspace:read"
  | "workspace:admin"
  | "governance:read"
  | "memberships:manage"
  | "service-accounts:manage"
  | "policy:manage"
  | "operations:read"
  | "operations:write"
  | "alerts:manage"
  | "incidents:manage"
  | "notifications:manage"
  | "access-reviews:manage"
  | "break-glass:manage"
  | "runs:write"
  | "iterations:propose"
  | "iterations:approve"
  | "evidence:attach"
  | "evidence:ingest"
  | "models:propose"
  | "deployment:control"
  | "participation:read"
  | "participation:contribute"
  | "participation:moderate"
  | "participation:approve"
  | "closure:read"
  | "closure:operate"
  | "closure:control";
export type ExperimentStorageBackend = "memory" | "postgres";
export type ExperimentRunStatus = "paused" | "running" | "completed";
export type WorkloadIdentityKind =
  | "ci"
  | "worker"
  | "deployment-controller"
  | "development";

export interface ExperimentActor {
  id: string;
  role: ExperimentRole;
  authSource?: "oidc" | "proxy" | "development" | "system";
  issuer?: string;
  organizationId?: string;
  workspaceId?: string;
  serviceAccountId?: string;
  workloadKind?: WorkloadIdentityKind;
  permissionGrants?: ExperimentPermission[];
  delegatedPermissions?: ExperimentPermission[];
  principalType?: ExperimentPrincipalType;
}

export interface ExperimentWorkspace {
  id: string;
  name: string;
  createdAt: string;
}

export interface ExperimentSession {
  id: string;
  workspaceId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface ExperimentRun {
  id: string;
  workspaceId: string;
  sessionId: string;
  name: string;
  status: ExperimentRunStatus;
  version: number;
  parentRunId?: string;
  forkedFromTick?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  run: SimulationRunExport;
}

export interface ExperimentEventRecord {
  cursor: number;
  runId: string;
  tick: number;
  event: DomainEvent;
  recordedAt: string;
}

export interface ExperimentSnapshot {
  id: string;
  runId: string;
  tick: number;
  version: number;
  fingerprint: string;
  run: SimulationRunExport;
  createdAt: string;
}

export interface ExperimentAuditRecord {
  id: string;
  workspaceId: string;
  runId?: string;
  actorId: string;
  role: ExperimentRole;
  action:
    | "run.created"
    | "run.paused"
    | "run.resumed"
    | "run.stepped"
    | "run.forked"
    | "run.command.queued";
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface ExperimentWorkerLease {
  name: string;
  ownerId: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface ExperimentOverview {
  backend: ExperimentStorageBackend;
  workspace: ExperimentWorkspace;
  session: ExperimentSession;
  runs: ExperimentRun[];
}

export interface ExperimentReport {
  schemaVersion: 1;
  generatedAt: string;
  backend: ExperimentStorageBackend;
  run: {
    id: string;
    name: string;
    status: ExperimentRunStatus;
    version: number;
    tick: number;
    seed: string;
    policyVersion: string;
    parentRunId?: string;
    forkedFromTick?: number;
  };
  verification: {
    deterministicReplay: boolean;
    fingerprint: string;
    verifiedAutonomyLoopRate: number;
    causalTraceCompleteness: number;
    evaluationSuccessRate: number;
    rollbackCoverage: number;
    invariantViolations: string[];
  };
  storage: {
    eventCount: number;
    snapshotCount: number;
    auditCount: number;
    latestCursor: number;
  };
  artifacts: {
    run: SimulationRunExport;
    events: ExperimentEventRecord[];
    snapshots: ExperimentSnapshot[];
    audit: ExperimentAuditRecord[];
  };
}

export type ExperimentRunAction =
  | { type: "pause" }
  | { type: "resume" }
  | { type: "step" }
  | { type: "fork"; tick?: number; name?: string };
