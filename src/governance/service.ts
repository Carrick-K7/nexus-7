import {
  actorPermissions,
  actorPrincipalType,
  actorWorkspaceId,
  assertActorPermission,
  DEFAULT_WORKSPACE_ID,
} from "@/experiments/authorization";
import {
  ExperimentConflictError,
  ExperimentNotFoundError,
  ExperimentPermissionError,
  ExperimentValidationError,
} from "@/experiments/errors";
import type {
  ExperimentActor,
  ExperimentPermission,
  ExperimentRole,
  WorkloadIdentityKind,
} from "@/experiments/types";
import type {
  ExperimentRepository,
} from "@/experiments/repository";
import type {
  AccessReviewCampaign,
  AccessReviewItem,
  BreakGlassRequest,
  DelegatedAdministrationDuty,
  DelegatedAdministrationGrant,
  GovernanceAuditAction,
  GovernanceAuditRecord,
  GovernanceOrganization,
  GovernedWorkspace,
  ServiceAccount,
  ServiceAccountStatus,
  WorkspaceAccessOverview,
  WorkspaceMembership,
  WorkspaceMembershipStatus,
} from "./types";

export const DEFAULT_ORGANIZATION_ID = "organization-nexus-7";

interface GovernanceServiceOptions {
  now?: () => Date;
  id?: () => string;
  organizationId?: string;
  organizationName?: string;
}

interface UpsertMembershipInput {
  issuer: string;
  subject: string;
  role: ExperimentRole;
  status?: WorkspaceMembershipStatus;
}

interface CreateServiceAccountInput {
  name: string;
  issuer: string;
  subject: string;
  role: ExperimentRole;
  workloadKind: Exclude<WorkloadIdentityKind, "development">;
  expiresAt?: string;
}

interface CreateDelegationInput {
  issuer: string;
  subject: string;
  duty: DelegatedAdministrationDuty;
  expiresAt?: string;
}

interface CreateAccessReviewCampaignInput {
  name: string;
  dueAt: string;
}

interface ReviewAccessItemInput {
  decision: "retain" | "revoke";
  justification: string;
}

interface RequestBreakGlassInput {
  purpose: string;
  permissionGrants: ExperimentPermission[];
  ttlMinutes: number;
}

const ROLES = new Set<ExperimentRole>(["viewer", "operator", "admin"]);

export const DELEGATED_DUTY_PERMISSIONS: Record<
  DelegatedAdministrationDuty,
  readonly ExperimentPermission[]
> = {
  "identity-manager": [
    "memberships:manage",
    "service-accounts:manage",
  ],
  "access-reviewer": ["access-reviews:manage"],
  "operations-admin": [
    "alerts:manage",
    "incidents:manage",
    "notifications:manage",
  ],
};

const BREAK_GLASS_ALLOWED_PERMISSIONS = new Set<ExperimentPermission>([
  "memberships:manage",
  "service-accounts:manage",
  "policy:manage",
  "alerts:manage",
  "incidents:manage",
  "notifications:manage",
  "deployment:control",
]);

export const WORKLOAD_PERMISSION_TEMPLATES: Record<
  WorkloadIdentityKind,
  readonly ExperimentPermission[]
> = {
  ci: [
    "workspace:read",
    "governance:read",
    "operations:read",
    "operations:write",
    "evidence:attach",
    "evidence:ingest",
    "models:propose",
  ],
  worker: [
    "workspace:read",
    "operations:write",
    "runs:write",
  ],
  "deployment-controller": [
    "workspace:read",
    "governance:read",
    "operations:read",
    "operations:write",
    "deployment:control",
  ],
  development: [
    "workspace:read",
    "governance:read",
    "operations:read",
    "operations:write",
    "runs:write",
    "iterations:propose",
    "evidence:attach",
    "models:propose",
    "deployment:control",
  ],
};

function normalizeRequired(
  value: string,
  field: string,
  maximumLength = 160,
): string {
  const normalized = value.trim().slice(0, maximumLength);
  if (!normalized) {
    throw new ExperimentValidationError(`${field} is required`);
  }
  return normalized;
}

function normalizeRole(role: ExperimentRole): ExperimentRole {
  if (!ROLES.has(role)) {
    throw new ExperimentValidationError("Unknown workspace role");
  }
  return role;
}

function identityIssuer(actor: ExperimentActor): string {
  return normalizeRequired(
    actor.issuer ?? actor.authSource ?? "local",
    "identity issuer",
  );
}

function assertHumanGovernanceAdmin(actor: ExperimentActor): void {
  assertActorPermission(actor, "workspace:admin");
  if (actorPrincipalType(actor) !== "human") {
    throw new ExperimentPermissionError(
      "Only a human administrator may manage workspace identities",
    );
  }
}

function assertHumanPermission(
  actor: ExperimentActor,
  permission: ExperimentPermission,
): void {
  assertActorPermission(actor, permission);
  if (actorPrincipalType(actor) !== "human") {
    throw new ExperimentPermissionError(
      `Only a human identity may perform ${permission}`,
    );
  }
}

function workloadPermissionGrants(
  workloadKind: WorkloadIdentityKind,
  role: ExperimentRole,
): ExperimentPermission[] {
  const allowedByRole = new Set(
    actorPermissions({
      id: "workload-template",
      role,
      principalType: "service-account",
    }),
  );
  const grants = WORKLOAD_PERMISSION_TEMPLATES[workloadKind];
  const missing = grants.filter(
    (permission) => !allowedByRole.has(permission),
  );
  if (missing.length > 0) {
    throw new ExperimentValidationError(
      `${workloadKind} requires a role that grants ${missing.join(", ")}`,
    );
  }
  return [...grants];
}

export class GovernanceService {
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly organizationId: string;
  private readonly organizationName: string;

  constructor(
    private readonly repository: ExperimentRepository,
    options: GovernanceServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
    this.organizationId =
      options.organizationId ??
      process.env.NEXUS_ORGANIZATION_ID ??
      DEFAULT_ORGANIZATION_ID;
    this.organizationName =
      options.organizationName ??
      process.env.NEXUS_ORGANIZATION_NAME ??
      "NEXUS-7 Autonomy Lab";
  }

  async initialize(): Promise<void> {
    await this.ensureWorkspaceContext(DEFAULT_WORKSPACE_ID);
    const subject = process.env.NEXUS_BOOTSTRAP_ADMIN_SUBJECT?.trim();
    if (subject) {
      const issuer =
        process.env.NEXUS_BOOTSTRAP_ADMIN_ISSUER?.trim() ??
        process.env.NEXUS_OIDC_ISSUER?.trim() ??
        "bootstrap";
      const workspaceId =
        process.env.NEXUS_BOOTSTRAP_ADMIN_WORKSPACE?.trim() ??
        DEFAULT_WORKSPACE_ID;
      const context = await this.ensureWorkspaceContext(workspaceId);
      const timestamp = this.now().toISOString();
      await this.repository.upsertWorkspaceMembership({
        id: `membership-${this.id()}`,
        organizationId: context.organization.id,
        workspaceId,
        issuer,
        subject,
        role: "admin",
        status: "active",
        createdBy: "system:bootstrap",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  private async ensureWorkspaceContext(workspaceId: string): Promise<{
    organization: GovernanceOrganization;
    workspace: GovernedWorkspace;
  }> {
    const timestamp = this.now().toISOString();
    await this.repository.ensureWorkspace({
      id: workspaceId,
      name:
        workspaceId === DEFAULT_WORKSPACE_ID
          ? "Neo Angeles Autonomy Lab"
          : `NEXUS Workspace ${workspaceId}`,
      createdAt: timestamp,
    });
    const organization = await this.repository.ensureOrganization({
      id: this.organizationId,
      name: this.organizationName,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const workspace = await this.repository.ensureGovernedWorkspace({
      organizationId: organization.id,
      workspaceId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return { organization, workspace };
  }

  private async appendAudit(
    actor: ExperimentActor,
    action: GovernanceAuditAction,
    targetId: string,
    detail: Record<string, unknown>,
  ): Promise<GovernanceAuditRecord> {
    const workspaceId = actorWorkspaceId(actor);
    const workspace = await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    return this.repository.appendGovernanceAudit({
      id: `governance-audit-${this.id()}`,
      organizationId: workspace.organizationId,
      workspaceId,
      actorId: actor.id,
      principalType: actorPrincipalType(actor),
      action,
      targetId,
      detail,
      createdAt: this.now().toISOString(),
    });
  }

  private resolvedActor(
    actor: ExperimentActor,
    role: ExperimentRole,
    organizationId: string,
    account?: ServiceAccount,
    delegatedPermissions?: ExperimentPermission[],
  ): ExperimentActor {
    return {
      ...actor,
      role,
      organizationId,
      workspaceId: actorWorkspaceId(actor),
      serviceAccountId: account?.id,
      workloadKind: account?.workloadKind,
      permissionGrants: account?.permissionGrants,
      delegatedPermissions:
        delegatedPermissions && delegatedPermissions.length > 0
          ? [...new Set(delegatedPermissions)]
          : undefined,
    };
  }

  async resolveActor(actor: ExperimentActor): Promise<ExperimentActor> {
    if (actorPrincipalType(actor) === "system") {
      return actor;
    }
    const workspaceId = actorWorkspaceId(actor);
    const issuer = identityIssuer(actor);
    const { organization } = await this.ensureWorkspaceContext(workspaceId);

    if (actorPrincipalType(actor) === "service-account") {
      let account = await this.repository.getServiceAccountBySubject(
        workspaceId,
        issuer,
        actor.id,
      );
      if (!account && actor.authSource === "development") {
        const timestamp = this.now().toISOString();
        account = await this.repository.createServiceAccount({
          id: `service-account-${this.id()}`,
          organizationId: organization.id,
          workspaceId,
          name: `Development service account ${actor.id}`,
          issuer,
          subject: actor.id,
          role: actor.role,
          status: "active",
          workloadKind: "development",
          permissionGrants: workloadPermissionGrants(
            "development",
            actor.role,
          ),
          credentialVersion: 1,
          revision: 1,
          createdBy: "system:development-bootstrap",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      if (!account) {
        throw new ExperimentPermissionError(
          "Service account is not registered in this workspace",
        );
      }
      if (account.status !== "active") {
        throw new ExperimentPermissionError(
          `Service account is ${account.status}`,
        );
      }
      if (
        account.expiresAt &&
        Date.parse(account.expiresAt) <= this.now().getTime()
      ) {
        throw new ExperimentPermissionError("Service account has expired");
      }
      const lastUsedAt = this.now().toISOString();
      await this.repository.touchServiceAccount(account.id, lastUsedAt);
      return this.resolvedActor(
        actor,
        account.role,
        account.organizationId,
        account,
      );
    }

    let membership = await this.repository.getWorkspaceMembership(
      workspaceId,
      issuer,
      actor.id,
    );
    if (!membership && actor.authSource === "development") {
      const timestamp = this.now().toISOString();
      membership = await this.repository.upsertWorkspaceMembership({
        id: `membership-${this.id()}`,
        organizationId: organization.id,
        workspaceId,
        issuer,
        subject: actor.id,
        role: actor.role,
        status: "active",
        createdBy: "system:development-bootstrap",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    if (!membership) {
      throw new ExperimentPermissionError(
        "Identity is not a member of this workspace",
      );
    }
    if (membership.status !== "active") {
      throw new ExperimentPermissionError("Workspace membership is suspended");
    }
    const now = this.now().getTime();
    const [delegations, breakGlassRequests] = await Promise.all([
      this.repository.listDelegatedAdministrationGrants(workspaceId),
      this.repository.listBreakGlassRequests(workspaceId),
    ]);
    const delegatedPermissions = delegations
      .filter(
        (grant) =>
          grant.issuer === issuer &&
          grant.subject === actor.id &&
          grant.status === "active" &&
          (!grant.expiresAt || Date.parse(grant.expiresAt) > now),
      )
      .flatMap((grant) => grant.permissionGrants);
    const emergencyPermissions = breakGlassRequests
      .filter(
        (request) =>
          request.issuer === issuer &&
          request.subject === actor.id &&
          request.status === "active" &&
          request.approvals.length >= 2 &&
          Date.parse(request.expiresAt) > now,
      )
      .flatMap((request) => request.permissionGrants);
    return this.resolvedActor(
      actor,
      membership.role,
      membership.organizationId,
      undefined,
      [...delegatedPermissions, ...emergencyPermissions],
    );
  }

  async overview(actor: ExperimentActor): Promise<WorkspaceAccessOverview> {
    assertActorPermission(actor, "governance:read");
    const workspaceId = actorWorkspaceId(actor);
    const workspace = await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    const organization = await this.repository.getOrganization(
      workspace.organizationId,
    );
    if (!organization) {
      throw new ExperimentNotFoundError(
        `Organization ${workspace.organizationId} was not found`,
      );
    }
    const [
      memberships,
      serviceAccounts,
      delegations,
      accessReviewCampaigns,
      accessReviewItems,
      breakGlassRequests,
      audit,
    ] = await Promise.all([
      this.repository.listWorkspaceMemberships(workspaceId),
      this.repository.listServiceAccounts(workspaceId),
      this.repository.listDelegatedAdministrationGrants(workspaceId),
      this.repository.listAccessReviewCampaigns(workspaceId),
      this.repository.listAccessReviewItems(workspaceId),
      this.repository.listBreakGlassRequests(workspaceId),
      this.repository.listGovernanceAudit(workspaceId),
    ]);
    const now = this.now().getTime();
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1_000;
    const oneDayAgo = now - 24 * 60 * 60 * 1_000;
    return {
      organization,
      workspace,
      memberships,
      serviceAccounts,
      delegations,
      accessReviewCampaigns,
      accessReviewItems,
      breakGlassRequests,
      riskReport: {
        orphanedServiceAccountIds: serviceAccounts
          .filter(
            (account) =>
              account.status === "active" &&
              !account.lastUsedAt &&
              Date.parse(account.createdAt) <= oneDayAgo,
          )
          .map((account) => account.id),
        expiredServiceAccountIds: serviceAccounts
          .filter(
            (account) =>
              account.status === "active" &&
              account.expiresAt !== undefined &&
              Date.parse(account.expiresAt) <= now,
          )
          .map((account) => account.id),
        credentialsDueForRotationIds: serviceAccounts
          .filter(
            (account) =>
              account.status === "active" &&
              Date.parse(account.updatedAt) <= ninetyDaysAgo,
          )
          .map((account) => account.id),
        overdueAccessReviewItemIds: accessReviewItems
          .filter((item) => {
            const campaign = accessReviewCampaigns.find(
              (candidate) => candidate.id === item.campaignId,
            );
            return (
              item.decision === "pending" &&
              campaign !== undefined &&
              Date.parse(campaign.dueAt) <= now
            );
          })
          .map((item) => item.id),
        breakGlassReviewRequiredIds: breakGlassRequests
          .filter(
            (request) =>
              request.status === "expired-review-required" ||
              request.status === "revoked-review-required" ||
              (
                request.status === "active" &&
                Date.parse(request.expiresAt) <= now
              ),
          )
          .map((request) => request.id),
      },
      audit,
    };
  }

  async upsertMembership(
    input: UpsertMembershipInput,
    actor: ExperimentActor,
  ): Promise<WorkspaceMembership> {
    assertHumanPermission(actor, "memberships:manage");
    const workspaceId = actorWorkspaceId(actor);
    const { organization } = await this.ensureWorkspaceContext(workspaceId);
    const timestamp = this.now().toISOString();
    const membership = await this.repository.upsertWorkspaceMembership({
      id: `membership-${this.id()}`,
      organizationId: organization.id,
      workspaceId,
      issuer: normalizeRequired(input.issuer, "issuer"),
      subject: normalizeRequired(input.subject, "subject"),
      role: normalizeRole(input.role),
      status: input.status ?? "active",
      createdBy: actor.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.appendAudit(actor, "membership.upserted", membership.id, {
      issuer: membership.issuer,
      subject: membership.subject,
      role: membership.role,
      status: membership.status,
    });
    return membership;
  }

  async createServiceAccount(
    input: CreateServiceAccountInput,
    actor: ExperimentActor,
  ): Promise<ServiceAccount> {
    assertHumanPermission(actor, "service-accounts:manage");
    const workspaceId = actorWorkspaceId(actor);
    const { organization } = await this.ensureWorkspaceContext(workspaceId);
    const issuer = normalizeRequired(input.issuer, "issuer");
    const subject = normalizeRequired(input.subject, "subject");
    if (
      await this.repository.getServiceAccountBySubject(
        workspaceId,
        issuer,
        subject,
      )
    ) {
      throw new ExperimentConflictError(
        `Service account ${issuer}/${subject} already exists`,
      );
    }
    const timestamp = this.now().toISOString();
    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt).toISOString()
      : undefined;
    if (expiresAt && Date.parse(expiresAt) <= this.now().getTime()) {
      throw new ExperimentValidationError(
        "Service account expiry must be in the future",
      );
    }
    const account = await this.repository.createServiceAccount({
      id: `service-account-${this.id()}`,
      organizationId: organization.id,
      workspaceId,
      name: normalizeRequired(input.name, "name", 100),
      issuer,
      subject,
      role: normalizeRole(input.role),
      status: "active",
      workloadKind: input.workloadKind,
      permissionGrants: workloadPermissionGrants(
        input.workloadKind,
        input.role,
      ),
      credentialVersion: 1,
      revision: 1,
      expiresAt,
      createdBy: actor.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.appendAudit(actor, "service-account.created", account.id, {
      name: account.name,
      issuer: account.issuer,
      subject: account.subject,
      role: account.role,
      workloadKind: account.workloadKind,
      permissionGrants: account.permissionGrants,
      expiresAt: account.expiresAt,
    });
    return account;
  }

  async rotateServiceAccount(
    accountId: string,
    expectedRevision: number,
    actor: ExperimentActor,
  ): Promise<ServiceAccount> {
    assertHumanPermission(actor, "service-accounts:manage");
    const current = await this.requireServiceAccount(accountId, actor);
    if (current.status === "revoked") {
      throw new ExperimentConflictError(
        "Revoked service accounts cannot be rotated",
      );
    }
    const next = await this.repository.updateServiceAccount(
      {
        ...current,
        credentialVersion: current.credentialVersion + 1,
        revision: current.revision + 1,
        updatedAt: this.now().toISOString(),
      },
      expectedRevision,
    );
    await this.appendAudit(actor, "service-account.rotated", next.id, {
      credentialVersion: next.credentialVersion,
      previousCredentialVersion: current.credentialVersion,
    });
    return next;
  }

  async setServiceAccountStatus(
    accountId: string,
    status: ServiceAccountStatus,
    expectedRevision: number,
    actor: ExperimentActor,
  ): Promise<ServiceAccount> {
    assertHumanPermission(actor, "service-accounts:manage");
    const current = await this.requireServiceAccount(accountId, actor);
    if (current.status === "revoked" && status !== "revoked") {
      throw new ExperimentConflictError(
        "Revoked service accounts cannot be reactivated",
      );
    }
    const next = await this.repository.updateServiceAccount(
      {
        ...current,
        status,
        revision: current.revision + 1,
        updatedAt: this.now().toISOString(),
      },
      expectedRevision,
    );
    const action =
      status === "active"
        ? "service-account.activated"
        : status === "suspended"
          ? "service-account.suspended"
          : "service-account.revoked";
    await this.appendAudit(actor, action, next.id, {
      previousStatus: current.status,
      status: next.status,
    });
    return next;
  }

  async createDelegation(
    input: CreateDelegationInput,
    actor: ExperimentActor,
  ): Promise<DelegatedAdministrationGrant> {
    assertHumanGovernanceAdmin(actor);
    const workspaceId = actorWorkspaceId(actor);
    const issuer = normalizeRequired(input.issuer, "issuer");
    const subject = normalizeRequired(input.subject, "subject");
    if (subject === actor.id && issuer === identityIssuer(actor)) {
      throw new ExperimentPermissionError(
        "Administrators cannot delegate duties to themselves",
      );
    }
    const membership = await this.repository.getWorkspaceMembership(
      workspaceId,
      issuer,
      subject,
    );
    if (!membership || membership.status !== "active") {
      throw new ExperimentNotFoundError(
        "Delegation target must be an active workspace member",
      );
    }
    const existing =
      await this.repository.listDelegatedAdministrationGrants(workspaceId);
    if (
      existing.some(
        (grant) =>
          grant.issuer === issuer &&
          grant.subject === subject &&
          grant.duty === input.duty &&
          grant.status === "active" &&
          (!grant.expiresAt ||
            Date.parse(grant.expiresAt) > this.now().getTime()),
      )
    ) {
      throw new ExperimentConflictError(
        `${subject} already has the ${input.duty} duty`,
      );
    }
    const incompatible = new Set<DelegatedAdministrationDuty>(
      input.duty === "identity-manager"
        ? ["access-reviewer"]
        : input.duty === "access-reviewer"
          ? ["identity-manager"]
          : [],
    );
    if (
      existing.some(
        (grant) =>
          grant.issuer === issuer &&
          grant.subject === subject &&
          grant.status === "active" &&
          incompatible.has(grant.duty),
      )
    ) {
      throw new ExperimentPermissionError(
        "Identity management and access review duties must remain separated",
      );
    }
    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt).toISOString()
      : undefined;
    if (expiresAt && Date.parse(expiresAt) <= this.now().getTime()) {
      throw new ExperimentValidationError(
        "Delegation expiry must be in the future",
      );
    }
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    const timestamp = this.now().toISOString();
    const grant =
      await this.repository.createDelegatedAdministrationGrant({
        id: `delegation-${this.id()}`,
        organizationId: workspace.organizationId,
        workspaceId,
        issuer,
        subject,
        duty: input.duty,
        permissionGrants: [...DELEGATED_DUTY_PERMISSIONS[input.duty]],
        status: "active",
        expiresAt,
        revision: 1,
        createdBy: actor.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    await this.appendAudit(actor, "delegation.created", grant.id, {
      issuer,
      subject,
      duty: grant.duty,
      permissionGrants: grant.permissionGrants,
      expiresAt,
    });
    return grant;
  }

  async revokeDelegation(
    grantId: string,
    expectedRevision: number,
    actor: ExperimentActor,
  ): Promise<DelegatedAdministrationGrant> {
    assertHumanGovernanceAdmin(actor);
    const current =
      await this.repository.getDelegatedAdministrationGrant(grantId);
    if (
      !current ||
      current.workspaceId !== actorWorkspaceId(actor)
    ) {
      throw new ExperimentNotFoundError(
        `Delegated administration grant ${grantId} was not found`,
      );
    }
    if (current.status !== "active") {
      return current;
    }
    const timestamp = this.now().toISOString();
    const next =
      await this.repository.updateDelegatedAdministrationGrant(
        {
          ...current,
          status: "revoked",
          revokedBy: actor.id,
          revokedAt: timestamp,
          revision: current.revision + 1,
          updatedAt: timestamp,
        },
        expectedRevision,
      );
    await this.appendAudit(actor, "delegation.revoked", grantId, {
      duty: current.duty,
      subject: current.subject,
    });
    return next;
  }

  async createAccessReviewCampaign(
    input: CreateAccessReviewCampaignInput,
    actor: ExperimentActor,
  ): Promise<AccessReviewCampaign> {
    assertHumanPermission(actor, "access-reviews:manage");
    const workspaceId = actorWorkspaceId(actor);
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    const dueAt = new Date(input.dueAt).toISOString();
    const now = this.now();
    if (
      Date.parse(dueAt) <= now.getTime() ||
      Date.parse(dueAt) > now.getTime() + 90 * 24 * 60 * 60 * 1_000
    ) {
      throw new ExperimentValidationError(
        "Access review dueAt must be within the next 90 days",
      );
    }
    const [memberships, serviceAccounts, delegations] = await Promise.all([
      this.repository.listWorkspaceMemberships(workspaceId),
      this.repository.listServiceAccounts(workspaceId),
      this.repository.listDelegatedAdministrationGrants(workspaceId),
    ]);
    const timestamp = now.toISOString();
    const campaign: AccessReviewCampaign = {
      id: `access-review-${this.id()}`,
      organizationId: workspace.organizationId,
      workspaceId,
      name: normalizeRequired(input.name, "name", 120),
      startsAt: timestamp,
      dueAt,
      status: "open",
      revision: 1,
      createdBy: actor.id,
      createdAt: timestamp,
    };
    const targets: Array<{
      targetType: AccessReviewItem["targetType"];
      targetId: string;
      targetSubject: string;
      accessSnapshot: Record<string, unknown>;
    }> = [
      ...memberships
        .filter((membership) => membership.status === "active")
        .map((membership) => ({
          targetType: "membership" as const,
          targetId: membership.id,
          targetSubject: membership.subject,
          accessSnapshot: {
            issuer: membership.issuer,
            subject: membership.subject,
            role: membership.role,
            status: membership.status,
          },
        })),
      ...serviceAccounts
        .filter((account) => account.status === "active")
        .map((account) => ({
          targetType: "service-account" as const,
          targetId: account.id,
          targetSubject: account.subject,
          accessSnapshot: {
            issuer: account.issuer,
            subject: account.subject,
            role: account.role,
            workloadKind: account.workloadKind,
            permissionGrants: account.permissionGrants,
            expiresAt: account.expiresAt,
          },
        })),
      ...delegations
        .filter(
          (grant) =>
            grant.status === "active" &&
            (!grant.expiresAt ||
              Date.parse(grant.expiresAt) > now.getTime()),
        )
        .map((grant) => ({
          targetType: "delegation" as const,
          targetId: grant.id,
          targetSubject: grant.subject,
          accessSnapshot: {
            issuer: grant.issuer,
            subject: grant.subject,
            duty: grant.duty,
            permissionGrants: grant.permissionGrants,
            expiresAt: grant.expiresAt,
          },
        })),
    ];
    const items: AccessReviewItem[] = targets.map((target, index) => ({
      id: `access-review-item-${this.id()}-${index + 1}`,
      organizationId: workspace.organizationId,
      workspaceId,
      campaignId: campaign.id,
      ...target,
      decision: "pending",
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    await this.repository.createAccessReviewCampaign(campaign, items);
    await this.appendAudit(actor, "access-review.created", campaign.id, {
      name: campaign.name,
      dueAt,
      itemCount: items.length,
    });
    return campaign;
  }

  async reviewAccessItem(
    itemId: string,
    expectedRevision: number,
    input: ReviewAccessItemInput,
    actor: ExperimentActor,
  ): Promise<AccessReviewItem> {
    assertHumanPermission(actor, "access-reviews:manage");
    const workspaceId = actorWorkspaceId(actor);
    const current = (
      await this.repository.listAccessReviewItems(workspaceId)
    ).find((item) => item.id === itemId);
    if (!current) {
      throw new ExperimentNotFoundError(
        `Access review item ${itemId} was not found`,
      );
    }
    const campaign = await this.repository.getAccessReviewCampaign(
      current.campaignId,
    );
    if (!campaign || campaign.status !== "open") {
      throw new ExperimentConflictError(
        "Access review campaign is no longer open",
      );
    }
    if (Date.parse(campaign.dueAt) <= this.now().getTime()) {
      throw new ExperimentConflictError(
        "Access review campaign is overdue and requires automatic enforcement",
      );
    }
    if (current.decision !== "pending") {
      return current;
    }
    if (current.targetSubject === actor.id) {
      throw new ExperimentPermissionError(
        "Reviewers cannot attest their own access",
      );
    }
    const timestamp = this.now().toISOString();
    const justification = normalizeRequired(
      input.justification,
      "justification",
      500,
    );
    if (input.decision === "revoke") {
      await this.applyAccessRevocation(current, actor.id, timestamp);
    }
    const next = await this.repository.updateAccessReviewItem(
      {
        ...current,
        decision: input.decision,
        reviewerId: actor.id,
        justification,
        reviewedAt: timestamp,
        revision: current.revision + 1,
        updatedAt: timestamp,
      },
      expectedRevision,
    );
    await this.appendAudit(
      actor,
      "access-review.item-reviewed",
      itemId,
      {
        campaignId: campaign.id,
        targetType: current.targetType,
        targetId: current.targetId,
        decision: input.decision,
        justification,
      },
    );
    await this.completeCampaignIfReady(campaign, actor, false);
    return next;
  }

  async requestBreakGlass(
    input: RequestBreakGlassInput,
    actor: ExperimentActor,
  ): Promise<BreakGlassRequest> {
    assertActorPermission(actor, "workspace:read");
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        "Only a human member may request break-glass access",
      );
    }
    if (
      !Number.isInteger(input.ttlMinutes) ||
      input.ttlMinutes < 5 ||
      input.ttlMinutes > 60
    ) {
      throw new ExperimentValidationError(
        "Break-glass ttlMinutes must be an integer from 5 to 60",
      );
    }
    const permissionGrants = [...new Set(input.permissionGrants)];
    if (
      permissionGrants.length === 0 ||
      permissionGrants.some(
        (permission) =>
          !BREAK_GLASS_ALLOWED_PERMISSIONS.has(permission),
      )
    ) {
      throw new ExperimentValidationError(
        "Break-glass permissions contain an unsupported grant",
      );
    }
    const workspaceId = actorWorkspaceId(actor);
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    const issuer = identityIssuer(actor);
    const existing = await this.repository.listBreakGlassRequests(
      workspaceId,
    );
    if (
      existing.some(
        (request) =>
          request.issuer === issuer &&
          request.subject === actor.id &&
          (request.status === "pending-approval" ||
            (
              request.status === "active" &&
              Date.parse(request.expiresAt) > this.now().getTime()
            )),
      )
    ) {
      throw new ExperimentConflictError(
        "Identity already has a pending or active break-glass request",
      );
    }
    const requestedAt = this.now().toISOString();
    const request = await this.repository.createBreakGlassRequest({
      id: `break-glass-${this.id()}`,
      organizationId: workspace.organizationId,
      workspaceId,
      issuer,
      subject: actor.id,
      requesterId: actor.id,
      purpose: normalizeRequired(input.purpose, "purpose", 500),
      permissionGrants,
      requestedAt,
      expiresAt: new Date(
        Date.parse(requestedAt) + input.ttlMinutes * 60_000,
      ).toISOString(),
      status: "pending-approval",
      approvals: [],
      revision: 1,
      createdAt: requestedAt,
      updatedAt: requestedAt,
    });
    await this.appendAudit(actor, "break-glass.requested", request.id, {
      purpose: request.purpose,
      permissionGrants,
      expiresAt: request.expiresAt,
    });
    return request;
  }

  async approveBreakGlass(
    requestId: string,
    expectedRevision: number,
    actor: ExperimentActor,
  ): Promise<BreakGlassRequest> {
    assertHumanPermission(actor, "break-glass:manage");
    const current = await this.requireBreakGlassRequest(requestId, actor);
    if (current.status !== "pending-approval") {
      throw new ExperimentConflictError(
        "Only pending break-glass requests can be approved",
      );
    }
    if (current.requesterId === actor.id) {
      throw new ExperimentPermissionError(
        "Break-glass requesters cannot approve their own access",
      );
    }
    if (
      current.approvals.some(
        (approval) => approval.approverId === actor.id,
      )
    ) {
      throw new ExperimentConflictError(
        "The same approver cannot approve twice",
      );
    }
    if (Date.parse(current.expiresAt) <= this.now().getTime()) {
      throw new ExperimentConflictError(
        "Break-glass request expired before activation",
      );
    }
    const timestamp = this.now().toISOString();
    const approvals = [
      ...current.approvals,
      { approverId: actor.id, approvedAt: timestamp },
    ];
    const activated = approvals.length >= 2;
    const next = await this.repository.updateBreakGlassRequest(
      {
        ...current,
        approvals,
        status: activated ? "active" : "pending-approval",
        activatedAt: activated ? timestamp : undefined,
        revision: current.revision + 1,
        updatedAt: timestamp,
      },
      expectedRevision,
    );
    await this.appendAudit(actor, "break-glass.approved", requestId, {
      approvalCount: approvals.length,
      requiredApprovals: 2,
    });
    if (activated) {
      await this.appendAudit(actor, "break-glass.activated", requestId, {
        expiresAt: next.expiresAt,
        permissionGrants: next.permissionGrants,
        approverIds: approvals.map((approval) => approval.approverId),
      });
    }
    return next;
  }

  async revokeBreakGlass(
    requestId: string,
    expectedRevision: number,
    actor: ExperimentActor,
  ): Promise<BreakGlassRequest> {
    const current = await this.requireBreakGlassRequest(requestId, actor);
    const requesterRevoking =
      actorPrincipalType(actor) === "human" &&
      current.requesterId === actor.id;
    if (!requesterRevoking) {
      assertHumanPermission(actor, "break-glass:manage");
    }
    if (current.status !== "active") {
      throw new ExperimentConflictError(
        "Only active break-glass access can be revoked",
      );
    }
    const timestamp = this.now().toISOString();
    const next = await this.repository.updateBreakGlassRequest(
      {
        ...current,
        status: "revoked-review-required",
        revokedBy: actor.id,
        revokedAt: timestamp,
        revision: current.revision + 1,
        updatedAt: timestamp,
      },
      expectedRevision,
    );
    await this.appendAudit(actor, "break-glass.revoked", requestId, {
      requesterRevoking,
    });
    return next;
  }

  async reviewBreakGlass(
    requestId: string,
    expectedRevision: number,
    outcome: "appropriate" | "policy-violation",
    note: string,
    actor: ExperimentActor,
  ): Promise<BreakGlassRequest> {
    assertHumanPermission(actor, "break-glass:manage");
    const current = await this.requireBreakGlassRequest(requestId, actor);
    if (
      current.status !== "expired-review-required" &&
      current.status !== "revoked-review-required"
    ) {
      throw new ExperimentConflictError(
        "Break-glass request does not require post-event review",
      );
    }
    if (current.requesterId === actor.id) {
      throw new ExperimentPermissionError(
        "Break-glass requesters cannot review their own access",
      );
    }
    const timestamp = this.now().toISOString();
    const next = await this.repository.updateBreakGlassRequest(
      {
        ...current,
        status: "closed",
        reviewOutcome: outcome,
        reviewNote: normalizeRequired(note, "review note", 1_000),
        reviewedBy: actor.id,
        reviewedAt: timestamp,
        revision: current.revision + 1,
        updatedAt: timestamp,
      },
      expectedRevision,
    );
    await this.appendAudit(actor, "break-glass.reviewed", requestId, {
      outcome,
    });
    return next;
  }

  async enforceAccessGovernance(
    actor: ExperimentActor,
  ): Promise<{
    expiredDelegations: string[];
    expiredBreakGlass: string[];
    autoRevokedItems: string[];
  }> {
    if (actorPrincipalType(actor) !== "system") {
      assertHumanPermission(actor, "access-reviews:manage");
    }
    const workspaceId = actorWorkspaceId(actor);
    const timestamp = this.now().toISOString();
    const now = Date.parse(timestamp);
    const expiredDelegations: string[] = [];
    for (
      const grant of await this.repository.listDelegatedAdministrationGrants(
        workspaceId,
      )
    ) {
      if (
        grant.status === "active" &&
        grant.expiresAt &&
        Date.parse(grant.expiresAt) <= now
      ) {
        await this.repository.updateDelegatedAdministrationGrant(
          {
            ...grant,
            status: "expired",
            revision: grant.revision + 1,
            updatedAt: timestamp,
          },
          grant.revision,
        );
        expiredDelegations.push(grant.id);
        await this.appendAudit(actor, "delegation.revoked", grant.id, {
          reason: "expired",
          expiresAt: grant.expiresAt,
        });
      }
    }
    const expiredBreakGlass: string[] = [];
    for (
      const request of await this.repository.listBreakGlassRequests(
        workspaceId,
      )
    ) {
      if (
        request.status === "pending-approval" &&
        Date.parse(request.expiresAt) <= now
      ) {
        await this.repository.updateBreakGlassRequest(
          {
            ...request,
            status: "closed",
            reviewOutcome: "appropriate",
            reviewNote: "Request expired before activation",
            reviewedBy: actor.id,
            reviewedAt: timestamp,
            revision: request.revision + 1,
            updatedAt: timestamp,
          },
          request.revision,
        );
        continue;
      }
      if (
        request.status === "active" &&
        Date.parse(request.expiresAt) <= now
      ) {
        await this.repository.updateBreakGlassRequest(
          {
            ...request,
            status: "expired-review-required",
            revision: request.revision + 1,
            updatedAt: timestamp,
          },
          request.revision,
        );
        expiredBreakGlass.push(request.id);
        await this.appendAudit(actor, "break-glass.expired", request.id, {
          expiresAt: request.expiresAt,
        });
      }
    }
    const autoRevokedItems: string[] = [];
    const campaigns = await this.repository.listAccessReviewCampaigns(
      workspaceId,
    );
    for (const campaign of campaigns) {
      if (
        campaign.status !== "open" ||
        Date.parse(campaign.dueAt) > now
      ) {
        continue;
      }
      const items = await this.repository.listAccessReviewItems(
        workspaceId,
        campaign.id,
      );
      let campaignAutoRevocations = 0;
      for (const item of items) {
        if (item.decision !== "pending") {
          continue;
        }
        await this.applyAccessRevocation(item, actor.id, timestamp);
        await this.repository.updateAccessReviewItem(
          {
            ...item,
            decision: "auto-revoke",
            reviewerId: actor.id,
            justification: "Campaign deadline elapsed without attestation",
            reviewedAt: timestamp,
            revision: item.revision + 1,
            updatedAt: timestamp,
          },
          item.revision,
        );
        autoRevokedItems.push(item.id);
        campaignAutoRevocations += 1;
        await this.appendAudit(
          actor,
          "access-review.auto-revoked",
          item.id,
          {
            campaignId: campaign.id,
            targetType: item.targetType,
            targetId: item.targetId,
          },
        );
      }
      await this.repository.updateAccessReviewCampaign(
        {
          ...campaign,
          status: "completed-with-auto-revocations",
          completedAt: timestamp,
          revision: campaign.revision + 1,
        },
        campaign.revision,
      );
      await this.appendAudit(
        actor,
        "access-review.completed",
        campaign.id,
        {
          autoRevocationCount: campaignAutoRevocations,
        },
      );
    }
    return {
      expiredDelegations,
      expiredBreakGlass,
      autoRevokedItems,
    };
  }

  private async applyAccessRevocation(
    item: AccessReviewItem,
    actorId: string,
    timestamp: string,
  ): Promise<void> {
    if (item.targetType === "membership") {
      const membership = (
        await this.repository.listWorkspaceMemberships(item.workspaceId)
      ).find((candidate) => candidate.id === item.targetId);
      if (membership?.status === "active") {
        await this.repository.upsertWorkspaceMembership({
          ...membership,
          status: "suspended",
          updatedAt: timestamp,
        });
      }
      return;
    }
    if (item.targetType === "service-account") {
      const account = await this.repository.getServiceAccount(item.targetId);
      if (account && account.status !== "revoked") {
        await this.repository.updateServiceAccount(
          {
            ...account,
            status: "revoked",
            revision: account.revision + 1,
            updatedAt: timestamp,
          },
          account.revision,
        );
      }
      return;
    }
    const grant =
      await this.repository.getDelegatedAdministrationGrant(item.targetId);
    if (grant?.status === "active") {
      await this.repository.updateDelegatedAdministrationGrant(
        {
          ...grant,
          status: "revoked",
          revokedBy: actorId,
          revokedAt: timestamp,
          revision: grant.revision + 1,
          updatedAt: timestamp,
        },
        grant.revision,
      );
    }
  }

  private async completeCampaignIfReady(
    campaign: AccessReviewCampaign,
    actor: ExperimentActor,
    autoRevoked: boolean,
  ): Promise<void> {
    const items = await this.repository.listAccessReviewItems(
      campaign.workspaceId,
      campaign.id,
    );
    if (items.some((item) => item.decision === "pending")) {
      return;
    }
    const completedAt = this.now().toISOString();
    await this.repository.updateAccessReviewCampaign(
      {
        ...campaign,
        status: autoRevoked
          ? "completed-with-auto-revocations"
          : "completed",
        completedAt,
        revision: campaign.revision + 1,
      },
      campaign.revision,
    );
    await this.appendAudit(actor, "access-review.completed", campaign.id, {
      autoRevocationCount: items.filter(
        (item) => item.decision === "auto-revoke",
      ).length,
    });
  }

  private async requireBreakGlassRequest(
    requestId: string,
    actor: ExperimentActor,
  ): Promise<BreakGlassRequest> {
    const request = await this.repository.getBreakGlassRequest(requestId);
    if (
      !request ||
      request.workspaceId !== actorWorkspaceId(actor)
    ) {
      throw new ExperimentNotFoundError(
        `Break-glass request ${requestId} was not found`,
      );
    }
    return request;
  }

  private async requireServiceAccount(
    accountId: string,
    actor: ExperimentActor,
  ): Promise<ServiceAccount> {
    const account = await this.repository.getServiceAccount(accountId);
    if (!account || account.workspaceId !== actorWorkspaceId(actor)) {
      throw new ExperimentNotFoundError(
        `Service account ${accountId} was not found`,
      );
    }
    return account;
  }
}
