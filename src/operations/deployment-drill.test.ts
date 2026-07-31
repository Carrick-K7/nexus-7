// @vitest-environment node

import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  HttpDeploymentAdapter,
  InMemoryDeploymentAdapter,
} from "@/deployment";
import {
  runDeploymentRollbackDrill,
} from "./deployment-drill";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

describe("deployment rollback drill", () => {
  it("detects an injected failure and returns traffic to zero", async () => {
    const report = await runDeploymentRollbackDrill({
      adapter: new InMemoryDeploymentAdapter(),
      artifact: {
        name: "nexus",
        repository: "Carrick-K7/nexus-7",
        commitSha: "a".repeat(40),
        evidenceManifestSha256: "b".repeat(64),
        evidenceManifestFingerprint: "c".repeat(64),
      },
      drillId: "rollback-test",
      now: () => new Date("2026-07-16T12:00:00.000Z"),
    });

    expect(report.passed).toBe(true);
    expect(report.traffic).toEqual({
      initialPercent: 5,
      drillPercent: 25,
      finalPercent: 0,
    });
    expect(report.faultTelemetry.healthy).toBe(false);
    expect(report.checks).toEqual({
      progressiveTraffic: true,
      faultDetected: true,
      rollbackExecuted: true,
      rollbackWithinObjective: true,
    });
  });

  it("runs the complete drill through the authenticated HTTP adapter", async () => {
    let trafficPercent = 0;
    let faultInjected = false;
    const server = createServer((request, response) => {
      expect(request.headers.authorization).toBe("Bearer drill-secret");
      const pathname = request.url ?? "";
      if (pathname.endsWith("/drills/failure")) {
        faultInjected = true;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end("{}");
        return;
      }
      if (pathname.endsWith("/telemetry")) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            observedAt: "2026-07-16T12:00:00.000Z",
            requestCount: 500,
            errorRatePercent: faultInjected ? 14 : 0.1,
            p95LatencyMs: faultInjected ? 2_000 : 180,
            availabilityPercent: faultInjected ? 86 : 99.99,
            healthy: !faultInjected,
          }),
        );
        return;
      }
      if (pathname.endsWith("/rollback")) {
        trafficPercent = 0;
      } else if (pathname.endsWith("/traffic")) {
        trafficPercent = 25;
      } else if (request.method === "POST" && pathname.endsWith("/canaries")) {
        trafficPercent = 5;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          deploymentId: "http-drill",
          baselineRevision: "stable",
          candidateRevision: "candidate",
          trafficPercent,
          environment: "staging",
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("HTTP drill server did not start");
    }
    const report = await runDeploymentRollbackDrill({
      adapter: new HttpDeploymentAdapter({
        baseUrl: `http://127.0.0.1:${address.port}`,
        token: "drill-secret",
      }),
      artifact: {
        name: "nexus",
        repository: "Carrick-K7/nexus-7",
        commitSha: "a".repeat(40),
        evidenceManifestSha256: "b".repeat(64),
        evidenceManifestFingerprint: "c".repeat(64),
      },
      drillId: "http-rollback-test",
    });

    expect(report.passed).toBe(true);
    expect(report.adapterId).toBe("http-deployment");
    expect(report.traffic.finalPercent).toBe(0);
    expect(report.faultTelemetry.errorRatePercent).toBe(14);
  });
});
