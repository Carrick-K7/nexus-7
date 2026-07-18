import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  verifyLongHorizon,
} from "../src/verification/long-horizon";

async function main(): Promise<void> {
  const ticks = Number(process.env.NEXUS_STRESS_TICKS ?? 10_000);
  if (!Number.isInteger(ticks) || ticks < 1) {
    throw new Error("NEXUS_STRESS_TICKS must be a positive integer");
  }
  const outputPath = path.resolve(
    process.cwd(),
    process.argv[2] ?? "public/data/v1-1-stress.json",
  );
  const startedAt = performance.now();
  const report = verifyLongHorizon(undefined, ticks);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify({
      event: "simulation.long-horizon.completed",
      outputPath,
      durationMs: Math.round(performance.now() - startedAt),
      ...report,
    }),
  );
  if (!report.meetsStabilityGate) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
