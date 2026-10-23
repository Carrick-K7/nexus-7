import type { ExperimentActor } from "@/experiments/types";
import { ExperimentConflictError } from "@/experiments/errors";
import type { ResearchStation } from "@/research/contracts";
import type { ResearchService } from "@/research/service";

export interface ResearchWorkerOptions {
  owner: string;
  intervalMs?: number;
  requirePersistent?: boolean;
  onCycle?: (station: ResearchStation | null) => void;
}

/** A worker advances only already-authorized research, never inventing a human approval. */
export class ResearchWorker {
  private readonly intervalMs: number;
  constructor(
    private readonly service: ResearchService,
    private readonly actor: ExperimentActor,
    private readonly options: ResearchWorkerOptions,
  ) {
    if (!options.owner || options.owner.length > 120) throw new Error("Invalid research worker identity");
    this.intervalMs = options.intervalMs ?? 30_000;
    if (!Number.isSafeInteger(this.intervalMs) || this.intervalMs < 1_000 || this.intervalMs > 3_600_000) throw new Error("Research worker interval outside bounds");
    if (options.requirePersistent !== false && service.repository.backend !== "postgres") {
      throw new Error("A standalone research worker requires PostgreSQL; memory is not shared with Web");
    }
    if (actor.principalType === "human") throw new Error("A worker must not impersonate a human authorizer");
  }

  async runCycle(signal?: AbortSignal): Promise<ResearchStation | null> {
    if (signal?.aborted) return this.service.get(this.actor);
    let station: ResearchStation | null;
    try {
      station = await this.service.step(this.actor, this.options.owner, signal);
    } catch (error) {
      if (!(error instanceof ExperimentConflictError)) throw error;
      // A pause or competing CAS owner legitimately fences this attempt. Re-read through
      // full validation: corrupt/unknown state still throws rather than being hidden.
      station = await this.service.get(this.actor);
    }
    this.options.onCycle?.(station);
    return station;
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.runCycle(signal);
      if (signal.aborted) break;
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, this.intervalMs);
        signal.addEventListener("abort", done, { once: true });
        if (signal.aborted) done();
      });
    }
  }
}
