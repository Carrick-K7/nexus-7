import type {
  ReleaseEnvironment,
} from "@/governance/types";
import {
  DEPLOYMENT_CONTROLLER_CONTRACT_VERSION,
  DeploymentContractError,
  deploymentIdempotencyKey,
  parseDeploymentHandle,
  parseDeploymentTelemetry,
} from "./contract";
import type {
  DeploymentAdapter,
  DeploymentArtifact,
  DeploymentCanaryHandle,
  DeploymentTelemetry,
} from "./types";

export interface HttpDeploymentAdapterOptions {
  baseUrl: string;
  token: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  maximumAttempts?: number;
  retryBaseDelayMs?: number;
  requestId?: () => string;
}

type Validator<T> = (value: unknown) => T;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export class HttpDeploymentAdapter implements DeploymentAdapter {
  readonly id = "http-deployment";
  readonly contractVersion = DEPLOYMENT_CONTROLLER_CONTRACT_VERSION;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maximumAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly requestId: () => string;
  private readonly responseCache = new Map<string, unknown>();
  private readonly latestTelemetryAt = new Map<string, number>();

  constructor(options: HttpDeploymentAdapterOptions) {
    if (!options.baseUrl || !options.token) {
      throw new Error("Deployment base URL and token are required");
    }
    const endpoint = new URL(options.baseUrl);
    if (
      process.env.NODE_ENV === "production" &&
      endpoint.protocol !== "https:"
    ) {
      throw new Error(
        "Production deployment controllers require an HTTPS base URL",
      );
    }
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = Math.max(1, options.timeoutMs ?? 5_000);
    this.maximumAttempts = Math.max(
      1,
      Math.min(options.maximumAttempts ?? 3, 5),
    );
    this.retryBaseDelayMs = Math.max(
      0,
      options.retryBaseDelayMs ?? 100,
    );
    this.requestId =
      options.requestId ?? (() => crypto.randomUUID());
  }

  async startCanary(input: {
    workspaceId: string;
    proposalId: string;
    artifact: DeploymentArtifact;
    environment: ReleaseEnvironment;
    initialTrafficPercent: number;
  }): Promise<DeploymentCanaryHandle> {
    return this.request(
      "/canaries",
      {
        method: "POST",
        body: input,
        idempotencyKey: deploymentIdempotencyKey(
          "start-canary",
          input,
        ),
      },
      (value) => parseDeploymentHandle(value, input.environment),
    );
  }

  async shiftTraffic(
    deploymentId: string,
    trafficPercent: number,
  ): Promise<DeploymentCanaryHandle> {
    const body = { trafficPercent };
    return this.request(
      `/canaries/${encodeURIComponent(deploymentId)}/traffic`,
      {
        method: "POST",
        body,
        idempotencyKey: deploymentIdempotencyKey(
          `shift-traffic:${deploymentId}`,
          body,
        ),
      },
      parseDeploymentHandle,
    );
  }

  async observe(deploymentId: string): Promise<DeploymentTelemetry> {
    const telemetry = await this.request(
      `/canaries/${encodeURIComponent(deploymentId)}/telemetry`,
      { method: "GET" },
      parseDeploymentTelemetry,
    );
    const observedAt = Date.parse(telemetry.observedAt);
    const latest = this.latestTelemetryAt.get(deploymentId);
    if (latest !== undefined && observedAt < latest) {
      throw new DeploymentContractError(
        `Deployment telemetry for ${deploymentId} arrived out of order`,
      );
    }
    this.latestTelemetryAt.set(deploymentId, observedAt);
    return telemetry;
  }

  async promote(
    deploymentId: string,
  ): Promise<DeploymentCanaryHandle> {
    return this.mutation(
      deploymentId,
      "promote",
      {},
      parseDeploymentHandle,
    );
  }

  async rollback(
    deploymentId: string,
    reason: string,
  ): Promise<DeploymentCanaryHandle> {
    return this.mutation(
      deploymentId,
      "rollback",
      { reason },
      parseDeploymentHandle,
    );
  }

  async injectRollbackDrill(deploymentId: string): Promise<void> {
    await this.request(
      `/canaries/${encodeURIComponent(deploymentId)}/drills/failure`,
      {
        method: "POST",
        body: {},
        idempotencyKey: deploymentIdempotencyKey(
          `inject-failure:${deploymentId}`,
          {},
        ),
      },
      () => undefined,
    );
  }

  private async mutation<T>(
    deploymentId: string,
    operation: "promote" | "rollback",
    body: unknown,
    validate: Validator<T>,
  ): Promise<T> {
    return this.request(
      `/canaries/${encodeURIComponent(deploymentId)}/${operation}`,
      {
        method: "POST",
        body,
        idempotencyKey: deploymentIdempotencyKey(
          `${operation}:${deploymentId}`,
          body,
        ),
      },
      validate,
    );
  }

  private async request<T>(
    pathname: string,
    options: {
      method: "GET" | "POST";
      body?: unknown;
      idempotencyKey?: string;
    },
    validate: Validator<T>,
  ): Promise<T> {
    if (
      options.idempotencyKey &&
      this.responseCache.has(options.idempotencyKey)
    ) {
      return structuredClone(
        this.responseCache.get(options.idempotencyKey) as T,
      );
    }
    const requestId = this.requestId();
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maximumAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.timeoutMs,
      );
      try {
        const response = await this.fetchImplementation(
          `${this.baseUrl}${pathname}`,
          {
            method: options.method,
            headers: {
              Authorization: `Bearer ${this.token}`,
              "Content-Type": "application/json",
              "X-Nexus-Contract-Version": this.contractVersion,
              "X-Nexus-Request-Id": requestId,
              "X-Nexus-Attempt": String(attempt),
              ...(options.idempotencyKey
                ? {
                    "Idempotency-Key": options.idempotencyKey,
                  }
                : {}),
            },
            body:
              options.method === "POST"
                ? JSON.stringify(options.body ?? {})
                : undefined,
            signal: controller.signal,
          },
        );
        const text = await response.text();
        let payload: unknown = {};
        if (text) {
          try {
            payload = JSON.parse(text);
          } catch {
            throw new DeploymentContractError(
              "Deployment controller returned invalid JSON",
            );
          }
        }
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : `Deployment adapter failed with ${response.status}`;
          const error = new Error(message);
          if (
            retryableStatus(response.status) &&
            attempt < this.maximumAttempts
          ) {
            lastError = error;
            await delay(
              this.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1),
            );
            continue;
          }
          throw error;
        }
        const result = validate(payload);
        if (options.idempotencyKey) {
          this.responseCache.set(
            options.idempotencyKey,
            structuredClone(result),
          );
        }
        return result;
      } catch (error) {
        if (error instanceof DeploymentContractError) {
          throw error;
        }
        lastError = error;
        if (attempt >= this.maximumAttempts) {
          throw error;
        }
        await delay(
          this.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1),
        );
      } finally {
        clearTimeout(timeout);
      }
    }
    throw (
      lastError ??
      new Error("Deployment controller request exhausted retries")
    );
  }
}
