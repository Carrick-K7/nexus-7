// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, PUT, PATCH, DELETE } from "@/app/api/research/v1/human/route";
import { actorFromRequest } from "@/experiments/http";
import { ExperimentPermissionError } from "@/experiments/errors";
import type { ExperimentActor } from "@/experiments/types";
import type { ResearchOverview } from "./contracts";
import type { ResearchService } from "./service";
import { getResearchService } from "./server";
import { parseHumanOverview } from "./human-contracts";

vi.mock("@/experiments/http", () => ({ actorFromRequest: vi.fn() }));
vi.mock("./server", () => ({ getResearchService: vi.fn() }));
const actor: ExperimentActor = { id: "reference-viewer", role: "viewer", principalType: "system", authSource: "public-observer", workspaceId: "reference-workspace" };
const fake = { overview: vi.fn(), get: vi.fn(), start: vi.fn(), step: vi.fn(), pause: vi.fn(), resume: vi.fn() };
const request = () => new Request("http://reference.invalid/api/research/v1/human");
function overview(): ResearchOverview {
  return { schemaVersion: "nexus.research-station.v1", generatedAt: "2026-01-02T00:00:00.000Z", backend: "memory", station: null, subjects: [],
    boundary: { productionWrites: false, arbitraryCodeExecution: false, liveModelCalls: false, knownSeedsAreNotDiscoveries: true, evaluatorIsolation: "separate-module-not-hostile-process-isolation" } };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NEXUS_RELEASE_REVISION", "");
  vi.mocked(actorFromRequest).mockResolvedValue(actor);
  vi.mocked(getResearchService).mockResolvedValue(fake as unknown as ResearchService);
  fake.overview.mockResolvedValue(overview());
});
afterEach(() => vi.unstubAllEnvs());

describe("versioned human HTTP boundary with explicit reference service", () => {
  it("authorizes exactly one read and projects an explicit null without starting any work", async () => {
    const req = request(); const result = await GET(req); const body: unknown = await result.json();
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ schemaVersion: "nexus.research-human.v1", study: null, story: null, storyAvailability: { status: "pending", reason: "no-study" } });
    expect(parseHumanOverview(body)).not.toBeNull();
    expect(actorFromRequest).toHaveBeenCalledExactlyOnceWith(req); expect(getResearchService).toHaveBeenCalledOnce(); expect(fake.overview).toHaveBeenCalledExactlyOnceWith(actor);
    for (const fn of [fake.get, fake.start, fake.step, fake.pause, fake.resume]) expect(fn).not.toHaveBeenCalled();
  });
  it("uses the exact configured release assertion and does not claim a worker heartbeat", async () => {
    vi.stubEnv("NEXUS_RELEASE_REVISION", "a".repeat(40));
    const body = await (await GET(request())).json();
    expect(body.source).toEqual({ backend: "memory", releaseRevision: "a".repeat(40), releaseEvidence: "deployment-env", stationRevision: null });
    expect(JSON.stringify(body)).not.toMatch(/heartbeat|cpu|memoryUsage|modelTraining/);
  });
  it.each(["identity", "construction", "read", "projection"])("returns generic uncached 503 for an unknown %s failure, never private error text", async (where) => {
    const error = new Error("PRIVATE_CREDENTIAL_DATABASE_DETAILS");
    if (where === "identity") vi.mocked(actorFromRequest).mockRejectedValueOnce(error);
    if (where === "construction") vi.mocked(getResearchService).mockRejectedValueOnce(error);
    if (where === "read") fake.overview.mockRejectedValueOnce(error);
    if (where === "projection") fake.overview.mockResolvedValueOnce({ ...overview(), station: {} });
    const response = await GET(request());
    expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Research observation is temporarily unavailable" });
  });
  it("preserves existing explicit authorization failures and never constructs a service", async () => {
    vi.mocked(actorFromRequest).mockRejectedValueOnce(new ExperimentPermissionError("Research read denied"));
    const response = await GET(request()); expect(response.status).toBe(403); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getResearchService).not.toHaveBeenCalled();
  });
  it("rejects every write before reading identity or constructing a service", () => {
    for (const mutate of [POST, PUT, PATCH, DELETE]) {
      const response = mutate(); expect(response.status).toBe(405); expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(actorFromRequest).not.toHaveBeenCalled(); expect(getResearchService).not.toHaveBeenCalled(); expect(fake.overview).not.toHaveBeenCalled();
  });
});
