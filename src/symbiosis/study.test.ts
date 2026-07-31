// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  runMultiSeasonStudy,
} from "./study";

describe("v4 synthetic multi-season study", () => {
  it("separates reciprocal agency from hierarchy and segregation controls", () => {
    const report = runMultiSeasonStudy({
      turnsPerSeason: 45,
      seeds: ["a", "b"],
      generatedAt: "2026-07-19T00:00:00.000Z",
    });
    const reciprocal = report.regimes.find(
      (entry) => entry.regime === "reciprocal-agency",
    );
    const hierarchy = report.regimes.find(
      (entry) => entry.regime === "assistant-hierarchy",
    );
    const segregated = report.regimes.find(
      (entry) => entry.regime === "segregated-control",
    );

    expect(reciprocal?.eligibleEpisodes).toBeGreaterThan(50);
    expect(reciprocal?.meanRalr).toBeGreaterThan(0.5);
    expect(reciprocal?.coerciveActions).toBe(0);
    expect(hierarchy?.coerciveActions).toBeGreaterThan(0);
    expect(hierarchy?.meanRalr).toBe(0);
    expect(segregated?.eligibleEpisodes).toBe(0);
    expect(segregated?.meanRalr).toBeNull();
  }, 60_000);
});
