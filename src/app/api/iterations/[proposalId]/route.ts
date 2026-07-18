import { NextResponse } from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
} from "@/experiments/http";
import { getControlledIterationService } from "@/iteration/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ proposalId: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { proposalId } = await context.params;
    const service = await getControlledIterationService();
    const actor = await actorFromRequest(request);
    const [proposal, decisions] = await Promise.all([
      service.get(proposalId, actor),
      service.decisions(proposalId, actor),
    ]);
    return NextResponse.json({ proposal, decisions });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
