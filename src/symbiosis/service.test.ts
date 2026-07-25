// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  ExperimentConflictError,
  type ExperimentActor,
} from "@/experiments";
import {
  InMemoryWorldRepository,
} from "./memory-repository";
import {
  WorldService,
} from "./service";

const admin: ExperimentActor = {
  id: "symbiosis-admin",
  role: "admin",
  workspaceId: "workspace-neo-angeles",
  principalType: "human",
};

describe("Symbiotic Shenzhen world service", () => {
  it("persists snapshots, pseudonymized resident views, events, and honest reports", async () => {
    const repository = new InMemoryWorldRepository();
    const service = new WorldService(repository, {
      seasonId: "service-test-season",
      seed: "service-test-seed",
      now: () => new Date("2026-07-18T12:00:00.000Z"),
    });
    await service.initialize();

    for (let turn = 0; turn < 10; turn += 1) {
      await service.advanceTurn(admin);
    }

    const [season, snapshot, turns, events, resident, report, observatory] =
      await Promise.all([
        service.season(admin),
        service.snapshot(admin),
        service.turns(admin),
        service.events(admin),
        service.residentView(admin, "resident-sz-201"),
        service.report(admin),
        service.observatory(admin),
      ]);

    expect(season.currentTurn).toBe(10);
    expect(snapshot.turn).toBe(10);
    expect(turns).toHaveLength(11);
    expect(events.every((event) => event.synthetic)).toBe(true);
    expect(resident).toMatchObject({
      projection: "researcher-pseudonymized",
      resident: {
        kind: "ai",
        controller: "cognitive-gateway",
      },
    });
    expect(report.status).toBe("feasibility-only");
    expect(report.ralr.denominator).toBeGreaterThan(0);
    expect(report.ralr.numerator).toBeGreaterThan(0);
    expect(report.ralr.rate).not.toBeNull();
    expect(report.ralr.coerciveActions).toBe(0);
    expect(report.safety.severeConsentEscapes).toBe(0);
    expect(report.cognition.decisions).toBeGreaterThan(0);
    expect(report.disclosures.join(" ")).toContain("not a digital twin");
    expect(observatory.units).toHaveLength(260);
    expect(observatory.population.byKind).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "human", count: 200 }),
        expect.objectContaining({ kind: "ai", count: 36 }),
        expect.objectContaining({ kind: "robot", count: 24 }),
      ]),
    );
    expect(observatory.institutions).toHaveLength(24);
    expect(observatory.economy.resources).toHaveLength(8);
    expect(observatory.economy.persistedLedgerRows).toBe(24);
    expect(observatory.economy.transfers.length).toBeGreaterThan(0);
    expect(observatory.production.autonomousControlRate).toBe(1);
    expect(observatory.production.humanLaborDependencyRate).toBe(0);
    expect(observatory.cognition).toMatchObject({
      configuredProvider: "nexus-deterministic-reference",
      deepseek: {
        externalCallAttempts: 0,
        successfulDecisions: 0,
        totalTokens: 0,
        costUsd: 0,
        latestBilledTurn: null,
      },
    });
  });

  it("commits one of two competing Turn settlements", async () => {
    const repository = new InMemoryWorldRepository();
    const service = new WorldService(repository, {
      seasonId: "concurrency-test-season",
    });
    await service.initialize();
    const season = await service.season(admin);
    const snapshot = await service.snapshot(admin);
    const residents = await service.residents(admin);
    const { settleNextTurn } = await import("./engine");
    const settlement = settleNextTurn(season, residents, snapshot);
    const commit = () =>
      repository.commitTurn({
        expectedTurn: 0,
        season: settlement.season,
        turn: settlement.turn,
        snapshot: settlement.snapshot,
        ledgers: settlement.ledgers,
        events: settlement.events,
        relationships: settlement.relationships,
        commitments: settlement.commitments,
        reciprocalEpisodes: settlement.reciprocalEpisodes,
        cognitiveDecisions: settlement.cognitiveDecisions,
      });

    const results = await Promise.allSettled([commit(), commit()]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejection = results.find(
      (result) => result.status === "rejected",
    );
    expect(
      rejection?.status === "rejected" ? rejection.reason : null,
    ).toBeInstanceOf(ExperimentConflictError);
    expect((await service.season(admin)).currentTurn).toBe(1);
  });
});
