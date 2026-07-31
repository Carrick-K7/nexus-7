import {
  execFileSync,
} from "node:child_process";
import {
  createPrivateKey,
} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createRemoteEvidenceReceipt,
  sha256FileContent,
} from "../src/evidence";
import type {
  GovernanceEvidenceKind,
} from "../src/governance/types";
import {
  verifySymbiosisReplicationBundle,
  type SymbiosisReplicationBundle,
} from "../src/symbiosis/replication";
import {
  verifyRecoveryEvidence,
  type SymbiosisRecoveryEvidence,
} from "../src/symbiosis/reliability";

interface GithubAttestationVerification {
  verificationResult?: {
    statement?: {
      subject?: Array<{
        digest?: Record<string, string>;
      }>;
    };
  };
}

const KINDS: GovernanceEvidenceKind[] = [
  "ci-evidence",
  "model-regression-live",
  "recovery-drill",
  "deployment-drill",
  "deployment-conformance",
  "symbiosis-replication",
  "symbiosis-off-host-recovery",
];

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function passed(kind: GovernanceEvidenceKind, artifact: Record<string, unknown>): boolean {
  if (kind === "ci-evidence") {
    return (
      Array.isArray(artifact.gates) &&
      artifact.gates.every(
        (gate) => isRecord(gate) && gate.status === "passed",
      )
    );
  }
  if (kind === "model-regression-live") {
    return isRecord(artifact.gate) && artifact.gate.passed === true;
  }
  if (kind === "symbiosis-replication") {
    const structurallyPassing =
      artifact.schemaVersion ===
        "nexus.symbiosis-replication-bundle.v1" &&
      artifact.status ===
        "local-replication-passed-external-attestation-pending" &&
      isRecord(artifact.analysis) &&
      artifact.analysis.passed === artifact.analysis.total &&
      isRecord(artifact.integrity) &&
      artifact.integrity.localVerificationPassed === true;
    if (!structurallyPassing) return false;
    try {
      return verifySymbiosisReplicationBundle(
        artifact as unknown as SymbiosisReplicationBundle,
      ).passed;
    } catch {
      return false;
    }
  }
  if (kind === "symbiosis-off-host-recovery") {
    const structurallyPassing =
      artifact.schemaVersion ===
        "nexus.symbiosis-recovery-evidence.v1" &&
      isRecord(artifact.backup) &&
      artifact.backup.encrypted === true &&
      artifact.backup.offHost === true &&
      isRecord(artifact.restoreDrill) &&
      artifact.restoreDrill.target ===
        "off-host-second-database" &&
      artifact.restoreDrill.checksumValid === true &&
      artifact.restoreDrill.rowCountsMatch === true &&
      artifact.restoreDrill.latestFingerprintMatch === true &&
      artifact.restoreDrill.resumedWrite === true &&
      isRecord(artifact.locationProof) &&
      artifact.locationProof.independentTarget === true;
    if (!structurallyPassing) return false;
    try {
      return verifyRecoveryEvidence(
        artifact as unknown as SymbiosisRecoveryEvidence,
      );
    } catch {
      return false;
    }
  }
  return artifact.passed === true;
}

function generatedAt(artifact: Record<string, unknown>): string {
  for (const field of ["completedAt", "generatedAt"] as const) {
    if (typeof artifact[field] === "string") {
      return artifact[field];
    }
  }
  throw new Error("Evidence artifact has no generated/completed timestamp");
}

function summary(
  kind: GovernanceEvidenceKind,
  artifact: Record<string, unknown>,
): Record<string, unknown> {
  if (kind === "ci-evidence") {
    return {
      fingerprint: artifact.fingerprint,
      gates: artifact.gates,
    };
  }
  if (kind === "model-regression-live") {
    return {
      providerId: artifact.providerId,
      model: artifact.model,
      promptVersion: artifact.promptVersion,
      summary: artifact.summary,
      gate: artifact.gate,
    };
  }
  if (kind === "recovery-drill") {
    return {
      drillId: artifact.drillId,
      observedRecoveryPointMs: artifact.observedRecoveryPointMs,
      observedRecoveryTimeMs: artifact.observedRecoveryTimeMs,
      checks: artifact.checks,
    };
  }
  if (kind === "deployment-conformance") {
    return {
      contractVersion: artifact.contractVersion,
      adapterId: artifact.adapterId,
      fingerprint: artifact.fingerprint,
      checks: artifact.checks,
    };
  }
  if (kind === "symbiosis-replication") {
    const analysis = artifact.analysis as Record<string, unknown>;
    const design = artifact.design as Record<string, unknown>;
    const integrity = artifact.integrity as Record<string, unknown>;
    return {
      bundleSha256: integrity.bundleSha256,
      resultsSha256: integrity.resultsSha256,
      hypothesesPassed: analysis.passed,
      hypothesesTotal: analysis.total,
      runCount: design.runCount,
    };
  }
  if (kind === "symbiosis-off-host-recovery") {
    const backup = artifact.backup as Record<string, unknown>;
    const location = artifact.locationProof as Record<string, unknown>;
    return {
      evidenceChecksum: artifact.evidenceChecksum,
      backupArtifactSha256: backup.artifactSha256,
      sourceHostFingerprint: location.sourceHostFingerprint,
      restoreTargetHostFingerprint:
        location.restoreTargetHostFingerprint,
      independentTarget: location.independentTarget,
    };
  }
  return {
    drillId: artifact.drillId,
    adapterId: artifact.adapterId,
    observedRollbackTimeMs: artifact.observedRollbackTimeMs,
    checks: artifact.checks,
  };
}

function lifetimeMs(kind: GovernanceEvidenceKind): number {
  if (kind === "ci-evidence") {
    return 24 * 60 * 60 * 1_000;
  }
  if (kind === "model-regression-live") {
    return 36 * 60 * 60 * 1_000;
  }
  return 7 * 24 * 60 * 60 * 1_000;
}

async function main(): Promise<void> {
  const evidencePath = path.resolve(
    process.cwd(),
    process.argv[2] ?? "",
  );
  const kind = process.argv[3] as GovernanceEvidenceKind;
  if (!KINDS.includes(kind)) {
    throw new Error(`Evidence kind must be one of ${KINDS.join(", ")}`);
  }
  const outputPath = path.resolve(
    process.cwd(),
    process.argv[4] ?? `.artifacts/${kind}-receipt.json`,
  );
  const evidenceContent = await fs.readFile(evidencePath);
  const parsed: unknown = JSON.parse(evidenceContent.toString("utf8"));
  if (!isRecord(parsed) || !passed(kind, parsed)) {
    throw new Error("Only passing evidence artifacts can receive a receipt");
  }
  const repository = required(
    process.env.NEXUS_EVIDENCE_REPOSITORY ??
      process.env.NEXUS_ATTESTATION_REPOSITORY ??
      process.env.GITHUB_REPOSITORY,
    "NEXUS_EVIDENCE_REPOSITORY",
  );
  const signerWorkflow = required(
    process.env.NEXUS_EVIDENCE_SIGNER_WORKFLOW,
    "NEXUS_EVIDENCE_SIGNER_WORKFLOW",
  );
  const sourceCommitSha = required(
    process.env.NEXUS_EVIDENCE_SOURCE_COMMIT_SHA ??
      process.env.GITHUB_SHA,
    "NEXUS_EVIDENCE_SOURCE_COMMIT_SHA",
  );
  const runId = required(
    process.env.NEXUS_EVIDENCE_RUN_ID ?? process.env.GITHUB_RUN_ID,
    "NEXUS_EVIDENCE_RUN_ID",
  );
  const verificationJson = execFileSync(
    "gh",
    [
      "attestation",
      "verify",
      evidencePath,
      "--repo",
      repository,
      "--signer-workflow",
      signerWorkflow,
      "--source-digest",
      sourceCommitSha,
      "--deny-self-hosted-runners",
      "--format",
      "json",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const verifications = JSON.parse(
    verificationJson,
  ) as GithubAttestationVerification[];
  const subjectSha256 = sha256FileContent(evidenceContent);
  if (
    !verifications.some((verification) =>
      verification.verificationResult?.statement?.subject?.some(
        (subject) => subject.digest?.sha256 === subjectSha256,
      ),
    )
  ) {
    throw new Error(
      "Verified attestation does not contain the evidence artifact digest",
    );
  }
  const privateKey = createPrivateKey(
    Buffer.from(
      required(
        process.env.NEXUS_ATTESTATION_RECEIPT_PRIVATE_KEY_BASE64,
        "NEXUS_ATTESTATION_RECEIPT_PRIVATE_KEY_BASE64",
      ),
      "base64",
    ).toString("utf8"),
  );
  const verifiedAt = new Date();
  const receipt = createRemoteEvidenceReceipt(
    {
      schemaVersion: 1,
      provider: "github-actions-sigstore",
      kind,
      repository,
      sourceCommitSha,
      signerWorkflow,
      runId,
      subjectPath: path.relative(process.cwd(), evidencePath),
      subjectSha256,
      passed: true,
      generatedAt: generatedAt(parsed),
      verifiedAt: verifiedAt.toISOString(),
      expiresAt: new Date(
        verifiedAt.getTime() + lifetimeMs(kind),
      ).toISOString(),
      summary: summary(kind, parsed),
    },
    privateKey,
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      event: "remote-evidence.receipt.issued",
      kind,
      outputPath,
      subjectSha256,
      expiresAt: receipt.payload.expiresAt,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
