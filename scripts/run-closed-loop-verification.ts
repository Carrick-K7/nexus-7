import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  resolve,
} from "node:path";
import {
  verifyClosedLoopCertification,
} from "../src/closure/verification";

async function main(): Promise<void> {
  const report = await verifyClosedLoopCertification();
  const outputPath = resolve(
    process.cwd(),
    ".artifacts/closed-loop-certification.json",
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify({
      event: "closed-loop.certification.completed",
      outputPath,
      metrics: report.metrics,
      implementationComplete:
        report.implementationComplete,
      productionVerified: report.productionVerified,
      status: report.status,
      fingerprint: report.fingerprint,
    }),
  );
  if (!report.implementationComplete) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
