// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_CONTROLLER_CONTRACT_VERSION,
  runDeploymentControllerConformance,
} from "@/deployment";

describe("deployment controller conformance", () => {
  it("passes success, retry, ordering, partial failure, and rollback fixtures", async () => {
    const report = await runDeploymentControllerConformance(
      () => new Date("2026-07-18T08:00:00.000Z"),
    );

    expect(report).toMatchObject({
      schemaVersion: 1,
      contractVersion: DEPLOYMENT_CONTROLLER_CONTRACT_VERSION,
      adapterId: "http-deployment",
      passed: true,
      failures: [],
      checks: {
        successPath: true,
        duplicateRequestIdempotent: true,
        serverFailureRetried: true,
        timeoutRetried: true,
        outOfOrderTelemetryRejected: true,
        partialPayloadRejected: true,
        partialRollbackRecovered: true,
        rollbackIdempotent: true,
        injectedFailureRolledBack: true,
      },
    });
    expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
