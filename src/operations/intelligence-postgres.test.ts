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
  OperationalIntelligenceService,
} from "./intelligence-service";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe("PostgreSQL operational intelligence", () => {
  const repository = databaseUrl
    ? new PostgresExperimentRepository(databaseUrl)
    : null;

  afterAll(async () => {
    await repository?.close();
  });

  it("persists samples, deduplicated incidents, occurrences, and deliveries", async () => {
    const suffix = `${Date.now()}-${crypto.randomUUID()}`;
    let sequence = 0;
    const experiments = new ExperimentService(repository!, {
      id: () => `operations-pg-experiment-${suffix}-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository!, {
      id: () => `operations-pg-governance-${suffix}-${++sequence}`,
    });
    await governance.initialize();
    const operations = new OperationalIntelligenceService(repository!, {
      id: () => `operations-pg-${suffix}-${++sequence}`,
    });
    const actor: ExperimentActor = {
      id: `operations-pg-admin-${suffix}`,
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "development",
    };
    const channel = await operations.createChannel(
      {
        name: `PostgreSQL channel ${suffix}`,
        endpointUrl: "https://operations.example.test/incidents",
        secretEnvName: "NEXUS_OPERATIONS_TEST_SECRET",
      },
      actor,
    );
    const rule = await operations.createRule(
      {
        code: `database-lag-${suffix}`,
        name: "Database replication lag",
        source: "recovery",
        metric: `replication-lag-${suffix}`,
        comparison: "greater-than",
        threshold: 1_000,
        severity: "critical",
        groupBy: ["database"],
        notificationChannelIds: [channel.id],
      },
      actor,
    );
    const first = await operations.recordSample(
      {
        source: "recovery",
        metric: rule.metric,
        value: 2_500,
        unit: "milliseconds",
        status: "breaching",
        dimensions: { database: "primary" },
      },
      actor,
    );
    const repeated = await operations.recordSample(
      {
        source: "recovery",
        metric: rule.metric,
        value: 2_200,
        unit: "milliseconds",
        status: "breaching",
        dimensions: { database: "primary" },
      },
      actor,
    );

    expect(repeated.incidents[0]).toMatchObject({
      id: first.incidents[0].id,
      occurrenceCount: 2,
      revision: 2,
    });

    const secondRepository = new PostgresExperimentRepository(databaseUrl!);
    try {
      await secondRepository.initialize();
      expect(
        await secondRepository.getOperationalIncident(
          first.incidents[0].id,
        ),
      ).toMatchObject({
        latestValue: 2_200,
        occurrenceCount: 2,
      });
      expect(
        await secondRepository.listSloSamples(actor.workspaceId!, {
          metric: rule.metric,
        }),
      ).toHaveLength(2);
      expect(
        (
          await secondRepository.listAlertOccurrences(actor.workspaceId!, {
            limit: 20,
          })
        ).filter((entry) => entry.ruleId === rule.id),
      ).toHaveLength(2);
      expect(
        (
          await secondRepository.listNotificationDeliveries(
            actor.workspaceId!,
            { limit: 200 },
          )
        ).filter((delivery) => delivery.incidentId === first.incidents[0].id),
      ).toHaveLength(1);
    } finally {
      await secondRepository.close();
    }
  });
});
