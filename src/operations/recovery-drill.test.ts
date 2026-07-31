// @vitest-environment node

import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  runPostgresRecoveryDrill,
} from "./recovery-drill";

const sourceUrl = process.env.TEST_DATABASE_URL;
const restoreUrl = process.env.TEST_RESTORE_DATABASE_URL;
const integrationDescribe =
  sourceUrl && restoreUrl ? describe : describe.skip;
const sourcePool = sourceUrl
  ? new Pool({ connectionString: sourceUrl })
  : null;
const restorePool = restoreUrl
  ? new Pool({ connectionString: restoreUrl })
  : null;

integrationDescribe("PostgreSQL recovery drill", () => {
  afterAll(async () => {
    await Promise.all([
      sourcePool?.end(),
      restorePool?.end(),
    ]);
  });

  it(
    "meets RPO/RTO and resumes writes after an exact restore",
    async () => {
      const report = await runPostgresRecoveryDrill({
        sourcePool: sourcePool!,
        restorePool: restorePool!,
        drillId: `integration-${Date.now()}`,
        recoveryPointObjectiveMs: 60_000,
        recoveryTimeObjectiveMs: 120_000,
      });

      expect(report.passed).toBe(true);
      expect(report.source.fingerprint).toBe(report.restored.fingerprint);
      expect(report.checks.workerLeaseCleared).toBe(true);
      expect(report.checks.sequencesWritable).toBe(true);
    },
    30_000,
  );
});
