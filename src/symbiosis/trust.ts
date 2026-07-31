import type {
  KeyLike,
} from "node:crypto";
import {
  isRemoteEvidenceReceipt,
  verifyRemoteEvidenceReceipt,
  type RemoteEvidenceReceipt,
} from "@/evidence";
import {
  DEEPSEEK_PROVIDER_ID,
} from "./cognition";
import type {
  HumanObservatoryReport,
} from "./observatory";
import {
  verifySymbiosisReplicationBundle,
  type SymbiosisReplicationBundle,
} from "./replication";
import {
  verifyRecoveryEvidence,
  type SymbiosisRecoveryEvidence,
} from "./reliability";

export const SYMBIOSIS_TRUST_MATRIX_SCHEMA_VERSION =
  "nexus.symbiosis-trust-matrix.v1" as const;
export const SYMBIOSIS_TRUST_POLICY_VERSION =
  "nexus-v4.8-independent-trust-policy-1.0.0" as const;

export type TrustLaneStatus =
  | "verified"
  | "pending"
  | "failed"
  | "stale";

interface TrustLaneBase {
  status: TrustLaneStatus;
  reasonCodes: string[];
  evidenceRefs: string[];
}

export interface SymbiosisTrustMatrix {
  schemaVersion: typeof SYMBIOSIS_TRUST_MATRIX_SCHEMA_VERSION;
  policyVersion: typeof SYMBIOSIS_TRUST_POLICY_VERSION;
  generatedAt: string;
  releaseRevision: string;
  overall: "verified" | "incomplete" | "failed";
  summary: {
    verified: number;
    pending: number;
    failed: number;
    stale: number;
    required: 5;
    allVerified: boolean;
  };
  lanes: {
    localReplication: TrustLaneBase & {
      hypothesesPassed: number | null;
      hypothesesTotal: number | null;
      exactRuns: number | null;
      runCount: number | null;
      bundleSha256: string | null;
      artifactSha256: string | null;
    };
    externalReplication: TrustLaneBase & {
      receiptPresent: boolean;
      receiptVerified: boolean;
      provider: string | null;
      runId: string | null;
      sourceCommitSha: string | null;
      verifiedAt: string | null;
      expiresAt: string | null;
    };
    offHostRecovery: TrustLaneBase & {
      evidencePresent: boolean;
      receiptPresent: boolean;
      receiptVerified: boolean;
      encrypted: boolean | null;
      offHost: boolean | null;
      secondDatabaseRestorePassed: boolean | null;
      sourceHostFingerprint: string | null;
      restoreTargetHostFingerprint: string | null;
      completedAt: string | null;
    };
    liveDeepSeekShadow: TrustLaneBase & {
      configured: boolean;
      externalCallAttempts: number;
      successfulComparisons: number;
      providerFailures: number;
      totalTokens: number;
      costUsd: number;
      latestBilledTurn: number | null;
      settlesWorld: false;
    };
    elapsedProduction: TrustLaneBase & {
      observedDays: number;
      requiredDays: 90;
      storedTurns: number;
      onTimeRate: number | null;
      revisionCoverageRate: number;
      observedRuntimeRevisionCoverageRate: number;
      missingTurns: number;
      duplicateTurns: number;
      predecessorMismatches: number;
      reportFresh: boolean | null;
    };
  };
  boundary: {
    lanesAreIndependent: true;
    localEvidenceCannotSatisfyExternalLanes: true;
    referenceProviderCannotSatisfyLiveProviderLane: true;
    simulatedTurnsCannotSatisfyElapsedTimeLane: true;
  };
}

export interface SymbiosisTrustInput {
  generatedAt: string;
  releaseRevision: string;
  repository: string;
  signerWorkflows: string[];
  publicKey?: KeyLike;
  replicationBundle?: unknown;
  replicationArtifactSha256?: string;
  replicationReceipt?: unknown;
  recoveryEvidence?: unknown;
  recoveryArtifactSha256?: string;
  recoveryReceipt?: unknown;
  observatory: Pick<
    HumanObservatoryReport,
    "cognition" | "reliability"
  >;
}

interface ReceiptCheck {
  status: TrustLaneStatus;
  reasonCodes: string[];
  receipt: RemoteEvidenceReceipt | null;
  verified: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReplicationBundle(
  value: unknown,
): value is SymbiosisReplicationBundle {
  return (
    isRecord(value) &&
    isRecord(value.analysis) &&
    isRecord(value.integrity) &&
    Array.isArray(value.runs) &&
    isRecord(value.inputs)
  );
}

function isRecoveryEvidence(
  value: unknown,
): value is SymbiosisRecoveryEvidence {
  return (
    isRecord(value) &&
    isRecord(value.backup) &&
    isRecord(value.restoreDrill) &&
    typeof value.evidenceChecksum === "string"
  );
}

function receiptStatus(reasons: string[]): TrustLaneStatus {
  return (
    reasons.length > 0 &&
    reasons.every((reason) => reason === "receipt-expired")
  )
    ? "stale"
    : "failed";
}

function verifyReceipt(
  value: unknown,
  input: SymbiosisTrustInput,
  expected: {
    kind: RemoteEvidenceReceipt["payload"]["kind"];
    subjectSha256?: string;
    summaryChecks: Array<{
      field: string;
      value: unknown;
    }>;
  },
): ReceiptCheck {
  if (value === undefined || value === null) {
    return {
      status: "pending",
      reasonCodes: ["receipt-missing"],
      receipt: null,
      verified: false,
    };
  }
  if (!isRemoteEvidenceReceipt(value)) {
    return {
      status: "failed",
      reasonCodes: ["receipt-envelope-invalid"],
      receipt: null,
      verified: false,
    };
  }
  if (!input.publicKey) {
    return {
      status: "pending",
      reasonCodes: ["receipt-public-key-missing"],
      receipt: value,
      verified: false,
    };
  }
  const verification = verifyRemoteEvidenceReceipt(
    value,
    input.publicKey,
    {
      repository: input.repository,
      signerWorkflows: input.signerWorkflows,
    },
    new Date(input.generatedAt),
  );
  const reasons = verification.reasons.map((reason) =>
    reason === "Evidence receipt has expired"
      ? "receipt-expired"
      : `receipt-invalid:${reason}`,
  );
  if (value.payload.kind !== expected.kind) {
    reasons.push("receipt-kind-mismatch");
  }
  if (value.payload.sourceCommitSha !== input.releaseRevision) {
    reasons.push("receipt-release-revision-mismatch");
  }
  if (!expected.subjectSha256) {
    reasons.push("expected-subject-digest-missing");
  } else if (
    value.payload.subjectSha256 !== expected.subjectSha256
  ) {
    reasons.push("receipt-subject-digest-mismatch");
  }
  for (const check of expected.summaryChecks) {
    if (value.payload.summary[check.field] !== check.value) {
      reasons.push(`receipt-summary-mismatch:${check.field}`);
    }
  }
  return {
    status: reasons.length === 0 ? "verified" : receiptStatus(reasons),
    reasonCodes: reasons,
    receipt: value,
    verified: reasons.length === 0,
  };
}

function recoveryPassed(evidence: SymbiosisRecoveryEvidence): boolean {
  return (
    evidence.restoreDrill.checksumValid &&
    evidence.restoreDrill.rowCountsMatch &&
    evidence.restoreDrill.latestFingerprintMatch &&
    evidence.restoreDrill.resumedWrite
  );
}

export function buildSymbiosisTrustMatrix(
  input: SymbiosisTrustInput,
): SymbiosisTrustMatrix {
  let bundle: SymbiosisReplicationBundle | null = null;
  let localStatus: TrustLaneStatus = "failed";
  let localReasons = ["replication-bundle-missing"];
  if (isReplicationBundle(input.replicationBundle)) {
    bundle = input.replicationBundle;
    try {
      const verification = verifySymbiosisReplicationBundle(bundle);
      localStatus = verification.passed ? "verified" : "failed";
      localReasons = verification.errors;
    } catch {
      localReasons = ["replication-bundle-invalid"];
    }
  }

  const external = verifyReceipt(
    input.replicationReceipt,
    input,
    {
      kind: "symbiosis-replication",
      subjectSha256: input.replicationArtifactSha256,
      summaryChecks: bundle
        ? [
            {
              field: "bundleSha256",
              value: bundle.integrity.bundleSha256,
            },
            {
              field: "hypothesesPassed",
              value: bundle.analysis.passed,
            },
            {
              field: "hypothesesTotal",
              value: bundle.analysis.total,
            },
            {
              field: "runCount",
              value: bundle.design.runCount,
            },
          ]
        : [],
    },
  );
  if (localStatus !== "verified" && external.status === "verified") {
    external.status = "failed";
    external.verified = false;
    external.reasonCodes.push("local-replication-not-verified");
  }

  const recovery = isRecoveryEvidence(input.recoveryEvidence)
    ? input.recoveryEvidence
    : undefined;
  const malformedRecovery =
    input.recoveryEvidence !== undefined && !recovery;
  const validRecovery = recovery
    ? verifyRecoveryEvidence(recovery)
    : false;
  const offHostReady = Boolean(
    recovery &&
    validRecovery &&
    recovery.backup.encrypted &&
    recovery.backup.offHost &&
    recovery.restoreDrill.target === "off-host-second-database" &&
    recoveryPassed(recovery) &&
    recovery.locationProof?.independentTarget,
  );
  const recoveryReceipt = verifyReceipt(
    input.recoveryReceipt,
    input,
    {
      kind: "symbiosis-off-host-recovery",
      subjectSha256: input.recoveryArtifactSha256,
      summaryChecks: recovery
        ? [
            {
              field: "evidenceChecksum",
              value: recovery.evidenceChecksum,
            },
            {
              field: "backupArtifactSha256",
              value: recovery.backup.artifactSha256,
            },
            {
              field: "sourceHostFingerprint",
              value:
                recovery.locationProof?.sourceHostFingerprint,
            },
            {
              field: "restoreTargetHostFingerprint",
              value:
                recovery.locationProof?.restoreTargetHostFingerprint,
            },
          ]
        : [],
    },
  );
  let recoveryStatus = recoveryReceipt.status;
  const recoveryReasons = [...recoveryReceipt.reasonCodes];
  if (!recovery) {
    recoveryStatus =
      malformedRecovery || recoveryReceipt.status === "failed"
        ? "failed"
        : recoveryReceipt.status === "stale"
          ? "stale"
          : "pending";
    recoveryReasons.push(
      malformedRecovery
        ? "recovery-evidence-invalid"
        : "recovery-evidence-missing",
    );
  } else if (!validRecovery) {
    recoveryStatus = "failed";
    recoveryReasons.push("recovery-evidence-invalid");
  } else if (
    recoveryReceipt.status === "failed" ||
    recoveryReceipt.status === "stale"
  ) {
    recoveryStatus = recoveryReceipt.status;
  } else if (!offHostReady) {
    recoveryStatus = "pending";
    recoveryReasons.push("off-host-recovery-not-demonstrated");
  } else if (recoveryReceipt.status === "verified") {
    recoveryStatus = "verified";
  }

  const deepSeek = input.observatory.cognition.deepseek;
  const deepSeekConfigured =
    input.observatory.cognition.configuredShadowProvider ===
    DEEPSEEK_PROVIDER_ID;
  let deepSeekStatus: TrustLaneStatus = "pending";
  const deepSeekReasons: string[] = [];
  if (!deepSeekConfigured) {
    deepSeekReasons.push("deepseek-shadow-not-configured");
  } else if (deepSeek.shadow.externalCallAttempts === 0) {
    deepSeekReasons.push("deepseek-shadow-not-exercised");
  } else if (
    deepSeek.shadow.successfulDecisions === 0 ||
    deepSeek.shadow.totalTokens === 0
  ) {
    deepSeekStatus = "failed";
    deepSeekReasons.push("deepseek-shadow-no-successful-comparison");
  } else {
    deepSeekStatus = "verified";
  }

  const reliability = input.observatory.reliability;
  const runtimeTurnCount =
    reliability.comparableSettlements > 0
      ? reliability.comparableSettlements + 1
      : reliability.revisionBoundTurns > 0
        ? 1
        : 0;
  const observedRuntimeRevisionCoverageRate =
    runtimeTurnCount === 0
      ? 0
      : Math.min(
          1,
          reliability.revisionBoundTurns / runtimeTurnCount,
        );
  const reliabilityIntegrity =
    reliability.missingTurns === 0 &&
    reliability.duplicateTurns === 0 &&
    reliability.predecessorMismatches === 0 &&
    observedRuntimeRevisionCoverageRate === 1 &&
    reliability.reportFresh === true &&
    reliability.onTimeRate !== null &&
    reliability.onTimeRate >= 0.99;
  let elapsedStatus: TrustLaneStatus = "pending";
  const elapsedReasons: string[] = [];
  if (runtimeTurnCount === 0) {
    elapsedReasons.push("production-runtime-evidence-missing");
  } else if (!reliabilityIntegrity) {
    elapsedStatus = "failed";
    elapsedReasons.push("production-reliability-gate-failed");
  } else if (
    reliability.observationWindowDays <
    reliability.requiredObservationDays
  ) {
    elapsedReasons.push("ninety-days-not-yet-observed");
  } else {
    elapsedStatus = "verified";
  }

  const lanes: SymbiosisTrustMatrix["lanes"] = {
    localReplication: {
      status: localStatus,
      reasonCodes: localReasons,
      evidenceRefs: [
        ...(bundle ? [bundle.integrity.bundleSha256] : []),
        ...(input.replicationArtifactSha256
          ? [input.replicationArtifactSha256]
          : []),
      ],
      hypothesesPassed: bundle?.analysis.passed ?? null,
      hypothesesTotal: bundle?.analysis.total ?? null,
      exactRuns:
        bundle?.runs.filter((run) => run.exactReplay).length ?? null,
      runCount: bundle?.design.runCount ?? null,
      bundleSha256: bundle?.integrity.bundleSha256 ?? null,
      artifactSha256: input.replicationArtifactSha256 ?? null,
    },
    externalReplication: {
      status: external.status,
      reasonCodes: external.reasonCodes,
      evidenceRefs: external.receipt
        ? [external.receipt.payload.subjectSha256]
        : [],
      receiptPresent: external.receipt !== null,
      receiptVerified: external.verified,
      provider: external.receipt?.payload.provider ?? null,
      runId: external.receipt?.payload.runId ?? null,
      sourceCommitSha:
        external.receipt?.payload.sourceCommitSha ?? null,
      verifiedAt: external.receipt?.payload.verifiedAt ?? null,
      expiresAt: external.receipt?.payload.expiresAt ?? null,
    },
    offHostRecovery: {
      status: recoveryStatus,
      reasonCodes: [...new Set(recoveryReasons)],
      evidenceRefs: [
        ...(recovery ? [recovery.evidenceChecksum] : []),
        ...(input.recoveryArtifactSha256
          ? [input.recoveryArtifactSha256]
          : []),
      ],
      evidencePresent: Boolean(recovery),
      receiptPresent: recoveryReceipt.receipt !== null,
      receiptVerified: recoveryReceipt.verified,
      encrypted: recovery?.backup.encrypted ?? null,
      offHost: recovery?.backup.offHost ?? null,
      secondDatabaseRestorePassed: recovery
        ? recoveryPassed(recovery)
        : null,
      sourceHostFingerprint:
        recovery?.locationProof?.sourceHostFingerprint ?? null,
      restoreTargetHostFingerprint:
        recovery?.locationProof?.restoreTargetHostFingerprint ?? null,
      completedAt: recovery?.restoreDrill.completedAt ?? null,
    },
    liveDeepSeekShadow: {
      status: deepSeekStatus,
      reasonCodes: deepSeekReasons,
      evidenceRefs: [
        ...(deepSeek.shadow.latestBilledTurn === null
          ? []
          : [`turn:${deepSeek.shadow.latestBilledTurn}`]),
        ...deepSeek.shadow.models.map((model) => `model:${model}`),
        ...deepSeek.shadow.pricingVersions.map(
          (version) => `pricing:${version}`,
        ),
      ],
      configured: deepSeekConfigured,
      externalCallAttempts: deepSeek.shadow.externalCallAttempts,
      successfulComparisons: deepSeek.shadow.successfulDecisions,
      providerFailures: deepSeek.shadow.providerFailures,
      totalTokens: deepSeek.shadow.totalTokens,
      costUsd: deepSeek.shadow.costUsd,
      latestBilledTurn: deepSeek.shadow.latestBilledTurn,
      settlesWorld: false,
    },
    elapsedProduction: {
      status: elapsedStatus,
      reasonCodes: elapsedReasons,
      evidenceRefs: reliability.deploymentRevisions.map(
        ({ revision }) => revision,
      ),
      observedDays: reliability.observationWindowDays,
      requiredDays: 90,
      storedTurns: reliability.storedTurns,
      onTimeRate: reliability.onTimeRate,
      revisionCoverageRate: reliability.revisionCoverageRate,
      observedRuntimeRevisionCoverageRate,
      missingTurns: reliability.missingTurns,
      duplicateTurns: reliability.duplicateTurns,
      predecessorMismatches: reliability.predecessorMismatches,
      reportFresh: reliability.reportFresh,
    },
  };
  const laneValues = Object.values(lanes);
  const summary = {
    verified: laneValues.filter((lane) => lane.status === "verified")
      .length,
    pending: laneValues.filter((lane) => lane.status === "pending")
      .length,
    failed: laneValues.filter((lane) => lane.status === "failed")
      .length,
    stale: laneValues.filter((lane) => lane.status === "stale").length,
    required: 5 as const,
    allVerified: laneValues.every(
      (lane) => lane.status === "verified",
    ),
  };
  return {
    schemaVersion: SYMBIOSIS_TRUST_MATRIX_SCHEMA_VERSION,
    policyVersion: SYMBIOSIS_TRUST_POLICY_VERSION,
    generatedAt: input.generatedAt,
    releaseRevision: input.releaseRevision,
    overall: summary.allVerified
      ? "verified"
      : summary.failed > 0 || summary.stale > 0
        ? "failed"
        : "incomplete",
    summary,
    lanes,
    boundary: {
      lanesAreIndependent: true,
      localEvidenceCannotSatisfyExternalLanes: true,
      referenceProviderCannotSatisfyLiveProviderLane: true,
      simulatedTurnsCannotSatisfyElapsedTimeLane: true,
    },
  };
}
