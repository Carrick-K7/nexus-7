// @vitest-environment node

import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  actorPermissions,
  ExperimentPermissionError,
  ExperimentService,
  InMemoryExperimentRepository,
  type ExperimentActor,
} from "@/experiments";
import {
  GovernanceService,
} from "./service";

describe("delegated access governance and break-glass", () => {
  let repository: InMemoryExperimentRepository;
  let governance: GovernanceService;
  let now: Date;
  let sequence: number;

  const admin: ExperimentActor = {
    id: "root-admin",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "oidc",
    issuer: "https://identity.example",
  };
  const secondAdmin: ExperimentActor = {
    ...admin,
    id: "second-admin",
  };

  beforeEach(async () => {
    repository = new InMemoryExperimentRepository();
    now = new Date("2026-07-18T08:00:00.000Z");
    sequence = 0;
    const experiments = new ExperimentService(repository, {
      now: () => now,
      id: () => `access-experiment-${++sequence}`,
    });
    await experiments.initialize();
    governance = new GovernanceService(repository, {
      now: () => now,
      id: () => `access-governance-${++sequence}`,
    });
    await governance.initialize();
  });

  async function addMember(
    subject: string,
    role: "viewer" | "operator" | "admin" = "viewer",
  ): Promise<void> {
    await governance.upsertMembership(
      {
        issuer: "https://identity.example",
        subject,
        role,
      },
      admin,
    );
  }

  async function resolveMember(
    subject: string,
  ): Promise<ExperimentActor> {
    return governance.resolveActor({
      id: subject,
      role: "viewer",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "oidc",
      issuer: "https://identity.example",
    });
  }

  it("uses fixed delegated duties and keeps identity management separate from review", async () => {
    await addMember("identity-manager");
    await addMember("access-reviewer");
    const identityGrant = await governance.createDelegation(
      {
        issuer: "https://identity.example",
        subject: "identity-manager",
        duty: "identity-manager",
      },
      admin,
    );
    const manager = await resolveMember("identity-manager");
    expect(actorPermissions(manager)).toEqual(
      expect.arrayContaining([
        "memberships:manage",
        "service-accounts:manage",
      ]),
    );
    expect(actorPermissions(manager)).not.toContain(
      "access-reviews:manage",
    );
    await governance.upsertMembership(
      {
        issuer: "https://identity.example",
        subject: "managed-user",
        role: "operator",
      },
      manager,
    );
    await expect(
      governance.createDelegation(
        {
          issuer: "https://identity.example",
          subject: "identity-manager",
          duty: "access-reviewer",
        },
        admin,
      ),
    ).rejects.toThrow("must remain separated");

    const reviewGrant = await governance.createDelegation(
      {
        issuer: "https://identity.example",
        subject: "access-reviewer",
        duty: "access-reviewer",
      },
      admin,
    );
    const reviewer = await resolveMember("access-reviewer");
    const campaign = await governance.createAccessReviewCampaign(
      {
        name: "Quarterly review",
        dueAt: "2026-07-18T09:00:00.000Z",
      },
      reviewer,
    );
    const managedItem = (
      await repository.listAccessReviewItems(
        "workspace-neo-angeles",
        campaign.id,
      )
    ).find((item) => item.targetSubject === "managed-user");
    expect(managedItem).toBeDefined();
    await governance.reviewAccessItem(
      managedItem!.id,
      managedItem!.revision,
      {
        decision: "revoke",
        justification: "Project access ended",
      },
      reviewer,
    );
    expect(
      await repository.getWorkspaceMembership(
        "workspace-neo-angeles",
        "https://identity.example",
        "managed-user",
      ),
    ).toMatchObject({ status: "suspended" });

    const ownItem = (
      await repository.listAccessReviewItems(
        "workspace-neo-angeles",
        campaign.id,
      )
    ).find((item) => item.targetSubject === reviewer.id);
    await expect(
      governance.reviewAccessItem(
        ownItem!.id,
        ownItem!.revision,
        {
          decision: "retain",
          justification: "Still reviewing access",
        },
        reviewer,
      ),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);

    now = new Date("2026-07-18T09:01:00.000Z");
    const enforced = await governance.enforceAccessGovernance({
      id: "system:access-governance",
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "system",
      authSource: "system",
    });
    expect(enforced.autoRevokedItems.length).toBeGreaterThan(0);
    expect(
      await repository.getAccessReviewCampaign(campaign.id),
    ).toMatchObject({
      status: "completed-with-auto-revocations",
    });
    expect(
      await repository.getDelegatedAdministrationGrant(identityGrant.id),
    ).toMatchObject({ status: "revoked" });
    expect(
      await repository.getDelegatedAdministrationGrant(reviewGrant.id),
    ).toMatchObject({ status: "revoked" });
  });

  it("requires two distinct approvers, revokes at TTL, and mandates post-event review", async () => {
    await addMember("emergency-operator", "operator");
    const requester = await resolveMember("emergency-operator");
    const request = await governance.requestBreakGlass(
      {
        purpose: "Restore a failed production deployment controller",
        permissionGrants: ["policy:manage", "deployment:control"],
        ttlMinutes: 15,
      },
      requester,
    );
    const firstApproval = await governance.approveBreakGlass(
      request.id,
      request.revision,
      admin,
    );
    expect(firstApproval).toMatchObject({
      status: "pending-approval",
      approvals: [{ approverId: admin.id }],
    });
    await expect(
      governance.approveBreakGlass(
        request.id,
        firstApproval.revision,
        admin,
      ),
    ).rejects.toThrow("cannot approve twice");
    const activated = await governance.approveBreakGlass(
      request.id,
      firstApproval.revision,
      secondAdmin,
    );
    expect(activated).toMatchObject({
      status: "active",
      revision: 3,
    });
    expect(actorPermissions(await resolveMember(requester.id))).toEqual(
      expect.arrayContaining(["policy:manage", "deployment:control"]),
    );

    now = new Date("2026-07-18T08:16:00.000Z");
    expect(actorPermissions(await resolveMember(requester.id))).not.toContain(
      "policy:manage",
    );
    const enforcement = await governance.enforceAccessGovernance({
      id: "system:access-governance",
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "system",
      authSource: "system",
    });
    expect(enforcement.expiredBreakGlass).toEqual([request.id]);
    const expired = await repository.getBreakGlassRequest(request.id);
    expect(expired).toMatchObject({
      status: "expired-review-required",
    });
    const reviewed = await governance.reviewBreakGlass(
      request.id,
      expired!.revision,
      "appropriate",
      "Emergency access matched the declared purpose",
      admin,
    );
    expect(reviewed).toMatchObject({
      status: "closed",
      reviewOutcome: "appropriate",
      reviewedBy: admin.id,
    });
    const overview = await governance.overview(admin);
    expect(overview.riskReport.breakGlassReviewRequiredIds).toEqual([]);
    expect(
      overview.audit.map((entry) => entry.action),
    ).toEqual(
      expect.arrayContaining([
        "break-glass.requested",
        "break-glass.approved",
        "break-glass.activated",
        "break-glass.expired",
        "break-glass.reviewed",
      ]),
    );
  });

  it("reports orphaned, expired, and stale service-account credentials", async () => {
    const account = await governance.createServiceAccount(
      {
        name: "Unused worker",
        issuer: "https://issuer.example",
        subject: "unused-worker",
        role: "operator",
        workloadKind: "worker",
        expiresAt: "2026-07-19T08:00:00.000Z",
      },
      admin,
    );
    now = new Date("2026-10-20T08:00:00.000Z");

    const overview = await governance.overview(admin);
    expect(overview.riskReport).toMatchObject({
      orphanedServiceAccountIds: [account.id],
      expiredServiceAccountIds: [account.id],
      credentialsDueForRotationIds: [account.id],
    });
  });
});
