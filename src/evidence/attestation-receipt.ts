import {
  createHash,
  sign,
  verify,
  type KeyLike,
} from "node:crypto";
import {
  stableStringify,
} from "@/simulation";

export interface ExternalAttestationReceiptPayload {
  schemaVersion: 1;
  provider: "github-actions-sigstore";
  repository: string;
  sourceCommitSha: string;
  subjectPath: string;
  subjectSha256: string;
  manifestFingerprint: string;
  workflow: string;
  signerWorkflow: string;
  runId: string;
  gates: string[];
  verifiedAt: string;
  expiresAt: string;
}

export interface ExternalAttestationReceipt {
  payload: ExternalAttestationReceiptPayload;
  signature: string;
}

export interface ExpectedAttestationEvidence {
  repository: string;
  sourceCommitSha: string;
  subjectSha256: string;
  manifestFingerprint: string;
  requiredGates: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isExternalAttestationReceipt(
  value: unknown,
): value is ExternalAttestationReceipt {
  if (!isRecord(value) || !isRecord(value.payload)) {
    return false;
  }
  const payload = value.payload;
  const stringFields = [
    "repository",
    "sourceCommitSha",
    "subjectPath",
    "subjectSha256",
    "manifestFingerprint",
    "workflow",
    "signerWorkflow",
    "runId",
    "verifiedAt",
    "expiresAt",
  ];
  return (
    typeof value.signature === "string" &&
    value.signature.length > 0 &&
    payload.schemaVersion === 1 &&
    payload.provider === "github-actions-sigstore" &&
    stringFields.every(
      (field) =>
        typeof payload[field] === "string" &&
        (payload[field] as string).length > 0,
    ) &&
    Array.isArray(payload.gates) &&
    payload.gates.length > 0 &&
    payload.gates.every(
      (gate) => typeof gate === "string" && gate.length > 0,
    )
  );
}

function payloadBytes(
  payload: ExternalAttestationReceiptPayload,
): Buffer {
  return Buffer.from(stableStringify(payload), "utf8");
}

export function sha256FileContent(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function createExternalAttestationReceipt(
  payload: ExternalAttestationReceiptPayload,
  privateKey: KeyLike,
): ExternalAttestationReceipt {
  return {
    payload: structuredClone(payload),
    signature: sign(null, payloadBytes(payload), privateKey).toString(
      "base64url",
    ),
  };
}

export function verifyExternalAttestationReceipt(
  receipt: ExternalAttestationReceipt,
  publicKey: KeyLike,
  expected: ExpectedAttestationEvidence,
  now = new Date(),
): {
  valid: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const payload = receipt.payload;
  let signatureValid = false;
  try {
    signatureValid = verify(
      null,
      payloadBytes(payload),
      publicKey,
      Buffer.from(receipt.signature, "base64url"),
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    reasons.push("Receipt signature is invalid");
  }
  if (payload.schemaVersion !== 1) {
    reasons.push("Receipt schema version is unsupported");
  }
  if (payload.provider !== "github-actions-sigstore") {
    reasons.push("Receipt provider is not GitHub Actions Sigstore");
  }
  if (payload.repository !== expected.repository) {
    reasons.push("Receipt repository does not match the release artifact");
  }
  if (payload.sourceCommitSha !== expected.sourceCommitSha) {
    reasons.push("Receipt commit does not match the release artifact");
  }
  if (payload.subjectSha256 !== expected.subjectSha256) {
    reasons.push("Receipt subject digest does not match the evidence manifest");
  }
  if (payload.manifestFingerprint !== expected.manifestFingerprint) {
    reasons.push("Receipt fingerprint does not match the evidence manifest");
  }
  const missingGates = expected.requiredGates.filter(
    (gate) => !payload.gates.includes(gate),
  );
  if (missingGates.length > 0) {
    reasons.push(`Receipt is missing gates: ${missingGates.join(", ")}`);
  }
  const verifiedAt = Date.parse(payload.verifiedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (!Number.isFinite(verifiedAt) || !Number.isFinite(expiresAt)) {
    reasons.push("Receipt timestamps are invalid");
  } else {
    if (verifiedAt > now.getTime() + 60_000) {
      reasons.push("Receipt verification time is in the future");
    }
    if (expiresAt <= now.getTime()) {
      reasons.push("Receipt has expired");
    }
    if (expiresAt - verifiedAt > 7 * 24 * 60 * 60 * 1_000) {
      reasons.push("Receipt lifetime exceeds seven days");
    }
  }
  return {
    valid: reasons.length === 0,
    reasons,
  };
}

export function attestationPublicKeyFromEnvironment(): string {
  const encoded = process.env.NEXUS_ATTESTATION_RECEIPT_PUBLIC_KEY_BASE64;
  if (!encoded) {
    throw new Error(
      "NEXUS_ATTESTATION_RECEIPT_PUBLIC_KEY_BASE64 is required for governed promotion",
    );
  }
  return Buffer.from(encoded, "base64").toString("utf8");
}
