import { NextResponse } from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
  readJsonObject,
} from "@/experiments/http";
import { ExperimentValidationError } from "@/experiments";
import {
  isExternalAttestationReceipt,
} from "@/evidence";
import type { ImprovementAction } from "@/iteration";
import { getControlledIterationService } from "@/iteration/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ proposalId: string }>;
}

const ACTIONS = [
  "run-experiment",
  "approve",
  "reject",
  "start-canary",
  "observe-canary",
  "drill-rollback",
  "attach-external-evidence",
] as const;

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { proposalId } = await context.params;
    const body = await readJsonObject(request);
    if (
      typeof body.action !== "string" ||
      !ACTIONS.includes(body.action as (typeof ACTIONS)[number])
    ) {
      throw new ExperimentValidationError("Unknown iteration action");
    }
    if (
      body.action === "attach-external-evidence" &&
      !isExternalAttestationReceipt(body.receipt)
    ) {
      throw new ExperimentValidationError(
        "A complete signed external attestation receipt is required",
      );
    }
    const action: ImprovementAction =
      body.action === "attach-external-evidence"
        ? {
            type: "attach-external-evidence",
            receipt: body.receipt as Extract<
              ImprovementAction,
              { type: "attach-external-evidence" }
            >["receipt"],
          }
        : body.action === "approve" || body.action === "reject"
        ? {
            type: body.action,
            rationale:
              typeof body.rationale === "string" ? body.rationale : undefined,
          }
        : {
            type: body.action as
              | "run-experiment"
              | "start-canary"
              | "observe-canary"
              | "drill-rollback",
          };
    const service = await getControlledIterationService();
    const proposal = await service.act(
      proposalId,
      Number(body.expectedRevision),
      action,
      await actorFromRequest(request),
    );
    return NextResponse.json(proposal);
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
