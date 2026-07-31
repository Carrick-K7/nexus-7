import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  ISOLATED_EVALUATION_IMAGE,
  isolatedEvaluationArguments,
  type IsolatedEvaluationProfile,
} from "../src/evidence/isolated-executor";

function runCommand(
  command: string,
  argumentsList: string[],
  cwd?: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, {
      cwd,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

function commandOutput(
  command: string,
  argumentsList: string[],
  cwd: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(command, argumentsList, {
      cwd,
      stdio: ["ignore", "pipe", "inherit"],
    });
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`${command} exited ${code ?? "without a status"}`));
      }
    });
  });
}

async function frozenSourceArchive(root: string): Promise<{
  archivePath: string;
  temporaryDirectory: string;
}> {
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "nexus-isolated-source-"),
  );
  const archivePath = path.join(temporaryDirectory, "source.tar");
  const sourceListPath = path.join(temporaryDirectory, "source-files");
  try {
    const sourceList = await commandOutput(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      root,
    );
    await fs.writeFile(sourceListPath, sourceList, { mode: 0o600 });
    const exitCode = await runCommand(
      "tar",
      [
        "--null",
        "--files-from",
        sourceListPath,
        "-cf",
        archivePath,
        "--",
        "node_modules",
      ],
      root,
    );
    if (exitCode !== 0) {
      throw new Error(`Unable to freeze isolated source: tar exited ${exitCode}`);
    }
    await fs.chmod(archivePath, 0o444);
    return { archivePath, temporaryDirectory };
  } catch (error) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function main(): Promise<void> {
  const requested = process.argv[2] ?? "smoke";
  if (requested !== "smoke" && requested !== "quality") {
    throw new Error("Evaluation profile must be smoke or quality");
  }
  const profile = requested as IsolatedEvaluationProfile;
  const startedAt = new Date();
  const frozenSource = await frozenSourceArchive(process.cwd());
  let exitCode: number;
  try {
    exitCode = await runCommand(
      "docker",
      isolatedEvaluationArguments(frozenSource.archivePath, profile),
    );
  } finally {
    await fs.rm(frozenSource.temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
  const report = {
    schemaVersion: 1,
    profile,
    image: ISOLATED_EVALUATION_IMAGE,
    network: "none",
    rootFilesystem: "read-only",
    sourceMount: "read-only-frozen-archive",
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
