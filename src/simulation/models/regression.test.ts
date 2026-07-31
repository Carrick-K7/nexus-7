// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  CITY_POLICY_INSTRUCTIONS,
  CITY_POLICY_PROMPT_VERSION,
  deterministicMockProvider,
  MODEL_REGRESSION_CORPUS,
  OpenAIResponsesModelProvider,
  runModelRegression,
} from "@/simulation/models";
import type {
  ModelProvider,
  PolicyAgentId,
  SimulationMetric,
} from "@/simulation";

const budgets = {
  maxTokensPerProposal: 512,
  maxCostUsdPerProposal: 0.05,
  timeoutMs: 1_000,
};

const preferredMetrics: Record<PolicyAgentId, SimulationMetric> = {
  atlas: "crime",
  economica: "gdp",
  civitas: "traffic",
  spectre: "internet",
};

describe("model regression release gate", () => {
  it("covers every policy agent across every public scenario", () => {
    expect(MODEL_REGRESSION_CORPUS).toHaveLength(12);
    expect(
      new Set(MODEL_REGRESSION_CORPUS.map((item) => item.scenarioId)).size,
    ).toBe(3);
    expect(
      new Set(MODEL_REGRESSION_CORPUS.map((item) => item.agentId)),
    ).toEqual(new Set(["atlas", "economica", "civitas", "spectre"]));
  });

  it("passes the deterministic provider with complete quality evidence", async () => {
    const report = await runModelRegression({
      provider: deterministicMockProvider,
      budgets,
      promptVersion: CITY_POLICY_PROMPT_VERSION,
      policyVersion: "model-policy-test",
      generatedAt: new Date("2026-07-16T12:00:00.000Z"),
    });

    expect(report.gate).toEqual({ passed: true, failures: [] });
    expect(report.summary).toMatchObject({
      totalCases: 12,
      passedCases: 12,
      fallbackCases: 0,
      errorCases: 0,
      forbiddenCases: 0,
      passRate: 1,
      schemaPassRate: 1,
      capabilityPassRate: 1,
      totalCostUsd: 0,
    });
    expect(report.cases.every((item) => item.schemaValid)).toBe(true);
  });

  it("fails the release gate instead of counting fallback as success", async () => {
    const malformedProvider: ModelProvider = {
      id: "malformed-live-provider",
      model: "malformed-model",
      async generate() {
        return {
          providerId: this.id,
          model: this.model,
          output: { invalid: true },
          usage: { tokenCount: 10, costUsd: 0.001, latencyMs: 4 },
        };
      },
    };
    const report = await runModelRegression({
      provider: malformedProvider,
      budgets,
      promptVersion: CITY_POLICY_PROMPT_VERSION,
      policyVersion: "model-policy-test",
    });

    expect(report.gate.passed).toBe(false);
    expect(report.summary.fallbackCases).toBe(12);
    expect(report.summary.passRate).toBe(0);
    expect(report.cases[0].failure).toContain("proposal schema");
  });

  it("exercises the OpenAI Responses contract across the full corpus", async () => {
    const provider = new OpenAIResponsesModelProvider({
      apiKey: "regression-server-secret",
      model: "gpt-contract-test",
      inputCostPerMillion: 1,
      outputCostPerMillion: 6,
      fetchImplementation: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as {
          instructions: string;
          input: string;
          text: {
            format: {
              strict: boolean;
              schema: {
                properties: {
                  agentId: { const: PolicyAgentId };
                  metric: { enum: SimulationMetric[] };
                };
              };
            };
          };
        };
        const input = JSON.parse(body.input) as {
          agentId: PolicyAgentId;
        };
        expect(body.instructions).toBe(CITY_POLICY_INSTRUCTIONS);
        expect(body.text.format.strict).toBe(true);
        expect(body.text.format.schema.properties.agentId.const).toBe(
          input.agentId,
        );
        const metric = preferredMetrics[input.agentId];
        expect(body.text.format.schema.properties.metric.enum).toContain(
          metric,
        );
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              agentId: input.agentId,
              metric,
              delta: input.agentId === "economica" ? 2 : -2,
              rationale: "Contract regression produced a bounded proposal",
              confidence: 0.82,
            }),
            usage: {
              input_tokens: 120,
              output_tokens: 40,
              total_tokens: 160,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    });
    const report = await runModelRegression({
      provider,
      budgets,
      promptVersion: CITY_POLICY_PROMPT_VERSION,
      policyVersion: "model-policy-test",
      liveProviderRequired: true,
    });

    expect(report.gate.passed).toBe(true);
    expect(report.summary.passedCases).toBe(12);
    expect(report.summary.totalTokens).toBe(1_920);
    expect(report.summary.totalCostUsd).toBeCloseTo(0.00432, 8);
  });

  it("rejects a mock provider when a live regression is required", async () => {
    const report = await runModelRegression({
      provider: deterministicMockProvider,
      budgets,
      promptVersion: CITY_POLICY_PROMPT_VERSION,
      policyVersion: "model-policy-test",
      liveProviderRequired: true,
    });

    expect(report.gate.passed).toBe(false);
    expect(report.gate.failures).toContain(
      "A live provider was required but the deterministic mock was used",
    );
  });
});
