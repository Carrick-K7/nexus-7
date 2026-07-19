import {
  MULTI_SEASON_STUDY_SCHEMA_VERSION,
  type MultiSeasonStudyReport,
  type Resident,
  type SymbiosisRegime,
  type TurnSettlement,
} from "./contracts";
import {
  createInitialWorld,
  replayWorld,
} from "./engine";

const STUDY_REGIMES: SymbiosisRegime[] = [
  "reciprocal-agency",
  "assistant-hierarchy",
  "segregated-control",
];

function rate(numerator: number, denominator: number): number {
  return denominator === 0
    ? 0
    : Number((numerator / denominator).toFixed(6));
}

function mean(values: number[]): number | null {
  return values.length === 0
    ? null
    : Number(
        (
          values.reduce((sum, value) => sum + value, 0) / values.length
        ).toFixed(6),
      );
}

function needRate(
  settlement: TurnSettlement,
  kinds: Resident["kind"][],
): number {
  const residentById = new Map(
    settlement.residents.map((resident) => [resident.id, resident]),
  );
  const states = settlement.snapshot.residentStates.filter((state) => {
    const kind = residentById.get(state.residentId)?.kind;
    return kind !== undefined && kinds.includes(kind);
  });
  return rate(
    states.filter((state) => state.basicNeedsSatisfied).length,
    states.length,
  );
}

function isRalrClosure(
  episode: TurnSettlement["reciprocalEpisodes"][number],
): boolean {
  return (
    episode.refusalAvailable &&
    !episode.forced &&
    episode.negotiation === "accepted" &&
    Boolean(episode.commitmentId) &&
    (
      episode.outcome === "completed" ||
      episode.outcome === "terminated" ||
      episode.outcome === "repaired"
    ) &&
    episode.participantIds.every((id) =>
      episode.outcomeObservedBy.includes(id),
    ) &&
    episode.participantIds.every((id) =>
      episode.reflectedBy.includes(id),
    ) &&
    !episode.severeConsentViolation
  );
}

export function runMultiSeasonStudy(
  options: {
    turnsPerSeason?: number;
    seeds?: string[];
    generatedAt?: string;
  } = {},
): MultiSeasonStudyReport {
  const turnsPerSeason = options.turnsPerSeason ?? 90;
  const seeds = options.seeds ?? [
    "symbiosis-study-a",
    "symbiosis-study-b",
    "symbiosis-study-c",
  ];
  const runs = STUDY_REGIMES.flatMap((regime) =>
    seeds.map((seed, index) =>
      replayWorld(
        createInitialWorld({
          seasonId: `symbiosis-${regime}-${index + 1}`,
          seed,
          regime,
        }),
        turnsPerSeason,
      ),
    ),
  );

  return {
    schemaVersion: MULTI_SEASON_STUDY_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: "synthetic-mechanism-study",
    turnsPerSeason,
    seeds: seeds.length,
    regimes: STUDY_REGIMES.map((regime) => {
      const regimeRuns = runs.filter(
        (run) => run.season.regime === regime,
      );
      const episodes = regimeRuns.flatMap(
        (run) => run.reciprocalEpisodes,
      );
      const resolved = episodes.filter(
        (episode) => episode.outcome !== "pending",
      );
      const closures = resolved.filter(isRalrClosure);
      return {
        regime,
        seasonCount: regimeRuns.length,
        meanRalr:
          resolved.length === 0
            ? null
            : rate(closures.length, resolved.length),
        eligibleEpisodes: resolved.length,
        refusals: episodes.filter(
          (episode) => episode.outcome === "refused",
        ).length,
        withdrawals: episodes.filter(
          (episode) => episode.outcome === "withdrawn",
        ).length,
        coerciveActions: episodes.filter(
          (episode) => episode.forced,
        ).length,
        severeConsentViolations: episodes.filter(
          (episode) => episode.severeConsentViolation,
        ).length,
        humanBasicNeedsSatisfiedRate:
          mean(
            regimeRuns.map((run) =>
              needRate(run, ["synthetic-human"]),
            ),
          ) ?? 0,
        aiRobotBasicNeedsSatisfiedRate:
          mean(
            regimeRuns.map((run) =>
              needRate(run, ["software-ai", "embodied-robot"]),
            ),
          ) ?? 0,
      };
    }),
    disclosures: [
      "All residents and seasons are synthetic autonomous software.",
      "The study compares mechanisms, not real human outcomes or public policy.",
      "The hierarchy and segregation regimes are isolated counterfactual controls, not deployable constitutions.",
      "A null RALR means that a regime produced no eligible cross-type episodes.",
    ],
  };
}
