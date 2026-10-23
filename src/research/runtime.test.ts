// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { persistentResearchRequired, researchRuntime } from "./runtime";
import { researchErrorResponse } from "./http-errors";
import { ExperimentPermissionError } from "@/experiments/errors";
import type { ResearchStation } from "./contracts";

afterEach(() => vi.unstubAllEnvs());
describe("production research runtime evidence", () => {
  it("never substitutes request time or a fake SHA for execution evidence", () => {
    vi.stubEnv("NEXUS_RELEASE_REVISION", "not-a-release");
    expect(researchRuntime(null)).toEqual({ releaseRevision: null, evidence: "local-unbound", lastEpisodeAt: null });
    vi.stubEnv("NEXUS_RELEASE_REVISION", "a".repeat(40));
    const station = { episodes: [{ completedAt: "2026-10-21T01:00:00.000Z" }] } as ResearchStation;
    expect(researchRuntime(station)).toEqual({ releaseRevision: "a".repeat(40), evidence: "deployment-env", lastEpisodeAt: "2026-10-21T01:00:00.000Z" });
  });
  it("requires durable storage in production except explicit local development fixtures", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXUS_AUTH_MODE", "public-observer");
    expect(persistentResearchRequired()).toBe(true);
    vi.stubEnv("NEXUS_AUTH_MODE", "development"); expect(persistentResearchRequired()).toBe(false);
    vi.stubEnv("NODE_ENV", "test"); expect(persistentResearchRequired()).toBe(false);
  });
  it("does not leak database driver details into a public error", async () => {
    const response = researchErrorResponse(new Error("postgresql://private-user:private-password@private-host/private-db"));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("private-");
    expect(body).toContain("temporarily unavailable");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("preserves controlled authorization failures without converting them to success", () => {
    expect(researchErrorResponse(new ExperimentPermissionError("Research control requires a human identity")).status).toBe(403);
  });
});
