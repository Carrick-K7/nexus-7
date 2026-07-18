// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  CITY_MODEL_ACCEPTANCE_SCHEMA_VERSION,
  verifyCityModelAcceptance,
} from "./verification";

describe("v1.5 coherent city acceptance", () => {
  it(
    "closes ontology, scenario truth, replay, view-source, and sandbox gates",
    async () => {
      const report = await verifyCityModelAcceptance();
      expect(report).toMatchObject({
        schemaVersion: CITY_MODEL_ACCEPTANCE_SCHEMA_VERSION,
        passed: true,
        failures: [],
        metrics: {
          scenarios: 20,
          eventFamilies: 5,
          scenarioModes: 4,
          precisionPercent: 100,
          recallPercent: 100,
          deterministicReplayPercent: 100,
          mechanismFamilies: 5,
          governedLegacyViews: 7,
        },
      });
      expect(Object.values(report.checks).every(Boolean)).toBe(true);
      expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    },
    30_000,
  );
});
