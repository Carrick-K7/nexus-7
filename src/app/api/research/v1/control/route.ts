import { NextResponse } from "next/server";
import { actorFromRequest, readJsonObject } from "@/experiments/http";
import { researchErrorResponse } from "@/research/http-errors";
import { assertActorPermission } from "@/experiments/authorization";
import { ExperimentPermissionError, ExperimentValidationError } from "@/experiments/errors";
import { getGovernanceService } from "@/governance/server";
import { getResearchService } from "@/research/server";
import type { ResearchPolicy } from "@/research/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only a separately authenticated operator can authorize, pause or resume the bounded station.
 * No public write authority, no request to execute a source fragment, and no one-step research API.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    if (actor.authSource === "public-observer") return NextResponse.json({ error: "Public research observation is read-only" }, { status: 405, headers: { "Cache-Control": "no-store" } });
    assertActorPermission(actor, "runs:write");
    if (actor.principalType !== "human") throw new ExperimentPermissionError("Research control requires a human identity");
    const body = await readJsonObject(request);
    const service = await getResearchService();
    if (body.action === "pause" || body.action === "resume") {
      if (Object.keys(body).some((key) => key !== "action")) throw new ExperimentValidationError("Unexpected research control field");
      return NextResponse.json(await service[body.action](actor), { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "start" || Object.keys(body).some((key) => !["action", "seed", "subjectIds", "policy"].includes(key)) ||
      typeof body.seed !== "string" || !Array.isArray(body.subjectIds) || body.subjectIds.some((id) => typeof id !== "string") ||
      (body.policy !== undefined && (body.policy === null || typeof body.policy !== "object" || Array.isArray(body.policy)))) {
      throw new ExperimentValidationError("Invalid research control request");
    }
    await getGovernanceService();
    return NextResponse.json(await service.start(actor, {
      seed: body.seed, subjectIds: body.subjectIds as string[],
      ...(body.policy ? { policy: body.policy as Partial<ResearchPolicy> } : {}),
    }), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return researchErrorResponse(error); }
}
