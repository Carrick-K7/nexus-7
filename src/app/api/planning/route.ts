import {
  NextResponse,
} from "next/server";
import {
  ExperimentValidationError,
} from "@/experiments/errors";
import {
  actorFromRequest,
  experimentErrorResponse,
  readJsonObject,
} from "@/experiments/http";
import {
  getPlanningService,
} from "@/planning/server";
import type {
  InterventionCandidate,
} from "@/planning/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new ExperimentValidationError(`${field} is required`);
  }
  return value;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    return NextResponse.json(
      await (await getPlanningService()).overview(actor),
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    const body = await readJsonObject(request);
    const service = await getPlanningService();
    if (body.action === "create-plan") {
      return NextResponse.json(
        await service.createPlanForScenario(
          requiredString(body, "scenarioId"),
          actor,
          {
            maximumCost:
              body.maximumCost === undefined
                ? undefined
                : Number(body.maximumCost),
            additionalCandidates: Array.isArray(
              body.additionalCandidates,
            )
              ? (
                  body.additionalCandidates as unknown as InterventionCandidate[]
                )
              : undefined,
          },
        ),
        { status: 201 },
      );
    }
    if (body.action === "approve-plan") {
      return NextResponse.json(
        await service.approvePlan(
          requiredString(body, "planId"),
          requiredString(body, "selectedCandidateId"),
          requiredString(body, "note"),
          actor,
        ),
      );
    }
    if (body.action === "request-evidence") {
      return NextResponse.json(
        await service.requestEvidence(
          requiredString(body, "planId"),
          requiredString(body, "note"),
          actor,
        ),
      );
    }
    if (body.action === "reject-plan") {
      return NextResponse.json(
        await service.rejectPlan(
          requiredString(body, "planId"),
          requiredString(body, "note"),
          actor,
        ),
      );
    }
    if (body.action === "stage-plan") {
      return NextResponse.json(
        await service.stagePlan(
          requiredString(body, "planId"),
          actor,
        ),
      );
    }
    throw new ExperimentValidationError(
      "Unknown planning action",
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
