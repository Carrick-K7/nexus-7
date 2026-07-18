import { randomUnit } from "../../core/random";
import type { AgentPolicy } from "../types";
import {
  createObservation,
  createProposal,
  shouldObserveRoutine,
} from "./shared";

export const economicaPolicy: AgentPolicy = {
  id: "economica",
  version: "economica-1.0.0",
  observe(state, context) {
    if (!shouldObserveRoutine("economica", state, context)) {
      return [];
    }

    const improveHappiness =
      randomUnit(context.seed, state.tick, "agent.economica.metric") > 0.75;
    return [
      createObservation({
        state,
        agentId: "economica",
        kind: "routine",
        metric: improveHappiness ? "happiness" : "gdp",
        value: improveHappiness ? state.city.happiness : state.economy.gdp,
        summary: "Routine economic allocation review",
        priority: 30,
        riskTier: "low",
      }),
    ];
  },
  propose(observation, state, context) {
    const roll = randomUnit(
      context.seed,
      state.tick,
      "agent.economica.delta",
    );
    return [
      createProposal(observation, state, context, {
        delta: observation.metric === "happiness" ? 1 : Math.round(1 + roll * 3),
        rationale: "Apply a bounded economic optimization",
      }),
    ];
  },
};
