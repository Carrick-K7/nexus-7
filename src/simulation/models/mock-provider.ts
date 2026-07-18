import { randomUnit } from "../core/random";
import type {
  ModelProvider,
  ModelProviderResult,
} from "./types";

const PROPOSALS = {
  atlas: {
    metric: "crime",
    delta: -4,
    rationale: "Model recommends a bounded security intervention",
  },
  economica: {
    metric: "gdp",
    delta: 4,
    rationale: "Model recommends reallocating economic capacity",
  },
  civitas: {
    metric: "traffic",
    delta: -4,
    rationale: "Model recommends a bounded infrastructure reroute",
  },
  spectre: {
    metric: "internet",
    delta: 3,
    rationale: "Model recommends reinforcing network intelligence",
  },
} as const;

export const deterministicMockProvider: ModelProvider = {
  id: "deterministic-mock",
  model: "nexus-mock-1",
  async generate(request): Promise<ModelProviderResult> {
    const proposal = PROPOSALS[request.agentId];
    const confidence =
      Math.round(
        (0.72 +
          randomUnit(
            request.seed,
            request.tick,
            `model.${request.agentId}.confidence`,
          ) *
            0.2) *
          100,
      ) / 100;
    const tokenCount =
      80 +
      Math.floor(
        randomUnit(
          request.seed,
          request.tick,
          `model.${request.agentId}.tokens`,
        ) * 40,
      );
    const latencyMs =
      12 +
      Math.floor(
        randomUnit(
          request.seed,
          request.tick,
          `model.${request.agentId}.latency`,
        ) * 18,
      );

    return {
      providerId: this.id,
      model: this.model,
      output: {
        agentId: request.agentId,
        metric: proposal.metric,
        delta: proposal.delta,
        rationale: proposal.rationale,
        confidence,
      },
      usage: {
        tokenCount,
        costUsd: 0,
        latencyMs,
      },
    };
  },
};
