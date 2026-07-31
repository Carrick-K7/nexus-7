import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Pool } from "pg";
import { createPostgresBackup } from "../src/operations/postgres-backup";

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL or POSTGRES_URL is required");
}

async function main(): Promise<void> {
  const createdAt = new Date();
  const outputPath = path.resolve(
    process.cwd(),
    process.argv[2] ??
      `backups/nexus-${createdAt.toISOString().replaceAll(":", "-")}.json`,
  );
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const backup = await createPostgresBackup(pool, createdAt);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.tmp`;
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(backup, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await fs.rename(temporaryPath, outputPath);
    console.log(
      JSON.stringify({
        event: "postgres.backup.completed",
        outputPath,
        checksum: backup.checksum,
        rowCounts: backup.rowCounts,
      }),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
