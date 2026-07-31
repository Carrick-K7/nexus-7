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
  consumeClosureApiQuota,
} from "@/closure/rate-limit";
import {
  getClosedLoopService,
} from "@/closure/server";
import type {
  ClosedLoopCommand,
} from "@/closure/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rateHeaders(
  quota: ReturnType<typeof consumeClosureApiQuota>,
): HeadersInit {
  return {
    "x-ratelimit-limit": String(quota.limit),
    "x-ratelimit-remaining": String(quota.remaining),
    "x-ratelimit-reset": quota.resetAt,
  };
}

function rateLimited(
  quota: ReturnType<typeof consumeClosureApiQuota>,
): NextResponse | undefined {
  if (quota.allowed) {
    return undefined;
  }
  return NextResponse.json(
    {
      error: "Closed-loop API rate limit exceeded",
      retryAfterSeconds: quota.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        ...rateHeaders(quota),
        "retry-after": String(quota.retryAfterSeconds),
      },
    },
  );
}

function requiredString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new ExperimentValidationError(
      `${field} is required`,
    );
  }
  return value;
}

export async function GET(
  request: Request,
): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    const quota = consumeClosureApiQuota(actor, false);
    const rejected = rateLimited(quota);
    if (rejected) {
      return rejected;
    }
    return NextResponse.json(
      await (await getClosedLoopService()).overview(actor),
      { headers: rateHeaders(quota) },
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    const quota = consumeClosureApiQuota(actor, true);
    const rejected = rateLimited(quota);
    if (rejected) {
      return rejected;
    }
    const body = await readJsonObject(request);
    const service = await getClosedLoopService();
    if (body.action === "start") {
      return NextResponse.json(
        await service.startCase(
          requiredString(body, "scenarioId"),
          requiredString(body, "idempotencyKey"),
          actor,
        ),
        { status: 201, headers: rateHeaders(quota) },
      );
    }
    if (body.action === "run-reference") {
      return NextResponse.json(
        await service.runReferenceFlow(actor),
        { headers: rateHeaders(quota) },
      );
    }
    if (body.action === "command") {
      const command = requiredString(
        body,
        "command",
      ) as ClosedLoopCommand;
      if (
        ![
          "advance",
          "pause",
          "resume",
          "cancel",
          "rollback",
          "emergency-stop",
          "reopen",
        ].includes(command)
      ) {
        throw new ExperimentValidationError(
          "command is invalid",
        );
      }
      return NextResponse.json(
        await service.command(
          requiredString(body, "caseId"),
          command,
          requiredString(body, "idempotencyKey"),
          actor,
          {
            reason:
              typeof body.reason === "string"
                ? body.reason
                : undefined,
          },
        ),
        { headers: rateHeaders(quota) },
      );
    }
    throw new ExperimentValidationError(
      "Unknown closed-loop action",
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
