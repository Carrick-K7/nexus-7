import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  resolve,
} from "node:path";
import {
  verifyCityModelAcceptance,
} from "../src/city/verification";

async function main(): Promise<void> {
  const report = await verifyCityModelAcceptance();
  const outputPath = resolve(
    process.cwd(),
    process.env.NEXUS_CITY_ACCEPTANCE_OUTPUT ??
      ".artifacts/city-model-acceptance.json",
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify({
      event: "city-model.acceptance.completed",
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
