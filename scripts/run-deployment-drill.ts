import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  getDeploymentAdapterFromEnvironment,
} from "../src/deployment";
import {
  OperationalTelemetryCollector,
  getOperationalIntelligenceService,
  runDeploymentRollbackDrill,
} from "../src/operations";
import {
  getGovernanceService,
} from "../src/governance/server";

function git(argumentsList: string[], fallback: string): string {
  try {
    return execFileSync("git", argumentsList, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const repository =
    process.env.GITHUB_REPOSITORY ??
    git(["remote", "get-url", "origin"], "local/nexus-7")
      .replace(/^https:\/\/github\.com\//, "")
      .replace(/\.git$/, "");
  const commitSha =
    process.env.GITHUB_SHA ??
    git(["rev-parse", "HEAD"], "unknown");
  const drillManifest = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      kind: "deployment-rollback-drill",
      repository,
      commitSha,
      workflow: process.env.GITHUB_WORKFLOW ?? "local",
      runId: process.env.GITHUB_RUN_ID ?? "local",
    }),
    "utf8",
  );
  const drillManifestSha256 = createHash("sha256")
    .update(drillManifest)
    .digest("hex");
  const report = await runDeploymentRollbackDrill({
    adapter: getDeploymentAdapterFromEnvironment(),
    artifact: {
      name: process.env.NEXUS_DRILL_ARTIFACT_NAME ?? "nexus-7",
      repository,
      commitSha,
      evidenceManifestSha256: drillManifestSha256,
      evidenceManifestFingerprint: drillManifestSha256,
    },
    rollbackTimeObjectiveMs: Number(
      process.env.NEXUS_ROLLBACK_TIME_OBJECTIVE_MS ?? 60_000,
    ),
  });
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    await getGovernanceService();
    const operations = await getOperationalIntelligenceService();
    await new OperationalTelemetryCollector(operations).collect(
      { deployment: report },
      {
        id: "system:deployment-drill",
        role: "admin",
        workspaceId: "workspace-neo-angeles",
        principalType: "system",
        authSource: "system",
        issuer: "nexus-deployment-drill",
      },
    );
  }
  const outputPath = path.resolve(
    root,
    process.env.NEXUS_DEPLOYMENT_DRILL_OUTPUT ??
      ".artifacts/deployment-rollback-drill.json",
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify({
      event: "operations.deployment-rollback-drill.completed",
      outputPath,
      drillId: report.drillId,
      adapterId: report.adapterId,
      observedRollbackTimeMs: report.observedRollbackTimeMs,
      passed: report.passed,
    }),
  );
  if (!report.passed) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
