// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCiEvidenceManifest,
  fingerprintCiEvidence,
  requiresExternalAttestationVerification,
} from "./ci-evidence";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("CI evidence manifest", () => {
  it("binds quality gates, source identity, and artifact bytes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-evidence-"));
    temporaryDirectories.push(root);
    fs.writeFileSync(path.join(root, "report.json"), '{"passed":true}\n');
    const manifest = createCiEvidenceManifest({
      root,
      generatedAt: new Date("2026-07-16T12:00:00.000Z"),
      source: {
        repository: "Carrick-K7/nexus-7",
        commitSha: "abc123",
        ref: "refs/heads/main",
        workflow: "CI",
        runId: "42",
        runAttempt: "1",
        actor: "github-actions",
        dirty: false,
      },
      artifactPaths: ["report.json"],
      externalCi: true,
      includeExternalPromotionGates: true,
    });
    const { fingerprint, ...unsigned } = manifest;

    expect(manifest.gates.every((gate) => gate.status === "passed")).toBe(true);
    expect(manifest.gates.map((gate) => gate.name)).toEqual(
      expect.arrayContaining([
        "model-regression",
        "postgres-integration",
        "model-regression-live",
      ]),
    );
    expect(manifest.provenance.provider).toBe("github-actions-sigstore");
    expect(manifest.provenance.attestationState).toBe(
      "requires-external-verification",
    );
    expect(manifest.artifacts[0].bytes).toBe(16);
    expect(requiresExternalAttestationVerification(manifest)).toBe(true);
    expect(fingerprint).toBe(fingerprintCiEvidence(unsigned));

    const legacy = structuredClone(manifest);
    delete legacy.provenance.attestationState;
    expect(requiresExternalAttestationVerification(legacy)).toBe(true);
  });

  it("does not imply that a local manifest can be attested", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-evidence-"));
    temporaryDirectories.push(root);
    fs.writeFileSync(path.join(root, "report.json"), '{"passed":true}\n');
    const manifest = createCiEvidenceManifest({
      root,
      generatedAt: new Date("2026-07-16T12:00:00.000Z"),
      source: {
        repository: "local/nexus-7",
        commitSha: "abc123",
        ref: "local",
        workflow: "local",
        runId: "local",
        runAttempt: "1",
        actor: "developer",
        dirty: false,
      },
      artifactPaths: ["report.json"],
    });

    expect(manifest.provenance).toMatchObject({
      trustLevel: "local",
      provider: "local",
      attestationState: "not-applicable",
    });
    expect(requiresExternalAttestationVerification(manifest)).toBe(false);
  });
});
