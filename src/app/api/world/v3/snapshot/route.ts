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
    const url = new URL(request.url);
    const turnValue = url.searchParams.get("turn");
    const turn = turnValue === null ? undefined : Number(turnValue);
    const season =
      url.searchParams.get("season") ?? DEFAULT_SYMBIOSIS_SEASON_ID;
    const actor = await actorFromRequest(request);
    const service = await getWorldService();
    return NextResponse.json({
      season: await service.season(actor, season),
      snapshot: await service.snapshot(actor, season, turn),
      residents: await service.residents(actor, season),
      projection: "researcher-pseudonymized",
    });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
