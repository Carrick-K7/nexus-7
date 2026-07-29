import {
  describe,
  expect,
  it,
} from "vitest";
import {
  SHENZHEN_TIME_ZONE,
  TURN_RUNTIME_EVIDENCE_SCHEMA_VERSION,
  TURN_SCHEMA_VERSION,
  type WorldTurn,
} from "./contracts";
import {
  attachTurnRuntimeEvidence,
  buildWorldReliabilityReport,
  nextTurnScheduleDelayMs,
  RECOVERY_EVIDENCE_SCHEMA_VERSION,
  withRecoveryEvidenceChecksum,
  type SymbiosisRecoveryEvidence,
} from "./reliability";

const intervalMs = 3_600_000;
const revision = "4".repeat(40);

function turn(
  number: number,
  previousFingerprint: string,
): WorldTurn {
  return {
    schemaVersion: TURN_SCHEMA_VERSION,
    id: `season-reliability-turn-${number}`,
    seasonId: "season-reliability",
    turn: number,
    simulationDate: "2026-01-01",
    timeZone: SHENZHEN_TIME_ZONE,
    status: "settled",
    inputFrozenAt: "2026-01-01T00:00:00.000Z",
    settledAt: "2026-01-01T00:00:00.000Z",
    seed: "reliability-seed",
    distributionVersion: "reliability-distribution-v1",
    previousFingerprint,
    fingerprint: `fingerprint-${number}`,
    eventCount: 0,
    resourceConservationPassed: true,
    cognitionStatus: "complete",
    cognitiveDecisionIds: [],
  };
}

function recoveryEvidence(
  createdAt: string,
): SymbiosisRecoveryEvidence {
  return withRecoveryEvidenceChecksum({
    schemaVersion: RECOVERY_EVIDENCE_SCHEMA_VERSION,
    generatedAt: createdAt,
    backup: {
      createdAt,
      checksum: "a".repeat(64),
      artifactSha256: "b".repeat(64),
      encrypted: true,
      offHost: true,
      sizeBytes: 1_024,
    },
    restoreDrill: {
      completedAt: createdAt,
      target: "off-host-second-database",
      checksumValid: true,
      rowCountsMatch: true,
      latestFingerprintMatch: true,
      resumedWrite: true,
    },
  });
}

describe("world reliability evidence", () => {
  it("accepts a revision-bound 90-day hourly reference clock", () => {
    const startedAt = Date.parse("2026-01-01T00:00:00.000Z");
    const first = turn(0, "genesis");
    first.runtimeEvidence = {
      schemaVersion: TURN_RUNTIME_EVIDENCE_SCHEMA_VERSION,
      recordedAt: new Date(startedAt).toISOString(),
      workerId: "reliability-reference",
      deploymentRevision: revision,
      engineVersion: "engine-v1",
      engineContractVersion: TURN_SCHEMA_VERSION,
      intervalMs,
      previousTurn: -1,
      previousFingerprint: "genesis",
      timing: "baseline",
    };
    const turns = [first];
    for (let number = 1; number <= 2_160; number += 1) {
      const previous = turns.at(-1)!;
      turns.push(
        attachTurnRuntimeEvidence(
          turn(number, previous.fingerprint),
          previous,
          {
            recordedAt: new Date(
              startedAt + number * intervalMs,
            ).toISOString(),
            workerId: "reliability-reference",
            deploymentRevision: revision,
            engineVersion: "engine-v1",
            engineContractVersion: TURN_SCHEMA_VERSION,
            intervalMs,
          },
        ),
      );
    }
    const generatedAt = turns.at(-1)!.runtimeEvidence!.recordedAt;
    const report = buildWorldReliabilityReport(turns, {
      generatedAt,
      intervalMs,
      recoveryEvidence: recoveryEvidence(generatedAt),
    });

    expect(report).toMatchObject({
      status: "healthy",
      observationWindowDays: 90,
      storedTurns: 2_161,
      missingTurns: 0,
      duplicateTurns: 0,
      predecessorMismatches: 0,
      revisionBoundTurns: 2_161,
      revisionCoverageRate: 1,
      comparableSettlements: 2_160,
      onTimeSettlements: 2_160,
      lateSettlements: 0,
      onTimeRate: 1,
      reportFresh: true,
      recovery: {
        backupFresh: true,
        encrypted: true,
        offHost: true,
        secondDatabaseRestorePassed: true,
      },
    });
  });

  it("makes gaps, duplicates, lineage breaks and lateness visible", () => {
    const first = turn(0, "genesis");
    first.runtimeEvidence = {
      schemaVersion: TURN_RUNTIME_EVIDENCE_SCHEMA_VERSION,
      recordedAt: "2026-01-01T00:00:00.000Z",
      workerId: "worker-a",
      deploymentRevision: revision,
      engineVersion: "engine-v1",
      engineContractVersion: TURN_SCHEMA_VERSION,
      intervalMs,
      previousTurn: -1,
      previousFingerprint: "genesis",
      timing: "baseline",
    };
    const late = attachTurnRuntimeEvidence(
      turn(2, "wrong-predecessor"),
      first,
      {
        recordedAt: "2026-01-01T03:00:00.000Z",
        workerId: "worker-a",
        deploymentRevision: "unbound-test",
        engineVersion: "engine-v1",
        engineContractVersion: TURN_SCHEMA_VERSION,
        intervalMs,
      },
    );
    const report = buildWorldReliabilityReport(
      [first, late, structuredClone(late)],
      {
        generatedAt: "2026-01-01T06:00:00.000Z",
        intervalMs,
      },
    );

    expect(report.status).toBe("critical");
    expect(report.missingTurns).toBe(1);
    expect(report.duplicateTurns).toBe(1);
    expect(report.predecessorMismatches).toBe(1);
    expect(report.lateSettlements).toBe(2);
    expect(report.onTimeRate).toBe(0);
    expect(report.reportFresh).toBe(false);
    expect(report.recovery.evidencePresent).toBe(false);
  });

  it("does not count an early restart as an on-time settlement", () => {
    const first = turn(0, "genesis");
    first.runtimeEvidence = {
      schemaVersion: TURN_RUNTIME_EVIDENCE_SCHEMA_VERSION,
      recordedAt: "2026-01-01T00:00:00.000Z",
      workerId: "worker-a",
      deploymentRevision: revision,
      engineVersion: "engine-v1",
      engineContractVersion: TURN_SCHEMA_VERSION,
      intervalMs,
      previousTurn: -1,
      previousFingerprint: "genesis",
      timing: "baseline",
    };
    const early = attachTurnRuntimeEvidence(
      turn(1, first.fingerprint),
      first,
      {
        recordedAt: "2026-01-01T00:30:00.000Z",
        workerId: "worker-a",
        deploymentRevision: revision,
        engineVersion: "engine-v1",
        engineContractVersion: TURN_SCHEMA_VERSION,
        intervalMs,
      },
    );
    const report = buildWorldReliabilityReport(
      [first, early],
      {
        generatedAt: "2026-01-01T00:30:00.000Z",
        intervalMs,
      },
    );

    expect(report.earlyRestartSettlements).toBe(1);
    expect(report.onTimeSettlements).toBe(0);
    expect(report.onTimeRate).toBe(0);
  });

  it("waits for the persisted cadence after restart and runs overdue work immediately", () => {
    const latest = turn(42, "fingerprint-41");
    latest.runtimeEvidence = {
      schemaVersion: TURN_RUNTIME_EVIDENCE_SCHEMA_VERSION,
      recordedAt: "2026-01-01T00:00:00.000Z",
      workerId: "worker-a",
      deploymentRevision: revision,
      engineVersion: "engine-v1",
      engineContractVersion: TURN_SCHEMA_VERSION,
      intervalMs,
      previousTurn: 41,
      previousFingerprint: "fingerprint-41",
      timing: "on-time",
    };

    expect(
      nextTurnScheduleDelayMs(
        latest,
        Date.parse("2026-01-01T00:30:00.000Z"),
        intervalMs,
      ),
    ).toBe(1_800_000);
    expect(
      nextTurnScheduleDelayMs(
        latest,
        Date.parse("2026-01-01T01:30:00.000Z"),
        intervalMs,
      ),
    ).toBe(0);
    expect(
      nextTurnScheduleDelayMs(
        turn(0, "genesis"),
        Date.parse("2026-01-01T00:00:00.000Z"),
        intervalMs,
      ),
    ).toBe(0);
    expect(() =>
      nextTurnScheduleDelayMs(latest, Date.now(), Number.NaN),
    ).toThrow("finite clock and interval");
  });
});
