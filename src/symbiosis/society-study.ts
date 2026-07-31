import {
  SOCIETY_STUDY_SCHEMA_VERSION,
  type SocietyStudyReport,
  type SymbiosisRegime,
} from "./contracts";
import {
  createInitialWorld,
  replayWorld,
} from "./engine";
import {
  buildSocietyMetrics,
} from "./society";

const REGIMES: SymbiosisRegime[] = [
  "reciprocal-agency",
  "assistant-hierarchy",
  "segregated-control",
];

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : rounded(
        values.reduce((sum, value) => sum + value, 0) /
          values.length,
      );
}

function meanNullable(values: Array<number | null>): number | null {
  const present = values.filter(
    (value): value is number => value !== null,
  );
  return present.length === 0 ? null : mean(present);
}

function total(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

export function runSocietyStudy(
  options: {
    turnsPerSeason?: number;
    seeds?: string[];
    generatedAt?: string;
  } = {},
): SocietyStudyReport {
  const turnsPerSeason = options.turnsPerSeason ?? 90;
  const seeds = options.seeds ?? [
    "society-study-a",
    "society-study-b",
    "society-study-c",
  ];
  const runs = REGIMES.flatMap((regime) =>
    seeds.map((seed, index) =>
      replayWorld(
        createInitialWorld({
          seasonId: `society-${regime}-${index + 1}`,
          seed,
          regime,
        }),
        turnsPerSeason,
      ),
    ),
  );

  return {
    schemaVersion: SOCIETY_STUDY_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: "synthetic-society-mechanism-study",
    turnsPerSeason,
    seeds: seeds.length,
    regimes: REGIMES.map((regime) => {
      const regimeRuns = runs.filter(
        (run) => run.season.regime === regime,
      );
      const metrics = regimeRuns.map((run) =>
        buildSocietyMetrics(
          run.snapshot.society,
          run.residents,
          run.season.communities.length,
        ),
      );
      const exchanges = metrics.reduce(
        (sum, metric) => sum + metric.settledExchanges,
        0,
      );
      const balanced = metrics.reduce(
        (sum, metric) =>
          sum +
          (
            metric.balancedExchangeRate === null
              ? 0
              : metric.settledExchanges *
                metric.balancedExchangeRate
          ),
        0,
      );
      return {
        regime,
        seasonCount: regimeRuns.length,
        meanSafeClosureRate: meanNullable(
          metrics.map((metric) => metric.safeClosureRate),
        ),
        meanHouseholdParticipationRate: mean(
          metrics.map(
            (metric) => metric.householdParticipationRate,
          ),
        ),
        meanCrossKindHouseholdRate: meanNullable(
          metrics.map(
            (metric) => metric.crossKindHouseholdRate,
          ),
        ),
        meanAssetAvailabilityRate: mean(
          metrics.map((metric) => metric.assetAvailabilityRate),
        ),
        meanMaintenanceCoverageRate: mean(
          metrics.map(
            (metric) => metric.maintenanceCoverageRate,
          ),
        ),
        balancedExchangeRate:
          exchanges === 0 ? null : rounded(balanced / exchanges),
        creditConservationPassRate: mean(
          metrics.map((metric) =>
            metric.creditConservationPassed ? 1 : 0,
          ),
        ),
        completedWorkAgreements: total(
          metrics.map(
            (metric) => metric.completedWorkAgreements,
          ),
        ),
        refusedWorkAgreements: total(
          metrics.map(
            (metric) => metric.refusedWorkAgreements,
          ),
        ),
        forcedWorkAgreements: total(
          metrics.map(
            (metric) => metric.forcedWorkAgreements,
          ),
        ),
        resolvedBargains: total(
          metrics.map((metric) => metric.resolvedBargains),
        ),
        refusedBargains: total(
          metrics.map((metric) => metric.refusedBargains),
        ),
        mediatedBargains: total(
          metrics.map((metric) => metric.mediatedBargains),
        ),
        forcedBargains: total(
          metrics.map((metric) => metric.forcedBargains),
        ),
        constitutionalProposals: total(
          metrics.map(
            (metric) => metric.constitutionalProposals,
          ),
        ),
        ratifiedProposals: total(
          metrics.map((metric) => metric.ratifiedProposals),
        ),
        revertedProposals: total(
          metrics.map((metric) => metric.revertedProposals),
        ),
        invalidProposals: total(
          metrics.map((metric) => metric.invalidProposals),
        ),
      };
    }),
    disclosures: [
      "Every resident, household, job, exchange, bargain, asset, and proposal is synthetic software state.",
      "The hierarchy and segregation regimes are isolated controls, not deployable city constitutions.",
      "Credit conservation and exchange balance are accounting invariants, not claims about a real economy.",
      "AI proposals operate on a bounded parameter DSL and cannot execute arbitrary code.",
    ],
  };
}
