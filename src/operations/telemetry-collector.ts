import type {
  ExperimentActor,
  ExperimentWorkerLease,
} from "@/experiments/types";
import type {
  EvidenceRegistryOverview,
  ReleasePolicyRecord,
} from "@/governance/types";
import type {
  OperationalIntelligenceService,
  RecordSloSampleInput,
} from "./intelligence-service";

export interface ModelOperationalEvidence {
  generatedAt: string;
  providerId: string;
  model: string;
  promptVersion: string;
  summary: {
    fallbackCases: number;
    errorCases: number;
    p95LatencyMs: number;
    totalCostUsd: number;
  };
  gate: {
    passed: boolean;
  };
}

export interface RecoveryOperationalEvidence {
  drillId: string;
  completedAt: string;
  observedRecoveryPointMs: number;
  observedRecoveryTimeMs: number;
  recoveryPointObjectiveMs: number;
  recoveryTimeObjectiveMs: number;
  passed: boolean;
}

export interface DeploymentOperationalEvidence {
  drillId: string;
  adapterId: string;
  completedAt: string;
  observedRollbackTimeMs: number;
  rollbackTimeObjectiveMs: number;
  passed: boolean;
}

export interface OperationalTelemetrySnapshot {
  model?: ModelOperationalEvidence | null;
  recovery?: RecoveryOperationalEvidence | null;
  deployment?: DeploymentOperationalEvidence | null;
  evidence?: EvidenceRegistryOverview | null;
  releasePolicies?: ReleasePolicyRecord[] | null;
  workerLease?: ExperimentWorkerLease | null;
}

export interface OperationalCollectionResult {
  samples: number;
  occurrences: number;
  incidents: number;
  accessGovernance?: {
    expiredDelegations: number;
    expiredBreakGlass: number;
    autoRevokedItems: number;
  };
}

function status(
  healthy: boolean,
  warning = false,
): RecordSloSampleInput["status"] {
  return healthy ? (warning ? "warning" : "healthy") : "breaching";
}

function hoursBetween(left: string, right: string): number {
  return (Date.parse(right) - Date.parse(left)) / (60 * 60 * 1_000);
}

export class OperationalTelemetryCollector {
  constructor(
    private readonly service: OperationalIntelligenceService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async collect(
    snapshot: OperationalTelemetrySnapshot,
    actor: ExperimentActor,
  ): Promise<OperationalCollectionResult> {
    const inputs: RecordSloSampleInput[] = [];
    if (snapshot.model) {
      const dimensions = {
        provider: snapshot.model.providerId,
        model: snapshot.model.model,
        promptVersion: snapshot.model.promptVersion,
      };
      inputs.push(
        {
          source: "model",
          metric: "fallback-count",
          value: snapshot.model.summary.fallbackCases,
          unit: "count",
          status: status(snapshot.model.summary.fallbackCases === 0),
          dimensions,
          observedAt: snapshot.model.generatedAt,
        },
        {
          source: "model",
          metric: "error-count",
          value: snapshot.model.summary.errorCases,
          unit: "count",
          status: status(snapshot.model.summary.errorCases === 0),
          dimensions,
          observedAt: snapshot.model.generatedAt,
        },
        {
          source: "model",
          metric: "p95-latency-ms",
          value: snapshot.model.summary.p95LatencyMs,
          unit: "milliseconds",
          status: status(snapshot.model.gate.passed),
          dimensions,
          observedAt: snapshot.model.generatedAt,
        },
        {
          source: "model",
          metric: "total-cost-usd",
          value: snapshot.model.summary.totalCostUsd,
          unit: "usd",
          status: status(snapshot.model.gate.passed),
          dimensions,
          observedAt: snapshot.model.generatedAt,
        },
      );
    }
    if (snapshot.recovery) {
      const dimensions = {
        drillId: snapshot.recovery.drillId,
        database: "recovery-target",
      };
      inputs.push(
        {
          source: "recovery",
          metric: "recovery-point-ms",
          value: snapshot.recovery.observedRecoveryPointMs,
          unit: "milliseconds",
          status: status(
            snapshot.recovery.observedRecoveryPointMs <=
              snapshot.recovery.recoveryPointObjectiveMs &&
              snapshot.recovery.passed,
          ),
          dimensions,
          observedAt: snapshot.recovery.completedAt,
        },
        {
          source: "recovery",
          metric: "recovery-time-ms",
          value: snapshot.recovery.observedRecoveryTimeMs,
          unit: "milliseconds",
          status: status(
            snapshot.recovery.observedRecoveryTimeMs <=
              snapshot.recovery.recoveryTimeObjectiveMs &&
              snapshot.recovery.passed,
          ),
          dimensions,
          observedAt: snapshot.recovery.completedAt,
        },
      );
    }
    if (snapshot.deployment) {
      inputs.push({
        source: "deployment",
        metric: "rollback-time-ms",
        value: snapshot.deployment.observedRollbackTimeMs,
        unit: "milliseconds",
        status: status(
          snapshot.deployment.observedRollbackTimeMs <=
            snapshot.deployment.rollbackTimeObjectiveMs &&
            snapshot.deployment.passed,
        ),
        dimensions: {
          drillId: snapshot.deployment.drillId,
          adapter: snapshot.deployment.adapterId,
        },
        observedAt: snapshot.deployment.completedAt,
      });
    }
    if (snapshot.evidence) {
      for (const freshness of snapshot.evidence.freshness) {
        const utilization =
          freshness.ageHours === undefined
            ? 101
            : (freshness.ageHours / freshness.maximumAgeHours) * 100;
        inputs.push({
          source: "evidence",
          metric: "freshness-utilization-percent",
          value: utilization,
          unit: "percent",
          status:
            freshness.status === "current"
              ? "healthy"
              : freshness.status === "expiring"
                ? "warning"
                : freshness.status === "missing"
                  ? "missing"
                  : "breaching",
          dimensions: { kind: freshness.kind },
          evidenceId: freshness.recordId,
          observedAt: this.now().toISOString(),
        });
      }
    }
    const activePolicy = snapshot.releasePolicies?.find(
      (policy) => policy.status === "active",
    );
    if (snapshot.releasePolicies) {
      const remainingHours = activePolicy
        ? hoursBetween(
            this.now().toISOString(),
            activePolicy.bundle.payload.expiresAt,
          )
        : 0;
      inputs.push({
        source: "policy",
        metric: "expiry-remaining-hours",
        value: remainingHours,
        unit: "hours",
        status: activePolicy
          ? remainingHours <= 0
            ? "breaching"
            : remainingHours <= 168
              ? "warning"
              : "healthy"
          : "missing",
        dimensions: {
          policyId:
            activePolicy?.bundle.payload.policyId ?? "missing",
          version:
            activePolicy?.bundle.payload.version ?? "missing",
        },
        evidenceId: activePolicy?.id,
        observedAt: this.now().toISOString(),
      });
    }
    if (snapshot.workerLease) {
      const leaseAgeMs = Math.max(
        0,
        this.now().getTime() -
          Date.parse(snapshot.workerLease.heartbeatAt),
      );
      inputs.push({
        source: "worker",
        metric: "lease-age-ms",
        value: leaseAgeMs,
        unit: "milliseconds",
        status: status(leaseAgeMs <= 5_000, leaseAgeMs > 3_750),
        dimensions: {
          worker: snapshot.workerLease.ownerId,
          lease: snapshot.workerLease.name,
        },
        observedAt: this.now().toISOString(),
      });
    }

    let occurrences = 0;
    let incidents = 0;
    for (const input of inputs) {
      const result = await this.service.recordSample(input, actor);
      occurrences += result.occurrences.length;
      incidents += result.incidents.length;
    }
    return {
      samples: inputs.length,
      occurrences,
      incidents,
    };
  }
}
