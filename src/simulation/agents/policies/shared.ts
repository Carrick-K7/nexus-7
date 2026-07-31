import { AGENT_TASKS } from "@/data/agent-tasks";
import {
  deterministicIndex,
  randomUnit,
} from "../../core/random";
import type {
  AgentObservation,
  AgentProposal,
  PolicyAgentId,
  RiskTier,
} from "../types";
import type {
  SimulationMetric,
  StepContext,
  WorldState,
} from "../../types";

export function routineProbability(context: StepContext): number {
  return 1 - Math.pow(1 - context.configuration.backgroundActionProbability, 0.25);
}

export function shouldObserveRoutine(
  agentId: PolicyAgentId,
  state: WorldState,
  context: StepContext,
): boolean {
  return (
    randomUnit(
      context.seed,
      state.tick,
      `agent.${agentId}.routine.enabled`,
    ) < routineProbability(context)
  );
}

export function selectAgentTask(
  agentId: PolicyAgentId,
  state: WorldState,
  context: StepContext,
): string {
  const tasks = AGENT_TASKS[agentId] ?? [];
  const index = deterministicIndex(
    context.seed,
    state.tick,
    `agent.${agentId}.task`,
    tasks.length,
  );
  return tasks[index] ?? "Monitoring assigned domain";
}

export function createObservation(input: {
  state: WorldState;
  agentId: PolicyAgentId;
  kind: AgentObservation["kind"];
  metric: SimulationMetric;
  value: number;
  threshold?: number;
  summary: string;
  priority: number;
  riskTier: RiskTier;
}): AgentObservation {
  const correlationId = `corr-${input.state.tick}-${input.agentId}-${input.kind}-${input.metric}`;
  return {
    id: `obs-${input.state.tick}-${input.agentId}-${input.kind}-${input.metric}`,
    tick: input.state.tick,
    agentId: input.agentId,
    kind: input.kind,
    metric: input.metric,
    value: input.value,
    threshold: input.threshold,
    summary: input.summary,
    correlationId,
    priority: input.priority,
    riskTier: input.riskTier,
  };
}

export function createProposal(
  observation: AgentObservation,
  state: WorldState,
  context: StepContext,
  input: {
    delta: number;
    rationale: string;
  },
): AgentProposal {
  return {
    id: `proposal-${state.tick}-${observation.agentId}-${observation.metric}`,
    tick: state.tick,
    agentId: observation.agentId,
    observationId: observation.id,
    metric: observation.metric,
    delta: input.delta,
    rationale: input.rationale,
    task: selectAgentTask(observation.agentId, state, context),
    correlationId: observation.correlationId,
    priority: observation.priority,
    riskTier: observation.riskTier,
  };
}
