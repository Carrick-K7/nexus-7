// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as HEALTH, POST as HEALTH_WRITE } from "@/app/api/research/v1/health/route";
import { actorFromRequest } from "@/experiments/http";
import { getResearchService } from "./server";
import { getGovernanceService } from "@/governance/server";
import { GET, POST, PUT, PATCH, DELETE } from "@/app/api/research/v1/overview/route";
import { POST as CONTROL } from "@/app/api/research/v1/control/route";
import type { ExperimentActor } from "@/experiments/types";
import type { ResearchService } from "./service";

vi.mock("@/experiments/http", async (original) => ({ ...await original<typeof import("@/experiments/http")>(), actorFromRequest: vi.fn() }));
vi.mock("./server", () => ({ getResearchService: vi.fn() }));
vi.mock("@/governance/server", () => ({ getGovernanceService: vi.fn() }));
const actor: ExperimentActor = { id: "viewer", role: "viewer", principalType: "system", authSource: "public-observer", workspaceId: "workspace-neo-angeles" };
const fake = { overview: vi.fn(), get: vi.fn(), repository: { backend: "memory" as "memory" | "postgres" }, start: vi.fn(), pause: vi.fn(), resume: vi.fn() };
const request = (body: unknown) => new Request("http://reference.invalid/api/research/v1/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXUS_RELEASE_REVISION", "");
  fake.repository.backend = "memory";
  fake.get.mockResolvedValue(null);
  vi.mocked(actorFromRequest).mockResolvedValue(actor);
  vi.mocked(getResearchService).mockResolvedValue(fake as unknown as ResearchService);
  fake.overview.mockResolvedValue({ schemaVersion: "nexus.research-station.v1", station: null });
});

afterEach(() => vi.unstubAllEnvs());

describe("versioned research HTTP boundary with explicit reference fakes", () => {
  it("projects empty state without starting research and forbids caching", async () => {
    const result = await GET(new Request("http://reference.invalid/api/research/v1/overview"));
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({ schemaVersion: "nexus.research-station.v1", station: null,
      runtime: { releaseRevision: null, evidence: "local-unbound", lastEpisodeAt: null } });
    expect(fake.start).not.toHaveBeenCalled();
  });
  it("exposes durable exact-release readiness without claiming a live worker", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXUS_AUTH_MODE", "public-observer");
    expect((await HEALTH(new Request("http://reference.invalid/api/research/v1/health"))).status).toBe(503);
    fake.repository.backend = "postgres"; vi.stubEnv("NEXUS_RELEASE_REVISION", "a".repeat(40));
    const result = await HEALTH(new Request("http://reference.invalid/api/research/v1/health"));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ status: "ready", releaseRevision: "a".repeat(40), backend: "postgres", authorized: false, workerState: "not-proven-by-this-read" });
    expect(HEALTH_WRITE().status).toBe(405);
    expect(fake.start).not.toHaveBeenCalled();
  });
  it("does not disclose storage errors from either research observation route", async () => {
    fake.overview.mockRejectedValueOnce(new Error("private database credential details"));
    const overview = await GET(new Request("http://reference.invalid/api/research/v1/overview"));
    expect(overview.status).toBe(503); expect(await overview.text()).not.toContain("credential");
    fake.get.mockRejectedValueOnce(new Error("private database credential details"));
    const health = await HEALTH(new Request("http://reference.invalid/api/research/v1/health"));
    expect(health.status).toBe(503); expect(await health.text()).not.toContain("credential");
  });
  it("rejects all observation mutations before reading identity or constructing services", () => {
    for (const mutate of [POST, PUT, PATCH, DELETE]) {
      const result = mutate();
      expect(result.status).toBe(405);
      expect(result.headers.get("allow")).toContain("GET");
    }
    expect(actorFromRequest).not.toHaveBeenCalled();
    expect(getResearchService).not.toHaveBeenCalled();
  });
  it("does not accept a public or system actor as a human authorizer", async () => {
    expect((await CONTROL(request({ action: "start", seed: "x", subjectIds: ["x"] }))).status).toBe(405);
    vi.mocked(actorFromRequest).mockResolvedValue({ ...actor, authSource: "system", role: "admin" });
    expect((await CONTROL(request({ action: "start", seed: "x", subjectIds: ["x"] }))).status).toBe(403);
    expect(fake.start).not.toHaveBeenCalled();
  });
  it("uses authenticated human context for bounded control only", async () => {
    const human: ExperimentActor = { ...actor, id: "reference-human", role: "operator", principalType: "human", authSource: "development" };
    vi.mocked(actorFromRequest).mockResolvedValue(human);
    fake.start.mockResolvedValue({ status: "running" });
    const result = await CONTROL(request({ action: "start", seed: "x", subjectIds: ["x"], policy: { maxOracleCalls: 20 } }));
    expect(result.status).toBe(201);
    expect(getGovernanceService).toHaveBeenCalledOnce();
    expect(fake.start).toHaveBeenCalledWith(human, { seed: "x", subjectIds: ["x"], policy: { maxOracleCalls: 20 } });
    expect((await CONTROL(request({ action: "execute", shell: "anything" }))).status).toBe(400);
    expect((await CONTROL(request({ action: "pause", unexpected: true }))).status).toBe(400);
    expect(fake.pause).not.toHaveBeenCalled();
  });
});
