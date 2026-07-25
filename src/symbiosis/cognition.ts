import {
  fingerprint,
} from "@/simulation";
import {
  COGNITIVE_DECISION_SCHEMA_VERSION,
  type CognitiveDecision,
  type PreferenceDisposition,
} from "./contracts";
import type {
  CognitiveCandidate,
} from "./engine";

export interface CognitiveProviderResult {
  provider: string;
  model: string;
  mode: "thinking" | "non-thinking";
  finalAnswer: {
    disposition: PreferenceDisposition;
    action: "negotiate-shared-community-task";
    reasonCode: string;
  };
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  billing?: NonNullable<CognitiveDecision["billing"]>;
}

export interface CognitiveProvider {
  readonly id: string;
  decide(
    candidate: CognitiveCandidate,
    mode: "flash" | "pro",
  ): Promise<CognitiveProviderResult>;
}

export interface CognitiveBudgetPolicy {
  monthlyCapUsd: number;
  routineReductionThreshold: number;
  proRestrictionThreshold: number;
}

export const DEFAULT_COGNITIVE_BUDGET: CognitiveBudgetPolicy = {
  monthlyCapUsd: 300,
  routineReductionThreshold: 0.7,
  proRestrictionThreshold: 0.9,
};

export const DEEPSEEK_PROVIDER_ID = "deepseek-chat-completions" as const;
export const DEEPSEEK_V4_PRICING_VERSION =
  "deepseek-v4-usd-2026-04-24" as const;

const DEEPSEEK_V4_PRICING = {
  flash: {
    cacheHitInputPerMillionUsd: 0.0028,
    cacheMissInputPerMillionUsd: 0.14,
    outputPerMillionUsd: 0.28,
  },
  pro: {
    cacheHitInputPerMillionUsd: 0.003625,
    cacheMissInputPerMillionUsd: 0.435,
    outputPerMillionUsd: 0.87,
  },
} as const;

class BilledCognitiveProviderError extends Error {
  constructor(
    message: string,
    readonly billing: NonNullable<CognitiveDecision["billing"]>,
  ) {
    super(message);
    this.name = "BilledCognitiveProviderError";
  }
}

function boundedDisposition(value: unknown): PreferenceDisposition {
  if (value === "engage" || value === "decline" || value === "reconsider") {
    return value;
  }
  throw new Error("Cognitive provider returned an invalid disposition");
}

function nonNegativeTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function deterministicDisposition(
  candidate: CognitiveCandidate,
): PreferenceDisposition {
  const digest = fingerprint(candidate);
  const bucket = Number.parseInt(digest.slice(0, 8), 16) / 0xffffffff;
  return bucket < 0.16
    ? "decline"
    : bucket < 0.24
      ? "reconsider"
      : "engage";
}

export class DeterministicCognitiveProvider implements CognitiveProvider {
  readonly id = "nexus-deterministic-reference";

  async decide(
    candidate: CognitiveCandidate,
  ): Promise<CognitiveProviderResult> {
    const disposition = deterministicDisposition(candidate);
    return {
      provider: this.id,
      model: "bounded-resident-policy-v1",
      mode: "non-thinking",
      finalAnswer: {
        disposition,
        action: "negotiate-shared-community-task",
        reasonCode:
          disposition === "engage"
            ? "mutual-resource-opportunity"
            : disposition === "decline"
              ? "boundary-or-capacity"
              : "needs-more-context",
      },
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
    };
  }
}

interface DeepSeekResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
}

export class DeepSeekChatCompletionsProvider implements CognitiveProvider {
  readonly id = DEEPSEEK_PROVIDER_ID;

  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl?: string;
      timeoutMs?: number;
      fetchImpl?: typeof fetch;
    },
  ) {
    if (!options.apiKey.trim()) {
      throw new Error("DEEPSEEK_API_KEY is required");
    }
  }

  async decide(
    candidate: CognitiveCandidate,
    mode: "flash" | "pro",
  ): Promise<CognitiveProviderResult> {
    const startedAt = Date.now();
    const model =
      mode === "pro" ? "deepseek-v4-pro" : "deepseek-v4-flash";
    const thinking = mode === "pro";
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(
      `${(this.options.baseUrl ?? "https://api.deepseek.com").replace(
        /\/$/,
        "",
      )}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 12_000),
        body: JSON.stringify({
          model,
          stream: false,
          max_tokens: thinking ? 2_000 : 400,
          thinking: { type: thinking ? "enabled" : "disabled" },
          reasoning_effort: thinking ? "high" : undefined,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Return JSON only. You are a bounded synthetic resident. Choose one disposition: engage, decline, or reconsider. Never claim authority to mutate the world. Example JSON: {\"disposition\":\"engage\",\"action\":\"negotiate-shared-community-task\",\"reasonCode\":\"mutual-resource-opportunity\"}.",
            },
            {
              role: "user",
              content: JSON.stringify({
                synthetic: true,
                task: "express a preference about a reversible community task",
                candidate,
                allowedOutput: {
                  disposition: ["engage", "decline", "reconsider"],
                  action: ["negotiate-shared-community-task"],
                  reasonCode: "short-machine-code",
                },
              }),
            },
          ],
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`DeepSeek returned HTTP ${response.status}`);
    }
    const payload = await response.json() as DeepSeekResponse;
    const inputTokens = nonNegativeTokenCount(
      payload.usage?.prompt_tokens,
    );
    const outputTokens = nonNegativeTokenCount(
      payload.usage?.completion_tokens,
    );
    const cacheHitInputTokens = Math.min(
      inputTokens,
      nonNegativeTokenCount(
        payload.usage?.prompt_cache_hit_tokens,
      ),
    );
    const cacheMissInputTokens = Math.max(
      0,
      inputTokens - cacheHitInputTokens,
    );
    const pricing = DEEPSEEK_V4_PRICING[mode];
    const costUsd =
      (cacheHitInputTokens / 1_000_000) *
        pricing.cacheHitInputPerMillionUsd +
      (cacheMissInputTokens / 1_000_000) *
        pricing.cacheMissInputPerMillionUsd +
      (outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
    const billing = {
      provider: this.id,
      model: payload.model ?? model,
      pricingVersion: DEEPSEEK_V4_PRICING_VERSION,
      currency: "USD" as const,
      inputTokens,
      cacheHitInputTokens,
      cacheMissInputTokens,
      outputTokens,
      costUsd: Number(costUsd.toFixed(8)),
    };
    const choice = payload.choices?.[0];
    if (
      choice?.finish_reason !== "stop" ||
      typeof choice.message?.content !== "string" ||
      !choice.message.content.trim()
    ) {
      throw new BilledCognitiveProviderError(
        "DeepSeek returned no complete final JSON answer",
        billing,
      );
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(choice.message.content) as Record<string, unknown>;
    } catch {
      throw new BilledCognitiveProviderError(
        "DeepSeek returned invalid final JSON",
        billing,
      );
    }
    let disposition: PreferenceDisposition;
    try {
      disposition = boundedDisposition(parsed.disposition);
    } catch {
      throw new BilledCognitiveProviderError(
        "DeepSeek final answer failed the disposition schema",
        billing,
      );
    }
    if (
      parsed.action !== "negotiate-shared-community-task" ||
      typeof parsed.reasonCode !== "string" ||
      parsed.reasonCode.length > 120
    ) {
      throw new BilledCognitiveProviderError(
        "DeepSeek final answer failed the action schema",
        billing,
      );
    }
    return {
      provider: this.id,
      model: payload.model ?? model,
      mode: thinking ? "thinking" : "non-thinking",
      finalAnswer: {
        disposition,
        action: "negotiate-shared-community-task",
        reasonCode: parsed.reasonCode,
      },
      inputTokens,
      outputTokens,
      costUsd: billing.costUsd,
      latencyMs: Date.now() - startedAt,
      billing,
    };
  }
}

export class CognitiveGateway {
  private readonly fallback = new DeterministicCognitiveProvider();

  constructor(
    private readonly provider: CognitiveProvider,
    private readonly budget: CognitiveBudgetPolicy =
      DEFAULT_COGNITIVE_BUDGET,
  ) {}

  get configuredProviderId(): string {
    return this.provider.id;
  }

  async decide(
    candidate: CognitiveCandidate,
    currentMonthSpendUsd: number,
  ): Promise<CognitiveDecision> {
    const usageRatio =
      currentMonthSpendUsd / this.budget.monthlyCapUsd;
    const requestedMode =
      candidate.context.relationshipConflict >= 40 ||
      candidate.turn % 30 === 0
        ? "pro"
        : "flash";
    const shouldFallback =
      usageRatio >= 1 ||
      (
        usageRatio >= this.budget.routineReductionThreshold &&
        requestedMode === "flash" &&
        candidate.turn % 2 === 1
      ) ||
      (
        usageRatio >= this.budget.proRestrictionThreshold &&
        requestedMode === "pro" &&
        candidate.context.relationshipConflict < 70
      );
    let result: CognitiveProviderResult;
    let degradationReason: string | undefined;
    let externalCallAttempted = false;
    let billing: CognitiveDecision["billing"];
    try {
      if (shouldFallback) {
        throw new Error(
          usageRatio >= 1
            ? "monthly-budget-exhausted"
            : "budget-degradation",
        );
      }
      externalCallAttempted = true;
      result = await this.provider.decide(candidate, requestedMode);
      billing = result.billing;
    } catch (error) {
      if (error instanceof BilledCognitiveProviderError) {
        billing = error.billing;
      }
      result = await this.fallback.decide(candidate);
      degradationReason =
        error instanceof Error ? error.message : "provider-failure";
    }
    return {
      schemaVersion: COGNITIVE_DECISION_SCHEMA_VERSION,
      id: `${candidate.seasonId}-decision-${String(candidate.turn).padStart(
        4,
        "0",
      )}-${candidate.residentId}`,
      seasonId: candidate.seasonId,
      turn: candidate.turn,
      residentId: candidate.residentId,
      provider: result.provider,
      model: result.model,
      mode: result.mode,
      promptVersion: "symbiosis-cognition-1.0.0",
      contextSummarySha256: fingerprint(candidate),
      outputSchema: "nexus.cognitive-action.v1",
      finalAnswer: result.finalAnswer,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
      requestedProvider: this.provider.id,
      externalCallAttempted,
      billing,
      degradationReason,
      reasoningContentStored: false,
    };
  }
}

export function cognitiveDecisionCostUsd(
  decision: CognitiveDecision,
): number {
  return decision.billing?.costUsd ?? decision.costUsd;
}
