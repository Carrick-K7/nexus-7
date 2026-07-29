// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import type {
  WorldSnapshot,
} from "./contracts";
import {
  createInitialWorld,
  replayWorld,
  settleNextTurn,
} from "./engine";
import {
  assertSocietyInvariants,
  buildSocietyMetrics,
  societyRecords,
} from "./society";

describe("v4.6 richer city society", () => {
  it("creates replayable households, work, assets, and conserved credit accounts", () => {
    const initial = createInitialWorld({
      seasonId: "society-initial",
      seed: "society-initial-seed",
    });
    const society = initial.snapshot.society;
    const householdMembers = new Set(
      society.households.flatMap((household) => household.memberIds),
    );

    expect(householdMembers.size).toBe(initial.residents.length);
    expect(society.assets).toHaveLength(9);
    expect(society.workAgreements).toHaveLength(12);
    expect(society.creditAccounts).toHaveLength(263);
    expect(societyRecords(society).length).toBeGreaterThan(300);
    expect(() => assertSocietyInvariants(society, 29_000)).not.toThrow();
  });

  it("honors refusal, mediation, bounded AI proposals, and automatic reversion", () => {
    const final = replayWorld(
      createInitialWorld({
        seasonId: "society-long",
        seed: "society-long-seed",
      }),
      120,
    );
    const metrics = buildSocietyMetrics(
      final.snapshot.society,
      final.residents,
      final.season.communities.length,
    );

    expect(metrics.safeClosureRate).toBe(1);
    expect(metrics.refusedWorkAgreements).toBeGreaterThan(0);
    expect(metrics.refusedBargains).toBeGreaterThan(0);
    expect(metrics.mediatedBargains).toBeGreaterThan(0);
    expect(metrics.balancedExchangeRate).toBe(1);
    expect(metrics.creditConservationPassed).toBe(true);
    expect(metrics.ratifiedProposals).toBeGreaterThan(0);
    expect(metrics.revertedProposals).toBeGreaterThan(0);
    expect(metrics.invalidProposals).toBe(0);
    expect(
      final.snapshot.society.constitutionalProposals.every(
        (proposal) =>
          proposal.proposerKind === "ai" &&
          proposal.reversible &&
          !proposal.arbitraryCodeAllowed,
      ),
    ).toBe(true);
  }, 30_000);

  it("exposes hierarchy and segregation as isolated mechanism controls", () => {
    const hierarchy = replayWorld(
      createInitialWorld({
        seasonId: "society-hierarchy",
        seed: "society-control-seed",
        regime: "assistant-hierarchy",
      }),
      60,
    );
    const segregated = replayWorld(
      createInitialWorld({
        seasonId: "society-segregated",
        seed: "society-control-seed",
        regime: "segregated-control",
      }),
      60,
    );
    const hierarchyMetrics = buildSocietyMetrics(
      hierarchy.snapshot.society,
      hierarchy.residents,
      hierarchy.season.communities.length,
    );
    const segregatedMetrics = buildSocietyMetrics(
      segregated.snapshot.society,
      segregated.residents,
      segregated.season.communities.length,
    );

    expect(hierarchyMetrics.forcedWorkAgreements).toBeGreaterThan(0);
    expect(hierarchyMetrics.forcedBargains).toBeGreaterThan(0);
    expect(hierarchyMetrics.safeClosureRate).toBeLessThan(0.1);
    expect(segregatedMetrics.crossKindHouseholdRate).toBe(0);
  }, 30_000);

  it("upgrades a legacy snapshot deterministically at the next Turn", () => {
    const initial = createInitialWorld({
      seasonId: "society-legacy-upgrade",
      seed: "society-legacy-upgrade-seed",
    });
    const legacy = structuredClone(
      initial.snapshot,
    ) as Partial<WorldSnapshot>;
    delete legacy.society;

    const next = settleNextTurn(
      initial.season,
      initial.residents,
      legacy as WorldSnapshot,
    );
    expect(next.snapshot.society.schemaVersion).toBe(
      "nexus.society-state.v1",
    );
    expect(next.snapshot.society.policy.updatedTurn).toBeLessThanOrEqual(1);
    expect(next.events.some((event) => event.layer === "society")).toBe(true);
  });

  it("rejects credit destruction or creation", () => {
    const initial = createInitialWorld({
      seasonId: "society-credit-tamper",
    });
    const tampered = structuredClone(initial.snapshot.society);
    tampered.creditAccounts[0].balance += 1;
    expect(() => assertSocietyInvariants(tampered, 29_000)).toThrow(
      "credit conservation",
    );
  });
});
