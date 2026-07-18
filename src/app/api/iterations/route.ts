import { NextResponse } from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
  readJsonObject,
} from "@/experiments/http";
import { ExperimentValidationError } from "@/experiments";
import { getControlledIterationService } from "@/iteration/server";
import type {
  ImprovementProposal,
} from "@/iteration";
import type {
  ReleaseEnvironment,
} from "@/governance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isReleaseArtifact(
  value: unknown,
): value is NonNullable<ImprovementProposal["releaseArtifact"]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const artifact = value as Record<string, unknown>;
  return (
    typeof artifact.name === "string" &&
    artifact.name.trim().length > 0 &&
    typeof artifact.repository === "string" &&
    artifact.repository.trim().length > 0 &&
    typeof artifact.commitSha === "string" &&
    /^[a-f0-9]{40}([a-f0-9]{24})?$/i.test(artifact.commitSha) &&
    typeof artifact.evidenceManifestSha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(artifact.evidenceManifestSha256) &&
    typeof artifact.evidenceManifestFingerprint === "string" &&
    /^[a-f0-9]{64}$/i.test(artifact.evidenceManifestFingerprint)
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const service = await getControlledIterationService();
    return NextResponse.json({
      proposals: await service.list(await actorFromRequest(request)),
    });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    if (typeof body.sourceRunId !== "string" || !body.sourceRunId) {
      throw new ExperimentValidationError("sourceRunId is required");
    }
    const changeScope =
      body.changeScope === "code" || body.changeScope === "deployment"
        ? body.changeScope
        : "policy";
    const targetEnvironment: ReleaseEnvironment =
      body.targetEnvironment === "staging" ||
      body.targetEnvironment === "production"
        ? body.targetEnvironment
        : "development";
    if (
      changeScope !== "policy" &&
      !isReleaseArtifact(body.releaseArtifact)
    ) {
      throw new ExperimentValidationError(
        "Code and deployment proposals require a complete release artifact with exact commit and evidence digests",
      );
    }
    const service = await getControlledIterationService();
    const proposal = await service.propose(
      body.sourceRunId,
      await actorFromRequest(request),
      {
        changeScope,
        releaseArtifact: isReleaseArtifact(body.releaseArtifact)
          ? body.releaseArtifact
          : undefined,
        targetEnvironment:
          changeScope === "policy" ? undefined : targetEnvironment,
      },
    );
    return NextResponse.json(proposal, { status: 201 });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
