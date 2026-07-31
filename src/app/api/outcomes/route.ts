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
  getOutcomeLearningService,
} from "@/outcomes/server";
import type {
  LearningProposalTarget,
} from "@/outcomes/types";
import type {
  SimulationMetric,
} from "@/simulation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METRICS = [
  "population",
  "gdp",
  "happiness",
  "pollution",
  "crime",
  "traffic",
  "energy",
  "water",
  "internet",
  "medical",
] as const satisfies readonly SimulationMetric[];

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

function enumValue<T extends string>(
  body: Record<string, unknown>,
  field: string,
  values: readonly T[],
): T {
  const value = body[field];
  if (
    typeof value !== "string" ||
    !values.includes(value as T)
  ) {
    throw new ExperimentValidationError(
      `${field} is invalid`,
    );
  }
  return value as T;
}

function finiteNumber(
  body: Record<string, unknown>,
  field: string,
): number {
  const value = Number(body[field]);
  if (!Number.isFinite(value)) {
    throw new ExperimentValidationError(
      `${field} must be finite`,
    );
  }
  return value;
}

export async function GET(
  request: Request,
): Promise<NextResponse> {
  try {
    return NextResponse.json(
      await (
        await getOutcomeLearningService()
      ).overview(await actorFromRequest(request)),
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    const actor = await actorFromRequest(request);
    const service = await getOutcomeLearningService();
    if (body.action === "evaluate-plan") {
      return NextResponse.json(
        await service.evaluateStagedPlan(
          requiredString(body, "planId"),
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "record-late-evidence") {
      return NextResponse.json(
        await service.recordLateEvidence(
          requiredString(body, "outcomeId"),
          {
            classification: enumValue(
              body,
              "classification",
              ["fact", "human-judgment"] as const,
            ),
            source: requiredString(body, "source"),
            metric: enumValue(
              body,
              "metric",
              METRICS,
            ),
            delta: finiteNumber(body, "delta"),
            appliesAtOrAfterTick: finiteNumber(
              body,
              "appliesAtOrAfterTick",
            ),
            rationale: requiredString(body, "rationale"),
          },
          actor,
        ),
      );
    }
    if (body.action === "flag-attribution") {
      return NextResponse.json(
        await service.flagAttributionForReview(
          requiredString(body, "outcomeId"),
          requiredString(body, "rationale"),
          actor,
        ),
      );
    }
    if (body.action === "close-incident") {
      await service.closeIncidentWithOutcome(
        requiredString(body, "outcomeId"),
        requiredString(body, "note"),
        actor,
      );
      return NextResponse.json({ closed: true });
    }
    if (body.action === "invalidate-lesson") {
      return NextResponse.json(
        await service.invalidateLesson(
          requiredString(body, "lessonId"),
          requiredString(body, "rationale"),
          actor,
        ),
      );
    }
    if (body.action === "deprecate-lesson") {
      return NextResponse.json(
        await service.deprecateLesson(
          requiredString(body, "lessonId"),
          requiredString(body, "rationale"),
          actor,
        ),
      );
    }
    if (body.action === "propose-change") {
      return NextResponse.json(
        await service.proposeGovernedChange(
          requiredString(body, "lessonId"),
          enumValue(
            body,
            "target",
            [
              "policy",
              "prompt",
              "scenario",
              "test",
            ] as const satisfies readonly LearningProposalTarget[],
          ),
          requiredString(body, "title"),
          requiredString(body, "expectedImpact"),
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "assess-playbook") {
      return NextResponse.json(
        await service.assessPlaybook(
          requiredString(body, "playbookId"),
          requiredString(body, "planId"),
          requiredString(body, "scenarioFamily"),
          actor,
        ),
      );
    }
    throw new ExperimentValidationError(
      "Unknown outcome-learning action",
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
