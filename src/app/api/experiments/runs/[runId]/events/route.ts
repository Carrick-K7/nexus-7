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
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
    const service = await getExperimentService();
    await service.getRun(runId, await actorFromRequest(request));
    const events = await service.repository.listEvents(
      runId,
      Number.isFinite(after) ? after : 0,
    );
    return NextResponse.json({
      events,
      nextCursor: events.at(-1)?.cursor ?? after,
    });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
