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
      expect(
        await secondRepository.listResidents(
          "workspace-neo-angeles",
          `symbiosis-pg-${suffix}`,
        ),
      ).toHaveLength(260);
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
      expect(
        await secondRepository.listCognitiveDecisions(
          "workspace-neo-angeles",
          `symbiosis-pg-${suffix}`,
        ),
      ).toHaveLength(4);
    } finally {
      await secondRepository.close();
    }
  });
});
