// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  MECHANICS_CAMPAIGN,
} from "./campaign-definitions";
import {
  runHypothesisCampaign,
  verifyHypothesisCampaignReport,
  type HypothesisCampaignReport,
} from "./campaign";

describe("hypothesis campaign framework", () => {
  it("runs a deterministic campaign and verifies its own report", async () => {
    const report = await runHypothesisCampaign(MECHANICS_CAMPAIGN, {
      generatedAt: "2026-08-01T12:00:00.000Z",
    });
    expect(report.campaignId).toBe("mechanics-test");
    expect(report.schemaVersion).toBe("nexus.hypothesis-campaign.v1");
    expect(report.design.runCount).toBe(2);
    expect(report.runs).toHaveLength(2);
    expect(report.runs.every((run) => run.exactReplay)).toBe(true);
    expect(report.analysis.hypotheses[0].passed).toBe(true);
    expect(report.status).toBe("campaign-passed");
    const verification = verifyHypothesisCampaignReport(
      report,
      MECHANICS_CAMPAIGN,
    );
    expect(verification.passed).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  it("reproduces the identical report envelope from the same definition", async () => {
    const first = await runHypothesisCampaign(MECHANICS_CAMPAIGN, {
      generatedAt: "2026-08-01T12:00:00.000Z",
    });
    const second = await runHypothesisCampaign(MECHANICS_CAMPAIGN, {
      generatedAt: "2026-08-01T12:00:00.000Z",
    });
    expect(first.integrity.reportSha256).toBe(
      second.integrity.reportSha256,
    );
  });

  it("binds the policy override into the run and keeps defaults unchanged", async () => {
    const report = await runHypothesisCampaign(
      {
        ...MECHANICS_CAMPAIGN,
        id: "mechanics-policy",
        regimes: [
          {
            id: "solidarity",
            label: { zh: "互助", en: "Solidarity" },
            description: "Override test.",
            policy: {
              maintenanceReserveRate: 0.25,
              householdSafetyFloor: 0.72,
              bargainingWindowTurns: 5,
            },
          },
        ],
        evaluate: (runs) => [
          {
            passed: runs.every(
              (run) =>
                run.policy.householdSafetyFloor === 0.72 &&
                run.policy.bargainingWindowTurns === 5,
            ),
            observed: "policy-bound",
          },
        ],
      },
      { generatedAt: "2026-08-01T12:00:00.000Z" },
    );
    expect(report.runs[0].policy).toEqual({
      maintenanceReserveRate: 0.25,
      householdSafetyFloor: 0.72,
      bargainingWindowTurns: 5,
    });
    expect(report.analysis.hypotheses[0].passed).toBe(true);
  });

  it("clamps out-of-bounds policy values to the constitutional bounds", async () => {
    const report = await runHypothesisCampaign(
      {
        ...MECHANICS_CAMPAIGN,
        id: "mechanics-clamp",
        regimes: [
          {
            id: "clamped",
            label: { zh: "限幅", en: "Clamped" },
            description: "Clamp test.",
            policy: {
              maintenanceReserveRate: 9,
              householdSafetyFloor: 0.1,
              bargainingWindowTurns: 1,
            },
          },
        ],
        evaluate: (runs) => [
          {
            passed:
              runs[0].policy.maintenanceReserveRate === 0.3 &&
              runs[0].policy.householdSafetyFloor === 0.55 &&
              runs[0].policy.bargainingWindowTurns === 2,
            observed: "clamped-to-bounds",
          },
        ],
      },
      { generatedAt: "2026-08-01T12:00:00.000Z" },
    );
    expect(report.analysis.hypotheses[0].passed).toBe(true);
  });

  it("publishes a rejected hypothesis as valid failed evidence", async () => {
    const failed = await runHypothesisCampaign(
      {
        ...MECHANICS_CAMPAIGN,
        id: "mechanics-failing",
        evaluate: (runs) => [
          {
            passed: false,
            observed: `deliberate rejection over ${runs.length} runs`,
          },
        ],
      },
      { generatedAt: "2026-08-01T12:00:00.000Z" },
    );
    expect(failed.status).toBe("campaign-failed");
    expect(failed.analysis.passed).toBe(0);
    const verification = verifyHypothesisCampaignReport(
      failed,
      { ...MECHANICS_CAMPAIGN, id: "mechanics-failing", evaluate: () => [{ passed: false, observed: "" }] },
    );
    expect(verification.passed).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  it("fails closed on tampered reports, altered runs and changed evaluation", async () => {
    const report = await runHypothesisCampaign(MECHANICS_CAMPAIGN, {
      generatedAt: "2026-08-01T12:00:00.000Z",
    });

    const tampered: HypothesisCampaignReport = structuredClone(report);
    tampered.runs[0].ralr.refusals += 1;
    expect(verifyHypothesisCampaignReport(tampered, MECHANICS_CAMPAIGN).errors).toContain(
      "results-hash-mismatch",
    );

    const replaced = structuredClone(report);
    replaced.analysis.hypotheses[0].passed = false;
    expect(
      verifyHypothesisCampaignReport(replaced, MECHANICS_CAMPAIGN).errors,
    ).toContain("hypothesis-evaluation-mismatch");

    const renamed: HypothesisCampaignReport = structuredClone(report);
    renamed.campaignId = "attacker-campaign";
    expect(
      verifyHypothesisCampaignReport(renamed, MECHANICS_CAMPAIGN).errors,
    ).toContain("campaign-identity-mismatch");
  });
});
