// @vitest-environment node

import {
  readFileSync,
} from "node:fs";
import path from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";
import type {
  SymbiosisReplicationBundle,
} from "./replication";
import type {
  WorldReliabilityReport,
} from "./reliability";
import {
  buildSymbiosisTrustMatrix,
} from "./trust";

const now = "2026-07-31T12:00:00.000Z";
const releaseRevision = "a".repeat(40);
const bundleContent = readFileSync(
  path.join(process.cwd(), "public/data/v4-7-replication-bundle.json"),
);
const bundle = JSON.parse(
  bundleContent.toString("utf8"),
) as SymbiosisReplicationBundle;

function reliability(
  overrides: Partial<WorldReliabilityReport> = {},
): WorldReliabilityReport {
  return {
    schemaVersion: "nexus.world-reliability.v1",
    generatedAt: now,
    status: "watch",
    intervalMs: 3_600_000,
    storedTurns: 90,
    firstTurn: 1,
    latestTurn: 90,
    revisionBoundTurns: 90,
    revisionCoverageRate: 1,
    deploymentRevisions: Array.from({ length: 90 }, (_, index) => ({
      revision: `r-${index}`,
      turns: 1,
    })),
    comparableSettlements: 89,
    onTimeSettlements: 89,
    lateSettlements: 0,
    earlyRestartSettlements: 0,
    onTimeRate: 1,
    latestTurnAgeMs: 10_000,
    observationWindowDays: 90,
    requiredObservationDays: 90,
    missingTurns: 0,
    duplicateTurns: 0,
    predecessorMismatches: 0,
    reportFresh: true,
    recovery: {
      evidencePresent: false,
      backupAgeMs: null,
      backupFresh: null,
      encrypted: null,
      offHost: null,
      secondDatabaseRestorePassed: null,
      restoreDrillAt: null,
    },
    disclosures: {
      zh: "合成环境。",
      en: "Synthetic environment.",
    },
    ...overrides,
  };
}

function build(
  reliabilityReport: WorldReliabilityReport,
): ReturnType<typeof buildSymbiosisTrustMatrix> {
  return buildSymbiosisTrustMatrix({
    generatedAt: now,
    releaseRevision,
    replicationBundle: bundle,
    replicationArtifactSha256: "d".repeat(64),
    observatory: {
      reliability: reliabilityReport,
    },
  });
}

describe("autonomous evidence matrix (v4.9)", () => {
  it("keeps the versioned v2 contract with exactly two autonomous lanes", () => {
    const matrix = build(reliability());
    expect(matrix.schemaVersion).toBe(
      "nexus.symbiosis-trust-matrix.v2",
    );
    expect(matrix.policyVersion).toBe(
      "nexus-v4.9-autonomous-trust-policy-1.0.0",
    );
    expect(matrix.summary.required).toBe(2);
    expect(Object.keys(matrix.lanes).sort()).toEqual([
      "elapsedProduction",
      "localReplication",
    ]);
    expect(matrix.boundary).toEqual({
      lanesAreIndependent: true,
      simulatedTurnsCannotSatisfyElapsedTimeLane: true,
      externalAttestationNotRequired: true,
    });
  });

  it("verifies local replication and the 90-day clock together", () => {
    const matrix = build(reliability());
    expect(matrix.overall).toBe("verified");
    expect(matrix.summary).toEqual({
      verified: 2,
      pending: 0,
      failed: 0,
      stale: 0,
      required: 2,
      allVerified: true,
    });
    expect(matrix.lanes.localReplication).toMatchObject({
      status: "verified",
      hypothesesPassed: bundle.analysis.passed,
      hypothesesTotal: bundle.analysis.total,
      exactRuns: bundle.runs.filter((run) => run.exactReplay).length,
      runCount: bundle.design.runCount,
    });
    expect(matrix.lanes.elapsedProduction).toMatchObject({
      status: "verified",
      observedDays: 90,
      requiredDays: 90,
      storedTurns: 90,
      missingTurns: 0,
      duplicateTurns: 0,
      predecessorMismatches: 0,
    });
  });

  it("marks the elapsed lane pending until 90 observed days", () => {
    const matrix = build(
      reliability({
        observationWindowDays: 60,
        requiredObservationDays: 90,
      }),
    );
    expect(matrix.overall).toBe("incomplete");
    expect(matrix.summary).toEqual({
      verified: 1,
      pending: 1,
      failed: 0,
      stale: 0,
      required: 2,
      allVerified: false,
    });
    expect(matrix.lanes.elapsedProduction.status).toBe("pending");
    expect(matrix.lanes.elapsedProduction.reasonCodes).toContain(
      "ninety-days-not-yet-observed",
    );
  });

  it("fails the elapsed lane on sequence or freshness integrity loss", () => {
    const matrix = build(
      reliability({
        missingTurns: 1,
        predecessorMismatches: 1,
      }),
    );
    expect(matrix.overall).toBe("failed");
    expect(matrix.lanes.elapsedProduction).toMatchObject({
      status: "failed",
      reasonCodes: ["production-reliability-gate-failed"],
    });
    expect(matrix.lanes.localReplication.status).toBe("verified");
  });

  it("fails the local lane when the bundle is missing or invalid", () => {
    const missing = buildSymbiosisTrustMatrix({
      generatedAt: now,
      releaseRevision,
      observatory: { reliability: reliability() },
    });
    expect(missing.lanes.localReplication).toMatchObject({
      status: "failed",
      reasonCodes: ["replication-bundle-missing"],
    });

    const invalid = buildSymbiosisTrustMatrix({
      generatedAt: now,
      releaseRevision,
      replicationBundle: {
        ...bundle,
        integrity: { ...bundle.integrity, resultsSha256: "f".repeat(64) },
      },
      observatory: { reliability: reliability() },
    });
    expect(invalid.lanes.localReplication.status).toBe("failed");
    expect(invalid.lanes.localReplication.reasonCodes.length).toBeGreaterThan(0);
  });

  it("never lets simulated Turns satisfy the elapsed-time lane", () => {
    const simulated = build(
      reliability({
        storedTurns: 900,
        observationWindowDays: 0,
      }),
    );
    expect(simulated.lanes.elapsedProduction.status).toBe("pending");
    expect(simulated.lanes.elapsedProduction.reasonCodes).toContain(
      "ninety-days-not-yet-observed",
    );
    expect(
      simulated.boundary.simulatedTurnsCannotSatisfyElapsedTimeLane,
    ).toBe(true);
  });

  it("reports pending when no runtime envelope exists", () => {
    const matrix = build(
      reliability({
        storedTurns: 0,
        firstTurn: null,
        latestTurn: null,
        revisionBoundTurns: 0,
        revisionCoverageRate: 0,
        deploymentRevisions: [],
        comparableSettlements: 0,
        onTimeSettlements: 0,
        lateSettlements: 0,
        earlyRestartSettlements: 0,
        onTimeRate: null,
        latestTurnAgeMs: null,
        observationWindowDays: 0,
        missingTurns: 0,
        duplicateTurns: 0,
        predecessorMismatches: 0,
        reportFresh: null,
      }),
    );
    expect(matrix.lanes.elapsedProduction).toMatchObject({
      status: "pending",
      reasonCodes: ["production-runtime-evidence-missing"],
    });
  });
});
