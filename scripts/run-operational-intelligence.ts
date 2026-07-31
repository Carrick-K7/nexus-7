import {
  hostname,
} from "node:os";
import {
  getExperimentService,
} from "../src/experiments/server";
import {
  getOperationalIntelligenceService,
} from "../src/operations/intelligence-server";
import {
  collectCurrentOperationalTelemetry,
} from "../src/operations/telemetry-server";
import {
  OperationalIntelligenceWorker,
} from "../src/workers/operational-intelligence";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  throw new Error(
    "The operational-intelligence worker requires DATABASE_URL or POSTGRES_URL",
  );
}

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

async function main(): Promise<void> {
  const configuredInterval = Number(
    process.env.NEXUS_OPERATIONS_INTERVAL_MS,
  );
  const experiments = await getExperimentService();
  const operations = await getOperationalIntelligenceService();
  const worker = new OperationalIntelligenceWorker(
    experiments.repository,
    operations,
    {
      ownerId:
        process.env.NEXUS_OPERATIONS_WORKER_ID ??
        `${hostname()}-${process.pid}`,
      intervalMs:
        Number.isFinite(configuredInterval) &&
        configuredInterval >= 10_000
          ? configuredInterval
          : 60_000,
      collect: collectCurrentOperationalTelemetry,
    },
  );

  console.log(
    JSON.stringify({
      event: "operational-intelligence.started",
      ownerId: worker.ownerId,
      leaseName: worker.leaseName,
      intervalMs: worker.intervalMs,
    }),
  );
  await worker.run(controller.signal);
  console.log(
    JSON.stringify({
      event: "operational-intelligence.stopped",
      ownerId: worker.ownerId,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
