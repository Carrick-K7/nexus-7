import { randomUnit } from "../../core/random";
import type { AgentPolicy } from "../types";
import {
  createObservation,
  createProposal,
  shouldObserveRoutine,
} from "./shared";

export const atlasPolicy: AgentPolicy = {
  id: "atlas",
  version: "atlas-1.0.0",
  observe(state, context) {
    if (state.security.crime > context.configuration.thresholds.crimeHigh) {
      const severity =
        state.security.crime - context.configuration.thresholds.crimeHigh;
      return [
        createObservation({
          state,
          agentId: "atlas",
          kind: "threshold",
          metric: "crime",
          value: state.security.crime,
          threshold: context.configuration.thresholds.crimeHigh,
          summary: "Crime index exceeded the security threshold",
          priority: Math.min(100, 85 + severity),
          riskTier: severity > 15 ? "high" : "medium",
        }),
      ];
    }

    if (!shouldObserveRoutine("atlas", state, context)) {
      return [];
    }

    return [
      createObservation({
        state,
        agentId: "atlas",
        kind: "routine",
        metric: "crime",
        value: state.security.crime,
        summary: "Routine security posture review",
        priority: 35,
        riskTier: "low",
      }),
    ];
  },
  propose(observation, state, context) {
    const routineDelta =
      randomUnit(context.seed, state.tick, "agent.atlas.delta") > 0.5 ? -2 : -1;
    return [
      createProposal(observation, state, context, {
        delta: observation.kind === "threshold" ? -5 : routineDelta,
        rationale:
          observation.kind === "threshold"
            ? "Deploy a bounded crime suppression response"
            : "Apply a low-risk security optimization",
      }),
    ];
  },
};
