import { hostname } from "node:os";
import { getExperimentService } from "../src/experiments/server";
import {
  getOperationalIntelligenceService,
} from "../src/operations/intelligence-server";
import { ExperimentClockWorker } from "../src/workers/experiment-clock";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  throw new Error(
    "The independent experiment clock requires DATABASE_URL or POSTGRES_URL",
  );
}

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

async function main(): Promise<void> {
  const intervalMs = Number(process.env.NEXUS_CLOCK_INTERVAL_MS);
  const [service, operationalIntelligence] = await Promise.all([
    getExperimentService(),
    getOperationalIntelligenceService(),
  ]);
  const worker = new ExperimentClockWorker(service, {
    ownerId:
      process.env.NEXUS_CLOCK_WORKER_ID ??
      `${hostname()}-${process.pid}`,
    intervalMs:
      Number.isFinite(intervalMs) && intervalMs >= 100 ? intervalMs : 1_000,
    operationalIntelligence,
  });

  console.log(
    JSON.stringify({
      event: "experiment-clock.started",
      ownerId: worker.ownerId,
      leaseName: worker.leaseName,
      intervalMs: worker.intervalMs,
    }),
  );

  await worker.run(controller.signal);

  console.log(
    JSON.stringify({
      event: "experiment-clock.stopped",
      ownerId: worker.ownerId,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
