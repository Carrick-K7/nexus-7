// @vitest-environment node

import {
  afterAll,
  describe,
  expect,
  it,
} from "vitest";
import {
  actorPermissions,
  ExperimentService,
  PostgresExperimentRepository,
  type ExperimentActor,
} from "@/experiments";
import {
  GovernanceService,
} from "./service";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe("PostgreSQL access governance", () => {
  const repository = databaseUrl
    ? new PostgresExperimentRepository(databaseUrl)
    : null;

  afterAll(async () => {
    await repository?.close();
  });

  it("persists delegated duties, review campaigns, and active dual-approved access", async () => {
    const suffix = `${Date.now()}-${crypto.randomUUID()}`;
    const now = new Date("2026-07-18T08:00:00.000Z");
    let sequence = 0;
    const experiments = new ExperimentService(repository!, {
      now: () => now,
      id: () => `access-pg-experiment-${suffix}-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository!, {
      now: () => now,
      id: () => `access-pg-${suffix}-${++sequence}`,
    });
    await governance.initialize();
    const admin: ExperimentActor = {
      id: `access-pg-admin-${suffix}`,
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "oidc",
      issuer: "https://identity.example",
    };
    const secondAdmin: ExperimentActor = {
      ...admin,
      id: `access-pg-second-admin-${suffix}`,
    };
    const subject = `access-pg-operator-${suffix}`;
    await governance.upsertMembership(
      {
        issuer: "https://identity.example",
        subject,
        role: "operator",
      },
      admin,
    );
    const grant = await governance.createDelegation(
      {
        issuer: "https://identity.example",
        subject,
        duty: "operations-admin",
      },
      admin,
    );
    const operator = await governance.resolveActor({
      id: subject,
      role: "viewer",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "oidc",
      issuer: "https://identity.example",
    });
    const request = await governance.requestBreakGlass(
      {
        purpose: "PostgreSQL break-glass persistence test",
        permissionGrants: ["policy:manage"],
        ttlMinutes: 30,
      },
      operator,
    );
    const first = await governance.approveBreakGlass(
      request.id,
      request.revision,
      admin,
    );
    const active = await governance.approveBreakGlass(
      request.id,
      first.revision,
      secondAdmin,
    );
    const campaign = await governance.createAccessReviewCampaign(
      {
        name: `PostgreSQL campaign ${suffix}`,
        dueAt: "2026-07-19T08:00:00.000Z",
      },
      admin,
    );

    const secondRepository = new PostgresExperimentRepository(databaseUrl!);
    try {
      await secondRepository.initialize();
      const secondGovernance = new GovernanceService(secondRepository, {
        now: () => now,
      });
      expect(
        await secondRepository.getDelegatedAdministrationGrant(grant.id),
      ).toEqual(grant);
      expect(
        await secondRepository.getAccessReviewCampaign(campaign.id),
      ).toEqual(campaign);
      expect(
        await secondRepository.getBreakGlassRequest(active.id),
      ).toEqual(active);
      const resolved = await secondGovernance.resolveActor({
        id: subject,
        role: "viewer",
        workspaceId: "workspace-neo-angeles",
        principalType: "human",
        authSource: "oidc",
        issuer: "https://identity.example",
      });
      expect(actorPermissions(resolved)).toEqual(
        expect.arrayContaining([
          "alerts:manage",
          "incidents:manage",
          "notifications:manage",
          "policy:manage",
        ]),
      );
    } finally {
      await secondRepository.close();
    }
  });
});
