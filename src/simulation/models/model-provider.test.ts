// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  approvalPolicyForRisk,
  assessModelRisk,
  deterministicMockProvider,
  executeModelWithFallback,
  validateModelProposal,
} from "@/simulation";
import type {
  ModelBudgets,
  ModelProvider,
  ModelRequest,
} from "@/simulation";

const request: ModelRequest = {
  requestId: "model-test",
  tick: 12,
  seed: "model-test-seed",
  agentId: "atlas",
  promptVersion: "prompt-test",
  policyVersion: "policy-test",
  city: {
    population: 1,
    gdp: 100,
    happiness: 70,
    pollution: 30,
    crime: 50,
    traffic: 50,
    energy: 80,
    water: 80,
    internet: 90,
    medical: 80,
  },
};

const budgets: ModelBudgets = {
  maxTokensPerProposal: 200,
  maxCostUsdPerProposal: 0.01,
  timeoutMs: 50,
};

describe("model provider runtime", () => {
  it("produces deterministic structured output", async () => {
    const first = await executeModelWithFallback(
      deterministicMockProvider,
      request,
      budgets,
    );
    const second = await executeModelWithFallback(
      deterministicMockProvider,
      request,
      budgets,
    );

    expect(second).toEqual(first);
    expect(first.proposal.agentId).toBe("atlas");
    expect(first.proposal.metric).toBe("crime");
  });

  it("falls back when a provider returns malformed output", async () => {
    const malformedProvider: ModelProvider = {
      id: "malformed-provider",
      model: "broken-model",
      async generate() {
        return {
          providerId: this.id,
          model: this.model,
          output: { arbitrary: true },
          usage: { tokenCount: 10, costUsd: 0, latencyMs: 1 },
        };
      },
    };

    const result = await executeModelWithFallback(
      malformedProvider,
      request,
      budgets,
    );

    expect(result.status).toBe("fallback");
    expect(result.providerId).toBe(deterministicMockProvider.id);
    expect(result.fallbackReason).toContain("proposal schema");
  });

  it("falls back on timeout and budget violations", async () => {
    const slowProvider: ModelProvider = {
      id: "slow-provider",
      model: "slow-model",
      generate: () => new Promise(() => undefined),
    };
    const timeoutResult = await executeModelWithFallback(
      slowProvider,
      request,
      { ...budgets, timeoutMs: 5 },
    );
    expect(timeoutResult.status).toBe("fallback");
    expect(timeoutResult.fallbackReason).toContain("timed out");

    const expensiveProvider: ModelProvider = {
      id: "expensive-provider",
      model: "expensive-model",
      async generate() {
        return {
          providerId: this.id,
          model: this.model,
          output: {
            agentId: "atlas",
            metric: "crime",
            delta: -1,
            rationale: "Valid but too expensive",
            confidence: 0.9,
          },
          usage: { tokenCount: 500, costUsd: 1, latencyMs: 1 },
        };
      },
    };
    const budgetResult = await executeModelWithFallback(
      expensiveProvider,
      request,
      budgets,
    );
    expect(budgetResult.status).toBe("fallback");
    expect(budgetResult.fallbackReason).toContain("token budget");
  });

  it("rejects capability violations and applies risk-tier policy", () => {
    expect(() =>
      validateModelProposal(
        {
          agentId: "atlas",
          metric: "energy",
          delta: 1,
          rationale: "Attempt unauthorized infrastructure change",
          confidence: 0.9,
        },
        "atlas",
      ),
    ).toThrow("capability");

    const mediumProposal = validateModelProposal(
      {
        agentId: "atlas",
        metric: "crime",
        delta: -4,
        rationale: "Bounded security action",
        confidence: 0.9,
      },
      "atlas",
    );
    expect(assessModelRisk(mediumProposal)).toBe("medium");
    expect(approvalPolicyForRisk("low")).toBe("auto-approve");
    expect(approvalPolicyForRisk("medium")).toBe("human-approval");
    expect(approvalPolicyForRisk("critical")).toBe("forbidden");
  });
});
