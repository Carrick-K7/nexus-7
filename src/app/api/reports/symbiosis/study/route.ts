import {
  NextResponse,
} from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
} from "@/experiments/http";
import {
  assertActorPermission,
} from "@/experiments/authorization";
import {
  readFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";
import type {
  MultiSeasonStudyReport,
} from "@/symbiosis/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cached: MultiSeasonStudyReport | undefined;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    assertActorPermission(actor, "workspace:read");
    const turns = Number(
      new URL(request.url).searchParams.get("turns") ?? 90,
    );
    if (turns !== 90) {
      return NextResponse.json(
        { error: "Only the frozen 90-Turn v4 reference study is exposed" },
        { status: 400 },
      );
    }
    if (!cached) {
      cached = JSON.parse(
        await readFile(
          resolve("public/data/symbiosis-study.json"),
          "utf8",
        ),
      ) as MultiSeasonStudyReport;
    }
    return NextResponse.json(cached);
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
