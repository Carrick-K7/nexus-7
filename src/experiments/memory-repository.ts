import {
  ExperimentConflictError,
} from "./errors";
import type {
  CommitRunRecord,
  CreateRunRecord,
  ExperimentRepository,
} from "./repository";
import type {
  ExperimentAuditRecord,
  ExperimentEventRecord,
  ExperimentRun,
  ExperimentSession,
  ExperimentSnapshot,
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
  AlertSuppression,
  AlertOccurrence,
  AlertRule,
  MaintenanceWindow,
  NotificationChannel,
  NotificationDelivery,
  NotificationEscalationPolicy,
  NotificationReceipt,
  OperationalIncident,
  OperationsListQuery,
  SloSample,
  SloSampleQuery,
} from "@/operations/intelligence-types";
import {
  LIFECYCLE_EVENT_SCHEMA_VERSION,
  type CommitLifecycleRecordInput,
  type CreateLifecycleRecordInput,
  type LifecycleEvent,
  type LifecycleEventQuery,
  type LifecycleRecord,
  type LifecycleRecordQuery,
  type NewLifecycleEvent,
} from "@/lifecycle";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryExperimentRepository implements ExperimentRepository {
  readonly backend = "memory" as const;

  private readonly workspaces = new Map<string, ExperimentWorkspace>();
  private readonly sessions = new Map<string, ExperimentSession>();
  private readonly runs = new Map<string, ExperimentRun>();
  private readonly events = new Map<string, ExperimentEventRecord[]>();
  private readonly snapshots = new Map<string, ExperimentSnapshot[]>();
  private readonly audit = new Map<string, ExperimentAuditRecord[]>();
  private readonly workerLeases = new Map<string, ExperimentWorkerLease>();
  private readonly improvements = new Map<string, ImprovementProposal>();
  private readonly iterationDecisions = new Map<
    string,
    IterationDecisionRecord[]
  >();
  private readonly organizations = new Map<
    string,
    GovernanceOrganization
  >();
  private readonly governedWorkspaces = new Map<
    string,
    GovernedWorkspace
  >();
  private readonly workspaceMemberships = new Map<
    string,
    WorkspaceMembership
  >();
  private readonly serviceAccounts = new Map<string, ServiceAccount>();
  private readonly governanceAudit: GovernanceAuditRecord[] = [];
  private readonly governanceEvidence = new Map<
    string,
    GovernanceEvidenceRecord
  >();
  private readonly releasePolicies = new Map<
    string,
    ReleasePolicyRecord
  >();
  private readonly delegatedAdministrationGrants = new Map<
    string,
    DelegatedAdministrationGrant
  >();
  private readonly accessReviewCampaigns = new Map<
    string,
    AccessReviewCampaign
  >();
  private readonly accessReviewItems = new Map<
    string,
    AccessReviewItem
  >();
  private readonly breakGlassRequests = new Map<
    string,
    BreakGlassRequest
  >();
  private readonly sloSamples = new Map<string, SloSample>();
  private readonly alertRules = new Map<string, AlertRule>();
  private readonly operationalIncidents = new Map<
    string,
    OperationalIncident
  >();
  private readonly alertOccurrences: AlertOccurrence[] = [];
  private readonly notificationChannels = new Map<
    string,
    NotificationChannel
  >();
  private readonly notificationDeliveries = new Map<
    string,
    NotificationDelivery
  >();
  private readonly maintenanceWindows = new Map<
    string,
    MaintenanceWindow
  >();
  private readonly alertSuppressions = new Map<
    string,
    AlertSuppression
  >();
  private readonly notificationEscalationPolicies = new Map<
    string,
    NotificationEscalationPolicy
  >();
  private readonly notificationReceipts: NotificationReceipt[] = [];
  private readonly lifecycleRecords = new Map<string, LifecycleRecord>();
  private readonly lifecycleEvents: LifecycleEvent[] = [];
  private cursor = 0;
  private iterationCursor = 0;
  private governanceCursor = 0;

  async initialize(): Promise<void> {}

  async ensureWorkspace(
    workspace: ExperimentWorkspace,
  ): Promise<ExperimentWorkspace> {
    const existing = this.workspaces.get(workspace.id);
    if (existing) {
      return clone(existing);
    }
    this.workspaces.set(workspace.id, clone(workspace));
    return clone(workspace);
  }

  async ensureSession(
    session: ExperimentSession,
  ): Promise<ExperimentSession> {
    const existing = this.sessions.get(session.id);
    if (existing) {
      return clone(existing);
    }
    this.sessions.set(session.id, clone(session));
    return clone(session);
  }

  async createRun(record: CreateRunRecord): Promise<ExperimentRun> {
    if (this.runs.has(record.run.id)) {
      throw new ExperimentConflictError(`Run ${record.run.id} already exists`);
    }

    this.runs.set(record.run.id, clone(record.run));
    this.snapshots.set(record.run.id, [clone(record.snapshot)]);
    this.audit.set(record.run.id, [clone(record.audit)]);
    this.events.set(
      record.run.id,
      (record.initialEvents ?? []).map((event) => {
        this.cursor += 1;
        return {
          cursor: this.cursor,
          runId: record.run.id,
          tick: event.tick,
          event: clone(event),
          recordedAt: record.run.createdAt,
        };
      }),
    );
    return clone(record.run);
  }

  async commitRun(record: CommitRunRecord): Promise<ExperimentRun> {
    const current = this.runs.get(record.run.id);
    if (!current || current.version !== record.expectedVersion) {
      throw new ExperimentConflictError(
        `Run ${record.run.id} changed; expected version ${record.expectedVersion}`,
      );
    }

    this.runs.set(record.run.id, clone(record.run));
    const events = this.events.get(record.run.id) ?? [];
    for (const event of record.newEvents) {
      this.cursor += 1;
      events.push({
        cursor: this.cursor,
        runId: record.run.id,
        tick: event.tick,
        event: clone(event),
        recordedAt: record.run.updatedAt,
      });
    }
    this.events.set(record.run.id, events);

    if (record.snapshot) {
      const snapshots = this.snapshots.get(record.run.id) ?? [];
      snapshots.push(clone(record.snapshot));
      this.snapshots.set(record.run.id, snapshots);
    }

    const audit = this.audit.get(record.run.id) ?? [];
    audit.push(clone(record.audit));
    this.audit.set(record.run.id, audit);
    return clone(record.run);
  }

  async getRun(runId: string): Promise<ExperimentRun | null> {
    const run = this.runs.get(runId);
    return run ? clone(run) : null;
  }

  async listRuns(workspaceId: string): Promise<ExperimentRun[]> {
    return [...this.runs.values()]
      .filter((run) => run.workspaceId === workspaceId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(clone);
  }

  async listRunningRuns(): Promise<ExperimentRun[]> {
    return [...this.runs.values()]
      .filter((run) => run.status === "running")
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(clone);
  }

  async listEvents(
    runId: string,
    afterCursor = 0,
  ): Promise<ExperimentEventRecord[]> {
    return (this.events.get(runId) ?? [])
      .filter((record) => record.cursor > afterCursor)
      .map(clone);
  }

  async listSnapshots(runId: string): Promise<ExperimentSnapshot[]> {
    return (this.snapshots.get(runId) ?? []).map(clone);
  }

  async listAudit(runId: string): Promise<ExperimentAuditRecord[]> {
    return (this.audit.get(runId) ?? []).map(clone);
  }

  async acquireWorkerLease(
    name: string,
    ownerId: string,
    ttlMs: number,
  ): Promise<boolean> {
    const now = new Date();
    const current = this.workerLeases.get(name);
    if (
      current &&
      current.ownerId !== ownerId &&
      new Date(current.expiresAt).getTime() > now.getTime()
    ) {
      return false;
    }
    this.workerLeases.set(name, {
      name,
      ownerId,
      heartbeatAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    });
    return true;
  }

  async releaseWorkerLease(name: string, ownerId: string): Promise<void> {
    if (this.workerLeases.get(name)?.ownerId === ownerId) {
      this.workerLeases.delete(name);
    }
  }

  async getWorkerLease(
    name: string,
  ): Promise<ExperimentWorkerLease | null> {
    const lease = this.workerLeases.get(name);
    return lease ? clone(lease) : null;
  }

  async createImprovement(
    proposal: ImprovementProposal,
    decision: Omit<IterationDecisionRecord, "cursor">,
  ): Promise<ImprovementProposal> {
    if (this.improvements.has(proposal.id)) {
      throw new ExperimentConflictError(
        `Improvement ${proposal.id} already exists`,
      );
    }
    this.improvements.set(proposal.id, clone(proposal));
    this.iterationCursor += 1;
    this.iterationDecisions.set(proposal.id, [
      { ...clone(decision), cursor: this.iterationCursor },
    ]);
    return clone(proposal);
  }

  async commitImprovement(
    proposal: ImprovementProposal,
    expectedRevision: number,
    decision: Omit<IterationDecisionRecord, "cursor">,
  ): Promise<ImprovementProposal> {
    const current = this.improvements.get(proposal.id);
    if (!current || current.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Improvement ${proposal.id} changed; expected revision ${expectedRevision}`,
      );
    }
    this.improvements.set(proposal.id, clone(proposal));
    this.iterationCursor += 1;
    const decisions = this.iterationDecisions.get(proposal.id) ?? [];
    decisions.push({ ...clone(decision), cursor: this.iterationCursor });
    this.iterationDecisions.set(proposal.id, decisions);
    return clone(proposal);
  }

  async getImprovement(
    proposalId: string,
  ): Promise<ImprovementProposal | null> {
    const proposal = this.improvements.get(proposalId);
    return proposal ? clone(proposal) : null;
  }

  async listImprovements(
    workspaceId: string,
  ): Promise<ImprovementProposal[]> {
    return [...this.improvements.values()]
      .filter((proposal) => proposal.workspaceId === workspaceId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(clone);
  }

  async listIterationDecisions(
    proposalId: string,
  ): Promise<IterationDecisionRecord[]> {
    return (this.iterationDecisions.get(proposalId) ?? []).map(clone);
  }

  async ensureOrganization(
    organization: GovernanceOrganization,
  ): Promise<GovernanceOrganization> {
    const current = this.organizations.get(organization.id);
    const next = current
      ? {
          ...current,
          name: organization.name,
          updatedAt: organization.updatedAt,
        }
      : clone(organization);
    this.organizations.set(next.id, next);
    return clone(next);
  }

  async ensureGovernedWorkspace(
    workspace: GovernedWorkspace,
  ): Promise<GovernedWorkspace> {
    const current = this.governedWorkspaces.get(workspace.workspaceId);
    const next = current
      ? {
          ...current,
          organizationId: workspace.organizationId,
          updatedAt: workspace.updatedAt,
        }
      : clone(workspace);
    this.governedWorkspaces.set(next.workspaceId, next);
    return clone(next);
  }

  async getOrganization(
    organizationId: string,
  ): Promise<GovernanceOrganization | null> {
    const organization = this.organizations.get(organizationId);
    return organization ? clone(organization) : null;
  }

  async getGovernedWorkspace(
    workspaceId: string,
  ): Promise<GovernedWorkspace | null> {
    const workspace = this.governedWorkspaces.get(workspaceId);
    return workspace ? clone(workspace) : null;
  }

  async upsertWorkspaceMembership(
    membership: WorkspaceMembership,
  ): Promise<WorkspaceMembership> {
    const key =
      `${membership.workspaceId}:${membership.issuer}:${membership.subject}`;
    const current = this.workspaceMemberships.get(key);
    const next = current
      ? {
          ...membership,
          id: current.id,
          createdAt: current.createdAt,
          createdBy: current.createdBy,
        }
      : clone(membership);
    this.workspaceMemberships.set(key, next);
    return clone(next);
  }

  async getWorkspaceMembership(
    workspaceId: string,
    issuer: string,
    subject: string,
  ): Promise<WorkspaceMembership | null> {
    const membership = this.workspaceMemberships.get(
      `${workspaceId}:${issuer}:${subject}`,
    );
    return membership ? clone(membership) : null;
  }

  async listWorkspaceMemberships(
    workspaceId: string,
  ): Promise<WorkspaceMembership[]> {
    return [...this.workspaceMemberships.values()]
      .filter((membership) => membership.workspaceId === workspaceId)
      .sort((left, right) => left.subject.localeCompare(right.subject))
      .map(clone);
  }

  async createServiceAccount(
    account: ServiceAccount,
  ): Promise<ServiceAccount> {
    if (
      this.serviceAccounts.has(account.id) ||
      [...this.serviceAccounts.values()].some(
        (candidate) =>
          candidate.workspaceId === account.workspaceId &&
          candidate.issuer === account.issuer &&
          candidate.subject === account.subject,
      )
    ) {
      throw new ExperimentConflictError(
        `Service account ${account.subject} already exists`,
      );
    }
    this.serviceAccounts.set(account.id, clone(account));
    return clone(account);
  }

  async updateServiceAccount(
    account: ServiceAccount,
    expectedRevision: number,
  ): Promise<ServiceAccount> {
    const current = this.serviceAccounts.get(account.id);
    if (!current || current.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Service account ${account.id} changed; expected revision ${expectedRevision}`,
      );
    }
    this.serviceAccounts.set(account.id, clone(account));
    return clone(account);
  }

  async touchServiceAccount(
    accountId: string,
    lastUsedAt: string,
  ): Promise<void> {
    const account = this.serviceAccounts.get(accountId);
    if (account) {
      this.serviceAccounts.set(accountId, {
        ...account,
        lastUsedAt,
      });
    }
  }

  async getServiceAccount(
    accountId: string,
  ): Promise<ServiceAccount | null> {
    const account = this.serviceAccounts.get(accountId);
    return account ? clone(account) : null;
  }

  async getServiceAccountBySubject(
    workspaceId: string,
    issuer: string,
    subject: string,
  ): Promise<ServiceAccount | null> {
    const account = [...this.serviceAccounts.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId &&
        candidate.issuer === issuer &&
        candidate.subject === subject,
    );
    return account ? clone(account) : null;
  }

  async listServiceAccounts(
    workspaceId: string,
  ): Promise<ServiceAccount[]> {
    return [...this.serviceAccounts.values()]
      .filter((account) => account.workspaceId === workspaceId)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(clone);
  }

  async appendGovernanceAudit(
    record: GovernanceAuditRecord,
  ): Promise<GovernanceAuditRecord> {
    this.governanceCursor += 1;
    const stored = {
      ...clone(record),
      cursor: this.governanceCursor,
    };
    this.governanceAudit.push(stored);
    return clone(stored);
  }

  async listGovernanceAudit(
    workspaceId: string,
    limit = 100,
  ): Promise<GovernanceAuditRecord[]> {
    return this.governanceAudit
      .filter((record) => record.workspaceId === workspaceId)
      .slice(-Math.max(1, limit))
      .reverse()
      .map(clone);
  }

  async storeGovernanceEvidence(
    record: GovernanceEvidenceRecord,
  ): Promise<GovernanceEvidenceRecord> {
    const existing = [...this.governanceEvidence.values()].find(
      (candidate) =>
        candidate.workspaceId === record.workspaceId &&
        candidate.kind === record.kind &&
        candidate.runId === record.runId &&
        candidate.subjectSha256 === record.subjectSha256,
    );
    if (existing) {
      return clone(existing);
    }
    this.governanceEvidence.set(record.id, clone(record));
    return clone(record);
  }

  async listGovernanceEvidence(
    workspaceId: string,
    limit = 100,
  ): Promise<GovernanceEvidenceRecord[]> {
    return [...this.governanceEvidence.values()]
      .filter((record) => record.workspaceId === workspaceId)
      .sort((left, right) =>
        right.verifiedAt.localeCompare(left.verifiedAt),
      )
      .slice(0, Math.max(1, limit))
      .map(clone);
  }

  async activateReleasePolicy(
    record: ReleasePolicyRecord,
  ): Promise<ReleasePolicyRecord> {
    for (const [id, current] of this.releasePolicies) {
      if (
        current.workspaceId === record.workspaceId &&
        current.status === "active"
      ) {
        this.releasePolicies.set(id, {
          ...current,
          status: "superseded",
        });
      }
    }
    const existing = [...this.releasePolicies.values()].find(
      (candidate) =>
        candidate.workspaceId === record.workspaceId &&
        candidate.bundle.payload.policyId ===
          record.bundle.payload.policyId &&
        candidate.bundle.payload.version === record.bundle.payload.version,
    );
    const stored = existing
      ? {
          ...record,
          id: existing.id,
        }
      : clone(record);
    this.releasePolicies.set(stored.id, stored);
    return clone(stored);
  }

  async getActiveReleasePolicy(
    workspaceId: string,
  ): Promise<ReleasePolicyRecord | null> {
    const policy = [...this.releasePolicies.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId &&
        candidate.status === "active",
    );
    return policy ? clone(policy) : null;
  }

  async listReleasePolicies(
    workspaceId: string,
  ): Promise<ReleasePolicyRecord[]> {
    return [...this.releasePolicies.values()]
      .filter((record) => record.workspaceId === workspaceId)
      .sort((left, right) =>
        right.activatedAt.localeCompare(left.activatedAt),
      )
      .map(clone);
  }

  async createDelegatedAdministrationGrant(
    grant: DelegatedAdministrationGrant,
  ): Promise<DelegatedAdministrationGrant> {
    if (this.delegatedAdministrationGrants.has(grant.id)) {
      throw new ExperimentConflictError(
        `Delegated administration grant ${grant.id} already exists`,
      );
    }
    this.delegatedAdministrationGrants.set(grant.id, clone(grant));
    return clone(grant);
  }

  async updateDelegatedAdministrationGrant(
    grant: DelegatedAdministrationGrant,
    expectedRevision: number,
  ): Promise<DelegatedAdministrationGrant> {
    const current = this.delegatedAdministrationGrants.get(grant.id);
    if (!current || current.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Delegated administration grant ${grant.id} changed; expected revision ${expectedRevision}`,
      );
    }
    this.delegatedAdministrationGrants.set(grant.id, clone(grant));
    return clone(grant);
  }

  async getDelegatedAdministrationGrant(
    grantId: string,
  ): Promise<DelegatedAdministrationGrant | null> {
    const grant = this.delegatedAdministrationGrants.get(grantId);
    return grant ? clone(grant) : null;
  }

  async listDelegatedAdministrationGrants(
    workspaceId: string,
  ): Promise<DelegatedAdministrationGrant[]> {
    return [...this.delegatedAdministrationGrants.values()]
      .filter((grant) => grant.workspaceId === workspaceId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  async createAccessReviewCampaign(
    campaign: AccessReviewCampaign,
    items: AccessReviewItem[],
  ): Promise<AccessReviewCampaign> {
    if (this.accessReviewCampaigns.has(campaign.id)) {
      throw new ExperimentConflictError(
        `Access review campaign ${campaign.id} already exists`,
      );
    }
    if (
      items.some((item) => this.accessReviewItems.has(item.id)) ||
      items.some((item) => item.campaignId !== campaign.id)
    ) {
      throw new ExperimentConflictError(
        `Access review campaign ${campaign.id} contains conflicting items`,
      );
    }
    this.accessReviewCampaigns.set(campaign.id, clone(campaign));
    for (const item of items) {
      this.accessReviewItems.set(item.id, clone(item));
    }
    return clone(campaign);
  }

  async updateAccessReviewCampaign(
    campaign: AccessReviewCampaign,
    expectedRevision: number,
  ): Promise<AccessReviewCampaign> {
    const current = this.accessReviewCampaigns.get(campaign.id);
    if (!current || current.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Access review campaign ${campaign.id} changed; expected revision ${expectedRevision}`,
      );
    }
    this.accessReviewCampaigns.set(campaign.id, clone(campaign));
    return clone(campaign);
  }

  async getAccessReviewCampaign(
    campaignId: string,
  ): Promise<AccessReviewCampaign | null> {
    const campaign = this.accessReviewCampaigns.get(campaignId);
    return campaign ? clone(campaign) : null;
  }

  async listAccessReviewCampaigns(
    workspaceId: string,
  ): Promise<AccessReviewCampaign[]> {
    return [...this.accessReviewCampaigns.values()]
      .filter((campaign) => campaign.workspaceId === workspaceId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  async updateAccessReviewItem(
    item: AccessReviewItem,
    expectedRevision: number,
  ): Promise<AccessReviewItem> {
    const current = this.accessReviewItems.get(item.id);
    if (!current || current.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Access review item ${item.id} changed; expected revision ${expectedRevision}`,
      );
    }
    this.accessReviewItems.set(item.id, clone(item));
    return clone(item);
  }

  async listAccessReviewItems(
    workspaceId: string,
    campaignId?: string,
  ): Promise<AccessReviewItem[]> {
    return [...this.accessReviewItems.values()]
      .filter(
        (item) =>
          item.workspaceId === workspaceId &&
          (!campaignId || item.campaignId === campaignId),
      )
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(clone);
  }

  async createBreakGlassRequest(
    request: BreakGlassRequest,
  ): Promise<BreakGlassRequest> {
    if (this.breakGlassRequests.has(request.id)) {
      throw new ExperimentConflictError(
        `Break-glass request ${request.id} already exists`,
      );
    }
    this.breakGlassRequests.set(request.id, clone(request));
    return clone(request);
  }

  async updateBreakGlassRequest(
    request: BreakGlassRequest,
    expectedRevision: number,
  ): Promise<BreakGlassRequest> {
    const current = this.breakGlassRequests.get(request.id);
    if (!current || current.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Break-glass request ${request.id} changed; expected revision ${expectedRevision}`,
      );
    }
    this.breakGlassRequests.set(request.id, clone(request));
    return clone(request);
  }

  async getBreakGlassRequest(
    requestId: string,
  ): Promise<BreakGlassRequest | null> {
    const request = this.breakGlassRequests.get(requestId);
    return request ? clone(request) : null;
  }

  async listBreakGlassRequests(
    workspaceId: string,
  ): Promise<BreakGlassRequest[]> {
    return [...this.breakGlassRequests.values()]
      .filter((request) => request.workspaceId === workspaceId)
      .sort((left, right) =>
        right.requestedAt.localeCompare(left.requestedAt),
      )
      .map(clone);
  }

  async storeSloSample(sample: SloSample): Promise<{
    sample: SloSample;
    created: boolean;
  }> {
    const existing = this.sloSamples.get(sample.id);
    if (existing) {
      return {
        sample: clone(existing),
        created: false,
      };
    }
    this.sloSamples.set(sample.id, clone(sample));
    return {
      sample: clone(sample),
      created: true,
    };
  }

  async getSloSample(sampleId: string): Promise<SloSample | null> {
    const sample = this.sloSamples.get(sampleId);
    return sample ? clone(sample) : null;
  }

  async listSloSamples(
    workspaceId: string,
    query: SloSampleQuery = {},
  ): Promise<SloSample[]> {
    const from = query.from ? Date.parse(query.from) : Number.NEGATIVE_INFINITY;
    const to = query.to ? Date.parse(query.to) : Number.POSITIVE_INFINITY;
    return [...this.sloSamples.values()]
      .filter(
        (sample) =>
          sample.workspaceId === workspaceId &&
          (!query.source || sample.source === query.source) &&
          (!query.metric || sample.metric === query.metric) &&
          Date.parse(sample.observedAt) >= from &&
          Date.parse(sample.observedAt) <= to,
      )
      .sort((left, right) =>
        right.observedAt.localeCompare(left.observedAt),
      )
      .slice(0, Math.max(1, query.limit ?? 1_000))
      .map(clone);
  }

  async deleteSloSamplesBefore(
    workspaceId: string,
    before: string,
  ): Promise<number> {
    const cutoff = Date.parse(before);
    let deleted = 0;
    for (const [sampleId, sample] of this.sloSamples) {
      if (
        sample.workspaceId === workspaceId &&
        Date.parse(sample.observedAt) < cutoff
      ) {
        this.sloSamples.delete(sampleId);
        deleted += 1;
      }
    }
    return deleted;
  }

  async createAlertRule(rule: AlertRule): Promise<AlertRule> {
    if (
      this.alertRules.has(rule.id) ||
      [...this.alertRules.values()].some(
        (candidate) =>
          candidate.workspaceId === rule.workspaceId &&
          candidate.code === rule.code,
      )
    ) {
      throw new ExperimentConflictError(
        `Alert rule ${rule.code} already exists`,
      );
    }
    this.alertRules.set(rule.id, clone(rule));
    return clone(rule);
  }

  async updateAlertRule(
    rule: AlertRule,
    expectedRevision: number,
  ): Promise<AlertRule> {
    const current = this.alertRules.get(rule.id);
    if (!current || current.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Alert rule ${rule.id} changed; expected revision ${expectedRevision}`,
      );
    }
    this.alertRules.set(rule.id, clone(rule));
    return clone(rule);
  }

  async listAlertRules(workspaceId: string): Promise<AlertRule[]> {
    return [...this.alertRules.values()]
      .filter((rule) => rule.workspaceId === workspaceId)
      .sort((left, right) => left.code.localeCompare(right.code))
      .map(clone);
  }

  async getOperationalIncident(
    incidentId: string,
  ): Promise<OperationalIncident | null> {
    const incident = this.operationalIncidents.get(incidentId);
    return incident ? clone(incident) : null;
  }

  async getOperationalIncidentByDedupeKey(
    workspaceId: string,
    dedupeKey: string,
  ): Promise<OperationalIncident | null> {
    const incident = [...this.operationalIncidents.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId &&
        candidate.dedupeKey === dedupeKey,
    );
    return incident ? clone(incident) : null;
  }

  async createOperationalIncident(
    incident: OperationalIncident,
  ): Promise<OperationalIncident> {
    if (
      this.operationalIncidents.has(incident.id) ||
      [...this.operationalIncidents.values()].some(
        (candidate) =>
          candidate.workspaceId === incident.workspaceId &&
          candidate.dedupeKey === incident.dedupeKey,
      )
    ) {
      throw new ExperimentConflictError(
        `Operational incident ${incident.dedupeKey} already exists`,
      );
    }
    this.operationalIncidents.set(incident.id, clone(incident));
    return clone(incident);
  }

  async updateOperationalIncident(
    incident: OperationalIncident,
    expectedRevision: number,
  ): Promise<OperationalIncident> {
    const current = this.operationalIncidents.get(incident.id);
    if (!current || current.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Operational incident ${incident.id} changed; expected revision ${expectedRevision}`,
      );
    }
    this.operationalIncidents.set(incident.id, clone(incident));
    return clone(incident);
  }

  async listOperationalIncidents(
    workspaceId: string,
    query: OperationsListQuery = {},
  ): Promise<OperationalIncident[]> {
    return [...this.operationalIncidents.values()]
      .filter((incident) => incident.workspaceId === workspaceId)
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      )
      .slice(0, Math.max(1, query.limit ?? 100))
      .map(clone);
  }

  async appendAlertOccurrence(
    occurrence: AlertOccurrence,
  ): Promise<AlertOccurrence> {
    if (
      this.alertOccurrences.some(
        (candidate) => candidate.id === occurrence.id,
      )
    ) {
      throw new ExperimentConflictError(
        `Alert occurrence ${occurrence.id} already exists`,
      );
    }
    this.alertOccurrences.push(clone(occurrence));
    return clone(occurrence);
  }

  async listAlertOccurrences(
    workspaceId: string,
    query: OperationsListQuery = {},
  ): Promise<AlertOccurrence[]> {
    return this.alertOccurrences
      .filter((occurrence) => occurrence.workspaceId === workspaceId)
      .sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      )
      .slice(0, Math.max(1, query.limit ?? 100))
      .map(clone);
  }

  async createNotificationChannel(
    channel: NotificationChannel,
  ): Promise<NotificationChannel> {
    if (this.notificationChannels.has(channel.id)) {
      throw new ExperimentConflictError(
        `Notification channel ${channel.id} already exists`,
      );
    }
    this.notificationChannels.set(channel.id, clone(channel));
    return clone(channel);
  }

  async updateNotificationChannel(
    channel: NotificationChannel,
    expectedRevision: number,
  ): Promise<NotificationChannel> {
    const current = this.notificationChannels.get(channel.id);
    if (!current || current.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Notification channel ${channel.id} changed; expected revision ${expectedRevision}`,
      );
    }
    this.notificationChannels.set(channel.id, clone(channel));
    return clone(channel);
  }

  async getNotificationChannel(
    channelId: string,
  ): Promise<NotificationChannel | null> {
    const channel = this.notificationChannels.get(channelId);
    return channel ? clone(channel) : null;
  }

  async listNotificationChannels(
    workspaceId: string,
  ): Promise<NotificationChannel[]> {
    return [...this.notificationChannels.values()]
      .filter((channel) => channel.workspaceId === workspaceId)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(clone);
  }

  async enqueueNotificationDelivery(
    delivery: NotificationDelivery,
  ): Promise<NotificationDelivery> {
    const existing = [...this.notificationDeliveries.values()].find(
      (candidate) => candidate.idempotencyKey === delivery.idempotencyKey,
    );
    if (existing) {
      return clone(existing);
    }
    this.notificationDeliveries.set(delivery.id, clone(delivery));
    return clone(delivery);
  }

  async updateNotificationDelivery(
    delivery: NotificationDelivery,
  ): Promise<NotificationDelivery> {
    if (!this.notificationDeliveries.has(delivery.id)) {
      throw new ExperimentConflictError(
        `Notification delivery ${delivery.id} does not exist`,
      );
    }
    this.notificationDeliveries.set(delivery.id, clone(delivery));
    return clone(delivery);
  }

  async listNotificationDeliveries(
    workspaceId: string,
    query: OperationsListQuery = {},
  ): Promise<NotificationDelivery[]> {
    return [...this.notificationDeliveries.values()]
      .filter((delivery) => delivery.workspaceId === workspaceId)
      .sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      )
      .slice(0, Math.max(1, query.limit ?? 100))
      .map(clone);
  }

  async listDueNotificationDeliveries(
    now: string,
    limit: number,
  ): Promise<NotificationDelivery[]> {
    const due = [...this.notificationDeliveries.values()]
      .filter(
        (delivery) =>
          (delivery.status === "pending" ||
            delivery.status === "retrying") &&
          delivery.nextAttemptAt <= now,
      )
      .sort((left, right) =>
        left.nextAttemptAt.localeCompare(right.nextAttemptAt),
      )
      .slice(0, Math.max(1, limit))
      .map(clone);
    const claimUntil = new Date(
      Date.parse(now) + 5 * 60_000,
    ).toISOString();
    return due.map((delivery) => {
      const claimed = {
        ...delivery,
        nextAttemptAt: claimUntil,
        updatedAt: now,
      };
      this.notificationDeliveries.set(claimed.id, clone(claimed));
      return claimed;
    });
  }

  async createMaintenanceWindow(
    window: MaintenanceWindow,
  ): Promise<MaintenanceWindow> {
    if (this.maintenanceWindows.has(window.id)) {
      throw new ExperimentConflictError(
        `Maintenance window ${window.id} already exists`,
      );
    }
    this.maintenanceWindows.set(window.id, clone(window));
    return clone(window);
  }

  async updateMaintenanceWindow(
    window: MaintenanceWindow,
    expectedRevision: number,
  ): Promise<MaintenanceWindow> {
    const current = this.maintenanceWindows.get(window.id);
    if (!current || current.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Maintenance window ${window.id} changed; expected revision ${expectedRevision}`,
      );
    }
    this.maintenanceWindows.set(window.id, clone(window));
    return clone(window);
  }

  async listMaintenanceWindows(
    workspaceId: string,
  ): Promise<MaintenanceWindow[]> {
    return [...this.maintenanceWindows.values()]
      .filter((window) => window.workspaceId === workspaceId)
      .sort((left, right) => right.startsAt.localeCompare(left.startsAt))
      .map(clone);
  }

  async createAlertSuppression(
    suppression: AlertSuppression,
  ): Promise<AlertSuppression> {
    if (this.alertSuppressions.has(suppression.id)) {
      throw new ExperimentConflictError(
        `Alert suppression ${suppression.id} already exists`,
      );
    }
    this.alertSuppressions.set(suppression.id, clone(suppression));
    return clone(suppression);
  }

  async updateAlertSuppression(
    suppression: AlertSuppression,
    expectedRevision: number,
  ): Promise<AlertSuppression> {
    const current = this.alertSuppressions.get(suppression.id);
    if (!current || current.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Alert suppression ${suppression.id} changed; expected revision ${expectedRevision}`,
      );
    }
    this.alertSuppressions.set(suppression.id, clone(suppression));
    return clone(suppression);
  }

  async listAlertSuppressions(
    workspaceId: string,
  ): Promise<AlertSuppression[]> {
    return [...this.alertSuppressions.values()]
      .filter((suppression) => suppression.workspaceId === workspaceId)
      .sort((left, right) => right.startsAt.localeCompare(left.startsAt))
      .map(clone);
  }

  async createNotificationEscalationPolicy(
    policy: NotificationEscalationPolicy,
  ): Promise<NotificationEscalationPolicy> {
    if (this.notificationEscalationPolicies.has(policy.id)) {
      throw new ExperimentConflictError(
        `Notification escalation policy ${policy.id} already exists`,
      );
    }
    this.notificationEscalationPolicies.set(policy.id, clone(policy));
    return clone(policy);
  }

  async updateNotificationEscalationPolicy(
    policy: NotificationEscalationPolicy,
    expectedRevision: number,
  ): Promise<NotificationEscalationPolicy> {
    const current = this.notificationEscalationPolicies.get(policy.id);
    if (!current || current.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Notification escalation policy ${policy.id} changed; expected revision ${expectedRevision}`,
      );
    }
    this.notificationEscalationPolicies.set(policy.id, clone(policy));
    return clone(policy);
  }

  async listNotificationEscalationPolicies(
    workspaceId: string,
  ): Promise<NotificationEscalationPolicy[]> {
    return [...this.notificationEscalationPolicies.values()]
      .filter((policy) => policy.workspaceId === workspaceId)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(clone);
  }

  async appendNotificationReceipt(
    receipt: NotificationReceipt,
  ): Promise<NotificationReceipt> {
    if (
      this.notificationReceipts.some(
        (candidate) => candidate.id === receipt.id,
      )
    ) {
      throw new ExperimentConflictError(
        `Notification receipt ${receipt.id} already exists`,
      );
    }
    this.notificationReceipts.push(clone(receipt));
    return clone(receipt);
  }

  async listNotificationReceipts(
    workspaceId: string,
    query: OperationsListQuery = {},
  ): Promise<NotificationReceipt[]> {
    return this.notificationReceipts
      .filter((receipt) => receipt.workspaceId === workspaceId)
      .sort((left, right) =>
        right.receivedAt.localeCompare(left.receivedAt),
      )
      .slice(0, Math.max(1, query.limit ?? 100))
      .map(clone);
  }

  async createLifecycleRecord(
    input: CreateLifecycleRecordInput,
  ): Promise<LifecycleRecord> {
    if (
      this.lifecycleRecords.has(input.record.id) ||
      this.lifecycleEvents.some(
        (candidate) => candidate.id === input.event.id,
      ) ||
      input.record.revision !== 1 ||
      input.event.aggregateId !== input.record.id ||
      input.event.organizationId !== input.record.organizationId ||
      input.event.workspaceId !== input.record.workspaceId ||
      input.event.aggregateKind !== input.record.kind ||
      input.event.schemaVersion !== LIFECYCLE_EVENT_SCHEMA_VERSION
    ) {
      throw new ExperimentConflictError(
        `Lifecycle record ${input.record.id} cannot be created`,
      );
    }
    this.lifecycleRecords.set(input.record.id, clone(input.record));
    this.lifecycleEvents.push({
      ...clone(input.event),
      cursor: this.lifecycleEvents.length + 1,
    });
    return clone(input.record);
  }

  async commitLifecycleRecord(
    input: CommitLifecycleRecordInput,
  ): Promise<LifecycleRecord> {
    const current = this.lifecycleRecords.get(input.record.id);
    if (
      !current ||
      current.revision !== input.expectedRevision ||
      input.record.revision !== input.expectedRevision + 1 ||
      current.organizationId !== input.record.organizationId ||
      current.workspaceId !== input.record.workspaceId ||
      current.kind !== input.record.kind ||
      this.lifecycleEvents.some(
        (candidate) => candidate.id === input.event.id,
      ) ||
      input.event.aggregateId !== input.record.id ||
      input.event.organizationId !== input.record.organizationId ||
      input.event.workspaceId !== input.record.workspaceId ||
      input.event.aggregateKind !== input.record.kind ||
      input.event.schemaVersion !== LIFECYCLE_EVENT_SCHEMA_VERSION
    ) {
      throw new ExperimentConflictError(
        `Lifecycle record ${input.record.id} revision conflict`,
      );
    }
    this.lifecycleRecords.set(input.record.id, clone(input.record));
    this.lifecycleEvents.push({
      ...clone(input.event),
      cursor: this.lifecycleEvents.length + 1,
    });
    return clone(input.record);
  }

  async getLifecycleRecord(
    recordId: string,
  ): Promise<LifecycleRecord | null> {
    const record = this.lifecycleRecords.get(recordId);
    return record ? clone(record) : null;
  }

  async listLifecycleRecords(
    workspaceId: string,
    query: LifecycleRecordQuery = {},
  ): Promise<LifecycleRecord[]> {
    return [...this.lifecycleRecords.values()]
      .filter(
        (record) =>
          record.workspaceId === workspaceId &&
          (!query.kind || record.kind === query.kind) &&
          (!query.status || record.status === query.status),
      )
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      )
      .slice(0, Math.max(1, query.limit ?? 1_000))
      .map(clone);
  }

  async appendLifecycleEvent(
    event: NewLifecycleEvent,
  ): Promise<LifecycleEvent> {
    if (
      this.lifecycleEvents.some((candidate) => candidate.id === event.id)
    ) {
      throw new ExperimentConflictError(
        `Lifecycle event ${event.id} already exists`,
      );
    }
    const stored = {
      ...clone(event),
      cursor: this.lifecycleEvents.length + 1,
    };
    this.lifecycleEvents.push(stored);
    return clone(stored);
  }

  async listLifecycleEvents(
    workspaceId: string,
    query: LifecycleEventQuery = {},
  ): Promise<LifecycleEvent[]> {
    return this.lifecycleEvents
      .filter(
        (event) =>
          event.workspaceId === workspaceId &&
          (!query.aggregateId ||
            event.aggregateId === query.aggregateId) &&
          (!query.aggregateKind ||
            event.aggregateKind === query.aggregateKind) &&
          event.cursor > (query.afterCursor ?? 0),
      )
      .slice(0, Math.max(1, query.limit ?? 1_000))
      .map(clone);
  }
}
