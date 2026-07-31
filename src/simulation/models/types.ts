import type {
  CityMetricSnapshot,
  SimulationMetric,
} from "../types";
import type { PolicyAgentId } from "../agents";

export interface ModelRequest {
  requestId: string;
  tick: number;
  seed: string;
  agentId: PolicyAgentId;
  promptVersion: string;
  policyVersion: string;
  city: CityMetricSnapshot;
}

export interface ModelUsage {
  tokenCount: number;
  costUsd: number;
  latencyMs: number;
}

export interface ModelProviderResult {
  providerId: string;
  model: string;
  output: unknown;
  usage: ModelUsage;
}

export interface ModelProvider {
  id: string;
  model: string;
  generate: (
    request: ModelRequest,
    signal?: AbortSignal,
  ) => Promise<ModelProviderResult>;
}

export interface ModelBudgets {
  maxTokensPerProposal: number;
  maxCostUsdPerProposal: number;
  timeoutMs: number;
}

export interface ValidatedModelProposal {
  agentId: PolicyAgentId;
  metric: SimulationMetric;
  delta: number;
  rationale: string;
  confidence: number;
}

export type ModelRiskTier = "low" | "medium" | "high" | "critical";

export interface ModelExecution {
  status: "success" | "fallback";
  proposal: ValidatedModelProposal;
  providerId: string;
  model: string;
  usage: ModelUsage;
  fallbackReason?: string;
}
