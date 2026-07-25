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
  CognitiveGateway,
} from "./cognition";
import {
  PostgresWorldRepository,
} from "./postgres-repository";
import {
  WorldService,
} from "./service";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe("PostgreSQL Symbiotic Shenzhen world", () => {
  const experimentRepository = databaseUrl
    ? new PostgresExperimentRepository(databaseUrl)
    : null;
  const worldRepository = databaseUrl
    ? new PostgresWorldRepository(databaseUrl)
    : null;

  afterAll(async () => {
    await Promise.all([
      experimentRepository?.close(),
      worldRepository?.close(),
    ]);
  });

  it("atomically persists normalized residents, Turns, snapshots, ledgers, and events", async () => {
    await new ExperimentService(experimentRepository!).initialize();
    const suffix = `${Date.now()}-${crypto.randomUUID()}`;
    const service = new WorldService(worldRepository!, {
      seasonId: `symbiosis-pg-${suffix}`,
      seed: `symbiosis-pg-seed-${suffix}`,
      cognitiveGateway: new CognitiveGateway({
        id: "deepseek-chat-completions",
        decide: async (_candidate, mode) => ({
          provider: "deepseek-chat-completions",
          model:
            mode === "pro"
              ? "deepseek-v4-pro"
              : "deepseek-v4-flash",
          mode: mode === "pro" ? "thinking" : "non-thinking",
          finalAnswer: {
            disposition: "engage",
            action: "negotiate-shared-community-task",
            reasonCode: "postgres-billing-roundtrip",
          },
          inputTokens: 10,
          outputTokens: 2,
          costUsd: 0.000002,
          latencyMs: 10,
          billing: {
            provider: "deepseek-chat-completions",
            model:
              mode === "pro"
                ? "deepseek-v4-pro"
                : "deepseek-v4-flash",
            pricingVersion: "deepseek-v4-usd-test",
            currency: "USD",
            inputTokens: 10,
            cacheHitInputTokens: 4,
            cacheMissInputTokens: 6,
            outputTokens: 2,
            costUsd: 0.000002,
          },
        }),
      }),
    });
    const actor: ExperimentActor = {
      id: "symbiosis-pg-admin",
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
    };
    await service.initialize();
    await service.advanceTurn(actor);
    await service.advanceTurn(actor);

    const secondRepository = new PostgresWorldRepository(databaseUrl!);
    try {
      await secondRepository.initialize();
      expect(
        await secondRepository.getSeason(
          "workspace-neo-angeles",
          `symbiosis-pg-${suffix}`,
        ),
      ).toMatchObject({ currentTurn: 2 });
      const residents = await secondRepository.listResidents(
        "workspace-neo-angeles",
        `symbiosis-pg-${suffix}`,
      );
      expect(residents).toHaveLength(260);
      expect(
        residents.every((resident) =>
          ["human", "ai", "robot"].includes(resident.kind),
        ),
      ).toBe(true);
      expect(
        await secondRepository.listCohorts(
          "workspace-neo-angeles",
          `symbiosis-pg-${suffix}`,
        ),
      ).toHaveLength(10);
      expect(
        await secondRepository.getSnapshot(
          "workspace-neo-angeles",
          `symbiosis-pg-${suffix}`,
          1,
        ),
      ).toMatchObject({ turn: 1 });
      expect(
        await secondRepository.listTurns(
          "workspace-neo-angeles",
          `symbiosis-pg-${suffix}`,
        ),
      ).toHaveLength(3);
      expect(
        await secondRepository.listRelationships(
          "workspace-neo-angeles",
          `symbiosis-pg-${suffix}`,
        ),
      ).toHaveLength(60);
      expect(
        await secondRepository.listReciprocalEpisodes(
          "workspace-neo-angeles",
          `symbiosis-pg-${suffix}`,
        ),
      ).toHaveLength(4);
      const decisions =
        await secondRepository.listCognitiveDecisions(
          "workspace-neo-angeles",
          `symbiosis-pg-${suffix}`,
        );
      expect(decisions).toHaveLength(4);
      expect(
        decisions.every(
          (decision) =>
            decision.billing?.pricingVersion ===
              "deepseek-v4-usd-test" &&
            decision.billing.cacheHitInputTokens === 4,
        ),
      ).toBe(true);
      expect((await service.observatory(actor)).cognition.deepseek).toMatchObject({
        successfulDecisions: 4,
        inputTokens: 40,
        outputTokens: 8,
        totalTokens: 48,
        costUsd: 0.000008,
      });
    } finally {
      await secondRepository.close();
    }
  });
});
