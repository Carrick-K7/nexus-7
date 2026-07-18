import type {
  ReleaseEnvironment,
} from "@/governance/types";

export interface DeploymentArtifact {
  name: string;
  repository: string;
  commitSha: string;
  evidenceManifestSha256: string;
  evidenceManifestFingerprint: string;
}

export interface DeploymentCanaryHandle {
  deploymentId: string;
  baselineRevision: string;
  candidateRevision: string;
  trafficPercent: number;
  environment: ReleaseEnvironment;
}

export interface DeploymentTelemetry {
  observedAt: string;
  requestCount: number;
  errorRatePercent: number;
  p95LatencyMs: number;
  availabilityPercent: number;
  healthy: boolean;
}

export interface DeploymentAdapter {
  readonly id: string;
  startCanary(input: {
    workspaceId: string;
    proposalId: string;
    artifact: DeploymentArtifact;
    environment: ReleaseEnvironment;
    initialTrafficPercent: number;
  }): Promise<DeploymentCanaryHandle>;
  shiftTraffic(
    deploymentId: string,
    trafficPercent: number,
  ): Promise<DeploymentCanaryHandle>;
  observe(deploymentId: string): Promise<DeploymentTelemetry>;
  promote(deploymentId: string): Promise<DeploymentCanaryHandle>;
  rollback(
    deploymentId: string,
    reason: string,
  ): Promise<DeploymentCanaryHandle>;
  injectRollbackDrill?(deploymentId: string): Promise<void>;
}
