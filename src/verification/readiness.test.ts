// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PUBLIC_SCENARIOS,
  replaySimulation,
} from "@/simulation";
import {
  V1_THRESHOLDS,
  verifyAutonomyReadiness,
} from "@/verification";

describe("v1 verified autonomy readiness", () => {
  it("publishes three deterministic versioned scenarios", () => {
    expect(PUBLIC_SCENARIOS).toHaveLength(3);
    expect(new Set(PUBLIC_SCENARIOS.map((scenario) => scenario.id)).size).toBe(
      3,
    );
    for (const scenario of PUBLIC_SCENARIOS) {
      expect(scenario.policyVersion).toBe("policy-1.0.0");
      const replay = replaySimulation(
        structuredClone(scenario.world),
        {
          seed: scenario.seed,
          policyVersion: scenario.policyVersion,
          configuration: scenario.configuration,
        },
        10,
      );
      expect(replay.state.scenarioId).toBe(scenario.id);
    }
  });

  it("meets every v1 north-star threshold across the public suite", () => {
    const report = verifyAutonomyReadiness(PUBLIC_SCENARIOS, 250);

    expect(report.aggregate.acceptedActions).toBeGreaterThan(0);
    expect(report.aggregate.verifiedAutonomyLoopRate).toBeGreaterThanOrEqual(
      V1_THRESHOLDS.verifiedAutonomyLoopRate,
    );
    expect(report.aggregate.deterministicReplaySuccess).toBeGreaterThanOrEqual(
      V1_THRESHOLDS.deterministicReplaySuccess,
    );
    expect(report.aggregate.causalTraceCompleteness).toBe(
      V1_THRESHOLDS.causalTraceCompleteness,
    );
    expect(report.aggregate.rollbackCoverage).toBe(
      V1_THRESHOLDS.rollbackCoverage,
    );
    expect(report.aggregate.invariantViolations).toBe(0);
    expect(report.meetsV1).toBe(true);
  });

  it("keeps the published release artifact in sync with the readiness audit", () => {
    const published = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "public/data/v1-readiness.json"),
        "utf8",
      ),
    );

    expect(published).toEqual(verifyAutonomyReadiness());
  });
});
