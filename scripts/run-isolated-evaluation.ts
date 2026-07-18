import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  ISOLATED_EVALUATION_IMAGE,
  isolatedEvaluationArguments,
  type IsolatedEvaluationProfile,
} from "../src/evidence/isolated-executor";

function runDocker(argumentsList: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", argumentsList, {
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  const requested = process.argv[2] ?? "smoke";
  if (requested !== "smoke" && requested !== "quality") {
    throw new Error("Evaluation profile must be smoke or quality");
  }
  const profile = requested as IsolatedEvaluationProfile;
  const startedAt = new Date();
  const exitCode = await runDocker(
    isolatedEvaluationArguments(process.cwd(), profile),
  );
  const report = {
    schemaVersion: 1,
    profile,
    image: ISOLATED_EVALUATION_IMAGE,
    network: "none",
    rootFilesystem: "read-only",
    sourceMount: "read-only",
    capabilities: "dropped",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    exitCode,
    passed: exitCode === 0,
  };
  const outputPath = path.resolve(
    process.cwd(),
    ".artifacts/isolated-evaluation.json",
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(report));
  process.exitCode = exitCode;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
