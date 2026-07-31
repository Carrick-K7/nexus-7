import {
  execFileSync,
} from "node:child_process";
import {
  createPublicKey,
} from "node:crypto";
import {
  readFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";
import {
  isExternalAttestationReceipt,
  verifyExternalAttestationReceipt,
} from "@/evidence/attestation-receipt";
import type {
  CiEvidenceManifest,
} from "@/evidence/ci-evidence";
import {
  hasSourceChanges,
} from "@/evidence/source-revision";
import {
  bindReleaseArtifact,
  sha256,
} from "./engine";
import {
  CLOSED_LOOP_CORPUS_FINGERPRINT,
} from "./corpus";
import type {
  ClosedLoopReleaseArtifact,
} from "./types";

function git(
  root: string,
  args: string[],
  fallback: string,
): string {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

async function optionalFile(
  path: string,
): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch {
    return undefined;
  }
}

export async function resolveClosedLoopReleaseArtifact(
  root = process.cwd(),
  now = new Date(),
): Promise<ClosedLoopReleaseArtifact> {
  const [
    packageBuffer,
    lockBuffer,
    iterationBuffer,
    ciBuffer,
  ] = await Promise.all([
    readFile(resolve(root, "package.json")),
    readFile(resolve(root, "package-lock.json")),
    optionalFile(resolve(root, "iterations/v2.0.0.json")),
    optionalFile(resolve(root, "public/data/ci-evidence.json")),
  ]);
  const packageDocument = JSON.parse(
    packageBuffer.toString("utf8"),
  ) as { version?: string };
  const commitSha = git(
    root,
    ["rev-parse", "HEAD"],
    "unknown",
  );
  const dirty = hasSourceChanges(
    git(
      root,
      [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ],
      "dirty",
    ),
  );
  const artifactDigest = sha256({
    packageJsonSha256: sha256(packageBuffer.toString("utf8")),
    packageLockSha256: sha256(lockBuffer.toString("utf8")),
    iterationManifestSha256: iterationBuffer
      ? sha256(iterationBuffer.toString("utf8"))
      : "pending",
    corpusFingerprint: CLOSED_LOOP_CORPUS_FINGERPRINT,
  });
  let ciEvidence: CiEvidenceManifest | undefined;
  try {
    ciEvidence = ciBuffer
      ? (JSON.parse(
          ciBuffer.toString("utf8"),
        ) as CiEvidenceManifest)
      : undefined;
  } catch {
    ciEvidence = undefined;
  }
  const repository =
    ciEvidence?.source.repository &&
    ciEvidence.source.repository !== "local/nexus-7"
      ? ciEvidence.source.repository
      : git(
          root,
          ["remote", "get-url", "origin"],
          "local/nexus-7",
        );
  const evidenceManifestFingerprint =
    ciEvidence?.fingerprint &&
    /^[a-f0-9]{64}$/i.test(ciEvidence.fingerprint)
      ? ciEvidence.fingerprint
      : sha256({
          artifactDigest,
          trust: "local",
          corpusFingerprint: CLOSED_LOOP_CORPUS_FINGERPRINT,
        });
  let externalAttestation:
    | NonNullable<
        ClosedLoopReleaseArtifact["externalAttestation"]
      >
    | undefined;
  const encodedReceipt =
    process.env.NEXUS_V2_ATTESTATION_RECEIPT_BASE64;
  const encodedPublicKey =
    process.env.NEXUS_ATTESTATION_RECEIPT_PUBLIC_KEY_BASE64;
  if (
    encodedReceipt &&
    encodedPublicKey &&
    ciBuffer &&
    ciEvidence?.provenance.trustLevel === "external-ci" &&
    ciEvidence.source.commitSha === commitSha &&
    !dirty
  ) {
    try {
      const receipt = JSON.parse(
        Buffer.from(encodedReceipt, "base64").toString("utf8"),
      ) as unknown;
      if (isExternalAttestationReceipt(receipt)) {
        const verification = verifyExternalAttestationReceipt(
          receipt,
          createPublicKey(
            Buffer.from(
              encodedPublicKey,
              "base64",
            ).toString("utf8"),
          ),
          {
            repository,
            sourceCommitSha: commitSha,
            subjectSha256: sha256(ciBuffer.toString("utf8")),
            manifestFingerprint:
              evidenceManifestFingerprint,
            requiredGates: ciEvidence.gates.map(
              (gate) => gate.name,
            ),
          },
          now,
        );
        if (verification.valid) {
          externalAttestation = {
            receiptId: `${receipt.payload.runId}:${receipt.payload.subjectSha256}`,
            provider: receipt.payload.provider,
            verifiedAt: receipt.payload.verifiedAt,
            expiresAt: receipt.payload.expiresAt,
            verified: true,
          };
        }
      }
    } catch {
      externalAttestation = undefined;
    }
  }
  return bindReleaseArtifact({
    packageVersion: packageDocument.version ?? "unknown",
    repository,
    commitSha,
    dirty,
    artifactDigest,
    evidenceManifestFingerprint,
    trust: externalAttestation
      ? "external-attested"
      : dirty
        ? "local-uncommitted"
        : "local-committed",
    ...(externalAttestation ? { externalAttestation } : {}),
    boundAt: now.toISOString(),
  });
}
