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
} from "@/city/model-service";
import {
  DiagnosisService,
} from "./service";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe("PostgreSQL causal diagnosis", () => {
  const repository = databaseUrl
    ? new PostgresExperimentRepository(databaseUrl)
    : null;

  afterAll(async () => {
    await repository?.close();
  });

  it("atomically persists diagnosis aggregate and causal event history", async () => {
    const suffix = `${Date.now()}-${crypto.randomUUID()}`;
    let sequence = 0;
    const experiments = new ExperimentService(repository!, {
      id: () => `diagnosis-pg-experiment-${suffix}-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository!, {
      id: () => `diagnosis-pg-governance-${suffix}-${++sequence}`,
    });
    await governance.initialize();
    const city = new CityModelService(repository!, {
      id: () => `diagnosis-pg-city-${suffix}-${++sequence}`,
    });
    const service = new DiagnosisService(repository!, city, {
      id: () => `diagnosis-pg-${suffix}-${++sequence}`,
    });
    await service.initialize();
    const actor: ExperimentActor = {
      id: `diagnosis-pg-admin-${suffix}`,
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "development",
    };
    const diagnosis = await service.diagnoseScenario(
      "city-public-safety-conflicting-objectives",
      actor,
    );

    const second = new PostgresExperimentRepository(databaseUrl!);
    try {
      await second.initialize();
      expect(
        await second.getLifecycleRecord(diagnosis.id),
      ).toMatchObject({
        id: diagnosis.id,
        kind: "causal-diagnosis",
        status: diagnosis.status,
        revision: 1,
      });
      expect(
        await second.listLifecycleEvents(actor.workspaceId!, {
          aggregateId: diagnosis.id,
        }),
      ).toHaveLength(1);
      expect(
        await second.getLifecycleRecord(
          "diagnostic-calibration-reference-v1",
        ),
      ).toMatchObject({
        kind: "diagnostic-calibration",
        status: "passed",
      });
    } finally {
      await second.close();
    }
  });
});
