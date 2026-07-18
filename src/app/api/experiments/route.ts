import { NextResponse } from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
  readJsonObject,
} from "@/experiments/http";
import { getExperimentService } from "@/experiments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const service = await getExperimentService();
    return NextResponse.json(
      await service.overview(await actorFromRequest(request)),
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const service = await getExperimentService();
    const body = await readJsonObject(request);
    const run = await service.createRun(
      { name: body.name, seed: body.seed },
      await actorFromRequest(request),
    );
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
