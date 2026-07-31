import {
  getWorldService,
  symbiosisTurnIntervalMs,
} from "../src/symbiosis/server";
import {
  nextTurnScheduleDelayMs,
} from "../src/symbiosis/reliability";
import type {
  ExperimentActor,
} from "../src/experiments/types";

const actor: ExperimentActor = {
  id: process.env.SYMBIOSIS_WORKER_ID ?? "symbiosis-clock-1",
  role: "operator",
  workspaceId: "workspace-neo-angeles",
  principalType: "system",
};

const intervalMs = symbiosisTurnIntervalMs(
  process.env.SYMBIOSIS_TURN_INTERVAL_MS,
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

async function waitFor(delayMs: number): Promise<void> {
  if (delayMs <= 0 || stopping) return;
  await new Promise<void>((resolve) => {
    wake = resolve;
    waitTimer = setTimeout(resolve, delayMs);
  });
  wake = undefined;
  waitTimer = undefined;
}

async function waitForPersistedCadence(): Promise<void> {
  const service = await getWorldService();
  const turns = await service.turns(actor);
  const latest = turns.reduce((current, candidate) =>
    candidate.turn > current.turn ? candidate : current,
  );
  const delayMs = nextTurnScheduleDelayMs(
    latest,
    Date.now(),
    intervalMs,
  );
  if (delayMs === 0) return;
  console.log(
    JSON.stringify({
      type: "symbiosis-clock-waiting",
      at: new Date().toISOString(),
      latestTurn: latest.turn,
      latestRecordedAt:
        latest.runtimeEvidence?.recordedAt ?? null,
      delayMs,
    }),
  );
  await waitFor(delayMs);
}

async function main(): Promise<void> {
  if (!once) {
    await waitForPersistedCadence();
  }
  if (stopping) return;
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
    await waitFor(intervalMs);
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
