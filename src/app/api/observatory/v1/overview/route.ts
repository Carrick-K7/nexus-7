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
import {
  toHumanObservatoryV1,
} from "@/symbiosis/observatory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const seasonId =
      new URL(request.url).searchParams.get("season") ??
      DEFAULT_SYMBIOSIS_SEASON_ID;
    return NextResponse.json(
      toHumanObservatoryV1(
        await (
          await getWorldService()
        ).observatory(await actorFromRequest(request), seasonId),
      ),
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
