import {
  createHash,
} from "node:crypto";
import {
  stableStringify,
} from "@/simulation";
import {
  DEPLOYMENT_CONTROLLER_CONTRACT_VERSION,
  DeploymentContractError,
} from "./contract";
import {
  HttpDeploymentAdapter,
} from "./http-adapter";
import {
  ReferenceDeploymentController,
} from "./reference-controller";
import type {
  DeploymentArtifact,
} from "./types";

export interface DeploymentControllerConformanceReport {
  schemaVersion: 1;
  contractVersion: typeof DEPLOYMENT_CONTROLLER_CONTRACT_VERSION;
  adapterId: string;
  generatedAt: string;
  checks: {
    successPath: boolean;
    duplicateRequestIdempotent: boolean;
    serverFailureRetried: boolean;
    timeoutRetried: boolean;
    outOfOrderTelemetryRejected: boolean;
    partialPayloadRejected: boolean;
    partialRollbackRecovered: boolean;
    rollbackIdempotent: boolean;
    injectedFailureRolledBack: boolean;
  };
  failures: string[];
  passed: boolean;
  fingerprint: string;
}

const ARTIFACT: DeploymentArtifact = {
  name: "nexus-7-conformance",
  repository: "Carrick-K7/nexus-7",
  commitSha: "a".repeat(40),
  evidenceManifestSha256: "b".repeat(64),
  evidenceManifestFingerprint: "c".repeat(64),
};

function harness(): {
  controller: ReferenceDeploymentController;
  adapter: HttpDeploymentAdapter;
} {
  const controller = new ReferenceDeploymentController();
  const adapter = new HttpDeploymentAdapter({
    baseUrl: "https://reference-controller.example.test",
    token: controller.token,
    fetchImplementation: controller.fetchImplementation,
    timeoutMs: 10,
    maximumAttempts: 3,
    retryBaseDelayMs: 0,
  });
  return { controller, adapter };
}

async function start(
  adapter: HttpDeploymentAdapter,
  proposalId: string,
) {
  return adapter.startCanary({
    workspaceId: "workspace-conformance",
    proposalId,
    artifact: ARTIFACT,
    environment: "staging",
    initialTrafficPercent: 5,
  });
}

export async function runDeploymentControllerConformance(
  now: () => Date = () => new Date(),
): Promise<DeploymentControllerConformanceReport> {
  const checks: DeploymentControllerConformanceReport["checks"] = {
    successPath: false,
    duplicateRequestIdempotent: false,
    serverFailureRetried: false,
    timeoutRetried: false,
    outOfOrderTelemetryRejected: false,
    partialPayloadRejected: false,
    partialRollbackRecovered: false,
    rollbackIdempotent: false,
    injectedFailureRolledBack: false,
  };
  const failures: string[] = [];
  const verify = async (
    name: keyof typeof checks,
    run: () => Promise<boolean>,
  ) => {
    try {
      checks[name] = await run();
      if (!checks[name]) {
        failures.push(`${name} returned false`);
      }
    } catch (error) {
      failures.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  await verify("successPath", async () => {
    const { adapter } = harness();
    const canary = await start(adapter, "success");
    const shifted = await adapter.shiftTraffic(canary.deploymentId, 25);
    const telemetry = await adapter.observe(canary.deploymentId);
    const promoted = await adapter.promote(canary.deploymentId);
    return (
      canary.trafficPercent === 5 &&
      shifted.trafficPercent === 25 &&
      telemetry.healthy &&
      promoted.trafficPercent === 100
    );
  });

  await verify("duplicateRequestIdempotent", async () => {
    const { adapter, controller } = harness();
    const first = await start(adapter, "duplicate");
    const second = await start(adapter, "duplicate");
    return (
      stableStringify(first) === stableStringify(second) &&
      controller.requestCounts.get("start") === 1
    );
  });

  await verify("serverFailureRetried", async () => {
    const { adapter, controller } = harness();
    controller.enqueueFault("start", "http-503");
    const canary = await start(adapter, "server-retry");
    return (
      canary.trafficPercent === 5 &&
      controller.requestCounts.get("start") === 2
    );
  });

  await verify("timeoutRetried", async () => {
    const { adapter, controller } = harness();
    controller.enqueueFault("start", "timeout");
    const canary = await start(adapter, "timeout-retry");
    return (
      canary.trafficPercent === 5 &&
      controller.requestCounts.get("start") === 2
    );
  });

  await verify("outOfOrderTelemetryRejected", async () => {
    const { adapter, controller } = harness();
    const canary = await start(adapter, "out-of-order");
    await adapter.observe(canary.deploymentId);
    controller.enqueueFault("telemetry", "out-of-order-telemetry");
    try {
      await adapter.observe(canary.deploymentId);
      return false;
    } catch (error) {
      return (
        error instanceof DeploymentContractError &&
        error.message.includes("out of order")
      );
    }
  });

  await verify("partialPayloadRejected", async () => {
    const { adapter, controller } = harness();
    controller.enqueueFault("start", "partial-handle");
    try {
      await start(adapter, "partial-payload");
      return false;
    } catch (error) {
      return error instanceof DeploymentContractError;
    }
  });

  await verify("partialRollbackRecovered", async () => {
    const { adapter, controller } = harness();
    const canary = await start(adapter, "partial-rollback");
    controller.enqueueFault("rollback", "rollback-partial-failure");
    const rolledBack = await adapter.rollback(
      canary.deploymentId,
      "conformance",
    );
    return (
      rolledBack.trafficPercent === 0 &&
      controller.rollbackExecutions === 1 &&
      controller.requestCounts.get("rollback") === 2
    );
  });

  await verify("rollbackIdempotent", async () => {
    const { adapter, controller } = harness();
    const canary = await start(adapter, "rollback-idempotent");
    const first = await adapter.rollback(
      canary.deploymentId,
      "same-reason",
    );
    const second = await adapter.rollback(
      canary.deploymentId,
      "same-reason",
    );
    return (
      stableStringify(first) === stableStringify(second) &&
      controller.rollbackExecutions === 1 &&
      controller.requestCounts.get("rollback") === 1
    );
  });

  await verify("injectedFailureRolledBack", async () => {
    const { adapter } = harness();
    const canary = await start(adapter, "fault-rollback");
    await adapter.injectRollbackDrill(canary.deploymentId);
    const telemetry = await adapter.observe(canary.deploymentId);
    const rolledBack = await adapter.rollback(
      canary.deploymentId,
      "injected failure",
    );
    return !telemetry.healthy && rolledBack.trafficPercent === 0;
  });

  const generatedAt = now().toISOString();
  const passed = Object.values(checks).every(Boolean);
  const fingerprint = createHash("sha256")
    .update(
      stableStringify({
        schemaVersion: 1,
        contractVersion: DEPLOYMENT_CONTROLLER_CONTRACT_VERSION,
        adapterId: "http-deployment",
        checks,
        failures,
        passed,
      }),
      "utf8",
    )
    .digest("hex");
  return {
    schemaVersion: 1,
    contractVersion: DEPLOYMENT_CONTROLLER_CONTRACT_VERSION,
    adapterId: "http-deployment",
    generatedAt,
    checks,
    failures,
    passed,
    fingerprint,
  };
}
