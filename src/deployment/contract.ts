import {
  createHash,
} from "node:crypto";
import type {
  ReleaseEnvironment,
} from "@/governance/types";
import {
  stableStringify,
} from "@/simulation";
import type {
  DeploymentCanaryHandle,
  DeploymentTelemetry,
} from "./types";

export const DEPLOYMENT_CONTROLLER_CONTRACT_VERSION =
  "nexus.deployment-controller.v1";

export class DeploymentContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentContractError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DeploymentContractError(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  value: Record<string, unknown>,
  field: string,
): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new DeploymentContractError(
      `Deployment response ${field} must be a non-empty string`,
    );
  }
  return candidate;
}

function finiteNumber(
  value: Record<string, unknown>,
  field: string,
): number {
  const candidate = value[field];
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    throw new DeploymentContractError(
      `Deployment response ${field} must be finite`,
    );
  }
  return candidate;
}

export function deploymentIdempotencyKey(
  operation: string,
  input: unknown,
): string {
  return createHash("sha256")
    .update(
      stableStringify({
        contractVersion: DEPLOYMENT_CONTROLLER_CONTRACT_VERSION,
        operation,
        input,
      }),
      "utf8",
    )
    .digest("hex");
}

export function parseDeploymentHandle(
  value: unknown,
  expectedEnvironment?: ReleaseEnvironment,
): DeploymentCanaryHandle {
  const payload = record(value, "Deployment handle");
  const environment = requiredString(
    payload,
    "environment",
  ) as ReleaseEnvironment;
  if (
    !["development", "staging", "production"].includes(environment)
  ) {
    throw new DeploymentContractError(
      "Deployment response environment is invalid",
    );
  }
  if (expectedEnvironment && environment !== expectedEnvironment) {
    throw new DeploymentContractError(
      `Deployment response environment ${environment} does not match ${expectedEnvironment}`,
    );
  }
  const trafficPercent = finiteNumber(payload, "trafficPercent");
  if (trafficPercent < 0 || trafficPercent > 100) {
    throw new DeploymentContractError(
      "Deployment response trafficPercent must be from 0 to 100",
    );
  }
  return {
    deploymentId: requiredString(payload, "deploymentId"),
    baselineRevision: requiredString(payload, "baselineRevision"),
    candidateRevision: requiredString(payload, "candidateRevision"),
    trafficPercent,
    environment,
  };
}

export function parseDeploymentTelemetry(
  value: unknown,
): DeploymentTelemetry {
  const payload = record(value, "Deployment telemetry");
  const observedAt = requiredString(payload, "observedAt");
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new DeploymentContractError(
      "Deployment telemetry observedAt must be an ISO timestamp",
    );
  }
  const requestCount = finiteNumber(payload, "requestCount");
  const errorRatePercent = finiteNumber(payload, "errorRatePercent");
  const p95LatencyMs = finiteNumber(payload, "p95LatencyMs");
  const availabilityPercent = finiteNumber(
    payload,
    "availabilityPercent",
  );
  if (
    !Number.isInteger(requestCount) ||
    requestCount < 0 ||
    errorRatePercent < 0 ||
    errorRatePercent > 100 ||
    p95LatencyMs < 0 ||
    availabilityPercent < 0 ||
    availabilityPercent > 100 ||
    typeof payload.healthy !== "boolean"
  ) {
    throw new DeploymentContractError(
      "Deployment telemetry contains out-of-range values",
    );
  }
  return {
    observedAt: new Date(observedAt).toISOString(),
    requestCount,
    errorRatePercent,
    p95LatencyMs,
    availabilityPercent,
    healthy: payload.healthy,
  };
}
