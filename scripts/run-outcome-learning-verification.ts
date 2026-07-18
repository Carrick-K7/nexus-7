import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  resolve,
} from "node:path";
import {
  verifyOutcomeLearningAcceptance,
} from "../src/outcomes/verification";

async function main(): Promise<void> {
  const outputPath = resolve(
    process.cwd(),
    process.env.NEXUS_OUTCOME_ACCEPTANCE_OUTPUT ??
      ".artifacts/outcome-learning-acceptance.json",
  );
  const report = await verifyOutcomeLearningAcceptance();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify({
      event: "outcome-learning.acceptance.completed",
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
