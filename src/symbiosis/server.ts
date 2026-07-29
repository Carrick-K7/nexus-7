import {
  readFileSync,
} from "node:fs";
import {
  getExperimentService,
} from "@/experiments/server";
import {
  CognitiveGateway,
  DeepSeekChatCompletionsProvider,
  DeterministicCognitiveProvider,
  DiversityReferenceCognitiveProvider,
  type CognitiveProvider,
} from "./cognition";
import {
  DEFAULT_SYMBIOSIS_SEASON_ID,
} from "./contracts";
import {
  InMemoryWorldRepository,
} from "./memory-repository";
import {
  PostgresWorldRepository,
} from "./postgres-repository";
import {
  WorldService,
} from "./service";
import {
  RECOVERY_EVIDENCE_SCHEMA_VERSION,
  verifyRecoveryEvidence,
  type SymbiosisRecoveryEvidence,
} from "./reliability";

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

function deepSeekProvider(): DeepSeekChatCompletionsProvider {
  return new DeepSeekChatCompletionsProvider({
    apiKey: deepSeekApiKey(),
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    timeoutMs: Number(
      process.env.SYMBIOSIS_MODEL_TIMEOUT_MS ?? 12_000,
    ),
  });
}

export function primaryProviderName(
  value: string | undefined,
): "deterministic" | "deepseek" {
  const configured = value?.trim() || "deterministic";
  if (
    configured !== "deterministic" &&
    configured !== "deepseek"
  ) {
    throw new Error(
      `Unsupported SYMBIOSIS_COGNITIVE_PROVIDER: ${configured}`,
    );
  }
  return configured;
}

export function shadowProviderName(
  value: string | undefined,
): "none" | "reference" | "deepseek" {
  const configured = value?.trim() || "none";
  if (
    configured !== "none" &&
    configured !== "reference" &&
    configured !== "deepseek"
  ) {
    throw new Error(
      `Unsupported SYMBIOSIS_SHADOW_PROVIDER: ${configured}`,
    );
  }
  return configured;
}

export function symbiosisTurnIntervalMs(
  value: string | undefined,
): number {
  const parsed = Number(value ?? 3_600_000);
  if (!Number.isFinite(parsed) || parsed < 60_000) {
    throw new Error(
      "SYMBIOSIS_TURN_INTERVAL_MS must be a finite number of at least 60000",
    );
  }
  return parsed;
}

function configuredRecoveryEvidence():
  | SymbiosisRecoveryEvidence
  | undefined {
  const path =
    process.env.SYMBIOSIS_RECOVERY_EVIDENCE_FILE?.trim();
  if (!path) return undefined;
  const evidence = JSON.parse(
    readFileSync(path, "utf8"),
  ) as SymbiosisRecoveryEvidence;
  if (
    evidence.schemaVersion !== RECOVERY_EVIDENCE_SCHEMA_VERSION ||
    !verifyRecoveryEvidence(evidence)
  ) {
    throw new Error(
      "SYMBIOSIS_RECOVERY_EVIDENCE_FILE has an unsupported schema",
    );
  }
  return evidence;
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
        primaryProviderName(
          process.env.SYMBIOSIS_COGNITIVE_PROVIDER,
        );
      const seed =
        process.env.SYMBIOSIS_SEED ??
        "symbiotic-shenzhen-2026-q3-seed";
      const primaryProvider: CognitiveProvider =
        providerName === "deepseek"
          ? deepSeekProvider()
          : new DeterministicCognitiveProvider(seed);
      const shadowName =
        shadowProviderName(
          process.env.SYMBIOSIS_SHADOW_PROVIDER,
        );
      const shadowProvider: CognitiveProvider | undefined =
        shadowName === "deepseek"
          ? deepSeekProvider()
          : shadowName === "reference"
            ? new DiversityReferenceCognitiveProvider()
            : undefined;
      const cognitiveGateway = new CognitiveGateway(
        primaryProvider,
        {
          monthlyCapUsd: Number(
            process.env.SYMBIOSIS_MONTHLY_BUDGET_USD ?? 300,
          ),
          routineReductionThreshold: 0.7,
          proRestrictionThreshold: 0.9,
        },
        shadowProvider
          ? {
              provider: shadowProvider,
              monthlyCapUsd: Number(
                process.env
                  .SYMBIOSIS_SHADOW_MONTHLY_BUDGET_USD ?? 30,
              ),
            }
          : undefined,
        seed,
      );
      const service = new WorldService(repository, {
        seasonId:
          process.env.SYMBIOSIS_SEASON_ID ??
          DEFAULT_SYMBIOSIS_SEASON_ID,
        seed,
        cognitiveGateway,
        runtimeEvidence: {
          workerId:
            process.env.SYMBIOSIS_WORKER_ID ??
            "nexus7-symbiosis-reference",
          deploymentRevision:
            process.env.NEXUS_RELEASE_REVISION ??
            "unbound-development",
          intervalMs: symbiosisTurnIntervalMs(
            process.env.SYMBIOSIS_TURN_INTERVAL_MS,
          ),
        },
        recoveryEvidence: configuredRecoveryEvidence(),
      });
      await service.initialize();
      state.service = service;
      return service;
    })();
  }
  return state.initializing;
}
