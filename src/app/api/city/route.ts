import {
  NextResponse,
} from "next/server";
import {
  ExperimentValidationError,
} from "@/experiments";
import {
  actorFromRequest,
  experimentErrorResponse,
  readJsonObject,
} from "@/experiments/http";
import {
  CITY_METRIC_DICTIONARY,
} from "@/city/ontology";
import {
  getCityModelService,
} from "@/city/model-server";
import type {
  CityIncidentStatus,
} from "@/city/model-types";
import type {
  CityMetricCode,
} from "@/city/types";
import {
  assertWorldInvariants,
  type WorldState,
} from "@/simulation";

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

function finiteNumber(
  body: Record<string, unknown>,
  field: string,
): number {
  const value = Number(body[field]);
  if (!Number.isFinite(value)) {
    throw new ExperimentValidationError(`${field} must be finite`);
  }
  return value;
}

function enumValue<T extends string>(
  body: Record<string, unknown>,
  field: string,
  values: readonly T[],
): T {
  const value = body[field];
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new ExperimentValidationError(`${field} is invalid`);
  }
  return value as T;
}

function metric(body: Record<string, unknown>): CityMetricCode {
  return enumValue(
    body,
    "metric",
    CITY_METRIC_DICTIONARY.map((definition) => definition.code),
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    return NextResponse.json(
      await (await getCityModelService()).overview(actor),
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    const actor = await actorFromRequest(request);
    const service = await getCityModelService();
    if (body.action === "overview") {
      if (
        typeof body.world !== "object" ||
        body.world === null ||
        Array.isArray(body.world)
      ) {
        throw new ExperimentValidationError(
          "world must be a simulation world object",
        );
      }
      const world = body.world as unknown as WorldState;
      assertWorldInvariants(world);
      return NextResponse.json(await service.overview(actor, world));
    }
    if (body.action === "inject-scenario") {
      return NextResponse.json(
        await service.injectScenario(
          requiredString(body, "scenarioId"),
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "transition-incident") {
      return NextResponse.json(
        await service.transitionIncident(
          requiredString(body, "incidentId"),
          enumValue(
            body,
            "status",
            [
              "detected",
              "triaged",
              "investigating",
              "resolved",
            ] as const satisfies readonly CityIncidentStatus[],
          ),
          requiredString(body, "note"),
          actor,
        ),
      );
    }
    if (body.action === "create-objective") {
      return NextResponse.json(
        await service.createObjective(
          {
            name: requiredString(body, "name"),
            metric: metric(body),
            direction: enumValue(
              body,
              "direction",
              ["increase", "decrease", "maintain"] as const,
            ),
            target: finiteNumber(body, "target"),
            weight: finiteNumber(body, "weight"),
            owner: requiredString(body, "owner"),
            scope:
              body.scope === undefined
                ? undefined
                : enumValue(
                    body,
                    "scope",
                    ["city", "organization", "scenario"] as const,
                  ),
            deadlineAt:
              typeof body.deadlineAt === "string"
                ? body.deadlineAt
                : undefined,
          },
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "create-guardrail") {
      return NextResponse.json(
        await service.createGuardrail(
          {
            name: requiredString(body, "name"),
            metric: metric(body),
            comparison: enumValue(
              body,
              "comparison",
              ["minimum", "maximum"] as const,
            ),
            threshold: finiteNumber(body, "threshold"),
            groupIds:
              Array.isArray(body.groupIds) &&
              body.groupIds.every((entry) => typeof entry === "string")
                ? body.groupIds
                : undefined,
            severity: enumValue(
              body,
              "severity",
              ["warning", "critical"] as const,
            ),
            breachAction: enumValue(
              body,
              "breachAction",
              ["pause", "rollback", "human-review"] as const,
            ),
            owner: requiredString(body, "owner"),
          },
          actor,
        ),
        { status: 201 },
      );
    }
    throw new ExperimentValidationError("Unknown city action");
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
