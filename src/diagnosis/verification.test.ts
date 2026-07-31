// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  verifyDiagnosisAcceptance,
} from "./verification";

describe("causal diagnosis acceptance", () => {
  it("passes every falsification, confidence, provenance, and drift gate", async () => {
    const first = await verifyDiagnosisAcceptance();
    const second = await verifyDiagnosisAcceptance();

    expect(first).toEqual(second);
    expect(first.passed).toBe(true);
    expect(first.failures).toEqual([]);
    expect(first.metrics).toMatchObject({
      incidentScenarios: 15,
      diagnoses: 15,
      calibrationSamples: 45,
      top3RootCauseHitRatePercent: 100,
      alternativeCoveragePercent: 100,
      counterevidenceCoveragePercent: 100,
      deterministicCounterfactualReplayPercent: 100,
      lowConfidenceAutomationAttempts: 0,
      independentAgentSubmissions: 60,
    });
    expect(Object.values(first.checks).every(Boolean)).toBe(true);
  });
});
