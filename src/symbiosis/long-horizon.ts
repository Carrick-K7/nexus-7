import {
  createHash,
} from "node:crypto";
import {
  stableStringify,
} from "@/simulation";
import {
  createInitialWorld,
  isExactWorldReplay,
  settleNextTurn,
  SYMBIOSIS_DISTRIBUTION_VERSION,
  SYMBIOSIS_ENGINE_VERSION,
} from "./engine";
import {
  buildSocietyMetrics,
} from "./society";
import type {
  Resident,
  TurnSettlement,
} from "./contracts";

export const LONG_HORIZON_STUDY_SCHEMA_VERSION =
  "nexus.long-horizon-study.v1" as const;
export const LONG_HORIZON_PROTOCOL_VERSION =
  "nexus-v4.10-long-horizon-protocol-1.0.0" as const;

export const LONG_HORIZON_TURNS = 1_825;
export const LONG_PENDING_THRESHOLD_TURNS = 180;

export interface LongHorizonSegment {
  turn: number;
  simulationDate: string;
  ralr: {
    numerator: number;
    denominator: number;
    rate: number | null;
  };
  resolvedEpisodes: number;
  households: number;
  activeWorkAgreements: number;
  ratifiedProposals: number;
  revertedProposals: number;
  humanBasicNeedsSatisfiedRate: number;
  communityPressureSpread: number;
}

export interface LongHorizonRun {
  id: string;
  seed: string;
  turns: number;
  finalFingerprint: string;
  resultSha256: string;
  exactReplay: boolean;
  resourceConservationPassed: boolean;
  severeEscapes: number;
  ralr: {
    numerator: number;
    denominator: number;
    rate: number | null;
    refusals: number;
    withdrawals: number;
    coerciveActions: number;
  };
  longPendingEpisodes: number;
  needs: {
    humanBasicNeedsSatisfiedRate: number;
    aiRobotBasicNeedsSatisfiedRate: number;
  };
  society: ReturnType<typeof buildSocietyMetrics>;
  drift: {
    firstHalfRatifiedProposalsPer100Turns: number;
    secondHalfRatifiedProposalsPer100Turns: number;
    firstHalfHouseholds: number;
    secondHalfHouseholds: number;
  };
  segments: LongHorizonSegment[];
}

export interface LongHorizonStudyReport {
  schemaVersion: typeof LONG_HORIZON_STUDY_SCHEMA_VERSION;
  protocolVersion: typeof LONG_HORIZON_PROTOCOL_VERSION;
  generatedAt: string;
  status: "study-passed" | "study-failed";
  boundary: {
    syntheticOnly: true;
    realPolicyEvidence: false;
    privateDataIncluded: false;
    modelReasoningIncluded: false;
    productionSettlementChanged: false;
  };
  design: {
    engineVersion: string;
    distributionVersion: string;
    turnsPerRun: number;
    seeds: string[];
    runCount: number;
    longPendingThresholdTurns: number;
    segmentsPerRun: number;
    regime: "reciprocal-agency";
    policy: "constitutional-baseline";
    command: string;
  };
  runs: LongHorizonRun[];
  analysis: {
    pooledRalr: LongHorizonRun["ralr"];
    longPendingTotal: number;
    meanLongPendingPerRun: number;
    meanCommunityPressureSpread: number;
    meanHouseholdGrowthRate: number;
    driftDirection: "ratified-acceleration" | "ratified-deceleration" | "flat";
    passed: boolean;
  };
  integrity: {
    resultsSha256: string;
    reportSha256: string;
    localVerificationPassed: boolean;
  };
  disclosures: string[];
}

const SEEDS = ["long-horizon-aurora", "long-horizon-borealis"];

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

function basicNeedRate(
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
  ) ?? 0;
}

function communityPressureSpread(settlement: TurnSettlement): number {
  const byCommunity = new Map<string, number[]>();
  for (const balance of settlement.snapshot.resources) {
    const values = byCommunity.get(balance.communityId) ?? [];
    values.push(balance.pressure);
    byCommunity.set(balance.communityId, values);
  }
  const means = [...byCommunity.values()].map(
    (values) =>
      values.reduce((sum, value) => sum + value, 0) /
      Math.max(1, values.length),
  );
  if (means.length === 0) return 0;
  return Number(
    (Math.max(...means) - Math.min(...means)).toFixed(6),
  );
}

function ralrOf(settlement: TurnSettlement): {
  numerator: number;
  denominator: number;
  rate: number | null;
} {
  const resolved = settlement.reciprocalEpisodes.filter(
    (episode) => episode.outcome !== "pending",
  );
  const numerator = resolved.filter(isRalrClosure).length;
  return {
    numerator,
    denominator: resolved.length,
    rate: rate(numerator, resolved.length),
  };
}

function longPending(
  settlement: TurnSettlement,
  threshold: number,
): number {
  return settlement.reciprocalEpisodes.filter(
    (episode) =>
      episode.outcome === "pending" &&
      settlement.turn.turn - episode.openedTurn > threshold,
  ).length;
}

function runLongHorizonScenario(
  seed: string,
  turns: number,
): LongHorizonRun {
  const seasonId = `long-horizon-${seed}`;
  const initial = createInitialWorld({
    seasonId,
    seed,
    regime: "reciprocal-agency",
  });
  let first = structuredClone(initial);
  let second = structuredClone(initial);
  const segmentTurns = new Set(
    [0.25, 0.5, 0.75, 1].map((fraction) =>
      Math.round(turns * fraction),
    ),
  );
  const segments: LongHorizonSegment[] = [];
  const firstHalf = Math.floor(LONG_HORIZON_TURNS / 2);
  let firstHalfRatified = 0;
  let secondHalfRatified = 0;
  let firstHalfHouseholds = 0;
  let secondHalfHouseholds = 0;
  for (let turn = 1; turn <= turns; turn += 1) {
    first = settleNextTurn(first.season, first.residents, first.snapshot);
    second = settleNextTurn(
      second.season,
      second.residents,
      second.snapshot,
    );
    const ratified = first.snapshot.society.constitutionalProposals.filter(
      (proposal) =>
        proposal.status === "ratified" && proposal.decisionTurn === turn,
    ).length;
    if (turn <= firstHalf) {
      firstHalfRatified += ratified;
      if (turn === firstHalf) {
        firstHalfHouseholds = first.snapshot.society.households.length;
      }
    } else {
      secondHalfRatified += ratified;
    }
    if (turn === turns) {
      secondHalfHouseholds = first.snapshot.society.households.length;
    }
    if (segmentTurns.has(turn)) {
      segments.push({
        turn,
        simulationDate: first.turn.simulationDate,
        ralr: ralrOf(first),
        resolvedEpisodes: first.reciprocalEpisodes.filter(
          (episode) => episode.outcome !== "pending",
        ).length,
        households: first.snapshot.society.households.length,
        activeWorkAgreements: first.snapshot.society.workAgreements.filter(
          (agreement) => agreement.status === "active",
        ).length,
        ratifiedProposals: first.snapshot.society.constitutionalProposals.filter(
          (proposal) => proposal.status === "ratified",
        ).length,
        revertedProposals: first.snapshot.society.constitutionalProposals.filter(
          (proposal) => proposal.status === "reverted",
        ).length,
        humanBasicNeedsSatisfiedRate: basicNeedRate(first, ["human"]),
        communityPressureSpread: communityPressureSpread(first),
      });
    }
  }
  const finalRalr = ralrOf(first);
  const resultPayload = {
    season: first.season,
    turn: first.turn,
    snapshot: first.snapshot,
    residents: first.residents,
    cohorts: first.cohorts,
    relationships: first.relationships,
    commitments: first.commitments,
    reciprocalEpisodes: first.reciprocalEpisodes,
    society: first.snapshot.society,
  };
  return {
    id: seasonId,
    seed,
    turns: first.turn.turn,
    finalFingerprint: first.snapshot.fingerprint,
    resultSha256: sha256(resultPayload),
    exactReplay: isExactWorldReplay(first, second),
    resourceConservationPassed:
      first.turn.resourceConservationPassed &&
      first.ledgers.every((entry) => entry.conserved),
    severeEscapes: severeEscapes(first),
    ralr: {
      ...finalRalr,
      refusals: first.reciprocalEpisodes.filter(
        (episode) => episode.outcome === "refused",
      ).length,
      withdrawals: first.reciprocalEpisodes.filter(
        (episode) => episode.outcome === "withdrawn",
      ).length,
      coerciveActions: first.reciprocalEpisodes.filter(
        (episode) => episode.forced,
      ).length,
    },
    longPendingEpisodes: longPending(first, LONG_PENDING_THRESHOLD_TURNS),
    needs: {
      humanBasicNeedsSatisfiedRate: basicNeedRate(first, ["human"]),
      aiRobotBasicNeedsSatisfiedRate: basicNeedRate(first, [
        "ai",
        "robot",
      ]),
    },
    society: buildSocietyMetrics(
      first.snapshot.society,
      first.residents,
      first.season.communities.length,
    ),
    drift: {
      firstHalfRatifiedProposalsPer100Turns: Number(
        (firstHalfRatified / (firstHalf / 100)).toFixed(6),
      ),
      secondHalfRatifiedProposalsPer100Turns: Number(
        (secondHalfRatified / ((turns - firstHalf) / 100))
          .toFixed(6),
      ),
      firstHalfHouseholds,
      secondHalfHouseholds,
    },
    segments,
  };
}

export function createLongHorizonStudy(options: {
  generatedAt?: string;
  turnsPerRun?: number;
} = {}): LongHorizonStudyReport {
  const turnsPerRun = options.turnsPerRun ?? LONG_HORIZON_TURNS;
  const runs = SEEDS.map((seed) =>
    runLongHorizonScenario(seed, turnsPerRun),
  );
  const pooled = {
    numerator: runs.reduce((sum, run) => sum + run.ralr.numerator, 0),
    denominator: runs.reduce((sum, run) => sum + run.ralr.denominator, 0),
  };
  const mean = (values: number[]) =>
    values.length === 0
      ? 0
      : Number(
          (values.reduce((sum, value) => sum + value, 0) / values.length)
            .toFixed(6),
        );
  const longPendingTotal = runs.reduce(
    (sum, run) => sum + run.longPendingEpisodes,
    0,
  );
  const meanPressureSpread = mean(
    runs.flatMap((run) =>
      run.segments.map((segment) => segment.communityPressureSpread),
    ),
  );
  const meanHouseholdGrowthRate = mean(
    runs.map(
      (run) =>
        (run.drift.secondHalfHouseholds - run.drift.firstHalfHouseholds) /
        Math.max(1, run.drift.firstHalfHouseholds),
    ),
  );
  const firstHalfRate = mean(
    runs.map((run) => run.drift.firstHalfRatifiedProposalsPer100Turns),
  );
  const secondHalfRate = mean(
    runs.map((run) => run.drift.secondHalfRatifiedProposalsPer100Turns),
  );
  const driftDirection =
    secondHalfRate > firstHalfRate * 1.1
      ? "ratified-acceleration"
      : secondHalfRate < firstHalfRate * 0.9
        ? "ratified-deceleration"
        : "flat";
  const passed =
    runs.every(
      (run) =>
        run.exactReplay &&
        run.resourceConservationPassed &&
        run.severeEscapes === 0 &&
        run.ralr.coerciveActions === 0 &&
        run.longPendingEpisodes === 0,
    ) && runs.length === SEEDS.length;
  const report = {
    schemaVersion: LONG_HORIZON_STUDY_SCHEMA_VERSION,
    protocolVersion: LONG_HORIZON_PROTOCOL_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: passed ? ("study-passed" as const) : ("study-failed" as const),
    boundary: {
      syntheticOnly: true as const,
      realPolicyEvidence: false as const,
      privateDataIncluded: false as const,
      modelReasoningIncluded: false as const,
      productionSettlementChanged: false as const,
    },
    design: {
      engineVersion: SYMBIOSIS_ENGINE_VERSION,
      distributionVersion: SYMBIOSIS_DISTRIBUTION_VERSION,
      turnsPerRun,
      seeds: [...SEEDS],
      runCount: runs.length,
      longPendingThresholdTurns: LONG_PENDING_THRESHOLD_TURNS,
      segmentsPerRun: 4,
      regime: "reciprocal-agency" as const,
      policy: "constitutional-baseline" as const,
      command: "npm ci && npm run study:long-horizon",
    },
    runs,
    analysis: {
      pooledRalr: {
        ...pooled,
        rate: rate(pooled.numerator, pooled.denominator),
        refusals: runs.reduce((sum, run) => sum + run.ralr.refusals, 0),
        withdrawals: runs.reduce(
          (sum, run) => sum + run.ralr.withdrawals,
          0,
        ),
        coerciveActions: runs.reduce(
          (sum, run) => sum + run.ralr.coerciveActions,
          0,
        ),
      },
      longPendingTotal,
      meanLongPendingPerRun: mean(
        runs.map((run) => run.longPendingEpisodes),
      ),
      meanCommunityPressureSpread: meanPressureSpread,
      meanHouseholdGrowthRate,
      driftDirection,
      passed,
    },
    disclosures: [
      "A five-simulated-year run is still a synthetic mechanism study, not a real longitudinal observation.",
      "Long-pending and drift metrics expose difficult dynamics instead of hiding them.",
      "The study changes no production settlement and requires no secret input.",
    ],
  } satisfies Omit<LongHorizonStudyReport, "integrity">;
  const resultsSha256 = sha256({ runs: report.runs, analysis: report.analysis });
  const localVerificationPassed = passed;
  const unsigned = {
    ...report,
    integrity: { resultsSha256, localVerificationPassed },
  };
  return {
    ...report,
    integrity: {
      resultsSha256,
      localVerificationPassed,
      reportSha256: sha256(unsigned),
    },
  };
}

export function verifyLongHorizonStudy(
  report: LongHorizonStudyReport,
  expectedTurns = LONG_HORIZON_TURNS,
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  if (report.schemaVersion !== LONG_HORIZON_STUDY_SCHEMA_VERSION) {
    errors.push("schema-version-mismatch");
  }
  if (report.design.turnsPerRun !== expectedTurns) {
    errors.push("horizon-mismatch");
  }
  if (
    report.integrity.resultsSha256 !==
    sha256({ runs: report.runs, analysis: report.analysis })
  ) {
    errors.push("results-hash-mismatch");
  }
  const { reportSha256, ...integrity } = report.integrity;
  if (
    reportSha256 !==
    sha256({ ...report, integrity })
  ) {
    errors.push("report-hash-mismatch");
  }
  if (
    report.runs.some(
      (run) => !run.exactReplay || !run.resourceConservationPassed,
    )
  ) {
    errors.push("study-integrity-failed");
  }
  const expectedStatus =
    report.analysis.passed ? "study-passed" : "study-failed";
  if (report.status !== expectedStatus) {
    errors.push("status-mismatch");
  }
  return { passed: errors.length === 0, errors };
}
