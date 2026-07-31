import {
  createHash,
} from "node:crypto";
import {
  stableStringify,
} from "@/simulation";
import {
  TURN_RUNTIME_EVIDENCE_SCHEMA_VERSION,
  type WorldTurn,
} from "./contracts";

export const WORLD_RELIABILITY_SCHEMA_VERSION =
  "nexus.world-reliability.v1" as const;
export const RECOVERY_EVIDENCE_SCHEMA_VERSION =
  "nexus.symbiosis-recovery-evidence.v1" as const;

export interface SymbiosisRecoveryEvidence {
  schemaVersion: typeof RECOVERY_EVIDENCE_SCHEMA_VERSION;
  generatedAt: string;
  backup: {
    createdAt: string;
    checksum: string;
    artifactSha256: string;
    encrypted: boolean;
    offHost: boolean;
    sizeBytes: number;
  };
  restoreDrill: {
    completedAt: string;
    target: "second-database" | "off-host-second-database";
    checksumValid: boolean;
    rowCountsMatch: boolean;
    latestFingerprintMatch: boolean;
    resumedWrite: boolean;
  };
  locationProof?: {
    sourceHostFingerprint: string;
    restoreTargetHostFingerprint: string;
    independentTarget: true;
  };
  evidenceChecksum: string;
}

export interface WorldReliabilityReport {
  schemaVersion: typeof WORLD_RELIABILITY_SCHEMA_VERSION;
  generatedAt: string;
  status: "healthy" | "watch" | "critical";
  intervalMs: number;
  observationWindowDays: number;
  requiredObservationDays: 90;
  storedTurns: number;
  firstTurn: number | null;
  latestTurn: number | null;
  missingTurns: number;
  duplicateTurns: number;
  predecessorMismatches: number;
  revisionBoundTurns: number;
  revisionCoverageRate: number;
  deploymentRevisions: Array<{
    revision: string;
    turns: number;
  }>;
  comparableSettlements: number;
  onTimeSettlements: number;
  lateSettlements: number;
  earlyRestartSettlements: number;
  onTimeRate: number | null;
  latestTurnAgeMs: number | null;
  reportFresh: boolean | null;
  recovery: {
    evidencePresent: boolean;
    backupAgeMs: number | null;
    backupFresh: boolean | null;
    encrypted: boolean | null;
    offHost: boolean | null;
    secondDatabaseRestorePassed: boolean | null;
    restoreDrillAt: string | null;
  };
  disclosures: {
    zh: string;
    en: string;
  };
}

function finiteDate(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function recoveryEvidenceChecksum(
  evidence: Omit<SymbiosisRecoveryEvidence, "evidenceChecksum">,
): string {
  return createHash("sha256")
    .update(stableStringify(evidence))
    .digest("hex");
}

export function withRecoveryEvidenceChecksum(
  evidence: Omit<SymbiosisRecoveryEvidence, "evidenceChecksum">,
): SymbiosisRecoveryEvidence {
  return {
    ...evidence,
    evidenceChecksum: recoveryEvidenceChecksum(evidence),
  };
}

export function verifyRecoveryEvidence(
  evidence: SymbiosisRecoveryEvidence,
): boolean {
  const {
    evidenceChecksum,
    ...payload
  } = evidence;
  const offHostTarget =
    evidence.restoreDrill.target ===
    "off-host-second-database";
  const locationProofValid =
    !offHostTarget ||
    (
      evidence.locationProof?.independentTarget === true &&
      /^[0-9a-f]{64}$/.test(
        evidence.locationProof.sourceHostFingerprint,
      ) &&
      /^[0-9a-f]{64}$/.test(
        evidence.locationProof.restoreTargetHostFingerprint,
      ) &&
      evidence.locationProof.sourceHostFingerprint !==
        evidence.locationProof.restoreTargetHostFingerprint
    );
  return (
    recoveryEvidenceChecksum(payload) === evidenceChecksum &&
    /^[0-9a-f]{64}$/.test(evidence.backup.checksum) &&
    /^[0-9a-f]{64}$/.test(evidence.backup.artifactSha256) &&
    evidence.backup.offHost === offHostTarget &&
    locationProofValid
  );
}

function roundedRate(numerator: number, denominator: number): number {
  return denominator === 0
    ? 0
    : Number((numerator / denominator).toFixed(6));
}

export function attachTurnRuntimeEvidence(
  turn: WorldTurn,
  previousTurn: WorldTurn,
  options: {
    recordedAt: string;
    workerId: string;
    deploymentRevision: string;
    engineVersion: string;
    engineContractVersion: string;
    intervalMs: number;
  },
): WorldTurn {
  const previousRecordedAt = finiteDate(
    previousTurn.runtimeEvidence?.recordedAt,
  );
  const recordedAt = finiteDate(options.recordedAt);
  if (recordedAt === null) {
    throw new Error("Turn runtime recordedAt must be a valid timestamp");
  }
  const expectedAt =
    previousRecordedAt === null
      ? undefined
      : new Date(previousRecordedAt + options.intervalMs).toISOString();
  const lagMs =
    expectedAt === undefined
      ? undefined
      : recordedAt - Date.parse(expectedAt);
  const toleranceMs = Math.max(
    60_000,
    Math.floor(options.intervalMs * 0.1),
  );
  const timing =
    lagMs === undefined
      ? "baseline"
      : lagMs > toleranceMs
        ? "late"
        : lagMs < -toleranceMs
          ? "early-restart"
          : "on-time";
  return {
    ...turn,
    runtimeEvidence: {
      schemaVersion: TURN_RUNTIME_EVIDENCE_SCHEMA_VERSION,
      recordedAt: options.recordedAt,
      workerId: options.workerId,
      deploymentRevision: options.deploymentRevision,
      engineVersion: options.engineVersion,
      engineContractVersion: options.engineContractVersion,
      intervalMs: options.intervalMs,
      previousTurn: previousTurn.turn,
      previousFingerprint: previousTurn.fingerprint,
      expectedAt,
      lagMs,
      timing,
    },
  };
}

export function nextTurnScheduleDelayMs(
  latestTurn: WorldTurn,
  nowMs: number,
  intervalMs: number,
): number {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(intervalMs) ||
    intervalMs < 60_000
  ) {
    throw new Error(
      "Turn schedule requires a finite clock and interval of at least 60 seconds",
    );
  }
  if (!latestTurn.runtimeEvidence) return 0;
  const recordedAt = finiteDate(
    latestTurn.runtimeEvidence.recordedAt,
  );
  if (recordedAt === null) {
    throw new Error(
      "Latest Turn runtime evidence has an invalid recordedAt",
    );
  }
  return Math.max(
    0,
    Math.ceil(recordedAt + intervalMs - nowMs),
  );
}

export function buildWorldReliabilityReport(
  turns: WorldTurn[],
  options: {
    generatedAt: string;
    intervalMs: number;
    recoveryEvidence?: SymbiosisRecoveryEvidence;
  },
): WorldReliabilityReport {
  const ordered = [...turns].sort(
    (left, right) => left.turn - right.turn,
  );
  const generatedAt = finiteDate(options.generatedAt);
  if (generatedAt === null) {
    throw new Error(
      "Reliability generatedAt must be a valid timestamp",
    );
  }
  const counts = new Map<number, number>();
  for (const turn of ordered) {
    counts.set(turn.turn, (counts.get(turn.turn) ?? 0) + 1);
  }
  const uniqueTurns = [...counts.keys()].sort(
    (left, right) => left - right,
  );
  const firstTurn = uniqueTurns[0] ?? null;
  const latestTurn = uniqueTurns.at(-1) ?? null;
  let missingTurns = 0;
  if (firstTurn !== null && latestTurn !== null) {
    for (let turn = firstTurn; turn <= latestTurn; turn += 1) {
      if (!counts.has(turn)) missingTurns += 1;
    }
  }
  const duplicateTurns = [...counts.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );
  let predecessorMismatches = 0;
  const firstRecordByTurn = new Map<number, WorldTurn>();
  for (const turn of ordered) {
    if (!firstRecordByTurn.has(turn.turn)) {
      firstRecordByTurn.set(turn.turn, turn);
    }
  }
  for (const turnNumber of uniqueTurns) {
    const current = firstRecordByTurn.get(turnNumber);
    const previous = firstRecordByTurn.get(turnNumber - 1);
    if (
      current?.runtimeEvidence &&
      current.turn > (firstTurn ?? current.turn) &&
      current.runtimeEvidence.previousTurn !== current.turn - 1
    ) {
      predecessorMismatches += 1;
      continue;
    }
    if (
      current &&
      previous &&
      (
        current.previousFingerprint !== previous.fingerprint ||
        (
          current.runtimeEvidence &&
          (
            current.runtimeEvidence.previousTurn !== previous.turn ||
            current.runtimeEvidence.previousFingerprint !==
              previous.fingerprint
          )
        )
      )
    ) {
      predecessorMismatches += 1;
    }
  }
  const runtimeTurns = ordered.filter(
    (turn) => turn.runtimeEvidence,
  );
  const revisionBoundTurns = runtimeTurns.filter(
    (turn) =>
      !turn.runtimeEvidence?.deploymentRevision.startsWith(
        "unbound-",
      ),
  ).length;
  const revisionCounts = new Map<string, number>();
  for (const turn of runtimeTurns) {
    const revision =
      turn.runtimeEvidence?.deploymentRevision ?? "unbound-legacy";
    revisionCounts.set(
      revision,
      (revisionCounts.get(revision) ?? 0) + 1,
    );
  }
  const comparable = runtimeTurns.filter(
    (turn) => turn.runtimeEvidence?.timing !== "baseline",
  );
  const lateSettlements = comparable.filter(
    (turn) => turn.runtimeEvidence?.timing === "late",
  ).length;
  const earlyRestartSettlements = comparable.filter(
    (turn) => turn.runtimeEvidence?.timing === "early-restart",
  ).length;
  const onTimeSettlements = comparable.filter(
    (turn) => turn.runtimeEvidence?.timing === "on-time",
  ).length;
  const firstRecordedAt = finiteDate(
    runtimeTurns[0]?.runtimeEvidence?.recordedAt,
  );
  const latestRecordedAt = finiteDate(
    runtimeTurns.at(-1)?.runtimeEvidence?.recordedAt,
  );
  const observationWindowDays =
    firstRecordedAt === null || latestRecordedAt === null
      ? 0
      : Number(
          (
            Math.max(0, latestRecordedAt - firstRecordedAt) /
            86_400_000
          ).toFixed(3),
        );
  const latestTurnAgeMs =
    latestRecordedAt === null
      ? null
      : Math.max(0, generatedAt - latestRecordedAt);
  const reportFresh =
    latestTurnAgeMs === null
      ? null
      : latestTurnAgeMs <= options.intervalMs * 2;
  const recovery = options.recoveryEvidence;
  const backupAt = finiteDate(recovery?.backup.createdAt);
  const backupAgeMs =
    backupAt === null
      ? null
      : Math.max(0, generatedAt - backupAt);
  const backupFresh =
    backupAgeMs === null
      ? null
      : backupAgeMs <= 24 * 60 * 60 * 1_000;
  const secondDatabaseRestorePassed = recovery
    ? recovery.restoreDrill.checksumValid &&
      recovery.restoreDrill.rowCountsMatch &&
      recovery.restoreDrill.latestFingerprintMatch &&
      recovery.restoreDrill.resumedWrite
    : null;
  const critical =
    missingTurns > 0 ||
    duplicateTurns > 0 ||
    predecessorMismatches > 0 ||
    reportFresh === false;
  const watch =
    observationWindowDays < 90 ||
    revisionBoundTurns < ordered.length ||
    backupFresh !== true ||
    recovery?.backup.encrypted !== true ||
    recovery?.backup.offHost !== true ||
    secondDatabaseRestorePassed !== true;

  return {
    schemaVersion: WORLD_RELIABILITY_SCHEMA_VERSION,
    generatedAt: options.generatedAt,
    status: critical ? "critical" : watch ? "watch" : "healthy",
    intervalMs: options.intervalMs,
    observationWindowDays,
    requiredObservationDays: 90,
    storedTurns: ordered.length,
    firstTurn,
    latestTurn,
    missingTurns,
    duplicateTurns,
    predecessorMismatches,
    revisionBoundTurns,
    revisionCoverageRate: roundedRate(
      revisionBoundTurns,
      ordered.length,
    ),
    deploymentRevisions: [...revisionCounts.entries()]
      .map(([revision, count]) => ({ revision, turns: count }))
      .sort((left, right) =>
        left.revision.localeCompare(right.revision),
      ),
    comparableSettlements: comparable.length,
    onTimeSettlements,
    lateSettlements,
    earlyRestartSettlements,
    onTimeRate:
      comparable.length === 0
        ? null
        : roundedRate(onTimeSettlements, comparable.length),
    latestTurnAgeMs,
    reportFresh,
    recovery: {
      evidencePresent: Boolean(recovery),
      backupAgeMs,
      backupFresh,
      encrypted: recovery?.backup.encrypted ?? null,
      offHost: recovery?.backup.offHost ?? null,
      secondDatabaseRestorePassed,
      restoreDrillAt:
        recovery?.restoreDrill.completedAt ?? null,
    },
    disclosures: {
      zh: "墙钟可靠性只使用已持久化的运行证据。参考时钟可验证 90 天算法，但不能冒充真实生产已运行 90 天；同机第二数据库也不能冒充异地恢复。",
      en: "Wall-clock reliability uses persisted runtime evidence only. A reference clock can verify the 90-day algorithm but cannot claim 90 production days; a same-host second database is not an off-host restore.",
    },
  };
}
