// @vitest-environment node

import { afterAll, describe, expect, it } from "vitest";
import {
  ExperimentConflictError,
  ExperimentService,
  PostgresExperimentRepository,
} from "@/experiments";
import { ControlledIterationService } from "@/iteration";
import { GovernanceService } from "@/governance";
import { ExperimentClockWorker } from "@/workers/experiment-clock";

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgresDescribe = databaseUrl ? describe : describe.skip;
const repository = databaseUrl
  ? new PostgresExperimentRepository(databaseUrl)
  : null;

postgresDescribe("PostgreSQL experiment repository", () => {
  afterAll(async () => {
    await repository?.close();
  });

  it("persists runs, events, snapshots, audit, and optimistic locks", async () => {
    let sequence = 0;
    const service = new ExperimentService(repository!, {
      id: () => `pg-${Date.now()}-${++sequence}`,
    });
    await service.initialize();
    const actor = { id: "postgres-test", role: "admin" as const };
    let run = await service.createRun(
      { name: `Postgres ${Date.now()}`, seed: "postgres-seed" },
      actor,
    );

    for (let index = 0; index < 5; index += 1) {
      run = await service.mutateRun(
        run.id,
        run.version,
        { type: "step" },
        actor,
      );
    }

    const [events, snapshots, audit, report] = await Promise.all([
      repository!.listEvents(run.id),
      repository!.listSnapshots(run.id),
      repository!.listAudit(run.id),
      service.report(run.id),
    ]);
    expect(events.length).toBeGreaterThan(0);
    expect(snapshots.map((snapshot) => snapshot.tick)).toEqual([0, 5]);
    expect(audit).toHaveLength(6);
    expect(report.verification.deterministicReplay).toBe(true);

    await expect(
      service.mutateRun(run.id, 1, { type: "step" }, actor),
    ).rejects.toBeInstanceOf(ExperimentConflictError);

    run = await service.mutateRun(
      run.id,
      run.version,
      { type: "resume" },
      actor,
    );
    const leaseName = `postgres-clock-${Date.now()}`;
    const leader = new ExperimentClockWorker(service, {
      ownerId: "postgres-clock-leader",
      leaseName,
      leaseTtlMs: 10_000,
    });
    const standby = new ExperimentClockWorker(service, {
      ownerId: "postgres-clock-standby",
      leaseName,
      leaseTtlMs: 10_000,
    });
    const leaderCycle = await leader.runCycle();
    expect(leaderCycle.leaseAcquired).toBe(true);
    expect(leaderCycle.advanced).toContain(run.id);
    expect(await standby.runCycle()).toEqual({
      leaseAcquired: false,
      advanced: [],
      conflicts: [],
    });
    expect((await repository!.getWorkerLease(leaseName))?.ownerId).toBe(
      "postgres-clock-leader",
    );
    await repository!.releaseWorkerLease(
      leaseName,
      "postgres-clock-leader",
    );
    const standbyCycle = await standby.runCycle();
    expect(standbyCycle.leaseAcquired).toBe(true);
    expect(standbyCycle.advanced).toContain(run.id);

    const iterations = new ControlledIterationService(service);
    const proposal = await iterations.propose(run.id, actor);
    const evaluated = await iterations.act(
      proposal.id,
      proposal.revision,
      { type: "run-experiment" },
      actor,
    );
    expect(
      (await repository!.getImprovement(proposal.id))?.evaluation
        ?.deterministicReplay,
    ).toBe(true);
    expect(await repository!.listIterationDecisions(evaluated.id)).toHaveLength(
      3,
    );
  });

  it("persists authoritative memberships and service-account lifecycle", async () => {
    let sequence = 0;
    const suffix = `${Date.now()}`;
    const experiments = new ExperimentService(repository!, {
      id: () => `governance-pg-experiment-${suffix}-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository!, {
      id: () => `governance-pg-${suffix}-${++sequence}`,
    });
    await governance.initialize();
    const admin = {
      id: "postgres-governance-admin",
      role: "admin" as const,
      workspaceId: "workspace-neo-angeles",
      principalType: "human" as const,
      authSource: "oidc" as const,
      issuer: "https://identity.example",
    };

    await governance.upsertMembership(
      {
        issuer: "https://identity.example",
        subject: `member-${suffix}`,
        role: "viewer",
      },
      admin,
    );
    const account = await governance.createServiceAccount(
      {
        name: `Postgres worker ${suffix}`,
        issuer: "https://workload.example",
        subject: `worker-${suffix}`,
        role: "operator",
        workloadKind: "worker",
      },
      admin,
    );
    const rotated = await governance.rotateServiceAccount(
      account.id,
      account.revision,
      admin,
    );

    expect(
      await repository!.getWorkspaceMembership(
        "workspace-neo-angeles",
        "https://identity.example",
        `member-${suffix}`,
      ),
    ).toMatchObject({
      role: "viewer",
      status: "active",
    });
    expect(await repository!.getServiceAccount(account.id)).toMatchObject({
      credentialVersion: 2,
      revision: 2,
    });
    expect(rotated.credentialVersion).toBe(2);
    expect(
      (await repository!.listGovernanceAudit("workspace-neo-angeles"))
        .map((record) => record.action),
    ).toEqual(
      expect.arrayContaining([
        "membership.upserted",
        "service-account.created",
        "service-account.rotated",
      ]),
    );
  });
});
