import type {
  HumanObservatoryReport,
} from "./observatory";
import {
  verifySymbiosisReplicationBundle,
  type SymbiosisReplicationBundle,
} from "./replication";

/**
 * Autonomous evidence matrix.
 *
 * The v4.9.0 constitution decision removed the external-attestation
 * requirement: no signed receipt, off-host recovery or live-provider lane is
 * required to consider the laboratory evidence complete. The matrix therefore
 * contains only the two lanes the system can verify autonomously:
 *
 * - localReplication: the committed bundle reproduces byte-exactly;
 * - elapsedProduction: the runtime envelope settles Turns on time with
 *   intact sequence integrity over 90 elapsed production days.
 *
 * The archived receipt machinery remains in the repository (dormant, tested)
 * but is no longer presented or required. Simulated Turns can never satisfy
 * the elapsed-time lane; the two remaining lanes stay independent.
 */

export const SYMBIOSIS_TRUST_MATRIX_SCHEMA_VERSION =
  "nexus.symbiosis-trust-matrix.v2" as const;
export const SYMBIOSIS_TRUST_POLICY_VERSION =
  "nexus-v4.9-autonomous-trust-policy-1.0.0" as const;

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
    required: 2;
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
    simulatedTurnsCannotSatisfyElapsedTimeLane: true;
    externalAttestationNotRequired: true;
  };
}

export interface SymbiosisTrustInput {
  generatedAt: string;
  releaseRevision: string;
  replicationBundle?: unknown;
  replicationArtifactSha256?: string;
  observatory: Pick<
    HumanObservatoryReport,
    "reliability"
  >;
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
    required: 2 as const,
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
      simulatedTurnsCannotSatisfyElapsedTimeLane: true,
      externalAttestationNotRequired: true,
    },
  };
}
