import { randomUnit } from "../../core/random";
import type { AgentPolicy, AgentObservation } from "../types";
import {
  createObservation,
  createProposal,
  shouldObserveRoutine,
} from "./shared";

export const civitasPolicy: AgentPolicy = {
  id: "civitas",
  version: "civitas-1.0.0",
  observe(state, context) {
    const observations: AgentObservation[] = [];
    const { thresholds } = context.configuration;

    if (state.infrastructure.traffic > thresholds.trafficHigh) {
      observations.push(
        createObservation({
          state,
          agentId: "civitas",
          kind: "threshold",
          metric: "traffic",
          value: state.infrastructure.traffic,
          threshold: thresholds.trafficHigh,
          summary: "Traffic exceeded the infrastructure threshold",
          priority: Math.min(
            100,
            80 + state.infrastructure.traffic - thresholds.trafficHigh,
          ),
          riskTier: "medium",
        }),
      );
    }

    if (state.infrastructure.energy < thresholds.energyLow) {
      observations.push(
        createObservation({
          state,
          agentId: "civitas",
          kind: "threshold",
          metric: "energy",
          value: state.infrastructure.energy,
          threshold: thresholds.energyLow,
          summary: "Energy availability fell below the safety threshold",
          priority: Math.min(
            100,
            90 + thresholds.energyLow - state.infrastructure.energy,
          ),
          riskTier: "high",
        }),
      );
    }

    if (state.weather.pollution > thresholds.pollutionHigh) {
      observations.push(
        createObservation({
          state,
          agentId: "civitas",
          kind: "threshold",
          metric: "pollution",
          value: state.weather.pollution,
          threshold: thresholds.pollutionHigh,
          summary: "Pollution exceeded the environmental threshold",
          priority: Math.min(
            100,
            75 + state.weather.pollution - thresholds.pollutionHigh,
          ),
          riskTier: "medium",
        }),
      );
    }

    if (observations.length > 0 || !shouldObserveRoutine("civitas", state, context)) {
      return observations;
    }

    const optimizeEnergy =
      randomUnit(context.seed, state.tick, "agent.civitas.metric") > 0.66;
    return [
      createObservation({
        state,
        agentId: "civitas",
        kind: "routine",
        metric: optimizeEnergy ? "energy" : "traffic",
        value: optimizeEnergy
          ? state.infrastructure.energy
          : state.infrastructure.traffic,
        summary: "Routine infrastructure optimization review",
        priority: 32,
        riskTier: "low",
      }),
    ];
  },
  propose(observation, state, context) {
    const delta =
      observation.metric === "energy"
        ? observation.kind === "threshold"
          ? 8
          : 2
        : observation.metric === "traffic"
          ? observation.kind === "threshold"
            ? -5
            : -2
          : -5;

    return [
      createProposal(observation, state, context, {
        delta,
        rationale:
          observation.kind === "threshold"
            ? `Apply a bounded ${observation.metric} threshold response`
            : "Apply a low-risk infrastructure optimization",
      }),
    ];
  },
};
