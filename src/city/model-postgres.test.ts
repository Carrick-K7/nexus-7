// @vitest-environment node

import {
  afterAll,
  describe,
  expect,
  it,
} from "vitest";
import {
  ExperimentService,
  PostgresExperimentRepository,
  type ExperimentActor,
} from "@/experiments";
import {
  GovernanceService,
} from "@/governance";
import {
  CityModelService,
} from "./model-service";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe("PostgreSQL coherent city model", () => {
  const repository = databaseUrl
    ? new PostgresExperimentRepository(databaseUrl)
    : null;

  afterAll(async () => {
    await repository?.close();
  });

  it("atomically persists typed records and append-only incident events", async () => {
    const suffix = `${Date.now()}-${crypto.randomUUID()}`;
    let sequence = 0;
    const experiments = new ExperimentService(repository!, {
      id: () => `city-pg-experiment-${suffix}-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository!, {
      id: () => `city-pg-governance-${suffix}-${++sequence}`,
    });
    await governance.initialize();
    const service = new CityModelService(repository!, {
      id: () => `city-pg-${suffix}-${++sequence}`,
    });
    await service.initialize();
    const actor: ExperimentActor = {
      id: `city-pg-admin-${suffix}`,
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "development",
    };
    const incident = await service.injectScenario(
      "city-environment-conflicting-objectives",
      actor,
    );
    expect(incident).not.toBeNull();

    const secondRepository = new PostgresExperimentRepository(databaseUrl!);
    try {
      await secondRepository.initialize();
      const stored = await secondRepository.getLifecycleRecord(
        incident!.id,
      );
      expect(stored).toMatchObject({
        id: incident!.id,
        kind: "city-incident",
        status: "detected",
        revision: 1,
      });
      expect(
        (
          await secondRepository.listLifecycleRecords(
            actor.workspaceId!,
            { kind: "city-scenario-truth" },
          )
        ).length,
      ).toBeGreaterThanOrEqual(20);
      expect(
        await secondRepository.listLifecycleEvents(
          actor.workspaceId!,
          { aggregateId: incident!.id },
        ),
      ).toHaveLength(1);
    } finally {
      await secondRepository.close();
    }
  });
});
