// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import {
  actorPermissions,
  ExperimentPermissionError,
  ExperimentService,
  InMemoryExperimentRepository,
} from "@/experiments";
import type {
  ExperimentActor,
} from "@/experiments";
import {
  GovernanceService,
} from "./service";

describe("persistent identity governance", () => {
  let repository: InMemoryExperimentRepository;
  let governance: GovernanceService;
  let sequence: number;

  const admin: ExperimentActor = {
    id: "human-admin",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "oidc",
    issuer: "https://identity.example",
  };

  beforeEach(async () => {
    repository = new InMemoryExperimentRepository();
    sequence = 0;
    const experiments = new ExperimentService(repository, {
      now: () => new Date("2026-07-16T14:00:00.000Z"),
      id: () => `experiment-${++sequence}`,
    });
    await experiments.initialize();
    governance = new GovernanceService(repository, {
      now: () => new Date("2026-07-16T14:00:00.000Z"),
      id: () => `governance-${++sequence}`,
    });
    await governance.initialize();
  });

  it("uses the persistent membership role instead of the asserted OIDC role", async () => {
    await governance.upsertMembership(
      {
        issuer: "https://identity.example",
        subject: "alice",
        role: "viewer",
      },
      admin,
    );

    const resolved = await governance.resolveActor({
      id: "alice",
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "oidc",
      issuer: "https://identity.example",
    });

    expect(resolved.role).toBe("viewer");
    expect(resolved.organizationId).toBe("organization-nexus-7");
    expect(actorPermissions(resolved)).toEqual([
      "workspace:read",
      "governance:read",
      "operations:read",
      "participation:read",
      "participation:contribute",
      "closure:read",
    ]);
    expect(actorPermissions(resolved)).not.toContain(
      "participation:moderate",
    );
    expect(actorPermissions(resolved)).not.toContain(
      "participation:approve",
    );
  });

  it("rejects missing and suspended production memberships", async () => {
    const actor: ExperimentActor = {
      id: "bob",
      role: "operator",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "proxy",
      issuer: "trusted-proxy",
    };

    await expect(governance.resolveActor(actor)).rejects.toBeInstanceOf(
      ExperimentPermissionError,
    );
    await governance.upsertMembership(
      {
        issuer: "trusted-proxy",
        subject: "bob",
        role: "operator",
        status: "suspended",
      },
      admin,
    );
    await expect(governance.resolveActor(actor)).rejects.toBeInstanceOf(
      ExperimentPermissionError,
    );
  });

  it("auto-bootstraps identities only in explicit development mode", async () => {
    const resolved = await governance.resolveActor({
      id: "local-observer",
      role: "viewer",
      workspaceId: "workspace-development",
      principalType: "human",
      authSource: "development",
    });

    expect(resolved.role).toBe("viewer");
    expect(
      await repository.getWorkspaceMembership(
        "workspace-development",
        "development",
        "local-observer",
      ),
    ).toMatchObject({
      role: "viewer",
      status: "active",
    });
  });

  it("manages service-account rotation, suspension, revocation, and audit", async () => {
    const account = await governance.createServiceAccount(
      {
        name: "CI evaluator",
        issuer: "https://token.actions.githubusercontent.com",
        subject: "repo:example/nexus:ref:refs/heads/main",
        role: "admin",
        workloadKind: "deployment-controller",
        expiresAt: "2026-07-17T14:00:00.000Z",
      },
      admin,
    );
    const resolved = await governance.resolveActor({
      id: account.subject,
      role: "admin",
      workspaceId: account.workspaceId,
      principalType: "service-account",
      authSource: "oidc",
      issuer: account.issuer,
    });

    expect(resolved.serviceAccountId).toBe(account.id);
    expect(actorPermissions(resolved)).not.toContain("iterations:approve");
    expect(actorPermissions(resolved)).not.toContain("memberships:manage");
    expect(actorPermissions(resolved)).toEqual([
      "workspace:read",
      "governance:read",
      "operations:read",
      "operations:write",
      "deployment:control",
    ]);

    const rotated = await governance.rotateServiceAccount(
      account.id,
      account.revision,
      admin,
    );
    expect(rotated.credentialVersion).toBe(2);
    expect(rotated.revision).toBe(2);

    const suspended = await governance.setServiceAccountStatus(
      account.id,
      "suspended",
      rotated.revision,
      admin,
    );
    await expect(
      governance.resolveActor({
        ...resolved,
        serviceAccountId: undefined,
      }),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);

    const revoked = await governance.setServiceAccountStatus(
      account.id,
      "revoked",
      suspended.revision,
      admin,
    );
    await expect(
      governance.setServiceAccountStatus(
        account.id,
        "active",
        revoked.revision,
        admin,
      ),
    ).rejects.toThrow("cannot be reactivated");

    const overview = await governance.overview(admin);
    expect(overview.serviceAccounts[0]).toMatchObject({
      id: account.id,
      status: "revoked",
      credentialVersion: 2,
    });
    expect(overview.audit.map((record) => record.action)).toEqual([
      "service-account.revoked",
      "service-account.suspended",
      "service-account.rotated",
      "service-account.created",
    ]);
  });
});
