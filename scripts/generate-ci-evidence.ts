import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createCiEvidenceManifest,
} from "../src/evidence/ci-evidence";
import {
  hasSourceChanges,
  normalizeGitPorcelainOutput,
  unexpectedSourceChanges,
} from "../src/evidence/source-revision";

function git(argumentsList: string[], fallback: string): string {
  try {
    return execFileSync("git", argumentsList, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

function gitPorcelain(): string {
  try {
    return normalizeGitPorcelainOutput(
      execFileSync(
        "git",
        ["status", "--porcelain=v1", "--untracked-files=all"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ),
    );
  } catch {
    return "dirty";
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const externalCi = process.env.GITHUB_ACTIONS === "true";
  const requireLiveModelEvidence =
    process.env.NEXUS_REQUIRE_LIVE_MODEL_EVIDENCE === "true";
  const repository =
    process.env.GITHUB_REPOSITORY ??
    git(["remote", "get-url", "origin"], "local/nexus-7");
  const isolatedEvidencePath = path.join(
    root,
    ".artifacts/isolated-evaluation.json",
  );
  const isolatedEvidence = JSON.parse(
    await fs.readFile(isolatedEvidencePath, "utf8"),
  ) as {
    profile?: string;
    passed?: boolean;
    exitCode?: number;
  };
  if (
    isolatedEvidence.profile !== "quality" ||
    isolatedEvidence.passed !== true ||
    isolatedEvidence.exitCode !== 0
  ) {
    throw new Error(
      "CI evidence requires a passing isolated quality evaluation",
    );
  }
  const modelEvidencePath = path.join(
    root,
    "public/data/model-regression.json",
  );
  const modelEvidence = JSON.parse(
    await fs.readFile(modelEvidencePath, "utf8"),
  ) as {
    providerId?: string;
    liveProviderRequired?: boolean;
    gate?: { passed?: boolean };
  };
  if (modelEvidence.gate?.passed !== true) {
    throw new Error(
      "CI evidence requires a passing model regression report",
    );
  }
  if (
    requireLiveModelEvidence &&
    (modelEvidence.liveProviderRequired !== true ||
      modelEvidence.providerId === "deterministic-mock")
  ) {
    throw new Error(
      "External promotion evidence requires a passing live model regression",
    );
  }
  const artifactPaths = [
    "package.json",
    "package-lock.json",
    "public/data/v1-readiness.json",
    "public/data/v1-1-stress.json",
    "public/data/model-regression.json",
    ".artifacts/isolated-evaluation.json",
    ".artifacts/deployment-controller-conformance.json",
    ".artifacts/operational-acceptance.json",
    ".artifacts/city-model-acceptance.json",
    ".artifacts/diagnosis-acceptance.json",
    ".artifacts/planning-acceptance.json",
    ".artifacts/outcome-learning-acceptance.json",
    ".artifacts/participation-acceptance.json",
    // The closed-loop report binds this manifest. Hashing that report here
    // would make the two signed artifacts recursively invalidate each other.
  ];
  const porcelainStatus = gitPorcelain();
  const unexpectedChanges = unexpectedSourceChanges(porcelainStatus);
  console.log(
    JSON.stringify({
      event: "ci.evidence.source-status",
      dirty: unexpectedChanges.length > 0,
      unexpectedChanges,
    }),
  );
  const manifest = createCiEvidenceManifest({
    root,
    source: {
      repository,
      commitSha:
        process.env.GITHUB_SHA ?? git(["rev-parse", "HEAD"], "unknown"),
      ref: process.env.GITHUB_REF ?? git(["branch", "--show-current"], "local"),
      workflow: process.env.GITHUB_WORKFLOW ?? "local",
      runId: process.env.GITHUB_RUN_ID ?? "local",
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "1",
      actor: process.env.GITHUB_ACTOR ?? process.env.USER ?? "local",
      dirty: hasSourceChanges(porcelainStatus),
    },
    artifactPaths,
    externalCi,
    includeExternalPromotionGates: requireLiveModelEvidence,
  });
  const outputPath = path.join(root, "public/data/ci-evidence.json");
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify({
      event: "ci.evidence.generated",
      outputPath,
      fingerprint: manifest.fingerprint,
      trustLevel: manifest.provenance.trustLevel,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
