// @vitest-environment node

import {
  createServer,
} from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  HttpDeploymentAdapter,
  InMemoryDeploymentAdapter,
} from "@/deployment";

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

describe("deployment adapters", () => {
  it("supports progressive traffic, telemetry, promotion, and rollback in memory", async () => {
    const adapter = new InMemoryDeploymentAdapter();
    const canary = await adapter.startCanary({
      workspaceId: "workspace-test",
      proposalId: "proposal-test",
      artifact: {
        name: "nexus",
        repository: "Carrick-K7/nexus-7",
        commitSha: "abc123",
        evidenceManifestSha256: "digest",
        evidenceManifestFingerprint: "fingerprint",
      },
      environment: "production",
      initialTrafficPercent: 5,
    });

    expect(canary.trafficPercent).toBe(5);
    expect((await adapter.observe(canary.deploymentId)).healthy).toBe(true);
    expect(
      (await adapter.shiftTraffic(canary.deploymentId, 50)).trafficPercent,
    ).toBe(50);
    expect((await adapter.promote(canary.deploymentId)).trafficPercent).toBe(
      100,
    );
    expect(
      (await adapter.rollback(canary.deploymentId, "drill")).trafficPercent,
    ).toBe(0);
  });

  it("sends authenticated requests through the HTTP deployment contract", async () => {
    const server = createServer((request, response) => {
      expect(request.headers.authorization).toBe("Bearer deployment-secret");
      response.writeHead(200, { "Content-Type": "application/json" });
      if (request.url?.endsWith("/telemetry")) {
        response.end(
          JSON.stringify({
            observedAt: "2026-07-16T12:00:00.000Z",
            requestCount: 500,
            errorRatePercent: 0.1,
            p95LatencyMs: 200,
            availabilityPercent: 99.99,
            healthy: true,
          }),
        );
        return;
      }
      response.end(
        JSON.stringify({
          deploymentId: "external-deployment",
          baselineRevision: "stable",
          candidateRevision: "candidate",
          trafficPercent: 5,
          environment: "production",
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("HTTP deployment test server did not start");
    }
    const adapter = new HttpDeploymentAdapter({
      baseUrl: `http://127.0.0.1:${address.port}`,
      token: "deployment-secret",
    });
    const canary = await adapter.startCanary({
      workspaceId: "workspace-test",
      proposalId: "proposal-test",
      artifact: {
        name: "nexus",
        repository: "Carrick-K7/nexus-7",
        commitSha: "abc123",
        evidenceManifestSha256: "digest",
        evidenceManifestFingerprint: "fingerprint",
      },
      environment: "production",
      initialTrafficPercent: 5,
    });

    expect(canary.deploymentId).toBe("external-deployment");
    expect((await adapter.observe(canary.deploymentId)).requestCount).toBe(500);
  });
});
