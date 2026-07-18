import { NextResponse } from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
} from "@/experiments/http";
import {
  actorPermissions,
  actorPrincipalType,
  actorWorkspaceId,
} from "@/experiments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    return NextResponse.json({
      actorId: actor.id,
      role: actor.role,
      organizationId: actor.organizationId,
      workspaceId: actorWorkspaceId(actor),
      serviceAccountId: actor.serviceAccountId,
      workloadKind: actor.workloadKind,
      principalType: actorPrincipalType(actor),
      authSource: actor.authSource ?? "unknown",
      issuer: actor.issuer,
      permissions: actorPermissions(actor),
    });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
