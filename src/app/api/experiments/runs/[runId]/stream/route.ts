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

const encoder = new TextEncoder();

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const { runId } = await context.params;
    const service = await getExperimentService();
    await service.getRun(runId, await actorFromRequest(request));
    let cursor = Number(new URL(request.url).searchParams.get("after") ?? 0);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (let iteration = 0; iteration < 30; iteration += 1) {
            if (request.signal.aborted) {
              break;
            }
            const events = await service.repository.listEvents(runId, cursor);
            for (const event of events) {
              cursor = event.cursor;
              controller.enqueue(
                encoder.encode(
                  `id: ${event.cursor}\nevent: simulation\ndata: ${JSON.stringify(event)}\n\n`,
                ),
              );
            }
            controller.enqueue(
              encoder.encode(
                `event: heartbeat\ndata: ${JSON.stringify({ cursor })}\n\n`,
              ),
            );
            await delay(1_000);
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      },
    });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
