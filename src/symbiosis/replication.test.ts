// @vitest-environment node

import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import {
  createSymbiosisReplicationBundle,
  type ReplicationInputArtifact,
  type SymbiosisReplicationBundle,
  verifySymbiosisReplicationBundle,
} from "./replication";

const artifacts: ReplicationInputArtifact[] = [
  { path: "frozen-input.json", sha256: "a".repeat(64), bytes: 10 },
];

describe("v4.7 scientific replication bundle", () => {
  let bundle: SymbiosisReplicationBundle;

  beforeAll(async () => {
    bundle = await createSymbiosisReplicationBundle(artifacts);
  }, 120_000);

  it("replays held-out regimes and keeps external proof pending", async () => {
    expect(bundle.design.runCount).toBe(12);
    expect(bundle.design.secretInputsRequired).toBe(false);
    expect(bundle.analysis).toMatchObject({ passed: 7, total: 7 });
    expect(bundle.runs.every((run) => run.exactReplay)).toBe(true);
    expect(
      bundle.runs.every((run) => run.resourceConservationPassed),
    ).toBe(true);
    expect(bundle.providerControl).toMatchObject({
      shadowWorldFingerprintUnchanged: true,
      substitutedWorldFingerprintDiffers: true,
      substitutedResourceConservationPassed: true,
      substitutedSevereEscapes: 0,
      externalCalls: 0,
      reasoningStored: false,
    });
    expect(bundle.integrity).toMatchObject({
      localVerificationPassed: true,
      externalCiVerified: false,
      sigstoreReceipt: null,
    });
    expect(verifySymbiosisReplicationBundle(bundle)).toEqual({
      passed: true,
      errors: [],
    });
  });

  it("rejects tampered results and bundle hashes", () => {
    const tampered = structuredClone(bundle);
    tampered.runs[0].finalFingerprint = "tampered";

    const verification = verifySymbiosisReplicationBundle(tampered);
    expect(verification.passed).toBe(false);
    expect(verification.errors).toEqual(
      expect.arrayContaining([
        "results-hash-mismatch",
        "bundle-hash-mismatch",
      ]),
    );
  });
});
