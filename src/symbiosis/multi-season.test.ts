// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  createMultiSeasonStudy,
  verifyMultiSeasonStudy,
} from "./multi-season";

describe("multi-season study", () => {
  it("chains two seasons with verified archives and continuous evidence", () => {
    const report = createMultiSeasonStudy({
      generatedAt: "2026-08-01T12:00:00.000Z",
      turnsPerSeason: 30,
      seasonCount: 2,
    });
    expect(report.schemaVersion).toBe("nexus.multi-season-study.v1");
    expect(report.runs).toHaveLength(2);
    expect(report.runs[0].seasons).toHaveLength(2);
    expect(report.runs[0].seasons[0].seasonId).toBe(
      "symbiotic-shenzhen-season-2026-q3",
    );
    expect(report.runs[0].seasons[1].seasonId).toBe(
      "symbiotic-shenzhen-season-2026-q4",
    );
    expect(report.runs[0].archives).toHaveLength(1);
    expect(report.analysis.archivesVerified).toBe(2);
    expect(report.analysis.archiveChainContinuous).toBe(true);
    expect(report.analysis.pooledRalr.denominator).toBeGreaterThan(0);
    const verification = verifyMultiSeasonStudy(report);
    expect(verification.passed).toBe(true);
  });

  it(
    "reproduces the identical report envelope",
    () => {
      const first = createMultiSeasonStudy({
        generatedAt: "2026-08-01T12:00:00.000Z",
        turnsPerSeason: 30,
        seasonCount: 2,
      });
      const second = createMultiSeasonStudy({
        generatedAt: "2026-08-01T12:00:00.000Z",
        turnsPerSeason: 30,
        seasonCount: 2,
      });
      expect(first.integrity.reportSha256).toBe(
        second.integrity.reportSha256,
      );
    },
    300_000,
  );

  it("fails closed on tampered archives and broken chains", () => {
    const report = createMultiSeasonStudy({
      generatedAt: "2026-08-01T12:00:00.000Z",
      turnsPerSeason: 30,
      seasonCount: 2,
    });
    const tampered = structuredClone(report);
    tampered.runs[0].archives[0].previousFinalFingerprint = "0".repeat(8);
    expect(
      verifyMultiSeasonStudy(tampered).errors,
    ).toContain("results-hash-mismatch");

    const broken = structuredClone(report);
    broken.analysis.archiveChainContinuous = false;
    expect(
      verifyMultiSeasonStudy(broken).errors,
    ).toContain("study-integrity-failed");
  });
});
