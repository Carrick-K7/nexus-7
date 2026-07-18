import type {
  DeploymentAdapter,
  DeploymentArtifact,
  DeploymentCanaryHandle,
  DeploymentTelemetry,
} from "./types";

interface DeploymentRecord {
  handle: DeploymentCanaryHandle;
  telemetry: DeploymentTelemetry[];
  observationIndex: number;
  faultInjected: boolean;
}

function startKey(input: {
  workspaceId: string;
  proposalId: string;
  artifact: DeploymentArtifact;
  environment: import("@/governance/types").ReleaseEnvironment;
  initialTrafficPercent: number;
}): string {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    proposalId: input.proposalId,
    artifact: input.artifact,
    environment: input.environment,
    initialTrafficPercent: input.initialTrafficPercent,
  });
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryDeploymentAdapter implements DeploymentAdapter {
  readonly id = "memory-deployment";
  private readonly deployments = new Map<string, DeploymentRecord>();
  private readonly starts = new Map<string, string>();
  private sequence = 0;

  constructor(
    private readonly defaultTelemetry: DeploymentTelemetry[] = [
      {
        observedAt: "2026-07-16T12:00:00.000Z",
        requestCount: 500,
        errorRatePercent: 0.2,
        p95LatencyMs: 180,
        availabilityPercent: 99.99,
        healthy: true,
      },
      {
        observedAt: "2026-07-16T12:01:00.000Z",
        requestCount: 750,
        errorRatePercent: 0.3,
        p95LatencyMs: 220,
        availabilityPercent: 99.98,
        healthy: true,
      },
      {
        observedAt: "2026-07-16T12:02:00.000Z",
        requestCount: 1_000,
        errorRatePercent: 0.1,
        p95LatencyMs: 190,
        availabilityPercent: 100,
        healthy: true,
      },
    ],
  ) {}

  async startCanary(input: {
    workspaceId: string;
    proposalId: string;
    artifact: DeploymentArtifact;
    environment: import("@/governance/types").ReleaseEnvironment;
    initialTrafficPercent: number;
  }): Promise<DeploymentCanaryHandle> {
    const key = startKey(input);
    const existingId = this.starts.get(key);
    if (existingId) {
      return clone(this.requireDeployment(existingId).handle);
    }
    this.sequence += 1;
    const deploymentId = `deployment-${this.sequence}-${input.proposalId}`;
    const handle = {
      deploymentId,
      baselineRevision: "stable",
      candidateRevision: input.artifact.commitSha,
      trafficPercent: input.initialTrafficPercent,
      environment: input.environment,
    };
    this.deployments.set(deploymentId, {
      handle,
      telemetry: clone(this.defaultTelemetry),
      observationIndex: 0,
      faultInjected: false,
    });
    this.starts.set(key, deploymentId);
    return clone(handle);
  }

  async shiftTraffic(
    deploymentId: string,
    trafficPercent: number,
  ): Promise<DeploymentCanaryHandle> {
    const record = this.requireDeployment(deploymentId);
    record.handle = {
      ...record.handle,
      trafficPercent,
    };
    return clone(record.handle);
  }

  async observe(deploymentId: string): Promise<DeploymentTelemetry> {
    const record = this.requireDeployment(deploymentId);
    if (record.faultInjected) {
      record.faultInjected = false;
      return {
        observedAt: new Date().toISOString(),
        requestCount: 250,
        errorRatePercent: 12,
        p95LatencyMs: 2_500,
        availabilityPercent: 87,
        healthy: false,
      };
    }
    const telemetry =
      record.telemetry[
        Math.min(
          record.observationIndex,
          record.telemetry.length - 1,
        )
      ];
    record.observationIndex += 1;
    return clone(telemetry);
  }

  async promote(
    deploymentId: string,
  ): Promise<DeploymentCanaryHandle> {
    return this.shiftTraffic(deploymentId, 100);
  }

  async rollback(
    deploymentId: string,
    reason: string,
  ): Promise<DeploymentCanaryHandle> {
    void reason;
    return this.shiftTraffic(deploymentId, 0);
  }

  async injectRollbackDrill(deploymentId: string): Promise<void> {
    this.requireDeployment(deploymentId).faultInjected = true;
  }

  private requireDeployment(deploymentId: string): DeploymentRecord {
    const record = this.deployments.get(deploymentId);
    if (!record) {
      throw new Error(`Deployment ${deploymentId} was not found`);
    }
    return record;
  }
}
