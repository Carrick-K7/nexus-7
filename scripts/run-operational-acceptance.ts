import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runOperationalAcceptance } from "../src/operations/acceptance";

async function main(): Promise<void> {
  const report = await runOperationalAcceptance();
  const outputPath = path.resolve(
    process.cwd(),
    process.env.NEXUS_OPERATIONAL_ACCEPTANCE_OUTPUT ??
      ".artifacts/operational-acceptance.json",
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify({
      event: "operational-intelligence.acceptance.completed",
      outputPath,
      fingerprint: report.fingerprint,
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
