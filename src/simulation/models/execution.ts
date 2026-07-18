import { deterministicMockProvider } from "./mock-provider";
import type {
  ModelBudgets,
  ModelExecution,
  ModelProvider,
  ModelRequest,
} from "./types";
import { validateModelProposal } from "./validation";

async function executeOnce(
  provider: ModelProvider,
  request: ModelRequest,
  budgets: ModelBudgets,
): Promise<ModelExecution> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error(`Model provider timed out after ${budgets.timeoutMs}ms`));
      }, budgets.timeoutMs);
    });
    const result = await Promise.race([
      provider.generate(request, controller.signal),
      timeoutPromise,
    ]);

    if (result.usage.tokenCount > budgets.maxTokensPerProposal) {
      throw new Error("Model token budget exceeded");
    }
    if (result.usage.costUsd > budgets.maxCostUsdPerProposal) {
      throw new Error("Model cost budget exceeded");
    }

    return {
      status: "success",
      proposal: validateModelProposal(result.output, request.agentId),
      providerId: result.providerId,
      model: result.model,
      usage: result.usage,
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function executeModelWithFallback(
  provider: ModelProvider,
  request: ModelRequest,
  budgets: ModelBudgets,
  fallbackProvider: ModelProvider = deterministicMockProvider,
): Promise<ModelExecution> {
  try {
    return await executeOnce(provider, request, budgets);
  } catch (error) {
    if (provider.id === fallbackProvider.id) {
      throw error;
    }

    const fallback = await executeOnce(fallbackProvider, request, budgets);
    return {
      ...fallback,
      status: "fallback",
      fallbackReason:
        error instanceof Error ? error.message : "Unknown provider failure",
    };
  }
}
