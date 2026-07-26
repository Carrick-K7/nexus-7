import {
  getWorldService,
} from "../src/symbiosis/server";
import type {
  ExperimentActor,
} from "../src/experiments/types";

const actor: ExperimentActor = {
  id: process.env.SYMBIOSIS_WORKER_ID ?? "symbiosis-clock-1",
  role: "operator",
  workspaceId: "workspace-neo-angeles",
  principalType: "system",
};

const intervalMs = Math.max(
  60_000,
  Number(process.env.SYMBIOSIS_TURN_INTERVAL_MS ?? 3_600_000),
);
const once = process.argv.includes("--once");
let stopping = false;
let wake: (() => void) | undefined;
let waitTimer: NodeJS.Timeout | undefined;

async function advance(): Promise<void> {
  const service = await getWorldService();
  const turn = await service.advanceTurn(actor);
  const report = await service.report(actor);
  console.log(
    JSON.stringify({
      type: "symbiosis-turn-settled",
      at: new Date().toISOString(),
      seasonId: turn.seasonId,
      turn: turn.turn,
      simulationDate: turn.simulationDate,
      fingerprint: turn.fingerprint,
      eventCount: turn.eventCount,
      cognitionStatus: turn.cognitionStatus,
      runtimeEvidence: turn.runtimeEvidence
        ? {
            deploymentRevision:
              turn.runtimeEvidence.deploymentRevision,
            timing: turn.runtimeEvidence.timing,
            lagMs: turn.runtimeEvidence.lagMs ?? null,
          }
        : null,
      ralr: report.ralr,
      safety: report.safety,
      costUsd: report.cognition.costUsd,
      shadow: {
        comparisons: report.cognition.shadowComparisons ?? 0,
        disagreements:
          report.cognition.shadowDisagreements ?? 0,
        costUsd: report.cognition.shadowCostUsd ?? 0,
      },
    }),
  );
}

async function main(): Promise<void> {
  do {
    try {
      await advance();
    } catch (error) {
      console.error(
        JSON.stringify({
          type: "symbiosis-turn-failed",
          at: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      if (once) throw error;
    }
    if (once || stopping) break;
    await new Promise<void>((resolve) => {
      wake = resolve;
      waitTimer = setTimeout(resolve, intervalMs);
    });
    wake = undefined;
    waitTimer = undefined;
  } while (!stopping);
}

process.on("SIGTERM", () => {
  stopping = true;
  if (waitTimer) clearTimeout(waitTimer);
  wake?.();
});
process.on("SIGINT", () => {
  stopping = true;
  if (waitTimer) clearTimeout(waitTimer);
  wake?.();
});

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
