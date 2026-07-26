import {
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  Pool,
} from "pg";
import type {
  ExperimentActor,
} from "../src/experiments/types";
import {
  backupArtifactSha256,
  decryptBackupFile,
} from "../src/operations/encrypted-backup";
import {
  verifyPostgresBackup,
  type PostgresBackup,
} from "../src/operations/postgres-backup";
import {
  PostgresWorldRepository,
} from "../src/symbiosis/postgres-repository";
import {
  RECOVERY_EVIDENCE_SCHEMA_VERSION,
  withRecoveryEvidenceChecksum,
} from "../src/symbiosis/reliability";
import {
  WorldService,
} from "../src/symbiosis/service";
import type {
  WorldSeason,
  WorldTurn,
} from "../src/symbiosis/contracts";

function safeTableName(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) {
    throw new Error(`Unsafe table name in backup: ${value}`);
  }
  return value;
}

async function main(): Promise<void> {
  const [backupArgument, encryptedArgument, outputArgument] =
    process.argv.slice(2).filter((value) => value !== "--off-host");
  const restoreDatabaseUrl =
    process.env.RESTORE_DATABASE_URL?.trim();
  const keyFile =
    process.env.NEXUS7_BACKUP_ENCRYPTION_KEY_FILE?.trim();
  if (
    !backupArgument ||
    !encryptedArgument ||
    !outputArgument ||
    !restoreDatabaseUrl ||
    !keyFile
  ) {
    throw new Error(
      "Usage: RESTORE_DATABASE_URL=... NEXUS7_BACKUP_ENCRYPTION_KEY_FILE=... npm run recovery:evidence -- <backup.json> <encrypted-backup> <evidence.json> [--off-host]",
    );
  }
  const backupPath = path.resolve(process.cwd(), backupArgument);
  const encryptedPath = path.resolve(
    process.cwd(),
    encryptedArgument,
  );
  const outputPath = path.resolve(process.cwd(), outputArgument);
  const backup = JSON.parse(
    await readFile(backupPath, "utf8"),
  ) as PostgresBackup;
  if (!verifyPostgresBackup(backup)) {
    throw new Error("Recovery evidence backup checksum is invalid");
  }
  const decryptedPath =
    `${outputPath}.decrypted-${process.pid}.tmp`;
  let encryptedBackup: PostgresBackup;
  try {
    await decryptBackupFile(
      encryptedPath,
      decryptedPath,
      keyFile,
    );
    encryptedBackup = JSON.parse(
      await readFile(decryptedPath, "utf8"),
    ) as PostgresBackup;
  } finally {
    await unlink(decryptedPath).catch((error: unknown) => {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    });
  }
  if (
    !verifyPostgresBackup(encryptedBackup) ||
    encryptedBackup.checksum !== backup.checksum
  ) {
    throw new Error(
      "Encrypted artifact does not contain the supplied checksum-valid backup",
    );
  }
  const seasonRows =
    backup.tables.nexus_world_seasons as Array<
      Record<string, unknown>
    >;
  const seasonRow = [...seasonRows].sort(
    (left, right) =>
      Number(right.current_turn) - Number(left.current_turn),
  )[0];
  const season = seasonRow?.season_json as
    | WorldSeason
    | undefined;
  if (!season) {
    throw new Error("Backup contains no symbiosis season");
  }
  const backupTurns = (
    backup.tables.nexus_world_turns as Array<
      Record<string, unknown>
    >
  )
    .filter((row) => row.season_id === season.id)
    .map((row) => row.turn_json as WorldTurn)
    .sort((left, right) => left.turn - right.turn);
  const backupLatest = backupTurns.at(-1);
  if (!backupLatest) {
    throw new Error("Backup contains no symbiosis Turn");
  }

  const pool = new Pool({
    connectionString: restoreDatabaseUrl,
  });
  try {
    let rowCountsMatch = true;
    for (const [tableName, expected] of Object.entries(
      backup.rowCounts,
    )) {
      const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ${safeTableName(
          tableName,
        )}`,
      );
      if (Number(result.rows[0]?.count ?? -1) !== expected) {
        rowCountsMatch = false;
      }
    }
    const restoredLatestResult = await pool.query<{
      turn_json: WorldTurn;
    }>(
      `SELECT turn_json
       FROM nexus_world_turns
       WHERE season_id = $1
       ORDER BY turn DESC
       LIMIT 1`,
      [season.id],
    );
    const restoredLatest =
      restoredLatestResult.rows[0]?.turn_json;
    const latestFingerprintMatch =
      restoredLatest?.turn === backupLatest.turn &&
      restoredLatest.fingerprint === backupLatest.fingerprint;
    const repository = new PostgresWorldRepository(pool);
    const service = new WorldService(repository, {
      seasonId: season.id,
      seed: season.seed,
    });
    const actor: ExperimentActor = {
      id: "symbiosis-recovery-drill",
      role: "admin",
      workspaceId: season.workspaceId,
      principalType: "system",
    };
    await service.initialize();
    const resumedTurn = await service.advanceTurn(actor);
    const resumedWrite =
      resumedTurn.turn === backupLatest.turn + 1 &&
      resumedTurn.previousFingerprint === backupLatest.fingerprint &&
      resumedTurn.resourceConservationPassed;
    const encryptedMetadata = await stat(encryptedPath);
    const completedAt = new Date().toISOString();
    const offHost = process.argv.includes("--off-host");
    const evidence = withRecoveryEvidenceChecksum({
      schemaVersion: RECOVERY_EVIDENCE_SCHEMA_VERSION,
      generatedAt: completedAt,
      backup: {
        createdAt: backup.createdAt,
        checksum: backup.checksum,
        artifactSha256:
          await backupArtifactSha256(encryptedPath),
        encrypted: true,
        offHost,
        sizeBytes: encryptedMetadata.size,
      },
      restoreDrill: {
        completedAt,
        target: offHost
          ? "off-host-second-database"
          : "second-database",
        checksumValid: true,
        rowCountsMatch,
        latestFingerprintMatch,
        resumedWrite,
      },
    });
    const temporaryPath = `${outputPath}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(evidence, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporaryPath, outputPath);
    console.log(
      JSON.stringify({
        event: "symbiosis.recovery-evidence.completed",
        outputPath,
        evidence,
      }),
    );
    if (
      !rowCountsMatch ||
      !latestFingerprintMatch ||
      !resumedWrite
    ) {
      throw new Error(
        "Second-database recovery evidence did not pass",
      );
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
