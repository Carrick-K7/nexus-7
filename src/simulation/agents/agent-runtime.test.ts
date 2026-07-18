// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  AGENT_DEFINITIONS,
  DEFAULT_SCENARIO,
  cloneWorldState,
  scheduleAgentProposals,
  stepSimulation,
} from "@/simulation";
import type {
  AgentProposal,
  PolicyAgentId,
  SimulationMetric,
  StepContext,
} from "@/simulation";

function proposal(
  agentId: PolicyAgentId,
  metric: SimulationMetric,
  priority = 50,
): AgentProposal {
  return {
    id: `proposal-${agentId}-${metric}`,
    tick: 10,
    agentId,
    observationId: `obs-${agentId}-${metric}`,
    metric,
    delta: metric === "crime" || metric === "traffic" ? -1 : 1,
    rationale: "Runtime scheduler test",
    task: "Test task",
    correlationId: `corr-${agentId}-${metric}`,
    priority,
    riskTier: "low",
  };
}

function context(): StepContext {
  return {
    seed: DEFAULT_SCENARIO.seed,
    policyVersion: DEFAULT_SCENARIO.policyVersion,
    configuration: structuredClone(DEFAULT_SCENARIO.configuration),
  };
}

describe("agent runtime scheduler", () => {
  it("uses agent priority to resolve commands targeting the same metric", () => {
    const state = {
      ...cloneWorldState(DEFAULT_SCENARIO.world),
      tick: 10,
    };
    const result = scheduleAgentProposals(
      [proposal("spectre", "crime"), proposal("atlas", "crime")],
      state,
      context().configuration,
    );

    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0].agentId).toBe("atlas");
    expect(result.rejected[0].code).toBe("COMMAND_CONFLICT");
  });

  it("enforces per-agent cooldown and command budgets", () => {
    const state = cloneWorldState(DEFAULT_SCENARIO.world);
    state.tick = 10;
    state.agents.atlas.lastActionTick = 9;

    const result = scheduleAgentProposals(
      [
        proposal("atlas", "crime", 90),
        proposal("civitas", "traffic", 80),
        proposal("civitas", "energy", 70),
      ],
      state,
      context().configuration,
    );

    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0].agentId).toBe("civitas");
    expect(result.rejected.map((item) => item.code)).toEqual(
      expect.arrayContaining(["COOLDOWN_ACTIVE", "BUDGET_EXCEEDED"]),
    );
  });

  it("enforces ARIA's global per-tick command budget", () => {
    const state = {
      ...cloneWorldState(DEFAULT_SCENARIO.world),
      tick: 10,
    };
    const configuration = context().configuration;
    configuration.agentRuntime = {
      ...configuration.agentRuntime!,
      globalCommandBudget: 1,
    };

    const result = scheduleAgentProposals(
      [
        proposal("atlas", "crime", 90),
        proposal("civitas", "energy", 80),
        proposal("economica", "gdp", 70),
      ],
      state,
      configuration,
    );

    expect(result.scheduled).toHaveLength(1);
    expect(
      result.rejected.filter((item) => item.code === "BUDGET_EXCEEDED"),
    ).toHaveLength(2);
  });

  it("rejects proposals above an agent's configured risk ceiling", () => {
    const state = {
      ...cloneWorldState(DEFAULT_SCENARIO.world),
      tick: 10,
    };
    const configuration = context().configuration;
    configuration.agentRuntime = {
      ...configuration.agentRuntime!,
      agents: {
        ...configuration.agentRuntime!.agents,
        atlas: {
          ...configuration.agentRuntime!.agents.atlas,
          maxRiskTier: "low",
        },
      },
    };
    const highRisk = {
      ...proposal("atlas", "crime", 100),
      riskTier: "high" as const,
    };

    const result = scheduleAgentProposals(
      [highRisk],
      state,
      configuration,
    );

    expect(result.scheduled).toEqual([]);
    expect(result.rejected[0].code).toBe("RISK_NOT_ALLOWED");
  });

  it("keeps every policy within capability and budget contracts over 500 ticks", () => {
    let state = cloneWorldState(DEFAULT_SCENARIO.world);
    const seenAgents = new Set<string>();
    const runtimeContext = context();

    for (let index = 0; index < 500; index += 1) {
      const result = stepSimulation(state, [], runtimeContext);
      const policyCommands = result.acceptedCommands.filter(
        (command) => command.source === "policy",
      );
      const perAgent = new Map<string, number>();

      expect(policyCommands.length).toBeLessThanOrEqual(
        runtimeContext.configuration.agentRuntime?.globalCommandBudget ?? 2,
      );

      for (const command of policyCommands) {
        const agentId = command.actorId as PolicyAgentId;
        seenAgents.add(agentId);
        expect(AGENT_DEFINITIONS[agentId].capabilities).toContain(
          command.payload.metric,
        );
        perAgent.set(agentId, (perAgent.get(agentId) ?? 0) + 1);
      }

      for (const [agentId, count] of perAgent) {
        expect(count).toBeLessThanOrEqual(
          runtimeContext.configuration.agentRuntime?.agents[
            agentId as PolicyAgentId
          ].commandBudget ?? 1,
        );
      }

      expect(
        result.events.some((event) => event.type === "coordinator.decision"),
      ).toBe(true);
      state = result.state;
    }

    expect([...seenAgents].sort()).toEqual([
      "atlas",
      "civitas",
      "economica",
      "spectre",
    ]);
  });
});
