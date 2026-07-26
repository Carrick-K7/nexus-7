// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  CognitiveGateway,
  DeepSeekChatCompletionsProvider,
  DeterministicCognitiveProvider,
  DiversityReferenceCognitiveProvider,
} from "./cognition";
import {
  cognitiveCandidatesForTurn,
  createInitialWorld,
  settleNextTurn,
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
    const requestIds: string[] = [];
    const provider = new DeepSeekChatCompletionsProvider({
      apiKey: "test-key",
      fetchImpl: async (_input, init) => {
        requestIds.push(
          new Headers(init?.headers).get(
            "X-Nexus-Idempotency-Key",
          ) ?? "",
        );
        expect(
          new Headers(init?.headers).get("X-Nexus-Contract"),
        ).toBe("nexus.cognitive-provider.v1");
        return new Response(
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
        );
      },
    });
    const gateway = new CognitiveGateway(provider);
    const decision = await gateway.decide(candidate(), 0);
    const repeated = await gateway.decide(candidate(), 0);

    expect(decision.provider).toBe("deepseek-chat-completions");
    expect(decision.finalAnswer.disposition).toBe("engage");
    expect(decision).toMatchObject({
      requestedProvider: "deepseek-chat-completions",
      providerRequestId: requestIds[0],
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
    expect(requestIds[0]).toMatch(/^nexus-cognition-/);
    expect(requestIds[1]).toBe(requestIds[0]);
    expect(repeated.providerRequestId).toBe(
      decision.providerRequestId,
    );
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

  it("rejects invalid primary and shadow budget configuration", () => {
    const provider = new DeterministicCognitiveProvider();
    expect(
      () =>
        new CognitiveGateway(provider, {
          monthlyCapUsd: Number.NaN,
          routineReductionThreshold: 0.7,
          proRestrictionThreshold: 0.9,
        }),
    ).toThrow("Primary cognitive budget");
    expect(
      () =>
        new CognitiveGateway(
          provider,
          undefined,
          {
            provider: new DiversityReferenceCognitiveProvider(),
            monthlyCapUsd: -1,
          },
        ),
    ).toThrow("Shadow monthly budget");
  });

  it("records a budget-bounded shadow comparison without changing the world", async () => {
    const initial = createInitialWorld({
      seasonId: "shadow-world",
      seed: "shadow-seed",
    });
    const candidate = cognitiveCandidatesForTurn(
      initial.season,
      initial.residents,
      initial.snapshot,
    )[0];
    const gateway = new CognitiveGateway(
      new DeterministicCognitiveProvider(initial.season.seed),
      undefined,
      {
        provider: new DiversityReferenceCognitiveProvider(),
        monthlyCapUsd: 1,
      },
      initial.season.seed,
    );
    const decision = await gateway.decide(candidate, 0, 0);
    const withoutShadow = {
      ...decision,
      shadow: undefined,
    };
    const comparedWorld = settleNextTurn(
      initial.season,
      initial.residents,
      initial.snapshot,
      [decision],
    );
    const controlWorld = settleNextTurn(
      initial.season,
      initial.residents,
      initial.snapshot,
      [withoutShadow],
    );
    const engineReference = settleNextTurn(
      initial.season,
      initial.residents,
      initial.snapshot,
    );

    expect(decision.externalCallAttempted).toBe(false);
    expect(decision.shadow).toMatchObject({
      requestedProvider: "nexus-diversity-reference",
      status: "observed",
      externalCallAttempted: false,
      provider: "nexus-diversity-reference",
      primaryUsedFallback: false,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      reasoningContentStored: false,
    });
    expect(comparedWorld.snapshot).toEqual(controlWorld.snapshot);
    expect(comparedWorld.snapshot.fingerprint).toBe(
      engineReference.snapshot.fingerprint,
    );

    const skipped = await gateway.decide(candidate, 0, 1);
    expect(skipped.shadow).toMatchObject({
      status: "budget-skipped",
      externalCallAttempted: false,
      degradationReason: "shadow-monthly-budget-exhausted",
    });
  });

  it("retains billed DeepSeek shadow usage while preserving the primary decision", async () => {
    const shadow = new DeepSeekChatCompletionsProvider({
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
                    disposition: "decline",
                    action: "negotiate-shared-community-task",
                    reasonCode: "shadow-boundary",
                  }),
                },
              },
            ],
            usage: {
              prompt_tokens: 120,
              completion_tokens: 10,
              prompt_cache_hit_tokens: 20,
            },
          }),
          { status: 200 },
        ),
    });
    const gateway = new CognitiveGateway(
      new DeterministicCognitiveProvider("shadow-deepseek-seed"),
      undefined,
      { provider: shadow, monthlyCapUsd: 1 },
      "shadow-deepseek-seed",
    );
    const decision = await gateway.decide(candidate(), 0, 0);

    expect(decision.provider).toBe("nexus-deterministic-reference");
    expect(decision.shadow).toMatchObject({
      status: "observed",
      externalCallAttempted: true,
      provider: "deepseek-chat-completions",
      disposition: "decline",
      inputTokens: 120,
      outputTokens: 10,
      billing: {
        provider: "deepseek-chat-completions",
        cacheHitInputTokens: 20,
        cacheMissInputTokens: 100,
        costUsd: 0.00001686,
      },
    });
    expect(JSON.stringify(decision)).not.toContain("reasoning_content");
  });

  it("contains a shadow outage without invoking a fallback or changing primary output", async () => {
    const gateway = new CognitiveGateway(
      new DeterministicCognitiveProvider("shadow-outage-seed"),
      undefined,
      {
        provider: {
          id: "unavailable-shadow",
          external: true,
          decide: async () => {
            throw new Error("shadow-provider-offline");
          },
        },
        monthlyCapUsd: 1,
      },
      "shadow-outage-seed",
    );
    const decision = await gateway.decide(candidate(), 0, 0);

    expect(decision.provider).toBe("nexus-deterministic-reference");
    expect(decision.degradationReason).toBeUndefined();
    expect(decision.shadow).toMatchObject({
      requestedProvider: "unavailable-shadow",
      status: "provider-failed",
      externalCallAttempted: true,
      disagreesWithPrimary: null,
      degradationReason: "shadow-provider-offline",
      costUsd: 0,
    });
  });
});
