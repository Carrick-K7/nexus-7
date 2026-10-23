import { getResearchService } from "../src/research/server";
import { ResearchWorker } from "../src/workers/research";
import { researchRuntime } from "../src/research/runtime";

async function main(): Promise<void> {
  if (process.env.NEXUS_RESEARCH_ENABLED !== "true") throw new Error("Research worker is disabled; explicit operator configuration is required");
  const intervalMs = Number(process.env.NEXUS_RESEARCH_INTERVAL_MS ?? 30_000);
  const workspaceId = process.env.NEXUS_RESEARCH_WORKSPACE_ID ?? "workspace-neo-angeles";
  const owner = process.env.NEXUS_RESEARCH_WORKER_ID ?? "research-worker-1";
  const service = await getResearchService();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const worker = new ResearchWorker(service, {
      id: owner, role: "operator", workspaceId, principalType: "system", authSource: "system",
    }, {
      owner, intervalMs,
      onCycle(station) {
        console.log(JSON.stringify({ event: "research-cycle", at: new Date().toISOString(),
          status: station?.status ?? "not-authorized", revision: station?.revision ?? null,
          episodes: station?.episodes.length ?? 0, spentCalls: station?.budget.spentCalls ?? 0,
          stopReason: station?.stopReason ?? null, liveModelCalls: 0,
          releaseRevision: researchRuntime(station).releaseRevision,
          researchLedgerWrites: true, cityWrites: false, deploymentControl: false }));
      },
    });
    if (process.argv.includes("--once")) await worker.runCycle(controller.signal);
    else await worker.run(controller.signal);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    if ("close" in service.repository && typeof service.repository.close === "function") await service.repository.close();
  }
}

void main().catch(() => {
  // Do not print driver errors that may contain a connection string or private host information.
  console.error("Research worker failed; verify explicit enablement, durable backend, authorization and bounded configuration.");
  process.exitCode = 1;
});
