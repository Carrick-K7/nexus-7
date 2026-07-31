import type {
  PolicyAgentId,
  RiskTier,
} from "./types";
import type { SimulationConfiguration, SimulationMetric } from "../types";

export interface AgentDefinition {
  capabilities: SimulationMetric[];
  commandBudget: number;
  cooldownTicks: number;
  priority: number;
  maxRiskTier: RiskTier;
}

export const AGENT_DEFINITIONS: Record<PolicyAgentId, AgentDefinition> = {
  atlas: {
    capabilities: ["crime"],
    commandBudget: 1,
    cooldownTicks: 5,
    priority: 90,
    maxRiskTier: "high",
  },
  economica: {
    capabilities: ["gdp", "happiness"],
    commandBudget: 1,
    cooldownTicks: 5,
    priority: 60,
    maxRiskTier: "medium",
  },
  civitas: {
    capabilities: ["traffic", "energy", "pollution", "water", "medical"],
    commandBudget: 1,
    cooldownTicks: 5,
    priority: 80,
    maxRiskTier: "high",
  },
  spectre: {
    capabilities: ["crime", "internet"],
    commandBudget: 1,
    cooldownTicks: 5,
    priority: 70,
    maxRiskTier: "medium",
  },
};

export function getAgentDefinition(
  agentId: PolicyAgentId,
  configuration: SimulationConfiguration,
): AgentDefinition {
  const defaults = AGENT_DEFINITIONS[agentId];
  const override = configuration.agentRuntime?.agents[agentId];

  return {
    ...defaults,
    ...override,
    capabilities: defaults.capabilities,
  };
}

export function getGlobalCommandBudget(
  configuration: SimulationConfiguration,
): number {
  return configuration.agentRuntime?.globalCommandBudget ?? 2;
}

export const RISK_WEIGHT: Record<RiskTier, number> = {
  low: 1,
  medium: 2,
  high: 3,
};
