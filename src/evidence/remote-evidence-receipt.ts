import {
  sign,
  verify,
  type KeyLike,
} from "node:crypto";
import {
  stableStringify,
} from "@/simulation";
import type {
  GovernanceEvidenceKind,
} from "@/governance/types";

export interface RemoteEvidenceReceiptPayload {
  schemaVersion: 1;
  provider: "github-actions-sigstore";
  kind: GovernanceEvidenceKind;
  repository: string;
  sourceCommitSha: string;
  signerWorkflow: string;
  runId: string;
  subjectPath: string;
  subjectSha256: string;
  passed: boolean;
  generatedAt: string;
  verifiedAt: string;
  expiresAt: string;
  summary: Record<string, unknown>;
}

export interface RemoteEvidenceReceipt {
  payload: RemoteEvidenceReceiptPayload;
  signature: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRemoteEvidenceReceipt(
  value: unknown,
): value is RemoteEvidenceReceipt {
  if (!isRecord(value) || !isRecord(value.payload)) {
    return false;
  }
  const payload = value.payload;
  const kinds: GovernanceEvidenceKind[] = [
    "ci-evidence",
    "model-regression-live",
    "recovery-drill",
    "deployment-drill",
    "deployment-conformance",
  ];
  return (
    typeof value.signature === "string" &&
    value.signature.length > 0 &&
    payload.schemaVersion === 1 &&
    payload.provider === "github-actions-sigstore" &&
    typeof payload.kind === "string" &&
    kinds.includes(payload.kind as GovernanceEvidenceKind) &&
    [
      "repository",
      "sourceCommitSha",
      "signerWorkflow",
      "runId",
      "subjectPath",
      "subjectSha256",
      "generatedAt",
      "verifiedAt",
      "expiresAt",
    ].every(
      (field) =>
        typeof payload[field] === "string" &&
        (payload[field] as string).length > 0,
    ) &&
    typeof payload.passed === "boolean" &&
    isRecord(payload.summary)
  );
}

function payloadBytes(payload: RemoteEvidenceReceiptPayload): Buffer {
  return Buffer.from(stableStringify(payload), "utf8");
}

export function createRemoteEvidenceReceipt(
  payload: RemoteEvidenceReceiptPayload,
  privateKey: KeyLike,
): RemoteEvidenceReceipt {
  return {
    payload: structuredClone(payload),
    signature: sign(null, payloadBytes(payload), privateKey).toString(
      "base64url",
    ),
  };
}

export function verifyRemoteEvidenceReceipt(
  receipt: RemoteEvidenceReceipt,
  publicKey: KeyLike,
  expected: {
    repository: string;
    signerWorkflows: string[];
  },
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
    reasons.push("Evidence receipt signature is invalid");
  }
  if (payload.repository !== expected.repository) {
    reasons.push("Evidence repository is not trusted");
  }
  if (!expected.signerWorkflows.includes(payload.signerWorkflow)) {
    reasons.push("Evidence signer workflow is not trusted");
  }
  if (!/^[a-f0-9]{40}([a-f0-9]{24})?$/i.test(payload.sourceCommitSha)) {
    reasons.push("Evidence source commit digest is invalid");
  }
  if (!/^[a-f0-9]{64}$/i.test(payload.subjectSha256)) {
    reasons.push("Evidence subject digest is invalid");
  }
  if (!payload.passed) {
    reasons.push("Evidence reports a failed gate or drill");
  }
  const generatedAt = Date.parse(payload.generatedAt);
  const verifiedAt = Date.parse(payload.verifiedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (
    !Number.isFinite(generatedAt) ||
    !Number.isFinite(verifiedAt) ||
    !Number.isFinite(expiresAt)
  ) {
    reasons.push("Evidence timestamps are invalid");
  } else {
    if (generatedAt > verifiedAt) {
      reasons.push("Evidence was verified before it was generated");
    }
    if (verifiedAt > now.getTime() + 60_000) {
      reasons.push("Evidence verification time is in the future");
    }
    if (expiresAt <= now.getTime()) {
      reasons.push("Evidence receipt has expired");
    }
    if (expiresAt - verifiedAt > 7 * 24 * 60 * 60 * 1_000) {
      reasons.push("Evidence receipt lifetime exceeds seven days");
    }
  }
  return {
    valid: reasons.length === 0,
    reasons,
  };
}
