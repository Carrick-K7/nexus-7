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

// A later release may change package metadata and this verifier itself without
// changing the frozen v4.7 scientific inputs. Exact v4.7 environment
// reproduction still runs from tag v4.7.0 in CI; this current-release command
// reports compatibility only when every calibration/world source and complete
// result hash remains exact.
const COMPATIBILITY_METADATA_PATHS = new Set<string>([
  "package.json",
  "package-lock.json",
  "scripts/run-v47-replication.ts",
]);

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
  let publishedBundleSha256 = bundle.integrity.bundleSha256;
  let exactBundleMatch = true;
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
    publishedBundleSha256 = published.integrity.bundleSha256;
    if (!publishedVerification.passed) {
      throw new Error(
        `Published v4.7 bundle failed: ${publishedVerification.errors.join(", ")}`,
      );
    }
    exactBundleMatch =
      published.integrity.bundleSha256 ===
      bundle.integrity.bundleSha256;
    const publishedInputs = new Map(
      published.inputs.artifacts.map((input) => [input.path, input]),
    );
    const currentInputs = new Map(
      bundle.inputs.artifacts.map((input) => [input.path, input]),
    );
    const scientificInputMismatches = [
      ...new Set(
        [...publishedInputs.keys(), ...currentInputs.keys()].filter(
          (inputPath) => {
            if (COMPATIBILITY_METADATA_PATHS.has(inputPath)) {
              return false;
            }
            const publishedInput = publishedInputs.get(inputPath);
            const currentInput = currentInputs.get(inputPath);
            return (
              !publishedInput ||
              !currentInput ||
              publishedInput.sha256 !== currentInput.sha256 ||
              publishedInput.bytes !== currentInput.bytes
            );
          },
        ),
      ),
    ].sort();
    const metadataDrift = bundle.inputs.artifacts
      .filter(
        (input) =>
          COMPATIBILITY_METADATA_PATHS.has(input.path) &&
          (
            publishedInputs.get(input.path)?.sha256 !== input.sha256 ||
            publishedInputs.get(input.path)?.bytes !== input.bytes
          ),
      )
      .map((input) => input.path);
    if (
      !exactBundleMatch &&
      (
        scientificInputMismatches.length > 0 ||
        published.integrity.resultsSha256 !==
          bundle.integrity.resultsSha256
      )
    ) {
      throw new Error(
        `v4.7 scientific compatibility mismatch: inputs=${scientificInputMismatches.join(",") || "none"}, expected-results=${published.integrity.resultsSha256}, reproduced-results=${bundle.integrity.resultsSha256}`,
      );
    }
    console.log(
      JSON.stringify({
        event: "v47.replication.compatibility",
        exactBundleMatch,
        scientificInputMismatches,
        metadataDrift,
        exactReleaseCommand:
          "git checkout v4.7.0 && npm ci && npm run verify:v47",
      }),
    );
  }
  console.log(
    JSON.stringify({
      event: "v47.replication.completed",
      mode: process.argv.includes("--write") ? "write" : "verify",
      outputPath,
      bundleSha256: publishedBundleSha256,
      reproducedEnvelopeSha256: bundle.integrity.bundleSha256,
      exactBundleMatch,
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
