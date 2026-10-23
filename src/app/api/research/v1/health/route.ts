import { NextResponse } from "next/server";
import { actorFromRequest } from "@/experiments/http";
import { getResearchService } from "@/research/server";
import { persistentResearchRequired, researchRuntime } from "@/research/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    const service = await getResearchService();
    const station = await service.get(actor);
    const evidence = researchRuntime(station);
    const ready = !persistentResearchRequired() || service.repository.backend === "postgres" && evidence.releaseRevision !== null;
    return NextResponse.json({ schemaVersion: "nexus.research-health.v1", status: ready ? "ready" : "not-ready",
      releaseRevision: evidence.releaseRevision, backend: service.repository.backend, authorized: station !== null,
      researchStatus: station?.status ?? null, lastEpisodeAt: evidence.lastEpisodeAt,
      workerState: "not-proven-by-this-read", boundary: "Service readiness is not research progress or a worker heartbeat" },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ schemaVersion: "nexus.research-health.v1", status: "not-ready", error: "Research readiness is unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

const readOnly = () => NextResponse.json({ error: "Research readiness is read-only" }, { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
export const POST = readOnly;
export const PUT = readOnly;
export const PATCH = readOnly;
export const DELETE = readOnly;
