import type {
  AgentId,
  SimulationMetric,
  StepContext,
  WorldState,
} from "../types";

export type PolicyAgentId = Exclude<AgentId, "aria">;
export type RiskTier = "low" | "medium" | "high";

export interface AgentObservation {
  id: string;
  tick: number;
  agentId: PolicyAgentId;
  kind: "threshold" | "routine";
  metric: SimulationMetric;
  value: number;
  threshold?: number;
  summary: string;
  correlationId: string;
  priority: number;
  riskTier: RiskTier;
}

export interface AgentProposal {
  id: string;
  tick: number;
  agentId: PolicyAgentId;
  observationId: string;
  metric: SimulationMetric;
  delta: number;
  rationale: string;
  task: string;
  correlationId: string;
  priority: number;
  riskTier: RiskTier;
}

export interface AgentPolicy {
  id: PolicyAgentId;
  version: string;
  observe: (state: WorldState, context: StepContext) => AgentObservation[];
  propose: (
    observation: AgentObservation,
    state: WorldState,
    context: StepContext,
  ) => AgentProposal[];
}

export type RuntimeRejectionCode =
  | "BUDGET_EXCEEDED"
  | "COOLDOWN_ACTIVE"
  | "COMMAND_CONFLICT"
  | "RISK_NOT_ALLOWED";

export interface RuntimeRejection {
  proposal: AgentProposal;
  code: RuntimeRejectionCode;
  reason: string;
}

export interface AgentRuntimeResult {
  observations: AgentObservation[];
  proposals: AgentProposal[];
  scheduledProposals: AgentProposal[];
  rejectedProposals: RuntimeRejection[];
}
