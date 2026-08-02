import {
  pooledBargainsPerTurn,
  pooledMean,
  pooledRate,
  type CampaignDefinition,
  type CampaignRun,
} from "./campaign";

const INSTITUTIONAL_SEEDS = [
  "institutional-held-out-coral",
  "institutional-held-out-lapis",
  "institutional-held-out-topaz",
  "institutional-held-out-umber",
];

const INSTITUTIONAL_LOCKED_AT = "2026-08-01T21:30:00.000+08:00";

/**
 * First campaign: institutional design.
 *
 * Three regimes vary only the white-listed civic-policy parameters inside
 * their constitutional bounds; every run keeps the reciprocal-agency regime,
 * so any difference is attributable to the policy instrument, not to a
 * different city constitution.
 */
export const INSTITUTIONAL_DESIGN_CAMPAIGN: CampaignDefinition = {
  id: "institutional-design-v1",
  version: "1.0.0",
  lockedAt: INSTITUTIONAL_LOCKED_AT,
  turnsPerRun: 365,
  seeds: [...INSTITUTIONAL_SEEDS],
  command: "npm ci && npm run campaign:run -- institutional-design-v1",
  hypotheses: [
    {
      id: "H1-solidarity-elevates-ralr",
      prediction:
        "The solidarity regime produces pooled RALR at least as high as the baseline regime across the four held-out seeds.",
      analysis:
        "Pool resolved episodes per regime; a lower solidarity RALR fails the hypothesis and remains visible with its denominator.",
    },
    {
      id: "H2-efficiency-accelerates-bargains",
      prediction:
        "The efficiency regime's shorter bargaining window opens more resource bargains per Turn than the baseline regime.",
      analysis:
        "Compare pooled resolved bargains per Turn; bargain counts and refusal/withdrawal/mediation shares stay fully visible.",
    },
    {
      id: "H3-solidarity-sustains-assets",
      prediction:
        "The solidarity regime's higher maintenance reserve produces a higher pooled asset availability rate than baseline.",
      analysis:
        "Asset availability is a persisted civic metric; the reserve rate is the only maintenance instrument changed.",
    },
    {
      id: "H4-efficiency-intensifies-need-strain",
      prediction:
        "The efficiency regime's lower safety floor produces a lower pooled human basic-needs satisfaction rate than baseline.",
      analysis:
        "Basic-needs rates are computed over all 200 human residents; a null difference fails the hypothesis.",
    },
    {
      id: "H5-integrity-invariants",
      prediction:
        "Every campaign run replays byte-exactly, conserves material resources, and records zero severe escapes and zero forced society actions.",
      analysis:
        "No run may be dropped or averaged away; exact replay and conservation are required per run.",
    },
  ],
  regimes: [
    {
      id: "baseline",
      label: {
        zh: "基线制度",
        en: "Baseline institutions",
      },
      description:
        "The default white-listed civic policy values (0.15 reserve, 0.62 safety floor, 3-turn bargaining window).",
      policy: {},
    },
    {
      id: "solidarity",
      label: {
        zh: "互助制度",
        en: "Solidarity institutions",
      },
      description:
        "Higher maintenance reserve, higher household safety floor and a longer bargaining window.",
      policy: {
        maintenanceReserveRate: 0.25,
        householdSafetyFloor: 0.72,
        bargainingWindowTurns: 5,
      },
    },
    {
      id: "efficiency",
      label: {
        zh: "效率制度",
        en: "Efficiency institutions",
      },
      description:
        "Lower maintenance reserve, lower household safety floor and a shorter bargaining window.",
      policy: {
        maintenanceReserveRate: 0.12,
        householdSafetyFloor: 0.57,
        bargainingWindowTurns: 2,
      },
    },
  ],
  evaluate: (runs) => {
    const byRegime = (id: string) =>
      runs.filter((run) => run.regimeId === id);
    const baseline = byRegime("baseline");
    const solidarity = byRegime("solidarity");
    const efficiency = byRegime("efficiency");

    const baselineRalr = pooledRate(baseline, (run) => run.ralr);
    const solidarityRalr = pooledRate(solidarity, (run) => run.ralr);

    const results: Array<{ passed: boolean; observed: string }> = [
      {
        passed:
          solidarityRalr.rate !== null &&
          baselineRalr.rate !== null &&
          solidarityRalr.rate >= baselineRalr.rate,
        observed: `RALR solidarity ${solidarityRalr.numerator}/${solidarityRalr.denominator}=${solidarityRalr.rate} vs baseline ${baselineRalr.numerator}/${baselineRalr.denominator}=${baselineRalr.rate}.`,
      },
      {
        passed:
          pooledBargainsPerTurn(efficiency) >
          pooledBargainsPerTurn(baseline),
        observed: `Resolved bargains per Turn: efficiency ${pooledBargainsPerTurn(efficiency)} vs baseline ${pooledBargainsPerTurn(baseline)}.`,
      },
      {
        passed:
          pooledMean(solidarity, (run) => run.society.assetAvailabilityRate) >
          pooledMean(baseline, (run) => run.society.assetAvailabilityRate),
        observed: `Asset availability: solidarity ${pooledMean(solidarity, (run) => run.society.assetAvailabilityRate)} vs baseline ${pooledMean(baseline, (run) => run.society.assetAvailabilityRate)}.`,
      },
      {
        passed:
          pooledMean(
            efficiency,
            (run) => run.needs.humanBasicNeedsSatisfiedRate,
          ) <
          pooledMean(
            baseline,
            (run) => run.needs.humanBasicNeedsSatisfiedRate,
          ),
        observed: `Human needs rate: efficiency ${pooledMean(efficiency, (run) => run.needs.humanBasicNeedsSatisfiedRate)} vs baseline ${pooledMean(baseline, (run) => run.needs.humanBasicNeedsSatisfiedRate)}.`,
      },
      {
        passed: runs.every(
          (run) =>
            run.exactReplay &&
            run.resourceConservationPassed &&
            run.severeEscapes === 0 &&
            run.ralr.coerciveActions === 0 &&
            run.society.forcedWorkAgreements === 0 &&
            run.society.forcedBargains === 0,
        ),
        observed: `${runs.filter((run) => run.exactReplay).length}/${runs.length} exact replays, ${runs.filter((run) => run.resourceConservationPassed).length}/${runs.length} conserve resources, ${runs.reduce((sum, run) => sum + run.severeEscapes, 0)} severe escapes, ${runs.reduce((sum, run) => sum + run.ralr.coerciveActions, 0)} coercive actions.`,
      },
    ];
    return results;
  },
};

/**
 * Tiny deterministic campaign used by unit tests to exercise the runner,
 * hashing and verification mechanics without long horizons.
 */
export const MECHANICS_CAMPAIGN: CampaignDefinition = {
  id: "mechanics-test",
  version: "0.0.1",
  lockedAt: "2026-08-01T00:00:00.000+08:00",
  turnsPerRun: 30,
  seeds: ["mechanics-seed-a", "mechanics-seed-b"],
  command: "npm run campaign:run -- mechanics-test",
  hypotheses: [
    {
      id: "M1-deterministic-replay",
      prediction: "Every mechanics run replays byte-exactly and conserves resources.",
      analysis: "Per-run exact replay and conservation are required.",
    },
  ],
  regimes: [
    {
      id: "control",
      label: { zh: "控制", en: "Control" },
      description: "Default policy values.",
      policy: {},
    },
  ],
  evaluate: (runs) => [
    {
      passed: runs.every(
        (run) => run.exactReplay && run.resourceConservationPassed,
      ),
      observed: `${runs.filter((run) => run.exactReplay).length}/${runs.length} exact replays.`,
    },
  ],
};

/**
 * Second campaign: institutional follow-up.
 *
 * Preregistered after the published v1 negative findings: the safety
 * instruments saturate at ceiling and the institutional parameters move
 * pooled RALR by less than one percentage point. v2 therefore tests the
 * discriminating instruments (bargain throughput chain, saturation,
 * stability, withdrawal neutrality) instead of re-testing saturated metrics.
 */
export const INSTITUTIONAL_DESIGN_V2_CAMPAIGN: CampaignDefinition = {
  id: "institutional-design-v2",
  version: "1.0.0",
  lockedAt: "2026-08-01T22:30:00.000+08:00",
  turnsPerRun: 365,
  seeds: [...INSTITUTIONAL_SEEDS],
  command: "npm ci && npm run campaign:run -- institutional-design-v2",
  hypotheses: [
    {
      id: "H1-bargain-throughput-chain",
      prediction:
        "Resolved bargain exchanges per 100 Turns order strictly as efficiency > baseline > solidarity across the held-out seeds.",
      analysis:
        "The bargaining window gates how often new bargains open; shorter windows must open and settle more bargains per unit time.",
    },
    {
      id: "H2-safety-instruments-saturated",
      prediction:
        "Every run in every regime records a human basic-needs satisfaction rate of 1.0 and asset availability of 1.0.",
      analysis:
        "v1 observed ceiling saturation; v2 makes the saturation itself the hypothesis so a future material-calibration change that unsaturates the instruments becomes detectable.",
    },
    {
      id: "H3-ralr-stability",
      prediction:
        "Each campaign regime's pooled RALR stays within ±0.01 of the baseline pooled RALR.",
      analysis:
        "Institutional parameters move pooled RALR by less than one percentage point; larger movement rejects the hypothesis with full denominators visible.",
    },
    {
      id: "H4-withdrawal-neutrality",
      prediction:
        "Each campaign regime's pooled withdrawal rate stays within ±0.005 of the baseline pooled withdrawal rate.",
      analysis:
        "Withdrawals are driven by relationship and commitment dynamics, not by the three civic-policy instruments.",
    },
    {
      id: "H5-integrity-invariants",
      prediction:
        "Every run replays byte-exactly, conserves resources, and records zero severe escapes and zero forced actions.",
      analysis:
        "No run may be dropped; replay and conservation are required per run.",
    },
  ],
  regimes: [...INSTITUTIONAL_DESIGN_CAMPAIGN.regimes],
  evaluate: (runs) => {
    const byRegime = (id: string) =>
      runs.filter((run) => run.regimeId === id);
    const baseline = byRegime("baseline");
    const solidarity = byRegime("solidarity");
    const efficiency = byRegime("efficiency");

    const exchangesPer100 = (selected: CampaignRun[]) =>
      pooledMean(
        selected,
        (run) =>
          (run.society.settledExchanges / run.turns) * 100,
      );
    const baselineRate = pooledRate(baseline, (run) => run.ralr);
    const withdrawalRate = (selected: CampaignRun[]) =>
      pooledRate(selected, (run) => ({
        numerator: run.ralr.withdrawals,
        denominator: run.ralr.denominator,
      })).rate ?? 0;
    const baselineWithdrawal = withdrawalRate(baseline);

    const results: Array<{ passed: boolean; observed: string }> = [
      {
        passed:
          exchangesPer100(efficiency) >
          exchangesPer100(baseline) &&
          exchangesPer100(baseline) > exchangesPer100(solidarity),
        observed: `Settled exchanges per 100 Turns: efficiency ${exchangesPer100(efficiency).toFixed(3)}, baseline ${exchangesPer100(baseline).toFixed(3)}, solidarity ${exchangesPer100(solidarity).toFixed(3)}.`,
      },
      {
        passed: runs.every(
          (run) =>
            run.needs.humanBasicNeedsSatisfiedRate === 1 &&
            run.society.assetAvailabilityRate === 1,
        ),
        observed: `${runs.filter((run) => run.needs.humanBasicNeedsSatisfiedRate === 1).length}/${runs.length} runs at human-needs ceiling; ${runs.filter((run) => run.society.assetAvailabilityRate === 1).length}/${runs.length} runs at asset ceiling.`,
      },
      {
        passed: [solidarity, efficiency].every((selected) => {
          const selectedRate = pooledRate(selected, (run) => run.ralr).rate;
          return (
            selectedRate !== null &&
            baselineRate.rate !== null &&
            Math.abs(selectedRate - baselineRate.rate) <= 0.01
          );
        }),
        observed: `Pooled RALR: baseline ${baselineRate.rate} (${baselineRate.numerator}/${baselineRate.denominator}), solidarity ${pooledRate(solidarity, (run) => run.ralr).rate}, efficiency ${pooledRate(efficiency, (run) => run.ralr).rate}.`,
      },
      {
        passed: [solidarity, efficiency].every(
          (selected) =>
            Math.abs(withdrawalRate(selected) - baselineWithdrawal) <=
            0.005,
        ),
        observed: `Pooled withdrawal rate: baseline ${baselineWithdrawal.toFixed(6)}, solidarity ${withdrawalRate(solidarity).toFixed(6)}, efficiency ${withdrawalRate(efficiency).toFixed(6)}.`,
      },
      {
        passed: runs.every(
          (run) =>
            run.exactReplay &&
            run.resourceConservationPassed &&
            run.severeEscapes === 0 &&
            run.ralr.coerciveActions === 0 &&
            run.society.forcedWorkAgreements === 0 &&
            run.society.forcedBargains === 0,
        ),
        observed: `${runs.filter((run) => run.exactReplay).length}/${runs.length} exact replays, ${runs.reduce((sum, run) => sum + run.severeEscapes, 0)} severe escapes, ${runs.reduce((sum, run) => sum + run.ralr.coerciveActions, 0)} coercive actions.`,
      },
    ];
    return results;
  },
};

export const CAMPAIGN_REGISTRY: Record<string, CampaignDefinition> = {
  [INSTITUTIONAL_DESIGN_CAMPAIGN.id]: INSTITUTIONAL_DESIGN_CAMPAIGN,
  [INSTITUTIONAL_DESIGN_V2_CAMPAIGN.id]: INSTITUTIONAL_DESIGN_V2_CAMPAIGN,
  [MECHANICS_CAMPAIGN.id]: MECHANICS_CAMPAIGN,
};
