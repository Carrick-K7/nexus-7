import { NextResponse } from "next/server";
import {
  ExperimentConflictError,
  ExperimentNotFoundError,
  ExperimentPermissionError,
  ExperimentValidationError,
} from "./errors";
import type {
  ExperimentActor,
} from "./types";
import { authenticateRequest } from "@/auth/server";
import { getGovernanceService } from "@/governance/server";

export async function actorFromRequest(
  request: Request,
): Promise<ExperimentActor> {
  const actor = await authenticateRequest(request);
  return (await getGovernanceService()).resolveActor(actor);
}

export function experimentErrorResponse(error: unknown): NextResponse {
  const message =
    error instanceof Error ? error.message : "Unknown experiment platform error";
  if (error instanceof ExperimentNotFoundError) {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  if (error instanceof ExperimentPermissionError) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  if (error instanceof ExperimentConflictError) {
    return NextResponse.json({ error: message }, { status: 409 });
  }
  if (error instanceof ExperimentValidationError) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const body: unknown = await request.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ExperimentValidationError("Request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}
