import { NextResponse } from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
  readJsonObject,
} from "@/experiments/http";
import {
  assertActorPermission,
  ExperimentValidationError,
} from "@/experiments";
import {
  approvalPolicyForRisk,
  assessModelRisk,
  executeModelWithFallback,
  getServerModelConfiguration,
} from "@/simulation/models";
import type {
  ModelRequest,
  PolicyAgentId,
} from "@/simulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENTS: PolicyAgentId[] = [
  "atlas",
  "economica",
  "civitas",
  "spectre",
];

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    assertActorPermission(actor, "models:propose");
    const configuration = getServerModelConfiguration();
    return NextResponse.json({
      providerId: configuration.provider.id,
      model: configuration.provider.model,
      configuredProvider: configuration.configuredProvider,
      promptVersion: configuration.promptVersion,
      policyVersion: configuration.policyVersion,
      budgets: configuration.budgets,
    });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    assertActorPermission(actor, "models:propose");
    const body = await readJsonObject(request);
    if (
      typeof body.requestId !== "string" ||
      typeof body.tick !== "number" ||
      typeof body.seed !== "string" ||
      typeof body.agentId !== "string" ||
      !AGENTS.includes(body.agentId as PolicyAgentId) ||
      typeof body.city !== "object" ||
      body.city === null
    ) {
      throw new ExperimentValidationError(
        "Model proposal request is malformed",
      );
    }
    const configuration = getServerModelConfiguration();
    const modelRequest: ModelRequest = {
      requestId: body.requestId,
      tick: body.tick,
      seed: body.seed,
      agentId: body.agentId as PolicyAgentId,
      promptVersion: configuration.promptVersion,
      policyVersion: configuration.policyVersion,
      city: body.city as ModelRequest["city"],
    };
    const execution = await executeModelWithFallback(
      configuration.provider,
      modelRequest,
      configuration.budgets,
    );
    const riskTier = assessModelRisk(execution.proposal);

    return NextResponse.json({
      execution,
      riskTier,
      approvalPolicy: approvalPolicyForRisk(riskTier),
      promptVersion: configuration.promptVersion,
      policyVersion: configuration.policyVersion,
      budgets: configuration.budgets,
      requestedBy: {
        actorId: actor.id,
        role: actor.role,
        authSource: actor.authSource,
      },
    });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
