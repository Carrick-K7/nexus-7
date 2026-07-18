import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  runDeploymentControllerConformance,
} from "../src/deployment";

async function main(): Promise<void> {
  const report = await runDeploymentControllerConformance();
  const outputPath = path.resolve(
    process.cwd(),
    process.env.NEXUS_DEPLOYMENT_CONFORMANCE_OUTPUT ??
      ".artifacts/deployment-controller-conformance.json",
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify({
      event: "deployment-controller.conformance.completed",
      outputPath,
      contractVersion: report.contractVersion,
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
