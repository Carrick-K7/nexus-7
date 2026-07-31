import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL or POSTGRES_URL is required");
}

const migrationDirectory = path.resolve(process.cwd(), "migrations");
const migrationFiles = (await fs.readdir(migrationDirectory))
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  for (const fileName of migrationFiles) {
    const sql = await fs.readFile(
      path.join(migrationDirectory, fileName),
      "utf8",
    );
    await pool.query(sql);
    console.log(`Applied ${fileName}`);
  }
} finally {
  await pool.end();
}
