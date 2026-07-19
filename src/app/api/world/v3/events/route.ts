import {
  NextResponse,
} from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
} from "@/experiments/http";
import {
  DEFAULT_SYMBIOSIS_SEASON_ID,
  WORLD_SCHEMA_VERSION,
} from "@/symbiosis/contracts";
import {
  getWorldService,
} from "@/symbiosis/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const season =
      url.searchParams.get("season") ?? DEFAULT_SYMBIOSIS_SEASON_ID;
    const afterCursor = Number(url.searchParams.get("afterCursor") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 500);
    const events = await (
      await getWorldService()
    ).events(await actorFromRequest(request), season, afterCursor, limit);
    return NextResponse.json({
      schemaVersion: WORLD_SCHEMA_VERSION,
      seasonId: season,
      events,
      nextCursor: events.at(-1)?.cursor ?? afterCursor,
      privateFieldsIncluded: false,
    });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
