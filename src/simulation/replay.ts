import { fingerprint, stableStringify } from "./core/random";
import { stepSimulation } from "./core/step";
import type {
  DomainEvent,
  ReplayResult,
  SimulationCommand,
  StepContext,
  WorldState,
} from "./types";

export function replaySimulation(
  initialState: WorldState,
  context: StepContext,
  ticks: number,
  commands: SimulationCommand[] = [],
): ReplayResult {
  const commandsByTick = new Map<number, SimulationCommand[]>();

  for (const command of commands) {
    const commandsForTick = commandsByTick.get(command.tick) ?? [];
    commandsForTick.push(command);
    commandsByTick.set(command.tick, commandsForTick);
  }

  let state = structuredClone(initialState);
  const events: DomainEvent[] = [];
  const acceptedCommands: SimulationCommand[] = [];
  const rejectedCommands = [];

  for (let index = 0; index < ticks; index += 1) {
    const nextTick = state.tick + 1;
    const result = stepSimulation(
      state,
      commandsByTick.get(nextTick) ?? [],
      context,
    );
    state = result.state;
    events.push(...result.events);
    acceptedCommands.push(...result.acceptedCommands);
    rejectedCommands.push(...result.rejectedCommands);
  }

  return {
    state,
    events,
    acceptedCommands,
    rejectedCommands,
    fingerprint: fingerprint({ state, events }),
  };
}

export function isReplayEquivalent(
  expectedState: WorldState,
  expectedEvents: DomainEvent[],
  replay: ReplayResult,
): boolean {
  return (
    stableStringify(expectedState) === stableStringify(replay.state) &&
    stableStringify(expectedEvents) === stableStringify(replay.events)
  );
}
