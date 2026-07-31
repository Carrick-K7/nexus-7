import { AGENT_POLICIES } from "./policies";
import { scheduleAgentProposals } from "./scheduler";
import type { AgentRuntimeResult } from "./types";
import type { StepContext, WorldState } from "../types";

export function runAgentRuntime(
  state: WorldState,
  context: StepContext,
): AgentRuntimeResult {
  const observations = AGENT_POLICIES.flatMap((policy) =>
    policy.observe(state, context),
  );
  const proposals = observations.flatMap((observation) => {
    const policy = AGENT_POLICIES.find(
      (candidate) => candidate.id === observation.agentId,
    );
    return policy?.propose(observation, state, context) ?? [];
  });
  const { scheduled, rejected } = scheduleAgentProposals(
    proposals,
    state,
    context.configuration,
  );

  return {
    observations,
    proposals,
    scheduledProposals: scheduled,
    rejectedProposals: rejected,
  };
}
