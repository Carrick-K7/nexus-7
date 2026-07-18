import { NextResponse } from "next/server";
import {
  ExperimentValidationError,
} from "@/experiments";
import {
  isRemoteEvidenceReceipt,
} from "@/evidence";
import {
  actorFromRequest,
  experimentErrorResponse,
  readJsonObject,
} from "@/experiments/http";
import {
  getEvidenceRegistryService,
} from "@/governance/evidence-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    return NextResponse.json(
      await (await getEvidenceRegistryService()).overview(actor),
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    if (!isRemoteEvidenceReceipt(body.receipt)) {
      throw new ExperimentValidationError(
        "A complete signed remote evidence receipt is required",
      );
    }
    const actor = await actorFromRequest(request);
    const record = await (
      await getEvidenceRegistryService()
    ).ingest(body.receipt, actor);
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
