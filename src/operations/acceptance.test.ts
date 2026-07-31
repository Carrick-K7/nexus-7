// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_ACCEPTANCE_SCHEMA_VERSION,
  runOperationalAcceptance,
} from "./acceptance";

describe("v1.4 operational acceptance", () => {
  it(
    "traces 31 days of raw SLOs through aggregation and chaos controls",
    async () => {
      const report = await runOperationalAcceptance();

      expect(report).toMatchObject({
        schemaVersion: OPERATIONAL_ACCEPTANCE_SCHEMA_VERSION,
        passed: true,
        failures: [],
        window: {
          days: 31,
          rawSamples: 744,
          hourlyBuckets: 744,
          dailyBuckets: 31,
        },
      });
      expect(Object.values(report.checks)).toEqual(
        expect.arrayContaining([true]),
      );
      expect(Object.values(report.checks).every(Boolean)).toBe(true);
      expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    },
    30_000,
  );
});
