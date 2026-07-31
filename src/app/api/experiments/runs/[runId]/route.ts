import { NextResponse } from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
} from "@/experiments/http";
import { getExperimentService } from "@/experiments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { runId } = await context.params;
    const service = await getExperimentService();
    return NextResponse.json(
      await service.getRun(runId, await actorFromRequest(request)),
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
