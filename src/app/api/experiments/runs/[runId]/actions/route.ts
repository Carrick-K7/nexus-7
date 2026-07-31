import { NextResponse } from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
  readJsonObject,
} from "@/experiments/http";
import { ExperimentValidationError } from "@/experiments";
import { getExperimentService } from "@/experiments/server";
import type { ExperimentRunAction } from "@/experiments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

const ACTIONS = ["pause", "resume", "step", "fork"] as const;

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { runId } = await context.params;
    const body = await readJsonObject(request);
    if (
      typeof body.action !== "string" ||
      !ACTIONS.includes(body.action as (typeof ACTIONS)[number])
    ) {
      throw new ExperimentValidationError(
        "action must be pause, resume, step, or fork",
      );
    }
    const action: ExperimentRunAction =
      body.action === "fork"
        ? {
            type: "fork",
            tick:
              typeof body.tick === "number" ? body.tick : undefined,
            name: typeof body.name === "string" ? body.name : undefined,
          }
        : {
            type: body.action as "pause" | "resume" | "step",
          };
    const service = await getExperimentService();
    const run = await service.mutateRun(
      runId,
      Number(body.expectedVersion),
      action,
      await actorFromRequest(request),
    );
    return NextResponse.json(run);
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
