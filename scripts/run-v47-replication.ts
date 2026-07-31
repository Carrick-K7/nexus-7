import {
  createHash,
} from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createSymbiosisReplicationBundle,
  type ReplicationInputArtifact,
  type SymbiosisReplicationBundle,
  verifySymbiosisReplicationBundle,
} from "../src/symbiosis/replication";

const INPUT_PATHS = [
  "data/shenzhen/2026-q2/manifest.json",
  "data/shenzhen/2026-q2/calibration.json",
  "package.json",
  "package-lock.json",
  "scripts/run-v47-replication.ts",
  "src/simulation/core/random.ts",
  "src/symbiosis/cognition.ts",
  "src/symbiosis/contracts.ts",
  "src/symbiosis/engine.ts",
  "src/symbiosis/replication.ts",
  "src/symbiosis/society.ts",
] as const;

async function artifact(filePath: string): Promise<ReplicationInputArtifact> {
  const content = await readFile(path.resolve(filePath));
  return {
    path: filePath,
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.byteLength,
  };
}

async function main(): Promise<void> {
  const outputPath = path.resolve(
    process.cwd(),
    process.env.NEXUS_V47_BUNDLE_PATH ??
      "public/data/v4-7-replication-bundle.json",
  );
  const bundle = await createSymbiosisReplicationBundle(
    await Promise.all(INPUT_PATHS.map(artifact)),
  );
  const verification = verifySymbiosisReplicationBundle(bundle);
  if (!verification.passed) {
    throw new Error(
      `Generated v4.7 bundle failed: ${verification.errors.join(", ")}`,
    );
  }
  if (process.argv.includes("--write")) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(bundle, null, 2)}\n`,
      "utf8",
    );
  } else {
    const published = JSON.parse(
      await readFile(outputPath, "utf8"),
    ) as SymbiosisReplicationBundle;
    const publishedVerification =
      verifySymbiosisReplicationBundle(published);
    if (!publishedVerification.passed) {
      throw new Error(
        `Published v4.7 bundle failed: ${publishedVerification.errors.join(", ")}`,
      );
    }
    if (
      published.integrity.bundleSha256 !==
      bundle.integrity.bundleSha256
    ) {
      throw new Error(
        `v4.7 reproduction mismatch: expected ${published.integrity.bundleSha256}, reproduced ${bundle.integrity.bundleSha256}`,
      );
    }
  }
  console.log(
    JSON.stringify({
      event: "v47.replication.completed",
      mode: process.argv.includes("--write") ? "write" : "verify",
      outputPath,
      bundleSha256: bundle.integrity.bundleSha256,
      resultsSha256: bundle.integrity.resultsSha256,
      hypotheses: `${bundle.analysis.passed}/${bundle.analysis.total}`,
      runs: bundle.runs.length,
      exactReplays: bundle.runs.filter((run) => run.exactReplay).length,
      externalCiVerified: bundle.integrity.externalCiVerified,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
