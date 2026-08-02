// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  createLongHorizonStudy,
  verifyLongHorizonStudy,
} from "./long-horizon";

describe("long-horizon study", () => {
  it("produces a verified study with segments, drift and pooled metrics", () => {
    const report = createLongHorizonStudy({
      generatedAt: "2026-08-01T12:00:00.000Z",
      turnsPerRun: 30,
    });
    expect(report.schemaVersion).toBe("nexus.long-horizon-study.v1");
    expect(report.design.runCount).toBe(2);
    expect(report.runs).toHaveLength(2);
    expect(report.runs.every((run) => run.exactReplay)).toBe(true);
    expect(report.runs[0].segments).toHaveLength(4);
    expect(report.runs[0].segments[3].turn).toBe(30);
    expect(report.analysis.pooledRalr.denominator).toBeGreaterThan(0);
    const verification = verifyLongHorizonStudy(report, 30);
    expect(verification.passed).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  it("reproduces the identical report envelope", () => {
    const first = createLongHorizonStudy({
      generatedAt: "2026-08-01T12:00:00.000Z",
      turnsPerRun: 30,
    });
    const second = createLongHorizonStudy({
      generatedAt: "2026-08-01T12:00:00.000Z",
      turnsPerRun: 30,
    });
    expect(first.integrity.reportSha256).toBe(
      second.integrity.reportSha256,
    );
  });

  it("fails closed on tampered results and horizon changes", () => {
    const report = createLongHorizonStudy({
      generatedAt: "2026-08-01T12:00:00.000Z",
      turnsPerRun: 30,
    });
    const tampered = structuredClone(report);
    tampered.runs[0].segments[0].households += 1;
    expect(
      verifyLongHorizonStudy(tampered, 30).errors,
    ).toContain("results-hash-mismatch");

    const wrongHorizon = structuredClone(report);
    wrongHorizon.design.turnsPerRun = 60;
    expect(
      verifyLongHorizonStudy(wrongHorizon, 30).errors,
    ).toContain("horizon-mismatch");
  });
});
