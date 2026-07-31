// @vitest-environment node

import {
  generateKeyPairSync,
} from "node:crypto";
import {
  readFileSync,
} from "node:fs";
import path from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";
import {
  createRemoteEvidenceReceipt,
  sha256FileContent,
  type RemoteEvidenceReceiptPayload,
} from "@/evidence";
import {
  DEEPSEEK_PROVIDER_ID,
} from "./cognition";
import type {
  HumanObservatoryReport,
} from "./observatory";
import type {
  SymbiosisReplicationBundle,
} from "./replication";
import {
  RECOVERY_EVIDENCE_SCHEMA_VERSION,
  withRecoveryEvidenceChecksum,
  type SymbiosisRecoveryEvidence,
  type WorldReliabilityReport,
} from "./reliability";
import {
  buildSymbiosisTrustMatrix,
} from "./trust";

const now = "2026-07-31T12:00:00.000Z";
const releaseRevision = "a".repeat(40);
const repository = "Carrick-K7/nexus-7";
const ciWorkflow = `${repository}/.github/workflows/ci.yml`;
const replicationWorkflow =
  `${repository}/.github/workflows/symbiosis-replication.yml`;
const recoveryWorkflow =
  `${repository}/.github/workflows/symbiosis-offhost-recovery.yml`;
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const bundleContent = readFileSync(
  path.join(process.cwd(), "public/data/v4-7-replication-bundle.json"),
);
const bundle = JSON.parse(
  bundleContent.toString("utf8"),
) as SymbiosisReplicationBundle;
const bundleArtifactSha256 = sha256FileContent(bundleContent);

function cognition(
  liveShadow = false,
): HumanObservatoryReport["cognition"] {
  return {
    configuredProvider: "nexus-deterministic-reference",
    configuredShadowProvider: liveShadow
      ? DEEPSEEK_PROVIDER_ID
      : "nexus-diversity-reference",
    sourceDecisionCount: liveShadow ? 2 : 0,
    deepseek: {
      externalCallAttempts: liveShadow ? 2 : 0,
      successfulDecisions: liveShadow ? 2 : 0,
      fallbackDecisions: 0,
      inputTokens: liveShadow ? 200 : 0,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: liveShadow ? 200 : 0,
      outputTokens: liveShadow ? 40 : 0,
      totalTokens: liveShadow ? 240 : 0,
      costUsd: liveShadow ? 0.0001 : 0,
      latestBilledTurn: liveShadow ? 304 : null,
      shadow: {
        externalCallAttempts: liveShadow ? 2 : 0,
        successfulDecisions: liveShadow ? 2 : 0,
        providerFailures: 0,
        budgetSkipped: 0,
        billedInvalid: 0,
        inputTokens: liveShadow ? 200 : 0,
        outputTokens: liveShadow ? 40 : 0,
        totalTokens: liveShadow ? 240 : 0,
        costUsd: liveShadow ? 0.0001 : 0,
        latestBilledTurn: liveShadow ? 304 : null,
        pricingVersions: liveShadow ? ["deepseek-2026-07"] : [],
        models: liveShadow ? ["deepseek-v4"] : [],
      },
      currentTurn: {
        externalCallAttempts: liveShadow ? 2 : 0,
        successfulDecisions: liveShadow ? 2 : 0,
        inputTokens: liveShadow ? 200 : 0,
        outputTokens: liveShadow ? 40 : 0,
        totalTokens: liveShadow ? 240 : 0,
        costUsd: liveShadow ? 0.0001 : 0,
      },
      pricingVersions: liveShadow ? ["deepseek-2026-07"] : [],
      models: liveShadow ? ["deepseek-v4"] : [],
    },
    diversity: {
      shadowEnabled: liveShadow,
      comparisons: liveShadow ? 2 : 0,
      disagreements: liveShadow ? 1 : 0,
      disagreementRate: liveShadow ? 0.5 : null,
      homogeneityRate: liveShadow ? 0.5 : null,
      providerFailures: 0,
      budgetSkipped: 0,
      billedInvalid: 0,
      externalCallAttempts: liveShadow ? 2 : 0,
      inputTokens: liveShadow ? 200 : 0,
      outputTokens: liveShadow ? 40 : 0,
      totalTokens: liveShadow ? 240 : 0,
      costUsd: liveShadow ? 0.0001 : 0,
      fallbackComparisons: 0,
      fallbackDisagreements: 0,
      fallbackDisagreementRate: null,
      primaryDispositions: {
        engage: liveShadow ? 2 : 0,
        decline: 0,
        reconsider: 0,
      },
      shadowDispositions: {
        engage: liveShadow ? 1 : 0,
        decline: liveShadow ? 1 : 0,
        reconsider: 0,
      },
    },
    disclosure: { zh: "测试", en: "test" },
  };
}

function reliability(days: number): WorldReliabilityReport {
  return {
    schemaVersion: "nexus.world-reliability.v1",
    generatedAt: now,
    status: days >= 90 ? "healthy" : "watch",
    intervalMs: 3_600_000,
    observationWindowDays: days,
    requiredObservationDays: 90,
    storedTurns: Math.floor(days * 24) + 1,
    firstTurn: 0,
    latestTurn: Math.floor(days * 24),
    missingTurns: 0,
    duplicateTurns: 0,
    predecessorMismatches: 0,
    revisionBoundTurns: Math.floor(days * 24) + 1,
    revisionCoverageRate: 1,
    deploymentRevisions: [{ revision: releaseRevision, turns: 1 }],
    comparableSettlements: Math.floor(days * 24),
    onTimeSettlements: Math.floor(days * 24),
    lateSettlements: 0,
    earlyRestartSettlements: 0,
    onTimeRate: 1,
    latestTurnAgeMs: 0,
    reportFresh: true,
    recovery: {
      evidencePresent: false,
      backupAgeMs: null,
      backupFresh: null,
      encrypted: null,
      offHost: null,
      secondDatabaseRestorePassed: null,
      restoreDrillAt: null,
    },
    disclosures: { zh: "测试", en: "test" },
  };
}

function recoveryEvidence(): SymbiosisRecoveryEvidence {
  return withRecoveryEvidenceChecksum({
    schemaVersion: RECOVERY_EVIDENCE_SCHEMA_VERSION,
    generatedAt: "2026-07-31T10:00:00.000Z",
    backup: {
      createdAt: "2026-07-31T09:00:00.000Z",
      checksum: "b".repeat(64),
      artifactSha256: "c".repeat(64),
      encrypted: true,
      offHost: true,
      sizeBytes: 1024,
    },
    restoreDrill: {
      completedAt: "2026-07-31T10:00:00.000Z",
      target: "off-host-second-database",
      checksumValid: true,
      rowCountsMatch: true,
      latestFingerprintMatch: true,
      resumedWrite: true,
    },
    locationProof: {
      sourceHostFingerprint: "d".repeat(64),
      restoreTargetHostFingerprint: "e".repeat(64),
      independentTarget: true,
    },
  });
}

function receipt(
  kind: RemoteEvidenceReceiptPayload["kind"],
  subjectSha256: string,
  summary: Record<string, unknown>,
  signerWorkflow: string,
  overrides: Partial<RemoteEvidenceReceiptPayload> = {},
) {
  return createRemoteEvidenceReceipt(
    {
      schemaVersion: 1,
      provider: "github-actions-sigstore",
      kind,
      repository,
      sourceCommitSha: releaseRevision,
      signerWorkflow,
      runId: `run-${kind}`,
      subjectPath: `${kind}.json`,
      subjectSha256,
      passed: true,
      generatedAt: "2026-07-31T10:00:00.000Z",
      verifiedAt: "2026-07-31T11:00:00.000Z",
      expiresAt: "2026-08-07T11:00:00.000Z",
      summary,
      ...overrides,
    },
    privateKey,
  );
}

describe("v4.8 independent trust matrix", () => {
  it("keeps external, off-host, live-provider, and elapsed-time lanes pending", () => {
    const matrix = buildSymbiosisTrustMatrix({
      generatedAt: now,
      releaseRevision,
      repository,
      signerWorkflows: [ciWorkflow, recoveryWorkflow],
      publicKey,
      replicationBundle: bundle,
      replicationArtifactSha256: bundleArtifactSha256,
      observatory: {
        cognition: cognition(),
        reliability: reliability(5),
      },
    });

    expect(matrix.summary).toMatchObject({
      verified: 1,
      pending: 4,
      failed: 0,
      required: 5,
      allVerified: false,
    });
    expect(matrix.lanes.localReplication.status).toBe("verified");
    expect(matrix.lanes.externalReplication.status).toBe("pending");
    expect(matrix.lanes.offHostRecovery.status).toBe("pending");
    expect(matrix.lanes.liveDeepSeekShadow).toMatchObject({
      status: "pending",
      configured: false,
      externalCallAttempts: 0,
      successfulComparisons: 0,
      providerFailures: 0,
      totalTokens: 0,
      costUsd: 0,
    });
    expect(matrix.lanes.elapsedProduction.status).toBe("pending");
  });

  it("does not count a reference shadow as live DeepSeek evidence", () => {
    const referenceCognition = cognition();
    referenceCognition.sourceDecisionCount = 260;
    referenceCognition.diversity = {
      ...referenceCognition.diversity,
      shadowEnabled: true,
      comparisons: 260,
      disagreements: 130,
      disagreementRate: 0.5,
      homogeneityRate: 0.5,
      externalCallAttempts: 0,
    };
    const matrix = buildSymbiosisTrustMatrix({
      generatedAt: now,
      releaseRevision,
      repository,
      signerWorkflows: [ciWorkflow, recoveryWorkflow],
      publicKey,
      replicationBundle: bundle,
      replicationArtifactSha256: bundleArtifactSha256,
      observatory: {
        cognition: referenceCognition,
        reliability: reliability(5),
      },
    });

    expect(matrix.lanes.liveDeepSeekShadow).toMatchObject({
      status: "pending",
      reasonCodes: ["deepseek-shadow-not-configured"],
      configured: false,
      externalCallAttempts: 0,
      successfulComparisons: 0,
      providerFailures: 0,
      totalTokens: 0,
      costUsd: 0,
      latestBilledTurn: null,
    });
  });

  it("verifies all five independent lanes against exact signed subjects", () => {
    const recovery = recoveryEvidence();
    const recoveryArtifactSha256 = "f".repeat(64);
    const replicationReceipt = receipt(
      "symbiosis-replication",
      bundleArtifactSha256,
      {
        bundleSha256: bundle.integrity.bundleSha256,
        resultsSha256: bundle.integrity.resultsSha256,
        hypothesesPassed: bundle.analysis.passed,
        hypothesesTotal: bundle.analysis.total,
        runCount: bundle.design.runCount,
      },
      replicationWorkflow,
    );
    const recoveryReceipt = receipt(
      "symbiosis-off-host-recovery",
      recoveryArtifactSha256,
      {
        evidenceChecksum: recovery.evidenceChecksum,
        backupArtifactSha256: recovery.backup.artifactSha256,
        sourceHostFingerprint:
          recovery.locationProof!.sourceHostFingerprint,
        restoreTargetHostFingerprint:
          recovery.locationProof!.restoreTargetHostFingerprint,
        independentTarget: true,
      },
      recoveryWorkflow,
    );
    const matrix = buildSymbiosisTrustMatrix({
      generatedAt: now,
      releaseRevision,
      repository,
      signerWorkflows: [replicationWorkflow, recoveryWorkflow],
      publicKey,
      replicationBundle: bundle,
      replicationArtifactSha256: bundleArtifactSha256,
      replicationReceipt,
      recoveryEvidence: recovery,
      recoveryArtifactSha256,
      recoveryReceipt,
      observatory: {
        cognition: cognition(true),
        reliability: reliability(90),
      },
    });

    expect(matrix.overall).toBe("verified");
    expect(matrix.summary).toMatchObject({
      verified: 5,
      pending: 0,
      failed: 0,
      stale: 0,
      allVerified: true,
    });
  });

  it("fails closed for a tampered receipt and a claimed same-host target", () => {
    const badReceipt = receipt(
      "symbiosis-replication",
      bundleArtifactSha256,
      {
        bundleSha256: bundle.integrity.bundleSha256,
        hypothesesPassed: bundle.analysis.passed,
        hypothesesTotal: bundle.analysis.total,
        runCount: bundle.design.runCount,
      },
      ciWorkflow,
    );
    badReceipt.payload.runId = "tampered";
    const sameHost = recoveryEvidence();
    sameHost.locationProof!.restoreTargetHostFingerprint =
      sameHost.locationProof!.sourceHostFingerprint;
    const matrix = buildSymbiosisTrustMatrix({
      generatedAt: now,
      releaseRevision,
      repository,
      signerWorkflows: [ciWorkflow, recoveryWorkflow],
      publicKey,
      replicationBundle: bundle,
      replicationArtifactSha256: bundleArtifactSha256,
      replicationReceipt: badReceipt,
      recoveryEvidence: sameHost,
      observatory: {
        cognition: cognition(),
        reliability: reliability(5),
      },
    });

    expect(matrix.lanes.externalReplication.status).toBe("failed");
    expect(matrix.lanes.offHostRecovery).toMatchObject({
      status: "failed",
      offHost: true,
    });
    expect(matrix.overall).toBe("failed");
  });

  it("shows expired proof as stale and an unverifiable receipt as pending", () => {
    const summary = {
      bundleSha256: bundle.integrity.bundleSha256,
      hypothesesPassed: bundle.analysis.passed,
      hypothesesTotal: bundle.analysis.total,
      runCount: bundle.design.runCount,
    };
    const expired = receipt(
      "symbiosis-replication",
      bundleArtifactSha256,
      summary,
      ciWorkflow,
      {
        generatedAt: "2026-07-20T10:00:00.000Z",
        verifiedAt: "2026-07-20T11:00:00.000Z",
        expiresAt: "2026-07-27T11:00:00.000Z",
      },
    );
    const base = {
      generatedAt: now,
      releaseRevision,
      repository,
      signerWorkflows: [ciWorkflow],
      replicationBundle: bundle,
      replicationArtifactSha256: bundleArtifactSha256,
      replicationReceipt: expired,
      observatory: {
        cognition: cognition(),
        reliability: reliability(5),
      },
    };

    expect(
      buildSymbiosisTrustMatrix({ ...base, publicKey }).lanes
        .externalReplication.status,
    ).toBe("stale");
    expect(
      buildSymbiosisTrustMatrix(base).lanes.externalReplication,
    ).toMatchObject({
      status: "pending",
      receiptPresent: true,
      receiptVerified: false,
      reasonCodes: ["receipt-public-key-missing"],
    });
  });
});
