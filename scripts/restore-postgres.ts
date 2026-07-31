import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Pool } from "pg";
import {
  restorePostgresBackup,
  type PostgresBackup,
} from "../src/operations/postgres-backup";

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL or POSTGRES_URL is required");
}
const input = process.argv
  .slice(2)
  .find((argument) => !argument.startsWith("--"));
if (!input) {
  throw new Error(
    "Usage: npm run db:restore -- <backup.json> [--force]",
  );
}
const inputPath = path.resolve(process.cwd(), input);

async function main(): Promise<void> {
  const backup = JSON.parse(
    await fs.readFile(inputPath, "utf8"),
  ) as PostgresBackup;
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const rowCounts = await restorePostgresBackup(pool, backup, {
      force: process.argv.includes("--force"),
    });
    console.log(
      JSON.stringify({
        event: "postgres.restore.completed",
        inputPath,
        checksum: backup.checksum,
        rowCounts,
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
