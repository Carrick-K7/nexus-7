import { randomUnit } from "../../core/random";
import type { AgentPolicy } from "../types";
import {
  createObservation,
  createProposal,
  shouldObserveRoutine,
} from "./shared";

export const spectrePolicy: AgentPolicy = {
  id: "spectre",
  version: "spectre-1.0.0",
  observe(state, context) {
    if (!shouldObserveRoutine("spectre", state, context)) {
      return [];
    }

    const improveNetwork =
      randomUnit(context.seed, state.tick, "agent.spectre.metric") > 0.5;
    return [
      createObservation({
        state,
        agentId: "spectre",
        kind: "routine",
        metric: improveNetwork ? "internet" : "crime",
        value: improveNetwork
          ? state.infrastructure.internet
          : state.security.crime,
        summary: "Routine intelligence anomaly review",
        priority: 34,
        riskTier: "low",
      }),
    ];
  },
  propose(observation, state, context) {
    return [
      createProposal(observation, state, context, {
        delta: observation.metric === "internet" ? 1 : -1,
        rationale: "Apply a bounded intelligence intervention",
      }),
    ];
  },
};
