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

function boundedDisposition(value: unknown): PreferenceDisposition {
  if (value === "engage" || value === "decline" || value === "reconsider") {
    return value;
  }
  throw new Error("Cognitive provider returned an invalid disposition");
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
  readonly id = "deepseek-chat-completions";

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
    const choice = payload.choices?.[0];
    if (
      choice?.finish_reason !== "stop" ||
      typeof choice.message?.content !== "string" ||
      !choice.message.content.trim()
    ) {
      throw new Error("DeepSeek returned no complete final JSON answer");
    }
    const parsed = JSON.parse(choice.message.content) as Record<
      string,
      unknown
    >;
    const disposition = boundedDisposition(parsed.disposition);
    if (
      parsed.action !== "negotiate-shared-community-task" ||
      typeof parsed.reasonCode !== "string" ||
      parsed.reasonCode.length > 120
    ) {
      throw new Error("DeepSeek final answer failed the action schema");
    }
    const inputTokens = payload.usage?.prompt_tokens ?? 0;
    const outputTokens = payload.usage?.completion_tokens ?? 0;
    const inputRate = mode === "pro" ? 0.435 : 0.14;
    const outputRate = mode === "pro" ? 0.87 : 0.28;
    const costUsd =
      (inputTokens / 1_000_000) * inputRate +
      (outputTokens / 1_000_000) * outputRate;
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
      costUsd: Number(costUsd.toFixed(8)),
      latencyMs: Date.now() - startedAt,
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
    try {
      if (shouldFallback) {
        throw new Error(
          usageRatio >= 1
            ? "monthly-budget-exhausted"
            : "budget-degradation",
        );
      }
      result = await this.provider.decide(candidate, requestedMode);
    } catch (error) {
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
      degradationReason,
      reasoningContentStored: false,
    };
  }
}
