import {
  DEPLOYMENT_CONTROLLER_CONTRACT_VERSION,
} from "./contract";
import type {
  DeploymentCanaryHandle,
} from "./types";

export type DeploymentControllerOperation =
  | "start"
  | "traffic"
  | "telemetry"
  | "promote"
  | "rollback"
  | "inject-failure";

export type ReferenceControllerFault =
  | "timeout"
  | "http-503"
  | "invalid-json"
  | "partial-handle"
  | "out-of-order-telemetry"
  | "rollback-partial-failure";

interface DeploymentRecord {
  handle: DeploymentCanaryHandle;
  telemetryIndex: number;
  faultInjected: boolean;
}

interface QueuedFault {
  operation: DeploymentControllerOperation;
  fault: ReferenceControllerFault;
}

function json(
  status: number,
  payload: unknown,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Nexus-Contract-Version":
        DEPLOYMENT_CONTROLLER_CONTRACT_VERSION,
    },
  });
}

async function requestBody(init?: RequestInit): Promise<Record<string, unknown>> {
  if (!init?.body) {
    return {};
  }
  const parsed = JSON.parse(String(init.body)) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Reference controller request body must be an object");
  }
  return parsed as Record<string, unknown>;
}

export class ReferenceDeploymentController {
  readonly token: string;
  readonly requestCounts = new Map<
    DeploymentControllerOperation,
    number
  >();
  rollbackExecutions = 0;
  private sequence = 0;
  private readonly deployments = new Map<string, DeploymentRecord>();
  private readonly idempotentResponses = new Map<string, Response>();
  private readonly faults: QueuedFault[] = [];

  constructor(token = "reference-controller-secret") {
    this.token = token;
  }

  enqueueFault(
    operation: DeploymentControllerOperation,
    fault: ReferenceControllerFault,
  ): void {
    this.faults.push({ operation, fault });
  }

  readonly fetchImplementation: typeof fetch = async (
    input,
    init,
  ): Promise<Response> => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input
          : input.url,
    );
    const operation = this.operation(url.pathname);
    this.requestCounts.set(
      operation,
      (this.requestCounts.get(operation) ?? 0) + 1,
    );
    const headers = new Headers(init?.headers);
    if (headers.get("Authorization") !== `Bearer ${this.token}`) {
      return json(401, { error: "Unauthorized" });
    }
    if (
      headers.get("X-Nexus-Contract-Version") !==
      DEPLOYMENT_CONTROLLER_CONTRACT_VERSION
    ) {
      return json(426, { error: "Unsupported deployment contract" });
    }
    const idempotencyKey = headers.get("Idempotency-Key");
    if (idempotencyKey && this.idempotentResponses.has(idempotencyKey)) {
      return this.cloneResponse(
        this.idempotentResponses.get(idempotencyKey)!,
      );
    }
    const fault = this.takeFault(operation);
    if (fault === "timeout") {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () =>
          reject(new DOMException("Request timed out", "AbortError"));
        if (signal?.aborted) {
          abort();
        } else {
          signal?.addEventListener("abort", abort, { once: true });
        }
      });
    }
    if (fault === "http-503") {
      return json(503, { error: "Injected controller outage" });
    }
    if (fault === "invalid-json") {
      return new Response("{", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const response = await this.execute(
      operation,
      url,
      init,
      fault,
    );
    if (idempotencyKey && response.ok) {
      this.idempotentResponses.set(
        idempotencyKey,
        this.cloneResponse(response),
      );
    }
    if (
      fault === "rollback-partial-failure" &&
      operation === "rollback"
    ) {
      return json(503, {
        error: "Rollback completed but acknowledgement was lost",
      });
    }
    return response;
  };

  private async execute(
    operation: DeploymentControllerOperation,
    url: URL,
    init: RequestInit | undefined,
    fault: ReferenceControllerFault | undefined,
  ): Promise<Response> {
    const body = await requestBody(init);
    if (operation === "start") {
      this.sequence += 1;
      const deploymentId = `reference-deployment-${this.sequence}`;
      const handle: DeploymentCanaryHandle = {
        deploymentId,
        baselineRevision: "stable",
        candidateRevision:
          typeof body.artifact === "object" &&
          body.artifact !== null &&
          "commitSha" in body.artifact &&
          typeof body.artifact.commitSha === "string"
            ? body.artifact.commitSha
            : "candidate",
        trafficPercent: Number(body.initialTrafficPercent),
        environment:
          body.environment === "development" ||
          body.environment === "staging" ||
          body.environment === "production"
            ? body.environment
            : "staging",
      };
      this.deployments.set(deploymentId, {
        handle,
        telemetryIndex: 0,
        faultInjected: false,
      });
      if (fault === "partial-handle") {
        const {
          candidateRevision: _candidateRevision,
          ...partial
        } = handle;
        void _candidateRevision;
        return json(200, partial);
      }
      return json(201, handle);
    }

    const deploymentId = this.deploymentId(url.pathname);
    const record = this.deployments.get(deploymentId);
    if (!record) {
      return json(404, { error: "Deployment was not found" });
    }
    if (operation === "telemetry") {
      if (fault === "out-of-order-telemetry") {
        return json(200, {
          observedAt: "2026-07-18T07:59:00.000Z",
          requestCount: 600,
          errorRatePercent: 0.1,
          p95LatencyMs: 180,
          availabilityPercent: 99.99,
          healthy: true,
        });
      }
      const observedAt = new Date(
        Date.parse("2026-07-18T08:00:00.000Z") +
          record.telemetryIndex * 60_000,
      ).toISOString();
      record.telemetryIndex += 1;
      const failed = record.faultInjected;
      record.faultInjected = false;
      return json(200, {
        observedAt,
        requestCount: failed ? 250 : 1_000,
        errorRatePercent: failed ? 12 : 0.1,
        p95LatencyMs: failed ? 2_500 : 180,
        availabilityPercent: failed ? 87 : 99.99,
        healthy: !failed,
      });
    }
    if (operation === "inject-failure") {
      record.faultInjected = true;
      return json(202, { accepted: true });
    }
    if (operation === "traffic") {
      record.handle = {
        ...record.handle,
        trafficPercent: Number(body.trafficPercent),
      };
      return json(200, record.handle);
    }
    if (operation === "promote") {
      record.handle = {
        ...record.handle,
        trafficPercent: 100,
      };
      return json(200, record.handle);
    }
    this.rollbackExecutions += 1;
    record.handle = {
      ...record.handle,
      trafficPercent: 0,
    };
    return json(200, record.handle);
  }

  private operation(pathname: string): DeploymentControllerOperation {
    if (pathname.endsWith("/telemetry")) {
      return "telemetry";
    }
    if (pathname.endsWith("/traffic")) {
      return "traffic";
    }
    if (pathname.endsWith("/promote")) {
      return "promote";
    }
    if (pathname.endsWith("/rollback")) {
      return "rollback";
    }
    if (pathname.endsWith("/drills/failure")) {
      return "inject-failure";
    }
    return "start";
  }

  private deploymentId(pathname: string): string {
    const segments = pathname.split("/").filter(Boolean);
    const canaryIndex = segments.indexOf("canaries");
    return decodeURIComponent(segments[canaryIndex + 1] ?? "");
  }

  private takeFault(
    operation: DeploymentControllerOperation,
  ): ReferenceControllerFault | undefined {
    const index = this.faults.findIndex(
      (candidate) => candidate.operation === operation,
    );
    if (index < 0) {
      return undefined;
    }
    return this.faults.splice(index, 1)[0].fault;
  }

  private cloneResponse(response: Response): Response {
    return response.clone();
  }
}
