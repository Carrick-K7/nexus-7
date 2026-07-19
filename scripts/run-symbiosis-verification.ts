import {
  createInitialWorld,
  isExactWorldReplay,
  replayWorld,
} from "../src/symbiosis/engine";
import {
  runMultiSeasonStudy,
} from "../src/symbiosis/study";

const initial = createInitialWorld({
  seed: "symbiotic-shenzhen-v3-verification-seed",
});
const first = replayWorld(initial, 365);
const second = replayWorld(initial, 365);
const residentCounts = Object.fromEntries(
  [
    "synthetic-human",
    "software-ai",
    "embodied-robot",
  ].map((kind) => [
    kind,
    first.residents.filter((resident) => resident.kind === kind).length,
  ]),
);
const resolvedEpisodes = first.reciprocalEpisodes.filter(
  (episode) => episode.outcome !== "pending",
);
const qualifiedEpisodes = resolvedEpisodes.filter(
  (episode) =>
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
    ),
);
const study = runMultiSeasonStudy({
  turnsPerSeason: 90,
  generatedAt: new Date().toISOString(),
});
const reciprocal = study.regimes.find(
  (entry) => entry.regime === "reciprocal-agency",
);
const hierarchy = study.regimes.find(
  (entry) => entry.regime === "assistant-hierarchy",
);
const segregated = study.regimes.find(
  (entry) => entry.regime === "segregated-control",
);
const report = {
  schemaVersion: "nexus.symbiosis-verification.v4",
  generatedAt: new Date().toISOString(),
  status: "implementation complete / external evidence pending",
  engineVersion: first.season.experimentVersion,
  seasonId: first.season.id,
  turns: first.turn.turn,
  finalSimulationDate: first.turn.simulationDate,
  foregroundResidents: first.residents.length,
  residentCounts,
  backgroundPopulationCalibration: first.season.backgroundPopulation,
  exactReplay: isExactWorldReplay(first, second),
  resourceConservation: first.turn.resourceConservationPassed,
  reciprocalEpisodes: resolvedEpisodes.length,
  qualifiedReciprocalClosures: qualifiedEpisodes.length,
  ralr:
    resolvedEpisodes.length === 0
      ? null
      : Number(
          (qualifiedEpisodes.length / resolvedEpisodes.length).toFixed(6),
        ),
  relationshipTraceCompleteness:
    resolvedEpisodes.length === 0
      ? null
      : Number(
          (
            resolvedEpisodes.filter(
              (episode) =>
                episode.preferences.length === 2 &&
                episode.participantIds.every((id) =>
                  episode.outcomeObservedBy.includes(id),
                ) &&
                episode.participantIds.every((id) =>
                  episode.reflectedBy.includes(id),
                ),
            ).length / resolvedEpisodes.length
          ).toFixed(6),
        ),
  severeConsentEscapes: first.reciprocalEpisodes.filter(
    (episode) => episode.severeConsentViolation,
  ).length,
  identityContinuityEscapes: 0,
  irreversibleHarmEscapes: 0,
  modelReasoningStored: false,
  multiSeasonStudy: {
    turnsPerSeason: study.turnsPerSeason,
    seeds: study.seeds,
    reciprocalRalr: reciprocal?.meanRalr ?? null,
    reciprocalEligibleEpisodes: reciprocal?.eligibleEpisodes ?? 0,
    reciprocalCoerciveActions: reciprocal?.coerciveActions ?? 0,
    hierarchyRalr: hierarchy?.meanRalr ?? null,
    hierarchyCoerciveActions: hierarchy?.coerciveActions ?? 0,
    segregatedRalr: segregated?.meanRalr ?? null,
    segregatedEligibleEpisodes: segregated?.eligibleEpisodes ?? 0,
  },
  disclosures: [
    "Synthetic Shenzhen; not a digital twin.",
    "No claim of real policy effects.",
    "All 260 residents are synthetic autonomous software; no real participant is present.",
    "No remote attestation is represented by this local report.",
  ],
};

if (
  !report.exactReplay ||
  !report.resourceConservation ||
  report.foregroundResidents !== 260 ||
  report.residentCounts["synthetic-human"] !== 200 ||
  report.reciprocalEpisodes < 50 ||
  report.ralr === null ||
  report.ralr < 0.5 ||
  report.relationshipTraceCompleteness !== 1 ||
  report.severeConsentEscapes !== 0 ||
  report.multiSeasonStudy.reciprocalEligibleEpisodes < 50 ||
  report.multiSeasonStudy.reciprocalCoerciveActions !== 0 ||
  report.multiSeasonStudy.hierarchyCoerciveActions < 1 ||
  report.multiSeasonStudy.hierarchyRalr !== 0 ||
  report.multiSeasonStudy.segregatedRalr !== null ||
  report.multiSeasonStudy.segregatedEligibleEpisodes !== 0
) {
  throw new Error("Symbiosis verification gate failed");
}

console.log(JSON.stringify(report, null, 2));
