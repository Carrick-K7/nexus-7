import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  CITY_POLICY_PROMPT_VERSION,
  deterministicMockProvider,
  getServerModelConfiguration,
  runModelRegression,
} from "../src/simulation/models";

function finiteEnvironmentNumber(
  name: string,
  fallback: number,
): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

async function main(): Promise<void> {
  const live = process.argv.includes("--live");
  const configuration = live
    ? getServerModelConfiguration()
    : {
        provider: deterministicMockProvider,
        configuredProvider: "deterministic-mock" as const,
        promptVersion:
          process.env.NEXUS_MODEL_PROMPT_VERSION ??
          CITY_POLICY_PROMPT_VERSION,
        policyVersion:
          process.env.NEXUS_MODEL_POLICY_VERSION ??
          "model-policy-1.2.0",
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

  if (live && configuration.configuredProvider !== "openai") {
    throw new Error(
      "Live model regression requires NEXUS_MODEL_PROVIDER=openai",
    );
  }

  const report = await runModelRegression({
    provider: configuration.provider,
    budgets: configuration.budgets,
    promptVersion: configuration.promptVersion,
    policyVersion: configuration.policyVersion,
    liveProviderRequired: live,
    thresholds: {
      maximumP95LatencyMs: finiteEnvironmentNumber(
        "NEXUS_MODEL_REGRESSION_MAX_P95_MS",
        8_000,
      ),
      maximumTotalCostUsd: finiteEnvironmentNumber(
        "NEXUS_MODEL_REGRESSION_MAX_TOTAL_COST_USD",
        0.25,
      ),
      maximumAverageCostUsd: finiteEnvironmentNumber(
        "NEXUS_MODEL_REGRESSION_MAX_AVERAGE_COST_USD",
        0.03,
      ),
    },
  });
  const outputPath = path.resolve(
    process.cwd(),
    process.env.NEXUS_MODEL_REGRESSION_OUTPUT ??
      "public/data/model-regression.json",
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify({
      event: "model.regression.completed",
      outputPath,
      providerId: report.providerId,
      model: report.model,
      ...report.summary,
      passed: report.gate.passed,
    }),
  );
  if (!report.gate.passed) {
    console.error(report.gate.failures.join("\n"));
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
