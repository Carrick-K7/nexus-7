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
): Promise<Response> {
  try {
    const { runId } = await context.params;
    const service = await getExperimentService();
    const report = await service.report(
      runId,
      await actorFromRequest(request),
    );
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(JSON.stringify(report, null, 2), {
      headers: {
        "Content-Type": "application/json",
        ...(download
          ? {
              "Content-Disposition": `attachment; filename="nexus-experiment-${runId}.json"`,
            }
          : {}),
      },
    });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
