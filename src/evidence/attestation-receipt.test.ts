// @vitest-environment node

import {
  generateKeyPairSync,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createExternalAttestationReceipt,
  verifyExternalAttestationReceipt,
  type ExternalAttestationReceiptPayload,
} from "./attestation-receipt";
import {
  EXTERNAL_PROMOTION_GATES,
} from "./release-gates";

function payload(): ExternalAttestationReceiptPayload {
  return {
    schemaVersion: 1,
    provider: "github-actions-sigstore",
    repository: "Carrick-K7/nexus-7",
    sourceCommitSha: "a".repeat(40),
    subjectPath: "public/data/ci-evidence.json",
    subjectSha256: "b".repeat(64),
    manifestFingerprint: "c".repeat(64),
    workflow: "CI",
    signerWorkflow: "Carrick-K7/nexus-7/.github/workflows/ci.yml",
    runId: "12345",
    gates: [...EXTERNAL_PROMOTION_GATES],
    verifiedAt: "2026-07-16T12:00:00.000Z",
    expiresAt: "2026-07-17T12:00:00.000Z",
  };
}

describe("external attestation receipts", () => {
  it("accepts an independently signed, exact artifact receipt", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const receipt = createExternalAttestationReceipt(payload(), privateKey);
    const result = verifyExternalAttestationReceipt(
      receipt,
      publicKey,
      {
        repository: payload().repository,
        sourceCommitSha: payload().sourceCommitSha,
        subjectSha256: payload().subjectSha256,
        manifestFingerprint: payload().manifestFingerprint,
        requiredGates: payload().gates,
      },
      new Date("2026-07-16T13:00:00.000Z"),
    );

    expect(result).toEqual({ valid: true, reasons: [] });
  });

  it("rejects tampering, mismatched commits, missing gates, and expiry", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const receipt = createExternalAttestationReceipt(payload(), privateKey);
    receipt.payload.runId = "tampered";
    const result = verifyExternalAttestationReceipt(
      receipt,
      publicKey,
      {
        repository: payload().repository,
        sourceCommitSha: "different",
        subjectSha256: payload().subjectSha256,
        manifestFingerprint: payload().manifestFingerprint,
        requiredGates: [...payload().gates, "deployment-policy"],
      },
      new Date("2026-07-18T12:00:00.000Z"),
    );

    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "Receipt signature is invalid",
        "Receipt commit does not match the release artifact",
        "Receipt is missing gates: deployment-policy",
        "Receipt has expired",
      ]),
    );
  });
});
