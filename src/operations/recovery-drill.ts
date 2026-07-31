import type {
  Pool,
} from "pg";
import {
  ExperimentService,
  PostgresExperimentRepository,
} from "@/experiments";
import {
  stableStringify,
} from "@/simulation";
import {
  createPostgresBackup,
  restorePostgresBackup,
  verifyPostgresBackup,
} from "./postgres-backup";
import {
  initializeSymbiosisSchema,
} from "@/symbiosis/postgres-schema";

export interface RecoveryDrillReport {
  schemaVersion: 1;
  drillId: string;
  startedAt: string;
  completedAt: string;
  recoveryPointObjectiveMs: number;
  recoveryTimeObjectiveMs: number;
  observedRecoveryPointMs: number;
  observedRecoveryTimeMs: number;
  backup: {
    checksum: string;
    rowCounts: Record<string, number>;
  };
  source: {
    runId: string;
    tick: number;
    version: number;
    fingerprint: string;
  };
  restored: {
    tick: number;
    version: number;
    fingerprint: string;
  };
  checks: {
    checksumValid: boolean;
    tableSnapshotExact: boolean;
    deterministicReplay: boolean;
    runMetadataExact: boolean;
    verificationExact: boolean;
    workerLeaseCleared: boolean;
    sequencesWritable: boolean;
    recoveryPointWithinObjective: boolean;
    recoveryTimeWithinObjective: boolean;
  };
  passed: boolean;
}

export async function runPostgresRecoveryDrill(options: {
  sourcePool: Pool;
  restorePool: Pool;
  now?: () => Date;
  recoveryPointObjectiveMs?: number;
  recoveryTimeObjectiveMs?: number;
  drillId?: string;
}): Promise<RecoveryDrillReport> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const drillId =
    options.drillId ??
    `recovery-${startedAt.toISOString().replaceAll(":", "-")}`;
  const recoveryPointObjectiveMs =
    options.recoveryPointObjectiveMs ?? 60_000;
  const recoveryTimeObjectiveMs =
    options.recoveryTimeObjectiveMs ?? 120_000;
  let sequence = 0;
  const sourceRepository = new PostgresExperimentRepository(
    options.sourcePool,
  );
  const sourceService = new ExperimentService(sourceRepository, {
    now,
    id: () => `${drillId}-${++sequence}`,
  });
  await sourceService.initialize();
  // The backup contract spans the v2 kernel and v4 city tables. Recovery
  // drills must be self-contained rather than depending on a prior symbiosis
  // test or worker having initialized the city schema.
  await initializeSymbiosisSchema(options.sourcePool);
  const actor = {
    id: "recovery-drill",
    role: "admin" as const,
    principalType: "human" as const,
  };
  let sourceRun = await sourceService.createRun(
    {
      name: `Recovery drill ${drillId}`,
      seed: `${drillId}-seed`,
    },
    actor,
  );
  for (let index = 0; index < 8; index += 1) {
    sourceRun = await sourceService.mutateRun(
      sourceRun.id,
      sourceRun.version,
      { type: "step" },
      actor,
    );
  }
  await sourceRepository.acquireWorkerLease(
    "experiment-clock",
    drillId,
    60_000,
  );
  const sourceReport = await sourceService.report(sourceRun.id);
  const backup = await createPostgresBackup(options.sourcePool, now());
  const recoveryStartedAt = performance.now();
  await restorePostgresBackup(options.restorePool, backup, {
    force: true,
  });
  const restoredRepository = new PostgresExperimentRepository(
    options.restorePool,
  );
  const restoredService = new ExperimentService(restoredRepository, {
    now,
    id: () => `${drillId}-restored-${++sequence}`,
  });
  const restoredReport = await restoredService.report(sourceRun.id);
  const restoredBackup = await createPostgresBackup(
    options.restorePool,
    now(),
  );
  const workerLeaseCleared =
    (await restoredRepository.getWorkerLease("experiment-clock")) === null;
  const continuedRun = await restoredService.mutateRun(
    sourceRun.id,
    sourceRun.version,
    { type: "step" },
    actor,
  );
  const observedRecoveryTimeMs = Math.max(
    0,
    Math.round(performance.now() - recoveryStartedAt),
  );
  const observedRecoveryPointMs = Math.max(
    0,
    Date.parse(backup.createdAt) - Date.parse(sourceRun.updatedAt),
  );
  const checks = {
    checksumValid: verifyPostgresBackup(backup),
    tableSnapshotExact:
      stableStringify(restoredBackup.tables) ===
      stableStringify(backup.tables),
    deterministicReplay:
      sourceReport.verification.deterministicReplay &&
      restoredReport.verification.deterministicReplay,
    runMetadataExact:
      stableStringify(restoredReport.run) ===
      stableStringify(sourceReport.run),
    verificationExact:
      stableStringify(restoredReport.verification) ===
      stableStringify(sourceReport.verification),
    workerLeaseCleared,
    sequencesWritable:
      continuedRun.version === sourceRun.version + 1 &&
      continuedRun.run.world.tick === sourceRun.run.world.tick + 1,
    recoveryPointWithinObjective:
      observedRecoveryPointMs <= recoveryPointObjectiveMs,
    recoveryTimeWithinObjective:
      observedRecoveryTimeMs <= recoveryTimeObjectiveMs,
  };
  const completedAt = now();

  return {
    schemaVersion: 1,
    drillId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    recoveryPointObjectiveMs,
    recoveryTimeObjectiveMs,
    observedRecoveryPointMs,
    observedRecoveryTimeMs,
    backup: {
      checksum: backup.checksum,
      rowCounts: backup.rowCounts,
    },
    source: {
      runId: sourceRun.id,
      tick: sourceReport.run.tick,
      version: sourceReport.run.version,
      fingerprint: sourceReport.verification.fingerprint,
    },
    restored: {
      tick: restoredReport.run.tick,
      version: restoredReport.run.version,
      fingerprint: restoredReport.verification.fingerprint,
    },
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}
