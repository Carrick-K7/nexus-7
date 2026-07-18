import type {
  DeploymentAdapter,
  DeploymentArtifact,
  DeploymentTelemetry,
} from "@/deployment";
import type {
  ReleaseEnvironment,
} from "@/governance";

export interface DeploymentRollbackDrillReport {
  schemaVersion: 1;
  drillId: string;
  adapterId: string;
  deploymentId: string;
  startedAt: string;
  completedAt: string;
  rollbackTimeObjectiveMs: number;
  observedRollbackTimeMs: number;
  artifact: DeploymentArtifact;
  traffic: {
    initialPercent: number;
    drillPercent: number;
    finalPercent: number;
  };
  faultTelemetry: DeploymentTelemetry;
  checks: {
    progressiveTraffic: boolean;
    faultDetected: boolean;
    rollbackExecuted: boolean;
    rollbackWithinObjective: boolean;
  };
  passed: boolean;
}

export async function runDeploymentRollbackDrill(options: {
  adapter: DeploymentAdapter;
  artifact: DeploymentArtifact;
  workspaceId?: string;
  environment?: ReleaseEnvironment;
  drillId?: string;
  now?: () => Date;
  rollbackTimeObjectiveMs?: number;
}): Promise<DeploymentRollbackDrillReport> {
  if (!options.adapter.injectRollbackDrill) {
    throw new Error(
      "Configured deployment adapter does not support rollback drills",
    );
  }
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const drillId =
    options.drillId ??
    `deployment-rollback-${startedAt
      .toISOString()
      .replaceAll(":", "-")}`;
  const rollbackTimeObjectiveMs =
    options.rollbackTimeObjectiveMs ?? 60_000;
  const canary = await options.adapter.startCanary({
    workspaceId: options.workspaceId ?? "workspace-operations",
    proposalId: drillId,
    artifact: options.artifact,
    environment: options.environment ?? "staging",
    initialTrafficPercent: 5,
  });
  const shifted = await options.adapter.shiftTraffic(
    canary.deploymentId,
    25,
  );
  const rollbackStartedAt = performance.now();
  await options.adapter.injectRollbackDrill(canary.deploymentId);
  const faultTelemetry = await options.adapter.observe(
    canary.deploymentId,
  );
  const rolledBack = await options.adapter.rollback(
    canary.deploymentId,
    [
      `Scheduled rollback drill ${drillId}`,
      `healthy=${faultTelemetry.healthy}`,
      `errorRate=${faultTelemetry.errorRatePercent}`,
      `availability=${faultTelemetry.availabilityPercent}`,
    ].join("; "),
  );
  const observedRollbackTimeMs = Math.max(
    0,
    Math.round(performance.now() - rollbackStartedAt),
  );
  const checks = {
    progressiveTraffic:
      canary.trafficPercent === 5 && shifted.trafficPercent === 25,
    faultDetected:
      !faultTelemetry.healthy ||
      faultTelemetry.errorRatePercent > 1 ||
      faultTelemetry.availabilityPercent < 99.9,
    rollbackExecuted: rolledBack.trafficPercent === 0,
    rollbackWithinObjective:
      observedRollbackTimeMs <= rollbackTimeObjectiveMs,
  };

  return {
    schemaVersion: 1,
    drillId,
    adapterId: options.adapter.id,
    deploymentId: canary.deploymentId,
    startedAt: startedAt.toISOString(),
    completedAt: now().toISOString(),
    rollbackTimeObjectiveMs,
    observedRollbackTimeMs,
    artifact: structuredClone(options.artifact),
    traffic: {
      initialPercent: canary.trafficPercent,
      drillPercent: shifted.trafficPercent,
      finalPercent: rolledBack.trafficPercent,
    },
    faultTelemetry,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}
