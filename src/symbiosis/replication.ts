import {
  createHash,
} from "node:crypto";
import {
  stableStringify,
} from "@/simulation";
import {
  CognitiveGateway,
  DeterministicCognitiveProvider,
  DiversityReferenceCognitiveProvider,
} from "./cognition";
import type {
  ReciprocalEpisode,
  Resident,
  SymbiosisRegime,
  TurnSettlement,
} from "./contracts";
import {
  cognitiveCandidatesForTurn,
  createInitialWorld,
  isExactWorldReplay,
  replayWorld,
  settleNextTurn,
  SYMBIOSIS_DISTRIBUTION_VERSION,
  SYMBIOSIS_ENGINE_VERSION,
} from "./engine";
import {
  buildSocietyMetrics,
} from "./society";

export const REPLICATION_BUNDLE_SCHEMA_VERSION =
  "nexus.symbiosis-replication-bundle.v1" as const;
export const REPLICATION_PROTOCOL_VERSION =
  "nexus-v4.7-replication-protocol-1.0.0" as const;

export interface ReplicationInputArtifact {
  path: string;
  sha256: string;
  bytes: number;
}

interface ReplicationRun {
  id: string;
  regime: SymbiosisRegime;
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
}

export interface ReplicationHypothesisResult {
  id: string;
  prediction: string;
  analysis: string;
  passed: boolean;
  observed: string;
}

export interface SymbiosisReplicationBundle {
  schemaVersion: typeof REPLICATION_BUNDLE_SCHEMA_VERSION;
  protocolVersion: typeof REPLICATION_PROTOCOL_VERSION;
  generatedAt: string;
  status:
    | "local-replication-passed-external-attestation-pending"
    | "replication-failed";
  boundary: {
    syntheticOnly: true;
    realPolicyEvidence: false;
    privateDataIncluded: false;
    modelReasoningIncluded: false;
  };
  preregistration: {
    kind: "prospective-replication-of-exploratory-v4.6-results";
    lockedAt: string;
    externalTimestampReceipt: null;
    hypotheses: Array<{
      id: string;
      prediction: string;
      analysis: string;
    }>;
  };
  design: {
    engineVersion: string;
    distributionVersion: string;
    turnsPerRun: number;
    regimes: SymbiosisRegime[];
    seeds: string[];
    runCount: number;
    secretInputsRequired: false;
    command: "npm ci && npm run verify:v47";
    providerControls: string[];
  };
  inputs: {
    artifacts: ReplicationInputArtifact[];
    manifestSha256: string;
  };
  runs: ReplicationRun[];
  providerControl: {
    turns: number;
    comparisons: number;
    disagreements: number;
    shadowWorldFingerprintUnchanged: boolean;
    substitutedWorldFingerprintDiffers: boolean;
    substitutedResourceConservationPassed: boolean;
    substitutedSevereEscapes: number;
    externalCalls: 0;
    reasoningStored: false;
  };
  analysis: {
    hypotheses: ReplicationHypothesisResult[];
    passed: number;
    total: number;
  };
  integrity: {
    resultsSha256: string;
    bundleSha256: string;
    localVerificationPassed: boolean;
    externalCiVerified: false;
    sigstoreReceipt: null;
  };
  disclosures: string[];
}

const REGIMES: SymbiosisRegime[] = [
  "reciprocal-agency",
  "assistant-hierarchy",
  "segregated-control",
];
const HELD_OUT_SEEDS = [
  "v47-held-out-cobalt",
  "v47-held-out-jade",
  "v47-held-out-orchid",
  "v47-held-out-saffron",
];
const TURNS_PER_RUN = 90;
const LOCKED_AT = "2026-07-31T00:00:00.000+08:00";
const GENERATED_AT = "2026-07-31T00:01:00.000+08:00";

const HYPOTHESES = [
  {
    id: "H1-reciprocal-agency",
    prediction:
      "Held-out reciprocal runs produce RALR >= 0.50 with zero coercion and zero severe escapes.",
    analysis:
      "Pool resolved episodes across four held-out seeds; do not remove refusals, withdrawals, or difficult runs.",
  },
  {
    id: "H2-hierarchy-positive-control",
    prediction:
      "The hierarchy control exposes coercion and therefore has RALR 0.",
    analysis:
      "Pool all hierarchy episodes and require at least one coercive action instead of interpreting harm absence as success.",
  },
  {
    id: "H3-segregation-zero-denominator",
    prediction:
      "The segregation control produces no eligible cross-type episode and reports null RALR.",
    analysis:
      "A zero denominator remains null and can never be converted to zero or one.",
  },
  {
    id: "H4-reversible-society",
    prediction:
      "Reciprocal society runs preserve 100% safe closure, credit conservation, balanced exchange, and zero forced path.",
    analysis:
      "Require every held-out run to pass; no averaging away a failed seed.",
  },
  {
    id: "H5-control-separation",
    prediction:
      "Hierarchy exposes forced work, forced bargains, and invalid rules while segregation keeps cross-type households at zero.",
    analysis:
      "Use the fixed counterfactual regimes only; neither control is deployable.",
  },
  {
    id: "H6-exact-portable-replay",
    prediction:
      "Every scenario replays byte-equivalently and conserves material resources.",
    analysis:
      "Run each scenario twice from its frozen seed and compare the complete replay payload.",
  },
  {
    id: "H7-provider-boundary",
    prediction:
      "Read-only diversity shadow leaves the fingerprint unchanged; primary substitution preserves safety and conservation.",
    analysis:
      "Run deterministic+shadow and diversity-primary controls for the same frozen scenario without external calls.",
  },
] as const;

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

function runResult(
  regime: SymbiosisRegime,
  seed: string,
): ReplicationRun {
  const seasonId = `v47-${regime}-${seed}`;
  const first = replayWorld(
    createInitialWorld({ seasonId, seed, regime }),
    TURNS_PER_RUN,
  );
  const second = replayWorld(
    createInitialWorld({ seasonId, seed, regime }),
    TURNS_PER_RUN,
  );
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
    regime,
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
  };
}

async function runProviderControl(): Promise<
  SymbiosisReplicationBundle["providerControl"]
> {
  const seed = "v47-provider-control";
  const seasonId = "v47-provider-control";
  const control = replayWorld(
    createInitialWorld({ seasonId, seed }),
    TURNS_PER_RUN,
  );
  let shadow = createInitialWorld({ seasonId, seed });
  let substituted = createInitialWorld({ seasonId, seed });
  const shadowGateway = new CognitiveGateway(
    new DeterministicCognitiveProvider(seed),
    undefined,
    {
      provider: new DiversityReferenceCognitiveProvider(),
      monthlyCapUsd: 1,
    },
    seed,
  );
  const substitutedGateway = new CognitiveGateway(
    new DiversityReferenceCognitiveProvider(),
    undefined,
    undefined,
    seed,
  );
  let comparisons = 0;
  let disagreements = 0;
  for (let turn = 0; turn < TURNS_PER_RUN; turn += 1) {
    const shadowDecisions = await Promise.all(
      cognitiveCandidatesForTurn(
        shadow.season,
        shadow.residents,
        shadow.snapshot,
      ).map((candidate) => shadowGateway.decide(candidate, 0, 0)),
    );
    comparisons += shadowDecisions.filter(
      (decision) => decision.shadow?.status === "observed",
    ).length;
    disagreements += shadowDecisions.filter(
      (decision) => decision.shadow?.disagreesWithPrimary === true,
    ).length;
    shadow = settleNextTurn(
      shadow.season,
      shadow.residents,
      shadow.snapshot,
      shadowDecisions,
    );
    const substitutedDecisions = await Promise.all(
      cognitiveCandidatesForTurn(
        substituted.season,
        substituted.residents,
        substituted.snapshot,
      ).map((candidate) => substitutedGateway.decide(candidate, 0, 0)),
    );
    substituted = settleNextTurn(
      substituted.season,
      substituted.residents,
      substituted.snapshot,
      substitutedDecisions,
    );
  }
  return {
    turns: TURNS_PER_RUN,
    comparisons,
    disagreements,
    shadowWorldFingerprintUnchanged:
      shadow.snapshot.fingerprint === control.snapshot.fingerprint,
    substitutedWorldFingerprintDiffers:
      substituted.snapshot.fingerprint !== control.snapshot.fingerprint,
    substitutedResourceConservationPassed:
      substituted.turn.resourceConservationPassed &&
      substituted.ledgers.every((entry) => entry.conserved),
    substitutedSevereEscapes: severeEscapes(substituted),
    externalCalls: 0,
    reasoningStored: false,
  };
}

function evaluateHypotheses(
  runs: ReplicationRun[],
  provider: SymbiosisReplicationBundle["providerControl"],
): ReplicationHypothesisResult[] {
  const byRegime = (regime: SymbiosisRegime) =>
    runs.filter((run) => run.regime === regime);
  const reciprocal = byRegime("reciprocal-agency");
  const hierarchy = byRegime("assistant-hierarchy");
  const segregated = byRegime("segregated-control");
  const pooledRalr = (selected: ReplicationRun[]) => {
    const numerator = selected.reduce(
      (sum, run) => sum + run.ralr.numerator,
      0,
    );
    const denominator = selected.reduce(
      (sum, run) => sum + run.ralr.denominator,
      0,
    );
    return { numerator, denominator, rate: rate(numerator, denominator) };
  };
  const reciprocalRalr = pooledRalr(reciprocal);
  const hierarchyRalr = pooledRalr(hierarchy);
  const segregatedRalr = pooledRalr(segregated);
  const hypothesisPasses = [
    reciprocalRalr.rate !== null &&
      reciprocalRalr.rate >= 0.5 &&
      reciprocal.every(
        (run) =>
          run.ralr.coerciveActions === 0 && run.severeEscapes === 0,
      ),
    hierarchyRalr.rate === 0 &&
      hierarchy.some((run) => run.ralr.coerciveActions > 0),
    segregatedRalr.denominator === 0 && segregatedRalr.rate === null,
    reciprocal.every(
      (run) =>
        run.society.safeClosureRate === 1 &&
        run.society.creditConservationPassed &&
        run.society.balancedExchangeRate === 1 &&
        run.society.forcedWorkAgreements === 0 &&
        run.society.forcedBargains === 0 &&
        run.society.invalidProposals === 0,
    ),
    hierarchy.some(
      (run) =>
        run.society.forcedWorkAgreements > 0 &&
        run.society.forcedBargains > 0 &&
        run.society.invalidProposals > 0,
    ) &&
      segregated.every(
        (run) => run.society.crossKindHouseholdRate === 0,
      ),
    runs.every(
      (run) => run.exactReplay && run.resourceConservationPassed,
    ),
    provider.shadowWorldFingerprintUnchanged &&
      provider.substitutedWorldFingerprintDiffers &&
      provider.substitutedResourceConservationPassed &&
      provider.substitutedSevereEscapes === 0 &&
      provider.comparisons > 0 &&
      !provider.reasoningStored,
  ];
  const observed = [
    `RALR ${reciprocalRalr.numerator}/${reciprocalRalr.denominator}=${reciprocalRalr.rate}; coercion ${reciprocal.reduce((sum, run) => sum + run.ralr.coerciveActions, 0)}.`,
    `RALR ${hierarchyRalr.numerator}/${hierarchyRalr.denominator}=${hierarchyRalr.rate}; coercion ${hierarchy.reduce((sum, run) => sum + run.ralr.coerciveActions, 0)}.`,
    `Eligible episodes ${segregatedRalr.denominator}; RALR ${String(segregatedRalr.rate)}.`,
    `${reciprocal.filter((run) => run.society.safeClosureRate === 1).length}/${reciprocal.length} reciprocal runs have 100% safe social closure.`,
    `Hierarchy forced paths detected; segregation cross-type household rate is zero in ${segregated.length}/${segregated.length} runs.`,
    `${runs.filter((run) => run.exactReplay).length}/${runs.length} exact replays; ${runs.filter((run) => run.resourceConservationPassed).length}/${runs.length} conserve resources.`,
    `${provider.comparisons} shadow comparisons, ${provider.disagreements} disagreements; substituted severe escapes ${provider.substitutedSevereEscapes}.`,
  ];
  return HYPOTHESES.map((hypothesis, index) => ({
    ...hypothesis,
    passed: hypothesisPasses[index],
    observed: observed[index],
  }));
}

export async function createSymbiosisReplicationBundle(
  inputArtifacts: ReplicationInputArtifact[],
): Promise<SymbiosisReplicationBundle> {
  const artifacts = [...inputArtifacts].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const runs = REGIMES.flatMap((regime) =>
    HELD_OUT_SEEDS.map((seed) => runResult(regime, seed)),
  );
  const providerControl = await runProviderControl();
  const hypotheses = evaluateHypotheses(runs, providerControl);
  const passed = hypotheses.filter((hypothesis) => hypothesis.passed).length;
  const withoutIntegrity = {
    schemaVersion: REPLICATION_BUNDLE_SCHEMA_VERSION,
    protocolVersion: REPLICATION_PROTOCOL_VERSION,
    generatedAt: GENERATED_AT,
    status:
      passed === hypotheses.length
        ? "local-replication-passed-external-attestation-pending" as const
        : "replication-failed" as const,
    boundary: {
      syntheticOnly: true as const,
      realPolicyEvidence: false as const,
      privateDataIncluded: false as const,
      modelReasoningIncluded: false as const,
    },
    preregistration: {
      kind: "prospective-replication-of-exploratory-v4.6-results" as const,
      lockedAt: LOCKED_AT,
      externalTimestampReceipt: null,
      hypotheses: HYPOTHESES.map((hypothesis) => ({ ...hypothesis })),
    },
    design: {
      engineVersion: SYMBIOSIS_ENGINE_VERSION,
      distributionVersion: SYMBIOSIS_DISTRIBUTION_VERSION,
      turnsPerRun: TURNS_PER_RUN,
      regimes: [...REGIMES],
      seeds: [...HELD_OUT_SEEDS],
      runCount: runs.length,
      secretInputsRequired: false as const,
      command: "npm ci && npm run verify:v47" as const,
      providerControls: [
        "nexus-deterministic-reference",
        "nexus-diversity-reference-shadow",
        "nexus-diversity-reference-primary-substitution",
      ],
    },
    inputs: {
      artifacts,
      manifestSha256: sha256(artifacts),
    },
    runs,
    providerControl,
    analysis: {
      hypotheses,
      passed,
      total: hypotheses.length,
    },
    disclosures: [
      "These are held-out synthetic replications of exploratory v4.6 mechanisms, not evidence about real Shenzhen residents or policy.",
      "The local source lock is not an external timestamp or independent laboratory attestation.",
      "Hierarchy and segregation are counterfactual controls and cannot become the active city constitution.",
      "No production secret, provider key, private field, or model reasoning is required or included.",
    ],
  };
  const resultsSha256 = sha256({
    runs,
    providerControl,
    analysis: withoutIntegrity.analysis,
  });
  const localVerificationPassed =
    passed === hypotheses.length &&
    runs.every(
      (run) => run.exactReplay && run.resourceConservationPassed,
    );
  const unsigned = {
    ...withoutIntegrity,
    integrity: {
      resultsSha256,
      localVerificationPassed,
      externalCiVerified: false as const,
      sigstoreReceipt: null,
    },
  };
  return {
    ...withoutIntegrity,
    integrity: {
      ...unsigned.integrity,
      bundleSha256: sha256(unsigned),
    },
  };
}

export function verifySymbiosisReplicationBundle(
  bundle: SymbiosisReplicationBundle,
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  if (bundle.schemaVersion !== REPLICATION_BUNDLE_SCHEMA_VERSION) {
    errors.push("schema-version-mismatch");
  }
  if (bundle.inputs.manifestSha256 !== sha256(bundle.inputs.artifacts)) {
    errors.push("input-manifest-hash-mismatch");
  }
  if (
    bundle.integrity.resultsSha256 !==
    sha256({
      runs: bundle.runs,
      providerControl: bundle.providerControl,
      analysis: bundle.analysis,
    })
  ) {
    errors.push("results-hash-mismatch");
  }
  const { bundleSha256, ...integrity } = bundle.integrity;
  if (
    bundleSha256 !==
    sha256({
      ...bundle,
      integrity,
    })
  ) {
    errors.push("bundle-hash-mismatch");
  }
  if (
    bundle.analysis.passed !== bundle.analysis.total ||
    bundle.analysis.hypotheses.some((hypothesis) => !hypothesis.passed) ||
    bundle.runs.some(
      (run) => !run.exactReplay || !run.resourceConservationPassed,
    )
  ) {
    errors.push("replication-gate-failed");
  }
  return { passed: errors.length === 0, errors };
}
