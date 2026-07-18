import type {
  ExperimentPermission,
  ExperimentPrincipalType,
  ExperimentRole,
  WorkloadIdentityKind,
} from "@/experiments/types";

export type WorkspaceMembershipStatus = "active" | "suspended";
export type ServiceAccountStatus = "active" | "suspended" | "revoked";

export interface GovernanceOrganization {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface GovernedWorkspace {
  organizationId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMembership {
  id: string;
  organizationId: string;
  workspaceId: string;
  issuer: string;
  subject: string;
  role: ExperimentRole;
  status: WorkspaceMembershipStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceAccount {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  issuer: string;
  subject: string;
  role: ExperimentRole;
  status: ServiceAccountStatus;
  workloadKind: WorkloadIdentityKind;
  permissionGrants: ExperimentPermission[];
  credentialVersion: number;
  revision: number;
  expiresAt?: string;
  lastUsedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type DelegatedAdministrationDuty =
  | "identity-manager"
  | "access-reviewer"
  | "operations-admin";

export interface DelegatedAdministrationGrant {
  id: string;
  organizationId: string;
  workspaceId: string;
  issuer: string;
  subject: string;
  duty: DelegatedAdministrationDuty;
  permissionGrants: ExperimentPermission[];
  status: "active" | "revoked" | "expired";
  expiresAt?: string;
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  revokedBy?: string;
  revokedAt?: string;
}

export type AccessReviewCampaignStatus =
  | "open"
  | "completed"
  | "completed-with-auto-revocations";

export interface AccessReviewCampaign {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  startsAt: string;
  dueAt: string;
  status: AccessReviewCampaignStatus;
  revision: number;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export type AccessReviewTargetType =
  | "membership"
  | "service-account"
  | "delegation";

export interface AccessReviewItem {
  id: string;
  organizationId: string;
  workspaceId: string;
  campaignId: string;
  targetType: AccessReviewTargetType;
  targetId: string;
  targetSubject: string;
  accessSnapshot: Record<string, unknown>;
  decision: "pending" | "retain" | "revoke" | "auto-revoke";
  reviewerId?: string;
  justification?: string;
  reviewedAt?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type BreakGlassStatus =
  | "pending-approval"
  | "active"
  | "expired-review-required"
  | "revoked-review-required"
  | "closed";

export interface BreakGlassApproval {
  approverId: string;
  approvedAt: string;
}

export interface BreakGlassRequest {
  id: string;
  organizationId: string;
  workspaceId: string;
  issuer: string;
  subject: string;
  requesterId: string;
  purpose: string;
  permissionGrants: ExperimentPermission[];
  requestedAt: string;
  expiresAt: string;
  status: BreakGlassStatus;
  approvals: BreakGlassApproval[];
  activatedAt?: string;
  revokedBy?: string;
  revokedAt?: string;
  reviewOutcome?: "appropriate" | "policy-violation";
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type GovernanceAuditAction =
  | "membership.upserted"
  | "service-account.created"
  | "service-account.rotated"
  | "service-account.activated"
  | "service-account.suspended"
  | "service-account.revoked"
  | "delegation.created"
  | "delegation.revoked"
  | "access-review.created"
  | "access-review.item-reviewed"
  | "access-review.auto-revoked"
  | "access-review.completed"
  | "break-glass.requested"
  | "break-glass.approved"
  | "break-glass.activated"
  | "break-glass.revoked"
  | "break-glass.expired"
  | "break-glass.reviewed";

export interface GovernanceAuditRecord {
  cursor?: number;
  id: string;
  organizationId: string;
  workspaceId: string;
  actorId: string;
  principalType: ExperimentPrincipalType;
  action: GovernanceAuditAction;
  targetId: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface WorkspaceAccessOverview {
  organization: GovernanceOrganization;
  workspace: GovernedWorkspace;
  memberships: WorkspaceMembership[];
  serviceAccounts: ServiceAccount[];
  delegations: DelegatedAdministrationGrant[];
  accessReviewCampaigns: AccessReviewCampaign[];
  accessReviewItems: AccessReviewItem[];
  breakGlassRequests: BreakGlassRequest[];
  riskReport: {
    orphanedServiceAccountIds: string[];
    expiredServiceAccountIds: string[];
    credentialsDueForRotationIds: string[];
    overdueAccessReviewItemIds: string[];
    breakGlassReviewRequiredIds: string[];
  };
  audit: GovernanceAuditRecord[];
}

export type GovernanceEvidenceKind =
  | "ci-evidence"
  | "model-regression-live"
  | "recovery-drill"
  | "deployment-drill"
  | "deployment-conformance";

export interface GovernanceEvidenceRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  kind: GovernanceEvidenceKind;
  provider: "github-actions-sigstore";
  repository: string;
  sourceCommitSha: string;
  signerWorkflow: string;
  runId: string;
  subjectPath: string;
  subjectSha256: string;
  passed: boolean;
  generatedAt: string;
  verifiedAt: string;
  expiresAt: string;
  ingestedBy: string;
  ingestedAt: string;
  summary: Record<string, unknown>;
}

export type EvidenceFreshnessStatus =
  | "current"
  | "expiring"
  | "stale"
  | "missing";

export interface EvidenceFreshness {
  kind: GovernanceEvidenceKind;
  status: EvidenceFreshnessStatus;
  maximumAgeHours: number;
  ageHours?: number;
  expiresAt?: string;
  recordId?: string;
  message: string;
}

export interface EvidenceRegistryOverview {
  records: GovernanceEvidenceRecord[];
  freshness: EvidenceFreshness[];
  alerts: EvidenceFreshness[];
}

export type ReleaseEnvironment =
  | "development"
  | "staging"
  | "production";

export interface ReleaseEnvironmentPolicy {
  environment: ReleaseEnvironment;
  prerequisite?: ReleaseEnvironment;
  trafficStages: number[];
  humanApprovalRequired: boolean;
  externalEvidenceRequired: boolean;
  minimumRequestCount: number;
  maximumErrorRatePercent: number;
  maximumP95LatencyMs: number;
  minimumAvailabilityPercent: number;
}

export interface ReleasePolicyBundlePayload {
  schemaVersion: 1;
  policyId: string;
  version: string;
  organizationId: string;
  issuedAt: string;
  expiresAt: string;
  environments: Record<
    ReleaseEnvironment,
    ReleaseEnvironmentPolicy
  >;
}

export interface SignedReleasePolicyBundle {
  payload: ReleasePolicyBundlePayload;
  signature: string;
}

export interface ReleasePolicyRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  status: "active" | "superseded";
  bundle: SignedReleasePolicyBundle;
  activatedBy: string;
  activatedAt: string;
}
