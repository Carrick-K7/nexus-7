// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  verifyLongHorizon,
} from "./long-horizon";

describe("long-horizon simulation stability", () => {
  it("remains deterministic, bounded, causal, and rollback-ready", () => {
    const report = verifyLongHorizon(undefined, 1_000);

    expect(report.finalTick).toBe(1_000);
    expect(report.eventCount).toBeGreaterThan(0);
    expect(report.acceptedActions).toBeGreaterThan(0);
    expect(report.invariantViolations).toEqual([]);
    expect(report.deterministicReplay).toBe(true);
    expect(report.verifiedAutonomyLoopRate).toBeGreaterThanOrEqual(90);
    expect(report.causalTraceCompleteness).toBe(100);
    expect(report.rollbackCoverage).toBe(100);
    expect(report.meetsStabilityGate).toBe(true);
  });
});
