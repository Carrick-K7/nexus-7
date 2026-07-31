import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Pool } from "pg";
import {
  OperationalTelemetryCollector,
  getOperationalIntelligenceService,
  runPostgresRecoveryDrill,
} from "../src/operations";
import {
  getGovernanceService,
} from "../src/governance/server";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main(): Promise<void> {
  const sourcePool = new Pool({
    connectionString:
      process.env.TEST_DATABASE_URL ??
      process.env.DATABASE_URL ??
      required("DATABASE_URL"),
  });
  const restorePool = new Pool({
    connectionString:
      process.env.TEST_RESTORE_DATABASE_URL ??
      required("TEST_RESTORE_DATABASE_URL"),
  });
  try {
    const report = await runPostgresRecoveryDrill({
      sourcePool,
      restorePool,
      recoveryPointObjectiveMs: Number(
        process.env.NEXUS_RECOVERY_POINT_OBJECTIVE_MS ?? 60_000,
      ),
      recoveryTimeObjectiveMs: Number(
        process.env.NEXUS_RECOVERY_TIME_OBJECTIVE_MS ?? 120_000,
      ),
    });
    await getGovernanceService();
    const operations = await getOperationalIntelligenceService();
    await new OperationalTelemetryCollector(operations).collect(
      { recovery: report },
      {
        id: "system:recovery-drill",
        role: "admin",
        workspaceId: "workspace-neo-angeles",
        principalType: "system",
        authSource: "system",
        issuer: "nexus-recovery-drill",
      },
    );
    const outputPath = path.resolve(
      process.cwd(),
      process.env.NEXUS_RECOVERY_DRILL_OUTPUT ??
        ".artifacts/recovery-drill.json",
    );
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(
      outputPath,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    console.log(
      JSON.stringify({
        event: "operations.recovery-drill.completed",
        outputPath,
        drillId: report.drillId,
        observedRecoveryPointMs: report.observedRecoveryPointMs,
        observedRecoveryTimeMs: report.observedRecoveryTimeMs,
        passed: report.passed,
      }),
    );
    if (!report.passed) {
      process.exitCode = 1;
    }
  } finally {
    await Promise.all([sourcePool.end(), restorePool.end()]);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
