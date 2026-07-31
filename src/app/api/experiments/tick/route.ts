import { NextResponse } from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
} from "@/experiments/http";
import {
  assertActorPermission,
  ExperimentPermissionError,
} from "@/experiments";
import { getExperimentService } from "@/experiments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const secret = process.env.NEXUS_CRON_SECRET;
    const service = await getExperimentService();
    if (
      secret &&
      request.headers.get("authorization") === `Bearer ${secret}`
    ) {
      return NextResponse.json(
        await service.tickRunningRuns({
          id: "experiment-clock",
          role: "admin",
          principalType: "system",
          authSource: "system",
        }),
      );
    }
    const actor = await actorFromRequest(request);
    assertActorPermission(actor, "runs:write");
    if (actor.authSource === "development") {
      return NextResponse.json(
        await service.tickRunningRuns(actor),
      );
    }
    if (
      actor.principalType !== "service-account" ||
      actor.workloadKind !== "worker"
    ) {
      throw new ExperimentPermissionError(
        "The tick endpoint requires a registered worker workload identity",
      );
    }
    return NextResponse.json(
      await service.tickRunningRuns(actor),
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
