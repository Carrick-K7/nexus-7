// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  CognitiveGateway,
  DeepSeekChatCompletionsProvider,
} from "./cognition";
import {
  cognitiveCandidatesForTurn,
  createInitialWorld,
} from "./engine";

function candidate() {
  const initial = createInitialWorld();
  return cognitiveCandidatesForTurn(
    initial.season,
    initial.residents,
    initial.snapshot,
  )[0];
}

describe("bounded cognitive gateway", () => {
  it("accepts DeepSeek final JSON but never persists reasoning content", async () => {
    const provider = new DeepSeekChatCompletionsProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            model: "deepseek-v4-flash",
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    disposition: "engage",
                    action: "negotiate-shared-community-task",
                    reasonCode: "shared-maintenance",
                  }),
                  reasoning_content: "must not be copied",
                },
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 20,
              prompt_cache_hit_tokens: 40,
              prompt_cache_miss_tokens: 60,
            },
          }),
          { status: 200 },
        ),
    });
    const decision = await new CognitiveGateway(provider).decide(
      candidate(),
      0,
    );

    expect(decision.provider).toBe("deepseek-chat-completions");
    expect(decision.finalAnswer.disposition).toBe("engage");
    expect(decision).toMatchObject({
      requestedProvider: "deepseek-chat-completions",
      externalCallAttempted: true,
      billing: {
        pricingVersion: "deepseek-v4-usd-2026-04-24",
        currency: "USD",
        inputTokens: 100,
        cacheHitInputTokens: 40,
        cacheMissInputTokens: 60,
        outputTokens: 20,
        costUsd: 0.00001411,
      },
    });
    expect(decision.reasoningContentStored).toBe(false);
    expect(JSON.stringify(decision)).not.toContain("must not be copied");
  });

  it("retains billed usage when invalid DeepSeek output falls back", async () => {
    const provider = new DeepSeekChatCompletionsProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            model: "deepseek-v4-pro",
            choices: [
              {
                finish_reason: "stop",
                message: { content: "not-json" },
              },
            ],
            usage: {
              prompt_tokens: 80,
              completion_tokens: 10,
              prompt_cache_hit_tokens: 20,
              prompt_cache_miss_tokens: 60,
            },
          }),
          { status: 200 },
        ),
    });
    const decision = await new CognitiveGateway(provider).decide(
      { ...candidate(), turn: 30 },
      0,
    );

    expect(decision.provider).toBe("nexus-deterministic-reference");
    expect(decision.degradationReason).toBe(
      "DeepSeek returned invalid final JSON",
    );
    expect(decision.externalCallAttempted).toBe(true);
    expect(decision.billing).toMatchObject({
      provider: "deepseek-chat-completions",
      model: "deepseek-v4-pro",
      inputTokens: 80,
      outputTokens: 10,
      costUsd: 0.00003487,
    });
  });

  it("falls back deterministically on provider failure and at the budget cap", async () => {
    const provider = new DeepSeekChatCompletionsProvider({
      apiKey: "test-key",
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
    });
    const gateway = new CognitiveGateway(provider);
    const failed = await gateway.decide(candidate(), 0);
    const capped = await gateway.decide(candidate(), 300);

    expect(failed.provider).toBe("nexus-deterministic-reference");
    expect(failed.degradationReason).toContain("503");
    expect(failed.externalCallAttempted).toBe(true);
    expect(failed.billing).toBeUndefined();
    expect(capped.provider).toBe("nexus-deterministic-reference");
    expect(capped.degradationReason).toBe("monthly-budget-exhausted");
    expect(capped.externalCallAttempted).toBe(false);
  });
});
