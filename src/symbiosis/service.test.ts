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
import {
  CognitiveGateway,
  DeterministicCognitiveProvider,
  DiversityReferenceCognitiveProvider,
  type CognitiveProvider,
} from "./cognition";

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

    const [
      season,
      snapshot,
      turns,
      events,
      resident,
      report,
      observatory,
      societyRecords,
    ] =
      await Promise.all([
        service.season(admin),
        service.snapshot(admin),
        service.turns(admin),
        service.events(admin),
        service.residentView(admin, "resident-sz-201"),
        service.report(admin),
        service.observatory(admin),
        service.societyRecords(admin),
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
    expect(report.society).toMatchObject({
      safeClosureRate: 1,
      creditConservationPassed: true,
      balancedExchangeRate: 1,
      forcedWorkAgreements: 0,
      forcedBargains: 0,
      invalidProposals: 0,
    });
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
    expect(observatory.society.households.total).toBeGreaterThan(50);
    expect(societyRecords.length).toBeGreaterThan(300);
    expect(observatory.society.creditConservationPassed).toBe(true);
    expect(observatory.units[0]).toMatchObject({
      civicCredits: expect.any(Number),
      activeWorkAgreements: expect.any(Number),
    });
    expect(resident.society.creditAccount).toMatchObject({
      ownerId: "resident-sz-201",
      ownerKind: "ai",
    });
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

  it("binds runtime revision and persists read-only shadow comparisons", async () => {
    const seed = "runtime-shadow-seed";
    let clock = Date.parse("2026-07-26T00:00:00.000Z");
    const service = new WorldService(
      new InMemoryWorldRepository(),
      {
        seasonId: "runtime-shadow-season",
        seed,
        now: () => new Date(clock),
        cognitiveGateway: new CognitiveGateway(
          new DeterministicCognitiveProvider(seed),
          undefined,
          {
            provider: new DiversityReferenceCognitiveProvider(),
            monthlyCapUsd: 1,
          },
          seed,
        ),
        runtimeEvidence: {
          workerId: "runtime-shadow-worker",
          deploymentRevision: "5".repeat(40),
          intervalMs: 3_600_000,
        },
      },
    );
    const control = new WorldService(
      new InMemoryWorldRepository(),
      {
        seasonId: "runtime-shadow-season",
        seed,
        now: () => new Date(clock),
      },
    );
    await Promise.all([service.initialize(), control.initialize()]);

    await service.advanceTurn(admin);
    await control.advanceTurn(admin);
    clock += 3_600_000;
    await service.advanceTurn(admin);
    await control.advanceTurn(admin);

    const [turns, decisions, observatory, snapshot, controlSnapshot] =
      await Promise.all([
        service.turns(admin),
        service.cognitiveDecisions(admin),
        service.observatory(admin),
        service.snapshot(admin),
        control.snapshot(admin),
      ]);

    expect(turns[1].runtimeEvidence).toMatchObject({
      timing: "baseline",
      deploymentRevision: "5".repeat(40),
      workerId: "runtime-shadow-worker",
    });
    expect(turns[2].runtimeEvidence).toMatchObject({
      timing: "on-time",
      lagMs: 0,
      previousTurn: 1,
    });
    expect(decisions).toHaveLength(4);
    expect(
      decisions.every(
        (decision) =>
          decision.shadow?.status === "observed" &&
          decision.shadow.requestedProvider ===
            "nexus-diversity-reference",
      ),
    ).toBe(true);
    expect(snapshot.fingerprint).toBe(controlSnapshot.fingerprint);
    expect(observatory.reliability).toMatchObject({
      missingTurns: 0,
      duplicateTurns: 0,
      predecessorMismatches: 0,
      revisionBoundTurns: 2,
      comparableSettlements: 1,
      onTimeRate: 1,
    });
    expect(observatory.cognition.diversity).toMatchObject({
      shadowEnabled: true,
      comparisons: 4,
      providerFailures: 0,
      budgetSkipped: 0,
      externalCallAttempts: 0,
      costUsd: 0,
    });
  });

  it("resets primary and shadow budget accounting on a simulated calendar month", async () => {
    let primaryCalls = 0;
    let shadowCalls = 0;
    const pricedProvider = (
      id: string,
      count: () => void,
    ): CognitiveProvider => ({
      id,
      external: true,
      decide: async () => {
        count();
        return {
          provider: id,
          model: `${id}-model`,
          mode: "non-thinking",
          finalAnswer: {
            disposition: "engage",
            action: "negotiate-shared-community-task",
            reasonCode: "monthly-budget-test",
          },
          inputTokens: 10,
          outputTokens: 2,
          costUsd: 0.5,
          latencyMs: 1,
        };
      },
    });
    const service = new WorldService(
      new InMemoryWorldRepository(),
      {
        seasonId: "monthly-budget-season",
        cognitiveGateway: new CognitiveGateway(
          pricedProvider(
            "priced-primary",
            () => {
              primaryCalls += 1;
            },
          ),
          {
            monthlyCapUsd: 1,
            routineReductionThreshold: 1,
            proRestrictionThreshold: 1,
          },
          {
            provider: pricedProvider(
              "priced-shadow",
              () => {
                shadowCalls += 1;
              },
            ),
            monthlyCapUsd: 1,
          },
        ),
      },
    );
    await service.initialize();

    for (let turn = 0; turn < 14; turn += 1) {
      await service.advanceTurn(admin);
    }

    expect(primaryCalls).toBe(4);
    expect(shadowCalls).toBe(4);
    const decisions = await service.cognitiveDecisions(admin);
    expect(
      decisions.filter(
        (decision) =>
          decision.degradationReason ===
          "monthly-budget-exhausted",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      decisions.filter(
        (decision) =>
          decision.shadow?.status === "budget-skipped",
      ).length,
    ).toBeGreaterThan(0);
  });
});
