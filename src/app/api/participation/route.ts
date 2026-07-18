import {
  NextResponse,
} from "next/server";
import {
  ExperimentValidationError,
} from "@/experiments/errors";
import {
  actorFromRequest,
  experimentErrorResponse,
  readJsonObject,
} from "@/experiments/http";
import {
  getParticipationService,
} from "@/participation/server";
import type {
  DeliberationStatement,
  ExplanationSubjectKind,
  FeedbackKind,
  FeedbackResolutionAction,
  FeedbackTarget,
  ObjectiveChangeProposal,
  StakeholderGroup,
  StakeholderImpactAssessment,
} from "@/participation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new ExperimentValidationError(`${field} is required`);
  }
  return value;
}

function requiredObject(
  body: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const value = body[field];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ExperimentValidationError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stakeholderGroupInput(body: Record<string, unknown>) {
  return {
    name: requiredString(body, "name"),
    districtId: requiredString(body, "districtId"),
    incomeBand: requiredString(
      body,
      "incomeBand",
    ) as StakeholderGroup["incomeBand"],
    serviceAccess: Number(body.serviceAccess),
    vulnerability: requiredString(
      body,
      "vulnerability",
    ) as StakeholderGroup["vulnerability"],
    populationSharePercent: Number(body.populationSharePercent),
    weight: Number(body.weight),
    protectedMetrics: Array.isArray(body.protectedMetrics)
      ? (
          body.protectedMetrics as unknown as StakeholderGroup["protectedMetrics"]
        )
      : [],
    severeBurdenThreshold: Number(body.severeBurdenThreshold),
    version: requiredString(body, "version"),
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    return NextResponse.json(
      await (await getParticipationService()).overview(actor),
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    const body = await readJsonObject(request);
    const service = await getParticipationService();
    if (body.action === "register-group") {
      return NextResponse.json(
        await service.registerStakeholderGroup(
          actor,
          stakeholderGroupInput(body),
        ),
        { status: 201 },
      );
    }
    if (body.action === "supersede-group") {
      return NextResponse.json(
        await service.supersedeStakeholderGroup(
          actor,
          requiredString(body, "groupId"),
          stakeholderGroupInput(body),
        ),
      );
    }
    if (body.action === "open-deliberation") {
      return NextResponse.json(
        await service.openDeliberation(actor, {
          baseObjectiveVersion: requiredString(body, "baseObjectiveVersion"),
          baseWeight: Number(body.baseWeight),
          proposal: requiredObject(
            body,
            "proposal",
          ) as unknown as ObjectiveChangeProposal,
          correlationId:
            typeof body.correlationId === "string"
              ? body.correlationId
              : undefined,
          causationId:
            typeof body.causationId === "string"
              ? body.causationId
              : undefined,
        }),
        { status: 201 },
      );
    }
    if (body.action === "add-statement") {
      return NextResponse.json(
        await service.addDeliberationStatement(
          actor,
          requiredString(body, "deliberationId"),
          {
            stance: requiredString(
              body,
              "stance",
            ) as DeliberationStatement["stance"],
            text: requiredString(body, "text"),
          },
        ),
      );
    }
    if (body.action === "attach-simulation") {
      return NextResponse.json(
        await service.attachDeliberationSimulation(
          actor,
          requiredString(body, "deliberationId"),
          {
            sourceWorldFingerprint: requiredString(
              body,
              "sourceWorldFingerprint",
            ),
            impacts: Array.isArray(body.impacts)
              ? (body.impacts as unknown as StakeholderImpactAssessment[])
              : [],
          },
        ),
      );
    }
    if (body.action === "simulate-deliberation") {
      return NextResponse.json(
        await service.simulateDeliberation(
          actor,
          requiredString(body, "deliberationId"),
        ),
      );
    }
    if (body.action === "decide-deliberation") {
      return NextResponse.json(
        await service.decideDeliberation(
          actor,
          requiredString(body, "deliberationId"),
          {
            outcome: requiredString(body, "outcome") as
              | "approved"
              | "rejected",
            approvals: [
              {
                actorId: actor.id,
                note:
                  typeof body.approvalNote === "string"
                    ? body.approvalNote
                    : undefined,
              },
            ],
            note: requiredString(body, "note"),
          },
        ),
      );
    }
    if (body.action === "apply-deliberation") {
      return NextResponse.json(
        await service.applyDeliberation(
          actor,
          requiredString(body, "deliberationId"),
        ),
      );
    }
    if (body.action === "submit-feedback") {
      return NextResponse.json(
        await service.submitFeedback(actor, {
          kind: requiredString(body, "kind") as FeedbackKind,
          target:
            body.target === undefined
              ? undefined
              : (body.target as unknown as FeedbackTarget),
          summary: requiredString(body, "summary"),
          details:
            typeof body.details === "string" ? body.details : undefined,
          appealOfCaseId:
            typeof body.appealOfCaseId === "string"
              ? body.appealOfCaseId
              : undefined,
        }),
        { status: 201 },
      );
    }
    if (body.action === "triage-feedback") {
      return NextResponse.json(
        await service.triageFeedback(
          actor,
          requiredString(body, "feedbackId"),
          {
            owner: typeof body.owner === "string" ? body.owner : undefined,
          },
        ),
      );
    }
    if (body.action === "start-review") {
      return NextResponse.json(
        await service.startFeedbackReview(
          actor,
          requiredString(body, "feedbackId"),
        ),
      );
    }
    if (body.action === "respond-feedback") {
      return NextResponse.json(
        await service.respondFeedback(
          actor,
          requiredString(body, "feedbackId"),
          {
            text: requiredString(body, "text"),
          },
        ),
      );
    }
    if (body.action === "dismiss-feedback") {
      return NextResponse.json(
        await service.dismissFeedback(
          actor,
          requiredString(body, "feedbackId"),
          {
            note: requiredString(body, "note"),
          },
        ),
      );
    }
    if (body.action === "resolve-appeal") {
      return NextResponse.json(
        await service.resolveAppeal(
          actor,
          requiredString(body, "feedbackId"),
          {
            outcome: requiredString(body, "outcome") as
              | "upheld"
              | "overturned",
            actions: Array.isArray(body.actions)
              ? (body.actions as unknown as FeedbackResolutionAction[])
              : [],
            note: requiredString(body, "note"),
          },
        ),
      );
    }
    if (body.action === "close-feedback") {
      return NextResponse.json(
        await service.closeFeedback(
          actor,
          requiredString(body, "feedbackId"),
        ),
      );
    }
    if (body.action === "publish-explanation") {
      return NextResponse.json(
        await service.publishExplanation(actor, {
          subject: requiredObject(body, "subject") as unknown as {
            kind: ExplanationSubjectKind;
            id: string;
          },
          uncertaintyCodes:
            Array.isArray(body.uncertaintyCodes) &&
            body.uncertaintyCodes.every(
              (entry) => typeof entry === "string",
            )
              ? body.uncertaintyCodes
              : undefined,
        }),
        { status: 201 },
      );
    }
    throw new ExperimentValidationError(
      "Unknown participation action",
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
