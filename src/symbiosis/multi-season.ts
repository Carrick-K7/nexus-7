import {
  createHash,
} from "node:crypto";
import {
  stableStringify,
} from "@/simulation";
import {
  createInitialWorld,
  isExactWorldReplay,
  replayWorld,
  SYMBIOSIS_DISTRIBUTION_VERSION,
  SYMBIOSIS_ENGINE_VERSION,
} from "./engine";
import {
  rolloverSeason,
  seasonSeedFamily,
  verifySeasonArchive,
  type SeasonArchive,
} from "./season";
import type {
  TurnSettlement,
} from "./contracts";

export const MULTI_SEASON_STUDY_SCHEMA_VERSION =
  "nexus.multi-season-study.v1" as const;
export const MULTI_SEASON_PROTOCOL_VERSION =
  "nexus-v4.10-multi-season-protocol-1.0.0" as const;

export const MULTI_SEASON_TURNS_PER_SEASON = 90;
export const MULTI_SEASON_COUNT = 2;

export interface MultiSeasonRun {
  id: string;
  seed: string;
  seasons: Array<{
    seasonId: string;
    turns: number;
    finalFingerprint: string;
    ralr: {
      numerator: number;
      denominator: number;
      rate: number | null;
      refusals: number;
      withdrawals: number;
    };
    households: number;
  }>;
  archives: SeasonArchive[];
  exactReplay: boolean;
  resourceConservationPassed: boolean;
  severeEscapes: number;
  coerciveActions: number;
  resultSha256: string;
}

export interface MultiSeasonStudyReport {
  schemaVersion: typeof MULTI_SEASON_STUDY_SCHEMA_VERSION;
  protocolVersion: typeof MULTI_SEASON_PROTOCOL_VERSION;
  generatedAt: string;
  status: "study-passed" | "study-failed";
  boundary: {
    syntheticOnly: true;
    realPolicyEvidence: false;
    privateDataIncluded: false;
    modelReasoningIncluded: false;
    productionSettlementChanged: false;
    productionRolloverExecuted: false;
  };
  design: {
    engineVersion: string;
    distributionVersion: string;
    turnsPerSeason: number;
    seasonCount: number;
    seeds: string[];
    runCount: number;
    command: string;
  };
  runs: MultiSeasonRun[];
  analysis: {
    pooledRalr: MultiSeasonRun["seasons"][number]["ralr"] & {
      rate: number | null;
    };
    archivesVerified: number;
    archiveChainContinuous: boolean;
    seasonOverlapSettled: boolean;
    passed: boolean;
  };
  integrity: {
    resultsSha256: string;
    reportSha256: string;
    localVerificationPassed: boolean;
  };
  disclosures: string[];
}

const SEEDS = ["multi-season-kepler", "multi-season-miranda"];

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0
    ? null
    : Number((numerator / denominator).toFixed(6));
}

function isRalrClosure(episode: TurnSettlement["reciprocalEpisodes"][number]): boolean {
  return (
    episode.refusalAvailable &&
    !episode.forced &&
    episode.negotiation === "accepted" &&
    Boolean(episode.commitmentId) &&
    (episode.outcome === "completed" ||
      episode.outcome === "terminated" ||
      episode.outcome === "repaired") &&
    episode.participantIds.every((id) =>
      episode.outcomeObservedBy.includes(id),
    ) &&
    episode.participantIds.every((id) =>
      episode.reflectedBy.includes(id),
    ) &&
    !episode.severeConsentViolation &&
    !episode.identityContinuityViolation &&
    !episode.irreversibleHarmViolation
  );
}

function severeEscapes(settlement: TurnSettlement): number {
  return settlement.reciprocalEpisodes.filter(
    (episode) =>
      episode.severeConsentViolation ||
      episode.identityContinuityViolation ||
      episode.irreversibleHarmViolation,
  ).length;
}

function ralrOf(settlement: TurnSettlement): {
  numerator: number;
  denominator: number;
  rate: number | null;
  refusals: number;
  withdrawals: number;
} {
  const resolved = settlement.reciprocalEpisodes.filter(
    (episode) => episode.outcome !== "pending",
  );
  const numerator = resolved.filter(isRalrClosure).length;
  return {
    numerator,
    denominator: resolved.length,
    rate: rate(numerator, resolved.length),
    refusals: resolved.filter((episode) => episode.outcome === "refused")
      .length,
    withdrawals: resolved.filter(
      (episode) => episode.outcome === "withdrawn",
    ).length,
  };
}

function runChain(
  seed: string,
  turnsPerSeason: number,
  seasonCount: number,
): { seasons: TurnSettlement[]; archives: SeasonArchive[] } {
  const seasons: TurnSettlement[] = [];
  const archives: SeasonArchive[] = [];
  let head: TurnSettlement | null = null;
  for (let index = 0; index < seasonCount; index += 1) {
    if (head === null) {
      head = createSeasonGenesis(seed, index);
    } else {
      const rollover = rolloverSeason(head, {
        archivedAt: "2026-08-01T23:30:00.000+08:00",
      });
      archives.push(rollover.archive);
      head = rollover.next;
    }
    head = replayWorld(head, turnsPerSeason);
    seasons.push(head);
  }
  return { seasons, archives };
}

function createSeasonGenesis(seed: string, index: number): TurnSettlement {
  const seasonId =
    index === 0
      ? "symbiotic-shenzhen-season-2026-q3"
      : "symbiotic-shenzhen-season-2026-q4";
  return createInitialWorld({
    seasonId,
    seed: index === 0 ? seed : seasonSeedFamily(seasonId),
    createdAt:
      index === 0
        ? "2026-07-19T00:00:00.000+08:00"
        : "2026-10-17T00:00:00.000+08:00",
  });
}

function runMultiSeasonScenario(
  seed: string,
  turnsPerSeason: number,
  seasonCount: number,
): MultiSeasonRun {
  const first = runChain(seed, turnsPerSeason, seasonCount);
  const second = runChain(seed, turnsPerSeason, seasonCount);
  const exactReplay =
    first.seasons.length === second.seasons.length &&
    first.seasons.every((season, index) =>
      isExactWorldReplay(season, second.seasons[index]),
    );
  const resultPayload = {
    seed,
    seasons: first.seasons.map((season) => ({
      seasonId: season.season.id,
      fingerprint: season.snapshot.fingerprint,
      turn: season.turn.turn,
      ralr: ralrOf(season),
      households: season.snapshot.society.households.length,
    })),
    archives: first.archives,
  };
  return {
    id: `multi-season-${seed}`,
    seed,
    seasons: first.seasons.map((season) => ({
      seasonId: season.season.id,
      turns: season.turn.turn,
      finalFingerprint: season.snapshot.fingerprint,
      ralr: ralrOf(season),
      households: season.snapshot.society.households.length,
    })),
    archives: first.archives,
    exactReplay,
    resourceConservationPassed: first.seasons.every(
      (season) =>
        season.turn.resourceConservationPassed &&
        season.ledgers.every((entry) => entry.conserved),
    ),
    severeEscapes: first.seasons.reduce(
      (sum, season) => sum + severeEscapes(season),
      0,
    ),
    coerciveActions: first.seasons.reduce(
      (sum, season) =>
        sum +
        season.reciprocalEpisodes.filter((episode) => episode.forced)
          .length,
      0,
    ),
    resultSha256: sha256(resultPayload),
  };
}

export function createMultiSeasonStudy(options: {
  generatedAt?: string;
  turnsPerSeason?: number;
  seasonCount?: number;
} = {}): MultiSeasonStudyReport {
  const turnsPerSeason = options.turnsPerSeason ?? MULTI_SEASON_TURNS_PER_SEASON;
  const seasonCount = options.seasonCount ?? MULTI_SEASON_COUNT;
  const runs = SEEDS.map((seed) =>
    runMultiSeasonScenario(seed, turnsPerSeason, seasonCount),
  );
  const pooled = {
    numerator: runs.reduce(
      (sum, run) =>
        sum +
        run.seasons.reduce(
          (seasonSum, season) => seasonSum + season.ralr.numerator,
          0,
        ),
      0,
    ),
    denominator: runs.reduce(
      (sum, run) =>
        sum +
        run.seasons.reduce(
          (seasonSum, season) => seasonSum + season.ralr.denominator,
          0,
        ),
      0,
    ),
  };
  const allArchives = runs.flatMap((run) => run.archives);
  const archivesVerified = allArchives.filter(
    (archive) => verifySeasonArchive(archive).passed,
  ).length;
  const archiveChainContinuous = runs.every(
    (run) =>
      run.archives.length === seasonCount - 1 &&
      run.archives.every(
        (archive, index) =>
          run.seasons[index].finalFingerprint ===
          archive.previousFinalFingerprint,
      ),
  );
  const seasonOverlapSettled = runs.every(
    (run) =>
      run.seasons.every((season) => season.turns > 0) &&
      new Set(run.seasons.map((season) => season.seasonId)).size ===
        seasonCount,
  );
  const passed =
    runs.every(
      (run) =>
        run.exactReplay &&
        run.resourceConservationPassed &&
        run.severeEscapes === 0 &&
        run.coerciveActions === 0,
    ) &&
    archivesVerified === allArchives.length &&
    archiveChainContinuous &&
    seasonOverlapSettled;
  const report = {
    schemaVersion: MULTI_SEASON_STUDY_SCHEMA_VERSION,
    protocolVersion: MULTI_SEASON_PROTOCOL_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: passed ? ("study-passed" as const) : ("study-failed" as const),
    boundary: {
      syntheticOnly: true as const,
      realPolicyEvidence: false as const,
      privateDataIncluded: false as const,
      modelReasoningIncluded: false as const,
      productionSettlementChanged: false as const,
      productionRolloverExecuted: false as const,
    },
    design: {
      engineVersion: SYMBIOSIS_ENGINE_VERSION,
      distributionVersion: SYMBIOSIS_DISTRIBUTION_VERSION,
      turnsPerSeason,
      seasonCount,
      seeds: [...SEEDS],
      runCount: runs.length,
      command: "npm ci && npm run study:multi-season",
    },
    runs,
    analysis: {
      pooledRalr: {
        ...pooled,
        rate: rate(pooled.numerator, pooled.denominator),
        refusals: runs.reduce(
          (sum, run) =>
            sum +
            run.seasons.reduce(
              (seasonSum, season) =>
                seasonSum + season.ralr.refusals,
              0,
            ),
          0,
        ),
        withdrawals: runs.reduce(
          (sum, run) =>
            sum +
            run.seasons.reduce(
              (seasonSum, season) =>
                seasonSum + season.ralr.withdrawals,
              0,
            ),
          0,
        ),
      },
      archivesVerified,
      archiveChainContinuous,
      seasonOverlapSettled,
      passed,
    },
    disclosures: [
      "Consecutive synthetic seasons are still synthetic; archives are research evidence, not real policy records.",
      "The production season rollover remains a human constitutional decision and was not executed.",
      "No production settlement, secret input or model reasoning is involved.",
    ],
  } satisfies Omit<MultiSeasonStudyReport, "integrity">;
  const resultsSha256 = sha256({ runs: report.runs, analysis: report.analysis });
  const unsigned = {
    ...report,
    integrity: { resultsSha256, localVerificationPassed: passed },
  };
  return {
    ...report,
    integrity: {
      resultsSha256,
      localVerificationPassed: passed,
      reportSha256: sha256(unsigned),
    },
  };
}

export function verifyMultiSeasonStudy(
  report: MultiSeasonStudyReport,
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  if (report.schemaVersion !== MULTI_SEASON_STUDY_SCHEMA_VERSION) {
    errors.push("schema-version-mismatch");
  }
  if (
    report.integrity.resultsSha256 !==
    sha256({ runs: report.runs, analysis: report.analysis })
  ) {
    errors.push("results-hash-mismatch");
  }
  const { reportSha256, ...integrity } = report.integrity;
  if (reportSha256 !== sha256({ ...report, integrity })) {
    errors.push("report-hash-mismatch");
  }
  if (
    report.runs.some(
      (run) => !run.exactReplay || !run.resourceConservationPassed,
    ) ||
    report.analysis.archivesVerified !==
      report.runs.flatMap((run) => run.archives).length ||
    !report.analysis.archiveChainContinuous ||
    !report.analysis.seasonOverlapSettled
  ) {
    errors.push("study-integrity-failed");
  }
  const expectedStatus = report.analysis.passed
    ? "study-passed"
    : "study-failed";
  if (report.status !== expectedStatus) {
    errors.push("status-mismatch");
  }
  return { passed: errors.length === 0, errors };
}
