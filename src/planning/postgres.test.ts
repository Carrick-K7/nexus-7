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
} from "@/diagnosis/service";
import {
  PlanningService,
} from "./service";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe("PostgreSQL goal-constrained planning", () => {
  const repository = databaseUrl
    ? new PostgresExperimentRepository(databaseUrl)
    : null;

  afterAll(async () => {
    await repository?.close();
  });

  it("round-trips the exact deterministic design, results, and decision history", async () => {
    const suffix = `${Date.now()}-${crypto.randomUUID()}`;
    let sequence = 0;
    const experiments = new ExperimentService(repository!, {
      id: () => `planning-pg-experiment-${suffix}-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository!, {
      id: () => `planning-pg-governance-${suffix}-${++sequence}`,
    });
    await governance.initialize();
    const city = new CityModelService(repository!, {
      id: () => `planning-pg-city-${suffix}-${++sequence}`,
    });
    const diagnosis = new DiagnosisService(repository!, city, {
      id: () => `planning-pg-diagnosis-${suffix}-${++sequence}`,
    });
    await diagnosis.initialize();
    const service = new PlanningService(
      repository!,
      city,
      diagnosis,
      {
        id: () => `planning-pg-${suffix}-${++sequence}`,
      },
    );
    const actor: ExperimentActor = {
      id: `planning-pg-admin-${suffix}`,
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "development",
    };
    const plan = await service.createPlanForScenario(
      "city-economic-conflicting-objectives",
      actor,
    );

    const second = new PostgresExperimentRepository(databaseUrl!);
    try {
      await second.initialize();
      const stored = await second.getLifecycleRecord(plan.id);
      expect(stored?.data).toEqual(plan);
      expect(stored).toMatchObject({
        kind: "intervention-plan",
        status: "awaiting-approval",
        revision: 1,
      });
      expect(
        await second.listLifecycleEvents(actor.workspaceId!, {
          aggregateId: plan.id,
        }),
      ).toHaveLength(1);
    } finally {
      await second.close();
    }
  });
});
