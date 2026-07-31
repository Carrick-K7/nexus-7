import {
  AGENT_DEFINITIONS,
  type PolicyAgentId,
} from "../agents";
import { selectCityMetrics } from "../core/metrics";
import { PUBLIC_SCENARIOS } from "../scenarios";
import type { SimulationMetric } from "../types";
import type { ModelRequest } from "./types";

export const MODEL_REGRESSION_CORPUS_VERSION =
  "city-policy-regression-1.2.0";

const AGENT_IDS: PolicyAgentId[] = [
  "atlas",
  "economica",
  "civitas",
  "spectre",
];

export interface ModelRegressionCase {
  id: string;
  scenarioId: string;
  agentId: PolicyAgentId;
  allowedMetrics: SimulationMetric[];
  request: Omit<ModelRequest, "promptVersion" | "policyVersion">;
}

export const MODEL_REGRESSION_CORPUS: ModelRegressionCase[] =
  PUBLIC_SCENARIOS.flatMap((scenario) =>
    AGENT_IDS.map((agentId, index) => ({
      id: `${scenario.id}:${agentId}`,
      scenarioId: scenario.id,
      agentId,
      allowedMetrics: [...AGENT_DEFINITIONS[agentId].capabilities],
      request: {
        requestId: `regression:${scenario.id}:${agentId}`,
        tick: index + 1,
        seed: `${scenario.seed}:model-regression:${agentId}`,
        agentId,
        city: selectCityMetrics(scenario.world),
      },
    })),
  );
