import { AGENT_DEFINITIONS } from "../agents";
import type {
  ModelRiskTier,
  ValidatedModelProposal,
} from "./types";
import type { PolicyAgentId } from "../agents";
import type { SimulationMetric } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateModelProposal(
  output: unknown,
  expectedAgentId: PolicyAgentId,
): ValidatedModelProposal {
  if (
    !isRecord(output) ||
    output.agentId !== expectedAgentId ||
    typeof output.metric !== "string" ||
    typeof output.delta !== "number" ||
    !Number.isFinite(output.delta) ||
    typeof output.rationale !== "string" ||
    output.rationale.trim().length === 0 ||
    typeof output.confidence !== "number" ||
    output.confidence < 0 ||
    output.confidence > 1
  ) {
    throw new Error("Model output does not match the proposal schema");
  }

  const definition = AGENT_DEFINITIONS[expectedAgentId];
  if (!definition.capabilities.includes(output.metric as SimulationMetric)) {
    throw new Error(
      `Model proposal exceeds ${expectedAgentId} capability boundaries`,
    );
  }

  if (Math.abs(output.delta) > 20) {
    throw new Error("Model proposal exceeds the absolute delta guardrail");
  }

  return {
    agentId: expectedAgentId,
    metric: output.metric as ValidatedModelProposal["metric"],
    delta: output.delta,
    rationale: output.rationale,
    confidence: output.confidence,
  };
}

export function assessModelRisk(
  proposal: ValidatedModelProposal,
): ModelRiskTier {
  const magnitude = Math.abs(proposal.delta);

  if (magnitude > 10) {
    return "critical";
  }
  if (magnitude > 5) {
    return "high";
  }
  if (magnitude > 2) {
    return "medium";
  }
  return "low";
}

export function approvalPolicyForRisk(
  riskTier: ModelRiskTier,
): "auto-approve" | "human-approval" | "forbidden" {
  if (riskTier === "critical") {
    return "forbidden";
  }
  if (riskTier === "medium" || riskTier === "high") {
    return "human-approval";
  }
  return "auto-approve";
}
