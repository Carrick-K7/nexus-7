import type {
  ExperimentService,
} from "@/experiments";
import type {
  OperationalIntelligenceService,
} from "@/operations";

export interface ExperimentClockCycle {
  leaseAcquired: boolean;
  advanced: string[];
  conflicts: string[];
  telemetryError?: string;
}

export interface ExperimentClockOptions {
  ownerId?: string;
  leaseName?: string;
  leaseTtlMs?: number;
  intervalMs?: number;
  operationalIntelligence?: Pick<
    OperationalIntelligenceService,
    "recordSample"
  >;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export class ExperimentClockWorker {
  readonly ownerId: string;
  readonly leaseName: string;
  readonly leaseTtlMs: number;
  readonly intervalMs: number;
  private readonly operationalIntelligence?: Pick<
    OperationalIntelligenceService,
    "recordSample"
  >;

  constructor(
    private readonly service: ExperimentService,
    options: ExperimentClockOptions = {},
  ) {
    this.ownerId = options.ownerId ?? `clock-${crypto.randomUUID()}`;
    this.leaseName = options.leaseName ?? "experiment-clock";
    this.intervalMs = options.intervalMs ?? 1_000;
    this.leaseTtlMs =
      options.leaseTtlMs ?? Math.max(this.intervalMs * 3, 5_000);
    this.operationalIntelligence = options.operationalIntelligence;
  }

  async runCycle(): Promise<ExperimentClockCycle> {
    const leaseAcquired =
      await this.service.repository.acquireWorkerLease(
        this.leaseName,
        this.ownerId,
        this.leaseTtlMs,
      );
    if (!leaseAcquired) {
      return {
        leaseAcquired: false,
        advanced: [],
        conflicts: [],
      };
    }
    const actor = {
      id: this.ownerId,
      role: "admin" as const,
      workspaceId: "workspace-neo-angeles",
      principalType: "system" as const,
      authSource: "system" as const,
      issuer: "nexus-experiment-clock",
    };
    const result = await this.service.tickRunningRuns(actor);
    const lease = await this.service.repository.getWorkerLease(
      this.leaseName,
    );
    let telemetryError: string | undefined;
    if (lease && this.operationalIntelligence) {
      const observedAt = new Date().toISOString();
      try {
        await this.operationalIntelligence.recordSample(
          {
            source: "worker",
            metric: "lease-age-ms",
            value: Math.max(
              0,
              Date.parse(observedAt) - Date.parse(lease.heartbeatAt),
            ),
            unit: "milliseconds",
            status: "healthy",
            dimensions: {
              worker: this.ownerId,
              lease: this.leaseName,
            },
            observedAt,
          },
          actor,
        );
      } catch (error) {
        telemetryError =
          error instanceof Error ? error.message : String(error);
      }
    }
    return {
      leaseAcquired: true,
      ...result,
      ...(telemetryError ? { telemetryError } : {}),
    };
  }

  async run(signal: AbortSignal): Promise<void> {
    try {
      while (!signal.aborted) {
        await this.runCycle();
        await delay(this.intervalMs, signal);
      }
    } finally {
      await this.service.repository.releaseWorkerLease(
        this.leaseName,
        this.ownerId,
      );
    }
  }
}
