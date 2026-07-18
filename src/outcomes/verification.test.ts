// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  verifyOutcomeLearningAcceptance,
} from "./verification";

describe("outcome learning acceptance", () => {
  it(
    "covers delayed evaluation, memory invalidation, governed learning, and human review",
    async () => {
      const report =
        await verifyOutcomeLearningAcceptance();
      expect(report.failures).toEqual([]);
      expect(report.passed).toBe(true);
      expect(report.metrics).toMatchObject({
        outcomes: 4,
        outcomeWindows: 12,
        verdictsCovered: 4,
        deterministicReplayPercent: 100,
        resolvedIncidentCoveragePercent: 100,
        harmfulPositiveRetrievalCount: 0,
      });
    },
    30_000,
  );
});
