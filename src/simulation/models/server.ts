import {
  deterministicMockProvider,
} from "./mock-provider";
import {
  OpenAIResponsesModelProvider,
} from "./openai-provider";
import type {
  ModelBudgets,
  ModelProvider,
} from "./types";
import {
  CITY_POLICY_PROMPT_VERSION,
} from "./prompts";

export interface ServerModelConfiguration {
  provider: ModelProvider;
  budgets: ModelBudgets;
  promptVersion: string;
  policyVersion: string;
  configuredProvider: "deterministic-mock" | "openai";
}

function finiteEnvironmentNumber(
  name: string,
  fallback: number,
): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getServerModelConfiguration(): ServerModelConfiguration {
  const configuredProvider =
    process.env.NEXUS_MODEL_PROVIDER === "openai"
      ? "openai"
      : "deterministic-mock";
  let provider: ModelProvider = deterministicMockProvider;

  if (configuredProvider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "NEXUS_MODEL_PROVIDER=openai requires OPENAI_API_KEY",
      );
    }
    provider = new OpenAIResponsesModelProvider({
      apiKey,
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
      baseUrl: process.env.OPENAI_BASE_URL,
      inputCostPerMillion: finiteEnvironmentNumber(
        "OPENAI_INPUT_COST_PER_MILLION",
        1,
      ),
      outputCostPerMillion: finiteEnvironmentNumber(
        "OPENAI_OUTPUT_COST_PER_MILLION",
        6,
      ),
    });
  }

  return {
    provider,
    configuredProvider,
    promptVersion:
      process.env.NEXUS_MODEL_PROMPT_VERSION ?? CITY_POLICY_PROMPT_VERSION,
    policyVersion:
      process.env.NEXUS_MODEL_POLICY_VERSION ?? "model-policy-1.2.0",
    budgets: {
      maxTokensPerProposal: finiteEnvironmentNumber(
        "NEXUS_MODEL_MAX_TOKENS",
        512,
      ),
      maxCostUsdPerProposal: finiteEnvironmentNumber(
        "NEXUS_MODEL_MAX_COST_USD",
        0.05,
      ),
      timeoutMs: finiteEnvironmentNumber(
        "NEXUS_MODEL_TIMEOUT_MS",
        8_000,
      ),
    },
  };
}
