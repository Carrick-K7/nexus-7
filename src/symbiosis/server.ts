import {
  readFileSync,
} from "node:fs";
import {
  getExperimentService,
} from "@/experiments/server";
import {
  CognitiveGateway,
  DeepSeekChatCompletionsProvider,
} from "./cognition";
import {
  InMemoryWorldRepository,
} from "./memory-repository";
import {
  PostgresWorldRepository,
} from "./postgres-repository";
import {
  WorldService,
} from "./service";

interface WorldGlobal {
  service?: WorldService;
  initializing?: Promise<WorldService>;
}

const worldGlobal = globalThis as typeof globalThis & {
  __nexusSymbiosisWorld?: WorldGlobal;
};

function deepSeekApiKey(): string {
  const direct = process.env.DEEPSEEK_API_KEY?.trim();
  if (direct) return direct;
  const path = process.env.DEEPSEEK_API_KEY_FILE?.trim();
  return path ? readFileSync(path, "utf8").trim() : "";
}

export async function getWorldService(): Promise<WorldService> {
  const state =
    worldGlobal.__nexusSymbiosisWorld ??
    (worldGlobal.__nexusSymbiosisWorld = {});
  if (state.service) return state.service;
  if (!state.initializing) {
    state.initializing = (async () => {
      await getExperimentService();
      const databaseUrl =
        process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
      const repository = databaseUrl
        ? new PostgresWorldRepository(databaseUrl)
        : new InMemoryWorldRepository();
      const providerName =
        process.env.SYMBIOSIS_COGNITIVE_PROVIDER ?? "deterministic";
      const cognitiveGateway =
        providerName === "deepseek"
          ? new CognitiveGateway(
              new DeepSeekChatCompletionsProvider({
                apiKey: deepSeekApiKey(),
                baseUrl: process.env.DEEPSEEK_BASE_URL,
                timeoutMs: Number(
                  process.env.SYMBIOSIS_MODEL_TIMEOUT_MS ?? 12_000,
                ),
              }),
              {
                monthlyCapUsd: Number(
                  process.env.SYMBIOSIS_MONTHLY_BUDGET_USD ?? 300,
                ),
                routineReductionThreshold: 0.7,
                proRestrictionThreshold: 0.9,
              },
            )
          : undefined;
      const service = new WorldService(repository, {
        seasonId: process.env.SYMBIOSIS_SEASON_ID,
        seed: process.env.SYMBIOSIS_SEED,
        cognitiveGateway,
      });
      await service.initialize();
      state.service = service;
      return service;
    })();
  }
  return state.initializing;
}
