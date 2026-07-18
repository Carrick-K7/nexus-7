// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  PUBLIC_CITY_SCENARIOS,
  materializeCityScenario,
  verifyCityScenarioCatalog,
} from "./scenarios";

describe("public coherent-city scenario catalog", () => {
  it("contains four modes for each of five event families", () => {
    expect(PUBLIC_CITY_SCENARIOS).toHaveLength(20);
    const families = new Set(
      PUBLIC_CITY_SCENARIOS.map((scenario) => scenario.family),
    );
    expect(families).toHaveLength(5);
    for (const family of families) {
      expect(
        PUBLIC_CITY_SCENARIOS.filter(
          (scenario) => scenario.family === family,
        ).map((scenario) => scenario.mode),
      ).toEqual([
        "normal",
        "single-fault",
        "cascade",
        "conflicting-objectives",
      ]);
    }
  });

  it("materializes isolated worlds without mutating the catalog", () => {
    const truth = PUBLIC_CITY_SCENARIOS.find(
      (scenario) =>
        scenario.family === "infrastructure" &&
        scenario.mode === "cascade",
    )!;
    const first = materializeCityScenario(truth);
    first.world.infrastructure.energy = 100;
    const second = materializeCityScenario(truth);
    expect(second.world.infrastructure.energy).toBeLessThan(40);
  });

  it("meets deterministic replay and detection truth gates", () => {
    const report = verifyCityScenarioCatalog(60);
    expect(report).toMatchObject({
      scenarioCount: 20,
      familyCount: 5,
      modeCount: 4,
      deterministicReplayPercent: 100,
      precisionPercent: 100,
      recallPercent: 100,
      invariantViolations: [],
      passed: true,
    });
  });
});
