import { assertWorldInvariants } from "./core/invariants";
import { isReplayEquivalent, replaySimulation } from "./replay";
import type {
  SimulationRunExport,
  StepContext,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function serializeSimulationRun(run: SimulationRunExport): string {
  return JSON.stringify(run, null, 2);
}

export function parseSimulationRun(serialized: string): SimulationRunExport {
  const parsed: unknown = JSON.parse(serialized);

  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.seed !== "string" ||
    typeof parsed.policyVersion !== "string" ||
    !isRecord(parsed.configuration) ||
    !isRecord(parsed.initialState) ||
    !isRecord(parsed.world) ||
    !Array.isArray(parsed.events) ||
    !Array.isArray(parsed.operatorCommands)
  ) {
    throw new Error("Unsupported or malformed simulation export");
  }

  const run = parsed as unknown as SimulationRunExport;
  assertWorldInvariants(run.initialState);
  assertWorldInvariants(run.world);

  const ticks = run.world.tick - run.initialState.tick;
  if (ticks < 0) {
    throw new Error("Simulation export tick range is invalid");
  }

  const context: StepContext = {
    seed: run.seed,
    policyVersion: run.policyVersion,
    configuration: run.configuration,
  };
  const replay = replaySimulation(
    run.initialState,
    context,
    ticks,
    run.operatorCommands,
  );

  if (!isReplayEquivalent(run.world, run.events, replay)) {
    throw new Error("Simulation export failed deterministic replay validation");
  }

  return structuredClone(run);
}
