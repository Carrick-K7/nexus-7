// @vitest-environment node

import {
  createHash,
} from "node:crypto";
import {
  readFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";
import {
  DEFAULT_DATA_BUNDLE,
} from "./engine";
import {
  SYMBIOSIS_SCHEMA_SQL,
  SYMBIOSIS_AI_ONLY_MIGRATION_SQL,
} from "./postgres-schema";

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

describe("Symbiotic Shenzhen governed artifacts", () => {
  it("keeps the deployable migration equal to the runtime schema", async () => {
    const migration = await readFile(
      resolve("migrations/0009_symbiotic_shenzhen_world.sql"),
      "utf8",
    );
    expect(normalizeSql(migration)).toBe(
      normalizeSql(SYMBIOSIS_SCHEMA_SQL),
    );
    const aiOnlyMigration = await readFile(
      resolve("migrations/0010_ai_only_world.sql"),
      "utf8",
    );
    expect(normalizeSql(aiOnlyMigration)).toBe(
      normalizeSql(SYMBIOSIS_AI_ONLY_MIGRATION_SQL),
    );
  });

  it("binds the frozen data manifest to its declared SHA-256", async () => {
    const manifest = await readFile(
      resolve(DEFAULT_DATA_BUNDLE.manifestPath),
    );
    const sha256 = createHash("sha256").update(manifest).digest("hex");
    expect(sha256).toBe(DEFAULT_DATA_BUNDLE.sha256);
    const parsed = JSON.parse(manifest.toString("utf8")) as {
      boundary: string;
      artifacts: Array<{
        containsPersonalData: boolean;
      }>;
    };
    expect(parsed.boundary).toContain("not a Shenzhen digital twin");
    expect(
      parsed.artifacts.every(
        (artifact) => !artifact.containsPersonalData,
      ),
    ).toBe(true);
  });
});
