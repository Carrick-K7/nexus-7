import { NextResponse } from "next/server";
import { ExperimentConflictError, ExperimentNotFoundError, ExperimentPermissionError, ExperimentValidationError } from "@/experiments/errors";

/** Never publish raw database/driver errors or connection strings at the observation boundary. */
export function researchErrorResponse(error: unknown): NextResponse {
  const status = error instanceof ExperimentPermissionError ? 403 : error instanceof ExperimentNotFoundError ? 404
    : error instanceof ExperimentConflictError ? 409 : error instanceof ExperimentValidationError ? 400 : 503;
  return NextResponse.json({ error: status === 503 ? "Research observation is temporarily unavailable" : error instanceof Error ? error.message : "Research request rejected" }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}
