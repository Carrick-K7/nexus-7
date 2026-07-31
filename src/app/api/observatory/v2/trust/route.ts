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
  configuredSymbiosisTrustMatrix,
} from "@/symbiosis/trust-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const seasonId =
      new URL(request.url).searchParams.get("season") ??
      DEFAULT_SYMBIOSIS_SEASON_ID;
    const observatory = await (
      await getWorldService()
    ).observatory(await actorFromRequest(request), seasonId);
    return NextResponse.json(
      configuredSymbiosisTrustMatrix(observatory),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export function POST(): Response {
  return NextResponse.json(
    { error: "read-only" },
    { status: 405, headers: { Allow: "GET" } },
  );
}
