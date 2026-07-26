import {
  fingerprint,
  randomUnit,
} from "@/simulation";
import {
  COGNITIVE_DECISION_SCHEMA_VERSION,
  COGNITIVE_SHADOW_SCHEMA_VERSION,
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
  readonly external?: boolean;
  decide(
    candidate: CognitiveCandidate,
    mode: "flash" | "pro",
    request?: {
      contractVersion: "nexus.cognitive-provider.v1";
      idempotencyKey: string;
    },
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

export interface CognitiveShadowPolicy {
  provider: CognitiveProvider;
  monthlyCapUsd: number;
}

export const DEEPSEEK_PROVIDER_ID = "deepseek-chat-completions" as const;
export const DIVERSITY_REFERENCE_PROVIDER_ID =
  "nexus-diversity-reference" as const;
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
  seed?: string,
): PreferenceDisposition {
  const bucket = seed
    ? randomUnit(
        seed,
        candidate.turn,
        `${candidate.relationshipId}:preference`,
      )
    : Number.parseInt(
        fingerprint(candidate).slice(0, 8),
        16,
      ) / 0xffffffff;
  return bucket < 0.16
    ? "decline"
    : bucket < 0.24
      ? "reconsider"
      : "engage";
}

export class DeterministicCognitiveProvider implements CognitiveProvider {
  readonly id = "nexus-deterministic-reference";

  constructor(private readonly seed?: string) {}

  async decide(
    candidate: CognitiveCandidate,
  ): Promise<CognitiveProviderResult> {
    const disposition = deterministicDisposition(candidate, this.seed);
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

export class DiversityReferenceCognitiveProvider
implements CognitiveProvider {
  readonly id = DIVERSITY_REFERENCE_PROVIDER_ID;

  async decide(
    candidate: CognitiveCandidate,
  ): Promise<CognitiveProviderResult> {
    const digest = fingerprint({
      provider: this.id,
      candidate,
    });
    const bucket =
      Number.parseInt(digest.slice(0, 8), 16) / 0xffffffff;
    const disposition =
      bucket < 0.22
        ? "decline"
        : bucket < 0.38
          ? "reconsider"
          : "engage";
    return {
      provider: this.id,
      model: "bounded-diversity-policy-v1",
      mode: "non-thinking",
      finalAnswer: {
        disposition,
        action: "negotiate-shared-community-task",
        reasonCode:
          disposition === "engage"
            ? "alternative-mutual-opportunity"
            : disposition === "decline"
              ? "alternative-boundary-priority"
              : "alternative-context-request",
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
  readonly external = true;

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
    request?: {
      contractVersion: "nexus.cognitive-provider.v1";
      idempotencyKey: string;
    },
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
          "X-Nexus-Contract":
            request?.contractVersion ??
            "nexus.cognitive-provider.v1",
          "X-Nexus-Idempotency-Key":
            request?.idempotencyKey ??
            `nexus-cognition-${fingerprint({
              provider: this.id,
              candidate,
              mode,
            })}`,
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
  private readonly fallback: DeterministicCognitiveProvider;

  constructor(
    private readonly provider: CognitiveProvider,
    private readonly budget: CognitiveBudgetPolicy =
      DEFAULT_COGNITIVE_BUDGET,
    private readonly shadow?: CognitiveShadowPolicy,
    fallbackSeed?: string,
  ) {
    if (
      !Number.isFinite(budget.monthlyCapUsd) ||
      budget.monthlyCapUsd < 0 ||
      !Number.isFinite(budget.routineReductionThreshold) ||
      budget.routineReductionThreshold < 0 ||
      budget.routineReductionThreshold > 1 ||
      !Number.isFinite(budget.proRestrictionThreshold) ||
      budget.proRestrictionThreshold < 0 ||
      budget.proRestrictionThreshold > 1
    ) {
      throw new Error(
        "Primary cognitive budget must use finite non-negative caps and thresholds from zero to one",
      );
    }
    if (
      shadow &&
      shadow.provider.id === provider.id
    ) {
      throw new Error(
        "Shadow provider must differ from the primary provider",
      );
    }
    if (
      shadow &&
      (
        !Number.isFinite(shadow.monthlyCapUsd) ||
        shadow.monthlyCapUsd < 0
      )
    ) {
      throw new Error(
        "Shadow monthly budget must be a finite non-negative number",
      );
    }
    this.fallback = new DeterministicCognitiveProvider(fallbackSeed);
  }

  get configuredProviderId(): string {
    return this.provider.id;
  }

  get configuredShadowProviderId(): string | null {
    return this.shadow?.provider.id ?? null;
  }

  async decide(
    candidate: CognitiveCandidate,
    currentMonthSpendUsd: number,
    currentShadowSpendUsd = 0,
  ): Promise<CognitiveDecision> {
    const usageRatio =
      currentMonthSpendUsd / this.budget.monthlyCapUsd;
    const requestedMode =
      candidate.context.relationshipConflict >= 40 ||
      candidate.turn % 30 === 0
        ? "pro"
        : "flash";
    const providerRequestId = `nexus-cognition-${fingerprint({
      provider: this.provider.id,
      candidate,
      mode: requestedMode,
    })}`;
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
      externalCallAttempted = this.provider.external === true;
      result = await this.provider.decide(
        candidate,
        requestedMode,
        {
          contractVersion: "nexus.cognitive-provider.v1",
          idempotencyKey: providerRequestId,
        },
      );
      billing = result.billing;
    } catch (error) {
      if (error instanceof BilledCognitiveProviderError) {
        billing = error.billing;
      }
      result = await this.fallback.decide(candidate);
      degradationReason =
        error instanceof Error ? error.message : "provider-failure";
    }
    const decision: CognitiveDecision = {
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
      providerRequestId,
      externalCallAttempted,
      billing,
      degradationReason,
      reasoningContentStored: false,
    };
    if (this.shadow) {
      const shadowRequestId = `nexus-cognition-${fingerprint({
        provider: this.shadow.provider.id,
        candidate,
        mode: requestedMode,
        shadow: true,
      })}`;
      const primaryDisposition =
        decision.finalAnswer.disposition as PreferenceDisposition;
      const primaryUsedFallback = Boolean(degradationReason);
      if (currentShadowSpendUsd >= this.shadow.monthlyCapUsd) {
        decision.shadow = {
          schemaVersion: COGNITIVE_SHADOW_SCHEMA_VERSION,
          requestedProvider: this.shadow.provider.id,
          providerRequestId: shadowRequestId,
          status: "budget-skipped",
          externalCallAttempted: false,
          disagreesWithPrimary: null,
          primaryUsedFallback,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: 0,
          degradationReason: "shadow-monthly-budget-exhausted",
          reasoningContentStored: false,
        };
      } else {
        const shadowExternal =
          this.shadow.provider.external === true;
        try {
          const shadowResult =
            await this.shadow.provider.decide(
              candidate,
              requestedMode,
              {
                contractVersion: "nexus.cognitive-provider.v1",
                idempotencyKey: shadowRequestId,
              },
            );
          decision.shadow = {
            schemaVersion: COGNITIVE_SHADOW_SCHEMA_VERSION,
            requestedProvider: this.shadow.provider.id,
            providerRequestId: shadowRequestId,
            status: "observed",
            externalCallAttempted: shadowExternal,
            provider: shadowResult.provider,
            model: shadowResult.model,
            disposition: shadowResult.finalAnswer.disposition,
            disagreesWithPrimary:
              shadowResult.finalAnswer.disposition !==
              primaryDisposition,
            primaryUsedFallback,
            inputTokens: shadowResult.inputTokens,
            outputTokens: shadowResult.outputTokens,
            costUsd: shadowResult.costUsd,
            latencyMs: shadowResult.latencyMs,
            billing: shadowResult.billing,
            reasoningContentStored: false,
          };
        } catch (error) {
          const billed =
            error instanceof BilledCognitiveProviderError
              ? error.billing
              : undefined;
          decision.shadow = {
            schemaVersion: COGNITIVE_SHADOW_SCHEMA_VERSION,
            requestedProvider: this.shadow.provider.id,
            providerRequestId: shadowRequestId,
            status: billed ? "billed-invalid" : "provider-failed",
            externalCallAttempted: shadowExternal,
            provider: billed?.provider,
            model: billed?.model,
            disagreesWithPrimary: null,
            primaryUsedFallback,
            inputTokens: billed?.inputTokens ?? 0,
            outputTokens: billed?.outputTokens ?? 0,
            costUsd: billed?.costUsd ?? 0,
            latencyMs: 0,
            billing: billed,
            degradationReason:
              error instanceof Error
                ? error.message
                : "shadow-provider-failure",
            reasoningContentStored: false,
          };
        }
      }
    }
    return decision;
  }
}

export function cognitiveDecisionCostUsd(
  decision: CognitiveDecision,
): number {
  return decision.billing?.costUsd ?? decision.costUsd;
}

export function cognitiveShadowCostUsd(
  decision: CognitiveDecision,
): number {
  return decision.shadow?.billing?.costUsd ??
    decision.shadow?.costUsd ??
    0;
}

export function cognitiveDecisionTotalCostUsd(
  decision: CognitiveDecision,
): number {
  return cognitiveDecisionCostUsd(decision) +
    cognitiveShadowCostUsd(decision);
}
