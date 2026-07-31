import neoAngelesScenario from "./neo-angeles.json";
import gridStressScenario from "./grid-stress.json";
import civicRecoveryScenario from "./civic-recovery.json";
import type { SimulationScenario, WorldState } from "../types";

const scenario = neoAngelesScenario as SimulationScenario;

export const DEFAULT_SCENARIO: SimulationScenario = scenario;
export const PUBLIC_SCENARIOS: SimulationScenario[] = [
  scenario,
  gridStressScenario as SimulationScenario,
  civicRecoveryScenario as SimulationScenario,
];

export function getScenario(scenarioId: string): SimulationScenario | undefined {
  const selected = PUBLIC_SCENARIOS.find(
    (candidate) => candidate.id === scenarioId,
  );
  return selected ? structuredClone(selected) : undefined;
}

export function cloneWorldState(state: WorldState): WorldState {
  return structuredClone(state);
}

export function createDefaultWorld(seedScenario = DEFAULT_SCENARIO): WorldState {
  return cloneWorldState(seedScenario.world);
}
