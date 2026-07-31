import {
  getAgentDefinition,
  getGlobalCommandBudget,
  RISK_WEIGHT,
} from "./config";
import type {
  AgentProposal,
  RuntimeRejection,
} from "./types";
import type {
  SimulationConfiguration,
  WorldState,
} from "../types";

export function scheduleAgentProposals(
  proposals: AgentProposal[],
  state: WorldState,
  configuration: SimulationConfiguration,
): {
  scheduled: AgentProposal[];
  rejected: RuntimeRejection[];
} {
  const rejected: RuntimeRejection[] = [];
  const sorted = [...proposals].sort((left, right) => {
    const priorityDelta = right.priority - left.priority;
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const agentPriorityDelta =
      getAgentDefinition(right.agentId, configuration).priority -
      getAgentDefinition(left.agentId, configuration).priority;
    return agentPriorityDelta !== 0
      ? agentPriorityDelta
      : left.id.localeCompare(right.id);
  });
  const eligible: AgentProposal[] = [];

  for (const proposal of sorted) {
    const definition = getAgentDefinition(proposal.agentId, configuration);
    const runtime = state.agents[proposal.agentId];

    if (RISK_WEIGHT[proposal.riskTier] > RISK_WEIGHT[definition.maxRiskTier]) {
      rejected.push({
        proposal,
        code: "RISK_NOT_ALLOWED",
        reason: `${proposal.agentId} risk ceiling is ${definition.maxRiskTier}`,
      });
      continue;
    }

    if (
      runtime.lastActionTick !== undefined &&
      state.tick - runtime.lastActionTick < definition.cooldownTicks
    ) {
      rejected.push({
        proposal,
        code: "COOLDOWN_ACTIVE",
        reason: `${proposal.agentId} is cooling down until tick ${runtime.lastActionTick + definition.cooldownTicks}`,
      });
      continue;
    }

    eligible.push(proposal);
  }

  const withinAgentBudget: AgentProposal[] = [];
  const perAgentCounts = new Map<string, number>();
  for (const proposal of eligible) {
    const definition = getAgentDefinition(proposal.agentId, configuration);
    const used = perAgentCounts.get(proposal.agentId) ?? 0;
    if (used >= definition.commandBudget) {
      rejected.push({
        proposal,
        code: "BUDGET_EXCEEDED",
        reason: `${proposal.agentId} exhausted its per-tick command budget`,
      });
      continue;
    }
    perAgentCounts.set(proposal.agentId, used + 1);
    withinAgentBudget.push(proposal);
  }

  const conflictFree: AgentProposal[] = [];
  const claimedMetrics = new Map<string, AgentProposal>();
  for (const proposal of withinAgentBudget) {
    const winner = claimedMetrics.get(proposal.metric);
    if (winner) {
      rejected.push({
        proposal,
        code: "COMMAND_CONFLICT",
        reason: `${proposal.metric} was already claimed by higher-priority ${winner.agentId}`,
      });
      continue;
    }
    claimedMetrics.set(proposal.metric, proposal);
    conflictFree.push(proposal);
  }

  const globalBudget = getGlobalCommandBudget(configuration);
  const scheduled = conflictFree.slice(0, globalBudget);
  for (const proposal of conflictFree.slice(globalBudget)) {
    rejected.push({
      proposal,
      code: "BUDGET_EXCEEDED",
      reason: "ARIA coordinator exhausted the global per-tick command budget",
    });
  }

  return { scheduled, rejected };
}
