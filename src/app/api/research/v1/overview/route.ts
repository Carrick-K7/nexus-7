import { NextResponse } from "next/server";
import { actorFromRequest } from "@/experiments/http";
import { getResearchService } from "@/research/server";
import { researchRuntime } from "@/research/runtime";
import { researchErrorResponse } from "@/research/http-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    const overview = await (await getResearchService()).overview(actor);
    return NextResponse.json({ ...overview, runtime: researchRuntime(overview.station) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return researchErrorResponse(error); }
}

function readOnly(): NextResponse {
  return NextResponse.json({ error: "Research observation is read-only" }, {
    status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
  });
}
export const POST = readOnly;
export const PUT = readOnly;
export const PATCH = readOnly;
export const DELETE = readOnly;
