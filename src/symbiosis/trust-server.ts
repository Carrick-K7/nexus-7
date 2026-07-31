import {
  createHash,
  createPublicKey,
  type KeyLike,
} from "node:crypto";
import {
  readFileSync,
} from "node:fs";
import path from "node:path";
import type {
  HumanObservatoryReport,
} from "./observatory";
import {
  buildSymbiosisTrustMatrix,
  type SymbiosisTrustMatrix,
} from "./trust";

interface JsonArtifact {
  value: unknown;
  sha256?: string;
}

function readJsonArtifact(
  filePath: string | undefined,
  required: boolean,
): JsonArtifact {
  if (!filePath) {
    return { value: required ? { loadError: "path-missing" } : undefined };
  }
  try {
    const content = readFileSync(filePath);
    return {
      value: JSON.parse(content.toString("utf8")) as unknown,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  } catch {
    return { value: { loadError: "artifact-unreadable" } };
  }
}

function receiptPublicKey(): KeyLike | undefined {
  const encoded =
    process.env.NEXUS_ATTESTATION_RECEIPT_PUBLIC_KEY_BASE64?.trim();
  if (!encoded) return undefined;
  try {
    return createPublicKey(
      Buffer.from(encoded, "base64").toString("utf8"),
    );
  } catch {
    return undefined;
  }
}

function trustedWorkflows(repository: string): string[] {
  const configured =
    process.env.SYMBIOSIS_TRUSTED_SIGNER_WORKFLOWS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  return configured.length > 0
    ? configured
    : [
        `${repository}/.github/workflows/ci.yml`,
        `${repository}/.github/workflows/operations-drills.yml`,
        `${repository}/.github/workflows/symbiosis-offhost-recovery.yml`,
      ];
}

export function configuredSymbiosisTrustMatrix(
  observatory: Pick<
    HumanObservatoryReport,
    "cognition" | "reliability"
  >,
  now = new Date(),
): SymbiosisTrustMatrix {
  const root = process.cwd();
  const bundle = readJsonArtifact(
    path.join(root, "public/data/v4-7-replication-bundle.json"),
    true,
  );
  const recoveryPath =
    process.env.SYMBIOSIS_RECOVERY_EVIDENCE_FILE?.trim();
  const recovery = readJsonArtifact(recoveryPath, false);
  const replicationReceipt = readJsonArtifact(
    process.env.SYMBIOSIS_REPLICATION_RECEIPT_FILE?.trim(),
    false,
  );
  const recoveryReceipt = readJsonArtifact(
    process.env.SYMBIOSIS_OFFHOST_RECOVERY_RECEIPT_FILE?.trim(),
    false,
  );
  const repository =
    process.env.NEXUS_EVIDENCE_REPOSITORY?.trim() ||
    process.env.NEXUS_ATTESTATION_REPOSITORY?.trim() ||
    "Carrick-K7/nexus-7";
  return buildSymbiosisTrustMatrix({
    generatedAt: now.toISOString(),
    releaseRevision:
      process.env.NEXUS_RELEASE_REVISION?.trim() ||
      "unbound-development",
    repository,
    signerWorkflows: trustedWorkflows(repository),
    publicKey: receiptPublicKey(),
    replicationBundle: bundle.value,
    replicationArtifactSha256: bundle.sha256,
    replicationReceipt: replicationReceipt.value,
    recoveryEvidence: recovery.value,
    recoveryArtifactSha256: recovery.sha256,
    recoveryReceipt: recoveryReceipt.value,
    observatory,
  });
}
