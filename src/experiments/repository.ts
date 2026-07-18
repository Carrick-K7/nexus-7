import type {
  DomainEvent,
} from "@/simulation";
import type {
  ExperimentAuditRecord,
  ExperimentEventRecord,
  ExperimentRun,
  ExperimentSession,
  ExperimentSnapshot,
  ExperimentStorageBackend,
  ExperimentWorkerLease,
  ExperimentWorkspace,
} from "./types";
import type {
  ImprovementProposal,
  IterationDecisionRecord,
} from "@/iteration/types";
import type {
  AccessReviewCampaign,
  AccessReviewItem,
  BreakGlassRequest,
  DelegatedAdministrationGrant,
  GovernanceAuditRecord,
  GovernanceEvidenceRecord,
  GovernanceOrganization,
  GovernedWorkspace,
  ReleasePolicyRecord,
  ServiceAccount,
  WorkspaceMembership,
} from "@/governance/types";
import type {
  OperationalIntelligenceRepository,
} from "@/operations/intelligence-repository";
import type {
  LifecycleRepository,
} from "@/lifecycle/repository";

export interface CreateRunRecord {
  run: ExperimentRun;
  snapshot: ExperimentSnapshot;
  audit: ExperimentAuditRecord;
  initialEvents?: DomainEvent[];
}

export interface CommitRunRecord {
  run: ExperimentRun;
  expectedVersion: number;
  newEvents: DomainEvent[];
  snapshot?: ExperimentSnapshot;
  audit: ExperimentAuditRecord;
}

export interface ExperimentRepository
  extends OperationalIntelligenceRepository, LifecycleRepository {
  readonly backend: ExperimentStorageBackend;
  initialize(): Promise<void>;
  ensureWorkspace(workspace: ExperimentWorkspace): Promise<ExperimentWorkspace>;
  ensureSession(session: ExperimentSession): Promise<ExperimentSession>;
  createRun(record: CreateRunRecord): Promise<ExperimentRun>;
  commitRun(record: CommitRunRecord): Promise<ExperimentRun>;
  getRun(runId: string): Promise<ExperimentRun | null>;
  listRuns(workspaceId: string): Promise<ExperimentRun[]>;
  listRunningRuns(): Promise<ExperimentRun[]>;
  listEvents(
    runId: string,
    afterCursor?: number,
  ): Promise<ExperimentEventRecord[]>;
  listSnapshots(runId: string): Promise<ExperimentSnapshot[]>;
  listAudit(runId: string): Promise<ExperimentAuditRecord[]>;
  acquireWorkerLease(
    name: string,
    ownerId: string,
    ttlMs: number,
  ): Promise<boolean>;
  releaseWorkerLease(name: string, ownerId: string): Promise<void>;
  getWorkerLease(name: string): Promise<ExperimentWorkerLease | null>;
  createImprovement(
    proposal: ImprovementProposal,
    decision: Omit<IterationDecisionRecord, "cursor">,
  ): Promise<ImprovementProposal>;
  commitImprovement(
    proposal: ImprovementProposal,
    expectedRevision: number,
    decision: Omit<IterationDecisionRecord, "cursor">,
  ): Promise<ImprovementProposal>;
  getImprovement(proposalId: string): Promise<ImprovementProposal | null>;
  listImprovements(workspaceId: string): Promise<ImprovementProposal[]>;
  listIterationDecisions(
    proposalId: string,
  ): Promise<IterationDecisionRecord[]>;
  ensureOrganization(
    organization: GovernanceOrganization,
  ): Promise<GovernanceOrganization>;
  ensureGovernedWorkspace(
    workspace: GovernedWorkspace,
  ): Promise<GovernedWorkspace>;
  getOrganization(
    organizationId: string,
  ): Promise<GovernanceOrganization | null>;
  getGovernedWorkspace(
    workspaceId: string,
  ): Promise<GovernedWorkspace | null>;
  upsertWorkspaceMembership(
    membership: WorkspaceMembership,
  ): Promise<WorkspaceMembership>;
  getWorkspaceMembership(
    workspaceId: string,
    issuer: string,
    subject: string,
  ): Promise<WorkspaceMembership | null>;
  listWorkspaceMemberships(
    workspaceId: string,
  ): Promise<WorkspaceMembership[]>;
  createServiceAccount(account: ServiceAccount): Promise<ServiceAccount>;
  updateServiceAccount(
    account: ServiceAccount,
    expectedRevision: number,
  ): Promise<ServiceAccount>;
  touchServiceAccount(
    accountId: string,
    lastUsedAt: string,
  ): Promise<void>;
  getServiceAccount(
    accountId: string,
  ): Promise<ServiceAccount | null>;
  getServiceAccountBySubject(
    workspaceId: string,
    issuer: string,
    subject: string,
  ): Promise<ServiceAccount | null>;
  listServiceAccounts(workspaceId: string): Promise<ServiceAccount[]>;
  appendGovernanceAudit(
    record: GovernanceAuditRecord,
  ): Promise<GovernanceAuditRecord>;
  listGovernanceAudit(
    workspaceId: string,
    limit?: number,
  ): Promise<GovernanceAuditRecord[]>;
  storeGovernanceEvidence(
    record: GovernanceEvidenceRecord,
  ): Promise<GovernanceEvidenceRecord>;
  listGovernanceEvidence(
    workspaceId: string,
    limit?: number,
  ): Promise<GovernanceEvidenceRecord[]>;
  activateReleasePolicy(
    record: ReleasePolicyRecord,
  ): Promise<ReleasePolicyRecord>;
  getActiveReleasePolicy(
    workspaceId: string,
  ): Promise<ReleasePolicyRecord | null>;
  listReleasePolicies(
    workspaceId: string,
  ): Promise<ReleasePolicyRecord[]>;
  createDelegatedAdministrationGrant(
    grant: DelegatedAdministrationGrant,
  ): Promise<DelegatedAdministrationGrant>;
  updateDelegatedAdministrationGrant(
    grant: DelegatedAdministrationGrant,
    expectedRevision: number,
  ): Promise<DelegatedAdministrationGrant>;
  getDelegatedAdministrationGrant(
    grantId: string,
  ): Promise<DelegatedAdministrationGrant | null>;
  listDelegatedAdministrationGrants(
    workspaceId: string,
  ): Promise<DelegatedAdministrationGrant[]>;
  createAccessReviewCampaign(
    campaign: AccessReviewCampaign,
    items: AccessReviewItem[],
  ): Promise<AccessReviewCampaign>;
  updateAccessReviewCampaign(
    campaign: AccessReviewCampaign,
    expectedRevision: number,
  ): Promise<AccessReviewCampaign>;
  getAccessReviewCampaign(
    campaignId: string,
  ): Promise<AccessReviewCampaign | null>;
  listAccessReviewCampaigns(
    workspaceId: string,
  ): Promise<AccessReviewCampaign[]>;
  updateAccessReviewItem(
    item: AccessReviewItem,
    expectedRevision: number,
  ): Promise<AccessReviewItem>;
  listAccessReviewItems(
    workspaceId: string,
    campaignId?: string,
  ): Promise<AccessReviewItem[]>;
  createBreakGlassRequest(
    request: BreakGlassRequest,
  ): Promise<BreakGlassRequest>;
  updateBreakGlassRequest(
    request: BreakGlassRequest,
    expectedRevision: number,
  ): Promise<BreakGlassRequest>;
  getBreakGlassRequest(
    requestId: string,
  ): Promise<BreakGlassRequest | null>;
  listBreakGlassRequests(
    workspaceId: string,
  ): Promise<BreakGlassRequest[]>;
}
