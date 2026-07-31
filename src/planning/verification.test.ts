// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  verifyPlanningAcceptance,
} from "./verification";

describe("goal-constrained planning acceptance", () => {
  it(
    "passes DSL, portfolio, experiment, safety, budget, and review gates",
    async () => {
      const first = await verifyPlanningAcceptance();
      const second = await verifyPlanningAcceptance();

      expect(first).toEqual(second);
      expect(first.passed).toBe(true);
      expect(first.failures).toEqual([]);
      expect(first.metrics).toMatchObject({
        incidentPlans: 15,
        validInterventionCandidates: 30,
        noActionBaselines: 15,
        pairedSeeds: 75,
        deterministicReplayPercent: 100,
        firstSampleGuardrailStops: 5,
        stagedWithoutGates: 0,
      });
      expect(first.metrics.experimentRuns).toBeGreaterThanOrEqual(225);
      expect(Object.values(first.checks).every(Boolean)).toBe(true);
    },
    30_000,
  );
});
