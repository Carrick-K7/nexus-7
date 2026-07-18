import { NextResponse } from "next/server";
import {
  ExperimentValidationError,
} from "@/experiments";
import {
  actorFromRequest,
  experimentErrorResponse,
  readJsonObject,
} from "@/experiments/http";
import {
  isSignedReleasePolicyBundle,
} from "@/governance/release-policy";
import {
  getReleasePolicyService,
} from "@/governance/policy-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    return NextResponse.json({
      policies: await (await getReleasePolicyService()).list(actor),
    });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    if (!isSignedReleasePolicyBundle(body.bundle)) {
      throw new ExperimentValidationError(
        "A complete signed release policy bundle is required",
      );
    }
    const actor = await actorFromRequest(request);
    return NextResponse.json(
      await (await getReleasePolicyService()).activate(
        body.bundle,
        actor,
      ),
      { status: 201 },
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
