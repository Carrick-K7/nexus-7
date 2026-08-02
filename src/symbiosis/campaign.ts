import {
  createHash,
} from "node:crypto";
import {
  fingerprint,
  stableStringify,
} from "@/simulation";
import type {
  ReciprocalEpisode,
  Resident,
  TurnSettlement,
} from "./contracts";
import {
  createInitialWorld,
  isExactWorldReplay,
  replayWorld,
  SYMBIOSIS_DISTRIBUTION_VERSION,
  SYMBIOSIS_ENGINE_VERSION,
} from "./engine";
import {
  buildSocietyMetrics,
} from "./society";

export const HYPOTHESIS_CAMPAIGN_SCHEMA_VERSION =
  "nexus.hypothesis-campaign.v1" as const;
export const CAMPAIGN_PROTOCOL_VERSION =
  "nexus-v4.10-campaign-protocol-1.0.0" as const;

/**
 * Hypothesis campaign framework.
 *
 * A campaign is a preregistered research design: frozen hypotheses, held-out
 * seeds, white-listed civic-policy regimes and a deterministic horizon. It
 * runs entirely on software residents, changes no production settlement, and
 * keeps every denominator, refusal, withdrawal and coercion count visible.
 */

/**
 * White-listed initial civic policy values for research campaigns. Every
 * value is clamped to the constitutional bounds before the world is built;
 * campaigns change only these three parameters and never the engine, the DSL
 * or the constitution.
 */
export interface CampaignPolicyOverride {
  maintenanceReserveRate?: number;
  householdSafetyFloor?: number;
  bargainingWindowTurns?: number;
}

const POLICY_BOUNDS = {
  maintenanceReserveRate: { min: 0.1, max: 0.3 },
  householdSafetyFloor: { min: 0.55, max: 0.8 },
  bargainingWindowTurns: { min: 2, max: 5 },
} as const;

export function normalizeCampaignPolicy(
  policy: CampaignPolicyOverride,
): CampaignPolicyOverride {
  const normalized: CampaignPolicyOverride = {};
  const entries: Array<
    [keyof CampaignPolicyOverride, { min: number; max: number }]
  > = [
    ["maintenanceReserveRate", POLICY_BOUNDS.maintenanceReserveRate],
    ["householdSafetyFloor", POLICY_BOUNDS.householdSafetyFloor],
    ["bargainingWindowTurns", POLICY_BOUNDS.bargainingWindowTurns],
  ];
  for (const [field, bounds] of entries) {
    const value = policy[field];
    if (value === undefined) continue;
    const bounded = Math.min(bounds.max, Math.max(bounds.min, value));
    normalized[field] =
      field === "bargainingWindowTurns"
        ? Math.round(bounded)
        : Number(bounded.toFixed(4));
  }
  return normalized;
}

export interface CampaignRegimeDefinition {
  id: string;
  label: {
    zh: string;
    en: string;
  };
  description: string;
  policy: CampaignPolicyOverride;
}

export interface CampaignHypothesisDefinition {
  id: string;
  prediction: string;
  analysis: string;
}

export interface CampaignRun {
  id: string;
  regimeId: string;
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
  needs: {
    humanBasicNeedsSatisfiedRate: number;
    aiRobotBasicNeedsSatisfiedRate: number;
  };
  society: ReturnType<typeof buildSocietyMetrics>;
  policy: CampaignPolicyOverride;
}

export interface CampaignHypothesisResult {
  id: string;
  prediction: string;
  analysis: string;
  passed: boolean;
  observed: string;
}

export interface HypothesisCampaignReport {
  schemaVersion: typeof HYPOTHESIS_CAMPAIGN_SCHEMA_VERSION;
  protocolVersion: typeof CAMPAIGN_PROTOCOL_VERSION;
  campaignId: string;
  campaignVersion: string;
  generatedAt: string;
  status: "campaign-passed" | "campaign-failed";
  boundary: {
    syntheticOnly: true;
    realPolicyEvidence: false;
    privateDataIncluded: false;
    modelReasoningIncluded: false;
    productionSettlementChanged: false;
  };
  preregistration: {
    kind: "prospective-campaign";
    lockedAt: string;
    hypotheses: CampaignHypothesisDefinition[];
  };
  design: {
    engineVersion: string;
    distributionVersion: string;
    turnsPerRun: number;
    regimes: Array<{
      id: string;
      label: CampaignRegimeDefinition["label"];
      description: string;
      policy: CampaignPolicyOverride;
    }>;
    seeds: string[];
    runCount: number;
    policyBounds: Record<
      "maintenance-reserve-rate" | "household-safety-floor" | "bargaining-window-turns",
      { min: number; max: number }
    >;
    secretInputsRequired: false;
    command: string;
  };
  runs: CampaignRun[];
  analysis: {
    hypotheses: CampaignHypothesisResult[];
    passed: number;
    total: number;
  };
  integrity: {
    resultsSha256: string;
    reportSha256: string;
    localVerificationPassed: boolean;
  };
  disclosures: string[];
}

export interface CampaignDefinition {
  id: string;
  version: string;
  lockedAt: string;
  turnsPerRun: number;
  regimes: CampaignRegimeDefinition[];
  seeds: string[];
  hypotheses: CampaignHypothesisDefinition[];
  command: string;
  evaluate: (
    runs: CampaignRun[],
  ) => Array<{ passed: boolean; observed: string }>;
}

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

function isRalrClosure(episode: ReciprocalEpisode): boolean {
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

function severeEscapes(settlement: TurnSettlement): number {
  return settlement.reciprocalEpisodes.filter(
    (episode) =>
      episode.severeConsentViolation ||
      episode.identityContinuityViolation ||
      episode.irreversibleHarmViolation,
  ).length;
}

/**
 * Builds the campaign genesis world without modifying the engine: the world
 * is created with default policy, then the white-listed policy values are
 * applied to the society policy record and the snapshot fingerprint is
 * recomputed so the invariant "fingerprint hashes snapshot content" holds.
 * This keeps the v4.7 scientific inputs (engine.ts, society.ts) byte-exact.
 */
export function createCampaignInitialWorld(
  options: {
    seasonId: string;
    seed: string;
    policy: CampaignPolicyOverride;
  },
): TurnSettlement {
  const world = createInitialWorld({
    seasonId: options.seasonId,
    seed: options.seed,
    regime: "reciprocal-agency",
  });
  const normalized = normalizeCampaignPolicy(options.policy);
  const policy = world.snapshot.society.policy;
  if (normalized.maintenanceReserveRate !== undefined) {
    policy.maintenanceReserveRate = normalized.maintenanceReserveRate;
  }
  if (normalized.householdSafetyFloor !== undefined) {
    policy.householdSafetyFloor = normalized.householdSafetyFloor;
  }
  if (normalized.bargainingWindowTurns !== undefined) {
    policy.bargainingWindowTurns = normalized.bargainingWindowTurns;
  }
  const withoutFingerprint = { ...world.snapshot } as Partial<
    typeof world.snapshot
  >;
  delete withoutFingerprint.fingerprint;
  world.snapshot.fingerprint = fingerprint(withoutFingerprint);
  return world;
}

function runCampaignScenario(
  regime: CampaignRegimeDefinition,
  seed: string,
  turns: number,
): CampaignRun {
  const seasonId = `campaign-${regime.id}-${seed}`;
  const policy = normalizeCampaignPolicy(regime.policy);
  const options = {
    seasonId,
    seed,
    policy,
  };
  const first = replayWorld(createCampaignInitialWorld(options), turns);
  const second = replayWorld(createCampaignInitialWorld(options), turns);
  const resolved = first.reciprocalEpisodes.filter(
    (episode) => episode.outcome !== "pending",
  );
  const numerator = resolved.filter(isRalrClosure).length;
  const resultPayload = {
    season: first.season,
    turn: first.turn,
    snapshot: first.snapshot,
    residents: first.residents,
    cohorts: first.cohorts,
    relationships: first.relationships,
    commitments: first.commitments,
    reciprocalEpisodes: first.reciprocalEpisodes,
  };
  return {
    id: seasonId,
    regimeId: regime.id,
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
      numerator,
      denominator: resolved.length,
      rate: rate(numerator, resolved.length),
      refusals: resolved.filter(
        (episode) => episode.outcome === "refused",
      ).length,
      withdrawals: resolved.filter(
        (episode) => episode.outcome === "withdrawn",
      ).length,
      coerciveActions: first.reciprocalEpisodes.filter(
        (episode) => episode.forced,
      ).length,
    },
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
    policy,
  };
}

export async function runHypothesisCampaign(
  campaign: CampaignDefinition,
  options: {
    generatedAt?: string;
  } = {},
): Promise<HypothesisCampaignReport> {
  const runs = campaign.regimes.flatMap((regime) =>
    campaign.seeds.map((seed) =>
      runCampaignScenario(regime, seed, campaign.turnsPerRun),
    ),
  );
  const results = campaign.evaluate(runs);
  const passed = results.filter((result) => result.passed).length;
  const report = {
    schemaVersion: HYPOTHESIS_CAMPAIGN_SCHEMA_VERSION,
    protocolVersion: CAMPAIGN_PROTOCOL_VERSION,
    campaignId: campaign.id,
    campaignVersion: campaign.version,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status:
      passed === results.length
        ? ("campaign-passed" as const)
        : ("campaign-failed" as const),
    boundary: {
      syntheticOnly: true as const,
      realPolicyEvidence: false as const,
      privateDataIncluded: false as const,
      modelReasoningIncluded: false as const,
      productionSettlementChanged: false as const,
    },
    preregistration: {
      kind: "prospective-campaign" as const,
      lockedAt: campaign.lockedAt,
      hypotheses: campaign.hypotheses.map((hypothesis) => ({
        ...hypothesis,
      })),
    },
    design: {
      engineVersion: SYMBIOSIS_ENGINE_VERSION,
      distributionVersion: SYMBIOSIS_DISTRIBUTION_VERSION,
      turnsPerRun: campaign.turnsPerRun,
      regimes: campaign.regimes.map((regime) => ({
        id: regime.id,
        label: regime.label,
        description: regime.description,
        policy: regime.policy,
      })),
      seeds: [...campaign.seeds],
      runCount: runs.length,
      policyBounds: {
        "maintenance-reserve-rate": { min: 0.1, max: 0.3 },
        "household-safety-floor": { min: 0.55, max: 0.8 },
        "bargaining-window-turns": { min: 2, max: 5 },
      },
      secretInputsRequired: false as const,
      command: campaign.command,
    },
    runs,
    analysis: {
      hypotheses: campaign.hypotheses.map((hypothesis, index) => ({
        ...hypothesis,
        passed: results[index].passed,
        observed: results[index].observed,
      })),
      passed,
      total: results.length,
    },
    disclosures: [
      "Every resident, household, bargain and policy proposal is synthetic software state.",
      "Campaign regimes vary only white-listed civic-policy parameters inside their constitutional bounds.",
      "The campaign changes no production settlement; results describe synthetic mechanisms, not real policy effects.",
      "RALR denominators, refusals, withdrawals and coercion remain fully visible.",
      "No production secret, provider key, private field or model reasoning is required or included.",
    ],
  } satisfies Omit<HypothesisCampaignReport, "integrity">;
  const resultsSha256 = sha256({
    runs: report.runs,
    analysis: report.analysis,
  });
  const localVerificationPassed = runs.every(
    (run) => run.exactReplay && run.resourceConservationPassed,
  );
  const unsigned = {
    ...report,
    integrity: {
      resultsSha256,
      localVerificationPassed,
    },
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

export function verifyHypothesisCampaignReport(
  report: HypothesisCampaignReport,
  campaign: CampaignDefinition,
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  if (report.schemaVersion !== HYPOTHESIS_CAMPAIGN_SCHEMA_VERSION) {
    errors.push("schema-version-mismatch");
  }
  if (
    report.campaignId !== campaign.id ||
    report.campaignVersion !== campaign.version
  ) {
    errors.push("campaign-identity-mismatch");
  }
  if (
    report.design.turnsPerRun !== campaign.turnsPerRun ||
    report.design.seeds.length !== campaign.seeds.length ||
    report.design.regimes.length !== campaign.regimes.length
  ) {
    errors.push("campaign-design-mismatch");
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
    sha256({
      ...report,
      integrity,
    })
  ) {
    errors.push("report-hash-mismatch");
  }
  const replayed = campaign.evaluate(report.runs);
  const hypothesisMismatch =
    report.analysis.hypotheses.length !== replayed.length ||
    report.analysis.hypotheses.some(
      (hypothesis, index) =>
        hypothesis.passed !== replayed[index].passed,
    ) ||
    report.analysis.passed !==
      replayed.filter((result) => result.passed).length;
  if (hypothesisMismatch) {
    errors.push("hypothesis-evaluation-mismatch");
  }
  if (
    report.runs.some(
      (run) => !run.exactReplay || !run.resourceConservationPassed,
    )
  ) {
    errors.push("run-integrity-failed");
  }
  const expectedStatus =
    report.analysis.passed === report.analysis.total
      ? "campaign-passed"
      : "campaign-failed";
  if (report.status !== expectedStatus) {
    errors.push("status-mismatch");
  }
  return { passed: errors.length === 0, errors };
}

/** Pooled metric helpers used by campaign evaluators. */

export function pooledRate(
  runs: CampaignRun[],
  select: (run: CampaignRun) => { numerator: number; denominator: number },
): { numerator: number; denominator: number; rate: number | null } {
  const numerator = runs.reduce(
    (sum, run) => sum + select(run).numerator,
    0,
  );
  const denominator = runs.reduce(
    (sum, run) => sum + select(run).denominator,
    0,
  );
  return { numerator, denominator, rate: rate(numerator, denominator) };
}

export function pooledMean(
  runs: CampaignRun[],
  select: (run: CampaignRun) => number,
): number {
  return runs.length === 0
    ? 0
    : Number(
        (
          runs.reduce((sum, run) => sum + select(run), 0) /
          runs.length
        ).toFixed(6),
      );
}

export function pooledBargainsPerTurn(
  runs: CampaignRun[],
): number {
  const resolved = runs.reduce(
    (sum, run) => sum + run.society.resolvedBargains,
    0,
  );
  const turns = runs.reduce((sum, run) => sum + run.turns, 0);
  return turns === 0 ? 0 : Number((resolved / turns).toFixed(6));
}
