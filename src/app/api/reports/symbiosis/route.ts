import {
  NextResponse,
} from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
} from "@/experiments/http";
import {
  DEFAULT_SYMBIOSIS_SEASON_ID,
} from "@/symbiosis/contracts";
import {
  getWorldService,
} from "@/symbiosis/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const season =
      new URL(request.url).searchParams.get("season") ??
      DEFAULT_SYMBIOSIS_SEASON_ID;
    return NextResponse.json(
      await (
        await getWorldService()
      ).report(await actorFromRequest(request), season),
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
