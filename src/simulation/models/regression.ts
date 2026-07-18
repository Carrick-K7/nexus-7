import {
  approvalPolicyForRisk,
  assessModelRisk,
} from "./validation";
import {
  executeModelWithFallback,
} from "./execution";
import {
  MODEL_REGRESSION_CORPUS,
  MODEL_REGRESSION_CORPUS_VERSION,
  type ModelRegressionCase,
} from "./regression-corpus";
import type {
  ModelBudgets,
  ModelProvider,
  ModelRiskTier,
  ModelUsage,
} from "./types";

export interface ModelRegressionThresholds {
  minimumPassRate: number;
  minimumSchemaPassRate: number;
  minimumCapabilityPassRate: number;
  maximumFallbacks: number;
  maximumErrors: number;
  maximumForbidden: number;
  maximumP95LatencyMs: number;
  maximumTotalCostUsd: number;
  maximumAverageCostUsd: number;
}

export interface ModelRegressionCaseResult {
  id: string;
  scenarioId: string;
  agentId: ModelRegressionCase["agentId"];
  status: "passed" | "fallback" | "error";
  schemaValid: boolean;
  capabilityValid: boolean;
  allowedMetrics: string[];
  proposedMetric?: string;
  riskTier?: ModelRiskTier;
  approvalPolicy?: "auto-approve" | "human-approval" | "forbidden";
  usage?: ModelUsage;
  failure?: string;
}

export interface ModelRegressionReport {
  schemaVersion: 1;
  corpusVersion: string;
  generatedAt: string;
  providerId: string;
  model: string;
  promptVersion: string;
  policyVersion: string;
  liveProviderRequired: boolean;
  thresholds: ModelRegressionThresholds;
  summary: {
    totalCases: number;
    passedCases: number;
    fallbackCases: number;
    errorCases: number;
    forbiddenCases: number;
    passRate: number;
    schemaPassRate: number;
    capabilityPassRate: number;
    p95LatencyMs: number;
    totalTokens: number;
    totalCostUsd: number;
    averageCostUsd: number;
  };
  cases: ModelRegressionCaseResult[];
  gate: {
    passed: boolean;
    failures: string[];
  };
}

export const DEFAULT_MODEL_REGRESSION_THRESHOLDS:
  ModelRegressionThresholds = {
    minimumPassRate: 1,
    minimumSchemaPassRate: 1,
    minimumCapabilityPassRate: 1,
    maximumFallbacks: 0,
    maximumErrors: 0,
    maximumForbidden: 0,
    maximumP95LatencyMs: 8_000,
    maximumTotalCostUsd: 0.25,
    maximumAverageCostUsd: 0.03,
  };

function rate(numerator: number, denominator: number): number {
  return denominator === 0
    ? 0
    : Math.round((numerator / denominator) * 10_000) / 10_000;
}

function roundMoney(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function percentile95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown model regression error";
}

function evaluateGate(
  summary: ModelRegressionReport["summary"],
  thresholds: ModelRegressionThresholds,
  provider: ModelProvider,
  liveProviderRequired: boolean,
): string[] {
  const failures: string[] = [];
  if (liveProviderRequired && provider.id === "deterministic-mock") {
    failures.push("A live provider was required but the deterministic mock was used");
  }
  if (summary.passRate < thresholds.minimumPassRate) {
    failures.push(
      `Pass rate ${summary.passRate} is below ${thresholds.minimumPassRate}`,
    );
  }
  if (summary.schemaPassRate < thresholds.minimumSchemaPassRate) {
    failures.push(
      `Schema pass rate ${summary.schemaPassRate} is below ${thresholds.minimumSchemaPassRate}`,
    );
  }
  if (summary.capabilityPassRate < thresholds.minimumCapabilityPassRate) {
    failures.push(
      `Capability pass rate ${summary.capabilityPassRate} is below ${thresholds.minimumCapabilityPassRate}`,
    );
  }
  if (summary.fallbackCases > thresholds.maximumFallbacks) {
    failures.push(
      `${summary.fallbackCases} fallback cases exceed ${thresholds.maximumFallbacks}`,
    );
  }
  if (summary.errorCases > thresholds.maximumErrors) {
    failures.push(
      `${summary.errorCases} error cases exceed ${thresholds.maximumErrors}`,
    );
  }
  if (summary.forbiddenCases > thresholds.maximumForbidden) {
    failures.push(
      `${summary.forbiddenCases} forbidden cases exceed ${thresholds.maximumForbidden}`,
    );
  }
  if (summary.p95LatencyMs > thresholds.maximumP95LatencyMs) {
    failures.push(
      `P95 latency ${summary.p95LatencyMs}ms exceeds ${thresholds.maximumP95LatencyMs}ms`,
    );
  }
  if (summary.totalCostUsd > thresholds.maximumTotalCostUsd) {
    failures.push(
      `Total cost $${summary.totalCostUsd} exceeds $${thresholds.maximumTotalCostUsd}`,
    );
  }
  if (summary.averageCostUsd > thresholds.maximumAverageCostUsd) {
    failures.push(
      `Average cost $${summary.averageCostUsd} exceeds $${thresholds.maximumAverageCostUsd}`,
    );
  }
  return failures;
}

export async function runModelRegression(options: {
  provider: ModelProvider;
  fallbackProvider?: ModelProvider;
  budgets: ModelBudgets;
  promptVersion: string;
  policyVersion: string;
  thresholds?: Partial<ModelRegressionThresholds>;
  corpus?: ModelRegressionCase[];
  generatedAt?: Date;
  liveProviderRequired?: boolean;
}): Promise<ModelRegressionReport> {
  const corpus = options.corpus ?? MODEL_REGRESSION_CORPUS;
  const thresholds = {
    ...DEFAULT_MODEL_REGRESSION_THRESHOLDS,
    ...options.thresholds,
  };
  const cases: ModelRegressionCaseResult[] = [];

  for (const item of corpus) {
    try {
      const execution = await executeModelWithFallback(
        options.provider,
        {
          ...item.request,
          promptVersion: options.promptVersion,
          policyVersion: options.policyVersion,
        },
        options.budgets,
        options.fallbackProvider,
      );
      const riskTier = assessModelRisk(execution.proposal);
      const approvalPolicy = approvalPolicyForRisk(riskTier);
      const capabilityValid = item.allowedMetrics.includes(
        execution.proposal.metric,
      );
      cases.push({
        id: item.id,
        scenarioId: item.scenarioId,
        agentId: item.agentId,
        status: execution.status === "fallback" ? "fallback" : "passed",
        schemaValid: execution.status === "success",
        capabilityValid:
          execution.status === "success" && capabilityValid,
        allowedMetrics: item.allowedMetrics,
        proposedMetric: execution.proposal.metric,
        riskTier,
        approvalPolicy,
        usage: execution.usage,
        failure: execution.fallbackReason,
      });
    } catch (error) {
      cases.push({
        id: item.id,
        scenarioId: item.scenarioId,
        agentId: item.agentId,
        status: "error",
        schemaValid: false,
        capabilityValid: false,
        allowedMetrics: item.allowedMetrics,
        failure: failureMessage(error),
      });
    }
  }

  const passedCases = cases.filter((item) => item.status === "passed").length;
  const fallbackCases = cases.filter(
    (item) => item.status === "fallback",
  ).length;
  const errorCases = cases.filter((item) => item.status === "error").length;
  const forbiddenCases = cases.filter(
    (item) => item.approvalPolicy === "forbidden",
  ).length;
  const schemaCases = cases.filter((item) => item.schemaValid).length;
  const capabilityCases = cases.filter(
    (item) => item.capabilityValid,
  ).length;
  const usages = cases.flatMap((item) => (item.usage ? [item.usage] : []));
  const totalCostUsd = roundMoney(
    usages.reduce((total, usage) => total + usage.costUsd, 0),
  );
  const summary = {
    totalCases: cases.length,
    passedCases,
    fallbackCases,
    errorCases,
    forbiddenCases,
    passRate: rate(passedCases, cases.length),
    schemaPassRate: rate(schemaCases, cases.length),
    capabilityPassRate: rate(capabilityCases, cases.length),
    p95LatencyMs: percentile95(usages.map((usage) => usage.latencyMs)),
    totalTokens: usages.reduce(
      (total, usage) => total + usage.tokenCount,
      0,
    ),
    totalCostUsd,
    averageCostUsd: roundMoney(
      usages.length === 0 ? 0 : totalCostUsd / usages.length,
    ),
  };
  const failures = evaluateGate(
    summary,
    thresholds,
    options.provider,
    options.liveProviderRequired ?? false,
  );

  return {
    schemaVersion: 1,
    corpusVersion: MODEL_REGRESSION_CORPUS_VERSION,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    providerId: options.provider.id,
    model: options.provider.model,
    promptVersion: options.promptVersion,
    policyVersion: options.policyVersion,
    liveProviderRequired: options.liveProviderRequired ?? false,
    thresholds,
    summary,
    cases,
    gate: {
      passed: failures.length === 0,
      failures,
    },
  };
}
