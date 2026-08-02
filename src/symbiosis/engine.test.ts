// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  assertResourceConservation,
  createInitialWorld,
  isExactWorldReplay,
  replayWorld,
  settleNextTurn,
} from "./engine";

describe("Symbiotic Shenzhen deterministic world", () => {
  it("creates exactly 260 pseudonymous software residents", () => {
    const initial = createInitialWorld();
    const kinds = initial.residents.reduce<Record<string, number>>(
      (counts, resident) => ({
        ...counts,
        [resident.kind]: (counts[resident.kind] ?? 0) + 1,
      }),
      {},
    );

    expect(initial.season.backgroundPopulation).toBe(18_248_500);
    expect(initial.season.districts).toHaveLength(10);
    expect(initial.cohorts).toHaveLength(10);
    expect(
      initial.cohorts.reduce(
        (population, cohort) => population + cohort.population,
        0,
      ),
    ).toBe(initial.season.backgroundPopulation);
    expect(initial.season.timeZone).toBe("Asia/Shanghai");
    expect(initial.residents).toHaveLength(260);
    expect(kinds).toEqual({
      human: 200,
      ai: 36,
      robot: 24,
    });
    expect(
      initial.residents.every(
        (resident) =>
          resident.synthetic &&
          !("realName" in resident) &&
          !("address" in resident),
      ),
    ).toBe(true);
    expect(
      initial.residents.every(
        (resident) => resident.controller !== undefined,
      ),
    ).toBe(true);
  });

  it(
    "replays 365 daily Turns exactly with conserved resources",
    () => {
      const initial = createInitialWorld({
        seed: "365-turn-certification-seed",
      });
      const first = replayWorld(initial, 365);
      const second = replayWorld(initial, 365);

      expect(first.turn.turn).toBe(365);
    expect(first.turn.simulationDate).toBe("2027-07-18");
    expect(first.turn.resourceConservationPassed).toBe(true);
    expect(first.snapshot.residentStates).toHaveLength(260);
    expect(first.snapshot.reciprocalEpisodes.length).toBeGreaterThan(50);
    expect(
      first.snapshot.reciprocalEpisodes.every(
        (episode) =>
          episode.synthetic &&
          !episode.identityContinuityViolation &&
          !episode.irreversibleHarmViolation,
      ),
    ).toBe(true);
    expect(isExactWorldReplay(first, second)).toBe(true);
    assertResourceConservation(first.ledgers);
    expect(
      first.ledgers.some(
        (ledger) =>
          ledger.transferredIn > 0 || ledger.transferredOut > 0,
      ),
    ).toBe(true);
    expect(
      first.events.some(
        (event) => event.type === "shared.resource-transfer",
      ),
    ).toBe(true);
    expect(
      first.ledgers.every(
        (ledger) => ledger.closing <= ledger.capacity,
      ),
    ).toBe(true);
    expect(first.snapshot.society.households.length).toBeGreaterThan(50);
    expect(
      first.snapshot.society.workAgreements.filter(
        (agreement) => agreement.status === "completed",
      ).length,
    ).toBeGreaterThan(250);
    expect(
      first.snapshot.society.exchanges.every(
        (exchange) => exchange.balanced,
      ),
    ).toBe(true);
    expect(
      first.snapshot.society.constitutionalProposals.every(
        (proposal) =>
          proposal.proposerKind === "ai" &&
          proposal.reversible &&
          !proposal.arbitraryCodeAllowed,
      ),
    ).toBe(true);
  }, 300_000);

  it("rejects a snapshot that is not the current season head", () => {
    const initial = createInitialWorld();
    const next = settleNextTurn(
      initial.season,
      initial.residents,
      initial.snapshot,
    );
    expect(() =>
      settleNextTurn(
        next.season,
        next.residents,
        initial.snapshot,
      ),
    ).toThrow("Turn predecessor");
  });
});
