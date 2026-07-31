// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  bindReleaseArtifact,
  refreshClosedLoopCaseFingerprint,
  sha256,
  verifyClosedLoopCaseIntegrity,
} from "./engine";
import {
  buildCertifiedClosedLoopCase,
  CLOSED_LOOP_CERTIFICATION_CORPUS,
} from "./corpus";

const release = bindReleaseArtifact({
  packageVersion: "2.0.0",
  repository: "Carrick-K7/nexus-7",
  commitSha: "a".repeat(40),
  dirty: false,
  artifactDigest: "b".repeat(64),
  evidenceManifestFingerprint: "c".repeat(64),
  trust: "local-committed",
  boundAt: "2026-07-18T18:00:00.000Z",
});

describe("closed-loop integrity engine", () => {
  it("freezes 25 scenarios with an honest 16/20 beneficial denominator", () => {
    const cases = CLOSED_LOOP_CERTIFICATION_CORPUS.map(
      (scenario) =>
        buildCertifiedClosedLoopCase(scenario, release),
    );
    const eligible = cases.filter(
      (item) => item.eligibleProblem,
    );
    expect(cases).toHaveLength(25);
    expect(eligible).toHaveLength(20);
    expect(
      eligible.filter(
        (item) => item.disposition === "beneficial",
      ),
    ).toHaveLength(16);
    expect(
      cases.map((item) =>
        verifyClosedLoopCaseIntegrity(item, {
          now: new Date("2026-07-18T19:00:00.000Z"),
          requireClosed: true,
        }),
      ).every((result) => result.passed),
    ).toBe(true);
  });

  it("rebuilds the same terminal fingerprints from the fixed corpus", () => {
    const first = CLOSED_LOOP_CERTIFICATION_CORPUS.map(
      (scenario) =>
        buildCertifiedClosedLoopCase(scenario, release),
    );
    const second = CLOSED_LOOP_CERTIFICATION_CORPUS.map(
      (scenario) =>
        buildCertifiedClosedLoopCase(
          structuredClone(scenario),
          structuredClone(release),
        ),
    );
    expect(second.map((item) => item.fingerprint)).toEqual(
      first.map((item) => item.fingerprint),
    );
  });

  it("fails closed when a stage, evidence envelope, or artifact binding is forged", () => {
    const source = buildCertifiedClosedLoopCase(
      CLOSED_LOOP_CERTIFICATION_CORPUS[6],
      release,
    );
    const missingStage = refreshClosedLoopCaseFingerprint({
      ...source,
      stages: source.stages.filter(
        (stage) => stage.code !== "diagnosis",
      ),
      fingerprint: "",
    });
    expect(
      verifyClosedLoopCaseIntegrity(missingStage, {
        requireClosed: true,
      }).failures,
    ).toContain("closed-loop-stage-set-or-order-invalid");

    const forgedEvidence = structuredClone(source);
    forgedEvidence.evidence[0].payloadDigest = sha256(
      "forged-payload",
    );
    forgedEvidence.fingerprint = refreshClosedLoopCaseFingerprint(
      forgedEvidence,
    ).fingerprint;
    expect(
      verifyClosedLoopCaseIntegrity(forgedEvidence).failures.some(
        (failure) =>
          failure.startsWith("evidence-integrity:"),
      ),
    ).toBe(true);

    const wrongArtifact = structuredClone(source);
    wrongArtifact.evidence[0].releaseArtifactFingerprint =
      "d".repeat(64);
    wrongArtifact.evidence[0].integrity.digest = sha256({
      ...wrongArtifact.evidence[0],
      integrity: undefined,
    });
    wrongArtifact.fingerprint = refreshClosedLoopCaseFingerprint(
      wrongArtifact,
    ).fingerprint;
    expect(
      verifyClosedLoopCaseIntegrity(wrongArtifact).failures.some(
        (failure) =>
          failure.startsWith(
            "evidence-artifact-binding:",
          ),
      ),
    ).toBe(true);
  });

  it("never accepts expired evidence as a prerequisite", () => {
    const source = buildCertifiedClosedLoopCase(
      CLOSED_LOOP_CERTIFICATION_CORPUS[1],
      release,
    );
    const result = verifyClosedLoopCaseIntegrity(source, {
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(
      result.failures.some((failure) =>
        failure.startsWith("evidence-expired:"),
      ),
    ).toBe(true);
  });
});
