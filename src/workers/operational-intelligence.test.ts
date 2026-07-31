// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  ExperimentService,
  InMemoryExperimentRepository,
  type ExperimentActor,
} from "@/experiments";
import {
  GovernanceService,
} from "@/governance";
import {
  OperationalIntelligenceService,
} from "@/operations";
import {
  OperationalIntelligenceWorker,
} from "./operational-intelligence";

describe("operational intelligence worker", () => {
  it("collects and delivers under one lease while a standby is fenced out", async () => {
    const repository = new InMemoryExperimentRepository();
    const experiments = new ExperimentService(repository);
    await experiments.initialize();
    const governance = new GovernanceService(repository);
    await governance.initialize();
    const actor: ExperimentActor = {
      id: "operations-worker-test-admin",
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "development",
    };
    const service = new OperationalIntelligenceService(repository, {
      transport: {
        async send() {
          return { delivered: true, responseStatus: 202 };
        },
      },
    });
    const channel = await service.createChannel(
      {
        name: "Worker test webhook",
        endpointUrl: "https://operations.example.test/incidents",
        secretEnvName: "NEXUS_WORKER_TEST_SECRET",
      },
      actor,
    );
    await service.createRule(
      {
        code: "worker-test",
        name: "Worker test alert",
        source: "worker",
        metric: "worker-test-value",
        comparison: "greater-than",
        threshold: 0,
        severity: "warning",
        groupBy: ["worker"],
        notificationChannelIds: [channel.id],
      },
      actor,
    );
    await service.recordSample(
      {
        source: "worker",
        metric: "worker-test-value",
        value: 1,
        unit: "count",
        status: "breaching",
        dimensions: { worker: "test" },
      },
      actor,
    );

    let collections = 0;
    const collect = async () => {
      collections += 1;
      return { samples: 0, occurrences: 0, incidents: 0 };
    };
    const leader = new OperationalIntelligenceWorker(
      repository,
      service,
      {
        ownerId: "operations-leader",
        leaseTtlMs: 10_000,
        collect,
      },
    );
    const standby = new OperationalIntelligenceWorker(
      repository,
      service,
      {
        ownerId: "operations-standby",
        leaseTtlMs: 10_000,
        collect,
      },
    );

    expect(await leader.runCycle()).toMatchObject({
      leaseAcquired: true,
      deliveriesProcessed: 1,
    });
    expect(collections).toBe(1);
    expect(await standby.runCycle()).toEqual({
      leaseAcquired: false,
      deliveriesProcessed: 0,
      samplesPruned: 0,
    });

    await repository.releaseWorkerLease(
      "operational-intelligence",
      "operations-leader",
    );
    expect(await standby.runCycle()).toMatchObject({
      leaseAcquired: true,
      deliveriesProcessed: 0,
    });
    expect(collections).toBe(2);
  });
});
