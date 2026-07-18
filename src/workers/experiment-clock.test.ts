// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  ExperimentService,
  InMemoryExperimentRepository,
} from "@/experiments";
import {
  GovernanceService,
} from "@/governance";
import {
  OperationalIntelligenceService,
} from "@/operations";
import {
  ExperimentClockWorker,
} from "./experiment-clock";

describe("independent experiment clock", () => {
  it("advances running experiments while a competing worker is fenced out", async () => {
    const repository = new InMemoryExperimentRepository();
    let sequence = 0;
    const service = new ExperimentService(repository, {
      id: () => `clock-test-${++sequence}`,
    });
    await service.initialize();
    const actor = { id: "clock-test-admin", role: "admin" as const };
    let run = await service.createRun(
      { name: "Clock test", seed: "clock-seed" },
      actor,
    );
    run = await service.mutateRun(
      run.id,
      run.version,
      { type: "resume" },
      actor,
    );
    const leader = new ExperimentClockWorker(service, {
      ownerId: "clock-leader",
      leaseTtlMs: 10_000,
    });
    const standby = new ExperimentClockWorker(service, {
      ownerId: "clock-standby",
      leaseTtlMs: 10_000,
    });

    expect(await leader.runCycle()).toMatchObject({
      leaseAcquired: true,
      advanced: [run.id],
    });
    expect((await service.getRun(run.id)).run.world.tick).toBe(1);
    expect(await standby.runCycle()).toEqual({
      leaseAcquired: false,
      advanced: [],
      conflicts: [],
    });

    await repository.releaseWorkerLease("experiment-clock", "clock-leader");
    expect(await standby.runCycle()).toMatchObject({
      leaseAcquired: true,
      advanced: [run.id],
    });
    expect((await service.getRun(run.id)).run.world.tick).toBe(2);
  });

  it("records a heartbeat sample without coupling clock progress to telemetry", async () => {
    const repository = new InMemoryExperimentRepository();
    const service = new ExperimentService(repository);
    await service.initialize();
    const governance = new GovernanceService(repository);
    await governance.initialize();
    const operations = new OperationalIntelligenceService(repository);
    const worker = new ExperimentClockWorker(service, {
      ownerId: "clock-observed",
      operationalIntelligence: operations,
    });

    expect(await worker.runCycle()).toMatchObject({
      leaseAcquired: true,
      advanced: [],
    });
    const overview = await operations.overview({
      id: "clock-observer",
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "development",
    });
    expect(overview.samples).toContainEqual(
      expect.objectContaining({
        source: "worker",
        metric: "lease-age-ms",
        dimensions: {
          lease: "experiment-clock",
          worker: "clock-observed",
        },
      }),
    );
  });
});
