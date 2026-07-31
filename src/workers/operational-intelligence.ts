import type {
  ExperimentRepository,
} from "@/experiments/repository";
import type {
  ExperimentActor,
} from "@/experiments/types";
import type {
  OperationalIntelligenceService,
} from "@/operations/intelligence-service";
import type {
  OperationalCollectionResult,
} from "@/operations/telemetry-collector";

export interface OperationalIntelligenceCycle {
  leaseAcquired: boolean;
  collection?: OperationalCollectionResult;
  deliveriesProcessed: number;
  samplesPruned: number;
}

export interface OperationalIntelligenceWorkerOptions {
  ownerId?: string;
  leaseName?: string;
  leaseTtlMs?: number;
  intervalMs?: number;
  collect: (actor: ExperimentActor) => Promise<OperationalCollectionResult>;
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

export class OperationalIntelligenceWorker {
  readonly ownerId: string;
  readonly leaseName: string;
  readonly leaseTtlMs: number;
  readonly intervalMs: number;
  private readonly collect: OperationalIntelligenceWorkerOptions["collect"];

  constructor(
    private readonly repository: ExperimentRepository,
    private readonly service: OperationalIntelligenceService,
    options: OperationalIntelligenceWorkerOptions,
  ) {
    this.ownerId = options.ownerId ?? `operations-${crypto.randomUUID()}`;
    this.leaseName =
      options.leaseName ?? "operational-intelligence";
    this.intervalMs = options.intervalMs ?? 60_000;
    this.leaseTtlMs =
      options.leaseTtlMs ?? Math.max(this.intervalMs * 3, 180_000);
    this.collect = options.collect;
  }

  private actor(): ExperimentActor {
    return {
      id: this.ownerId,
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "system",
      authSource: "system",
      issuer: "nexus-operational-intelligence",
    };
  }

  async runCycle(): Promise<OperationalIntelligenceCycle> {
    const leaseAcquired = await this.repository.acquireWorkerLease(
      this.leaseName,
      this.ownerId,
      this.leaseTtlMs,
    );
    if (!leaseAcquired) {
      return {
        leaseAcquired: false,
        deliveriesProcessed: 0,
        samplesPruned: 0,
      };
    }
    const actor = this.actor();
    const collection = await this.collect(actor);
    const deliveries = await this.service.processDueDeliveries(actor);
    const retention = await this.service.enforceRetention(actor);
    return {
      leaseAcquired: true,
      collection,
      deliveriesProcessed: deliveries.length,
      samplesPruned: retention.deletedSamples,
    };
  }

  async run(signal: AbortSignal): Promise<void> {
    try {
      while (!signal.aborted) {
        await this.runCycle();
        await delay(this.intervalMs, signal);
      }
    } finally {
      await this.repository.releaseWorkerLease(
        this.leaseName,
        this.ownerId,
      );
    }
  }
}
