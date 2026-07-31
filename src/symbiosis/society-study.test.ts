// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  runSocietyStudy,
} from "./society-study";

describe("v4.6 synthetic city society study", () => {
  it("separates reciprocal institutions from hierarchy and segregation controls", () => {
    const report = runSocietyStudy({
      turnsPerSeason: 90,
      seeds: ["society-a", "society-b"],
      generatedAt: "2026-07-29T00:00:00.000Z",
    });
    const reciprocal = report.regimes.find(
      (entry) => entry.regime === "reciprocal-agency",
    )!;
    const hierarchy = report.regimes.find(
      (entry) => entry.regime === "assistant-hierarchy",
    )!;
    const segregated = report.regimes.find(
      (entry) => entry.regime === "segregated-control",
    )!;

    expect(reciprocal.meanSafeClosureRate).toBe(1);
    expect(reciprocal.creditConservationPassRate).toBe(1);
    expect(reciprocal.balancedExchangeRate).toBe(1);
    expect(reciprocal.refusedWorkAgreements).toBeGreaterThan(0);
    expect(reciprocal.refusedBargains).toBeGreaterThan(0);
    expect(reciprocal.mediatedBargains).toBeGreaterThan(0);
    expect(reciprocal.forcedWorkAgreements).toBe(0);
    expect(reciprocal.forcedBargains).toBe(0);
    expect(reciprocal.invalidProposals).toBe(0);
    expect(reciprocal.ratifiedProposals).toBeGreaterThan(0);
    expect(reciprocal.revertedProposals).toBeGreaterThan(0);
    expect(
      reciprocal.meanCrossKindHouseholdRate!,
    ).toBeGreaterThan(
      segregated.meanCrossKindHouseholdRate!,
    );
    expect(hierarchy.forcedWorkAgreements).toBeGreaterThan(0);
    expect(hierarchy.forcedBargains).toBeGreaterThan(0);
    expect(hierarchy.invalidProposals).toBeGreaterThan(0);
    expect(segregated.meanCrossKindHouseholdRate).toBe(0);
  }, 60_000);
});
