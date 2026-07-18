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
  getDiagnosisService,
} from "@/diagnosis/server";

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

function boundedNumber(
  body: Record<string, unknown>,
  field: string,
): number {
  const value = Number(body[field]);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ExperimentValidationError(
      `${field} must be between 0 and 1`,
    );
  }
  return value;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    return NextResponse.json(
      await (await getDiagnosisService()).overview(actor),
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    const body = await readJsonObject(request);
    const service = await getDiagnosisService();
    if (body.action === "diagnose-scenario") {
      return NextResponse.json(
        await service.diagnoseScenario(
          requiredString(body, "scenarioId"),
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "diagnose-incident") {
      return NextResponse.json(
        await service.diagnoseIncident(
          requiredString(body, "incidentId"),
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "assess-drift") {
      return NextResponse.json(
        await service.assessDrift(
          {
            dataDistributionShift: boundedNumber(
              body,
              "dataDistributionShift",
            ),
            policyEffectShift: boundedNumber(
              body,
              "policyEffectShift",
            ),
            modelOutputShift: boundedNumber(
              body,
              "modelOutputShift",
            ),
          },
          actor,
        ),
      );
    }
    if (body.action === "record-human-judgment") {
      return NextResponse.json(
        await service.recordHumanJudgment(
          requiredString(body, "diagnosisId"),
          requiredString(body, "statement"),
          actor,
        ),
      );
    }
    throw new ExperimentValidationError(
      "Unknown diagnosis action",
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
