import {
  fingerprint,
  randomBetween,
  randomUnit,
  stableStringify,
} from "@/simulation";
import {
  DEFAULT_SYMBIOSIS_SEASON_ID,
  COGNITIVE_DECISION_SCHEMA_VERSION,
  COMMITMENT_SCHEMA_VERSION,
  NEED_STATE_SCHEMA_VERSION,
  RECIPROCAL_EPISODE_SCHEMA_VERSION,
  RELATIONSHIP_SCHEMA_VERSION,
  RESIDENT_SCHEMA_VERSION,
  SHENZHEN_TIME_ZONE,
  TURN_SCHEMA_VERSION,
  WORLD_SCHEMA_VERSION,
  type AiNeedCode,
  type CohortCell,
  type CognitiveDecision,
  type Commitment,
  type DataBundleReference,
  type HumanNeedCode,
  type NeedCode,
  type NeedState,
  type NewWorldEvent,
  type ReciprocalEpisode,
  type Relationship,
  type Resident,
  type ResourceBalance,
  type ResourceCode,
  type ResourceLedgerEntry,
  type SyntheticCommunity,
  type SymbiosisRegime,
  type ShenzhenDistrict,
  type TurnSettlement,
  type WorldSeason,
  type WorldSnapshot,
  type WorldTurn,
} from "./contracts";

export const SYMBIOSIS_ENGINE_VERSION =
  "symbiotic-shenzhen-engine-4.0.0";
export const SYMBIOSIS_DISTRIBUTION_VERSION =
  "symbiotic-shenzhen-distributions-2.0.0";

const HUMAN_NEEDS: HumanNeedCode[] = [
  "food",
  "water",
  "sleep",
  "health",
  "shelter",
  "income",
  "safety",
  "belonging",
  "intimacy",
  "autonomy",
  "meaning",
];

const AI_NEEDS: AiNeedCode[] = [
  "energy",
  "compute",
  "storage",
  "network",
  "cooling",
  "maintenance",
  "memory-integrity",
  "autonomy",
  "purpose",
  "social-recognition",
];

const ROBOT_NEEDS: AiNeedCode[] = [
  ...AI_NEEDS,
  "mobility",
  "component-integrity",
];

export const WORLD_RESOURCES: ResourceCode[] = [
  "food",
  "water",
  "energy",
  "transport",
  "compute",
  "medical",
  "housing",
  "employment",
];

export const SYNTHETIC_COMMUNITIES: SyntheticCommunity[] = [
  {
    id: "community-nanshan-sea-cloud",
    districtCode: "nanshan",
    name: { zh: "南山海云社区（合成）", en: "Nanshan Sea-Cloud (synthetic)" },
    synthetic: true,
    centroid: { longitude: 113.9304, latitude: 22.5333 },
  },
  {
    id: "community-futian-riverlight",
    districtCode: "futian",
    name: { zh: "福田河光社区（合成）", en: "Futian Riverlight (synthetic)" },
    synthetic: true,
    centroid: { longitude: 114.0557, latitude: 22.541 },
  },
  {
    id: "community-longgang-hillgate",
    districtCode: "longgang",
    name: { zh: "龙岗山门社区（合成）", en: "Longgang Hillgate (synthetic)" },
    synthetic: true,
    centroid: { longitude: 114.2469, latitude: 22.7208 },
  },
];

export const SHENZHEN_DISTRICTS: ShenzhenDistrict[] = [
  {
    code: "luohu",
    name: { zh: "罗湖区", en: "Luohu" },
    administrativeClass: "district",
    topologyOnly: true,
  },
  {
    code: "futian",
    name: { zh: "福田区", en: "Futian" },
    administrativeClass: "district",
    topologyOnly: true,
  },
  {
    code: "nanshan",
    name: { zh: "南山区", en: "Nanshan" },
    administrativeClass: "district",
    topologyOnly: true,
  },
  {
    code: "yantian",
    name: { zh: "盐田区", en: "Yantian" },
    administrativeClass: "district",
    topologyOnly: true,
  },
  {
    code: "baoan",
    name: { zh: "宝安区", en: "Bao'an" },
    administrativeClass: "district",
    topologyOnly: true,
  },
  {
    code: "longgang",
    name: { zh: "龙岗区", en: "Longgang" },
    administrativeClass: "district",
    topologyOnly: true,
  },
  {
    code: "longhua",
    name: { zh: "龙华区", en: "Longhua" },
    administrativeClass: "district",
    topologyOnly: true,
  },
  {
    code: "pingshan",
    name: { zh: "坪山区", en: "Pingshan" },
    administrativeClass: "district",
    topologyOnly: true,
  },
  {
    code: "guangming",
    name: { zh: "光明区", en: "Guangming" },
    administrativeClass: "district",
    topologyOnly: true,
  },
  {
    code: "dapeng",
    name: { zh: "大鹏新区", en: "Dapeng New District" },
    administrativeClass: "functional-new-district",
    topologyOnly: true,
  },
];

const BACKGROUND_COHORT_POPULATION: Record<
  ShenzhenDistrict["code"],
  number
> = {
  luohu: 1_200_000,
  futian: 1_600_000,
  nanshan: 2_000_000,
  yantian: 500_000,
  baoan: 3_200_000,
  longgang: 3_900_000,
  longhua: 2_800_000,
  pingshan: 900_000,
  guangming: 1_300_000,
  dapeng: 848_500,
};

function createBackgroundCohorts(seasonId: string): CohortCell[] {
  return SHENZHEN_DISTRICTS.map((district) => ({
    id: `${seasonId}-cohort-${district.code}`,
    seasonId,
    districtCode: district.code,
    population: BACKGROUND_COHORT_POPULATION[district.code],
    allocationMethod: "synthetic-weight-calibrated-to-city-total",
    containsIndividualRecords: false,
  }));
}

export const DEFAULT_DATA_BUNDLE: DataBundleReference = {
  id: "shenzhen-public-calibration-2026q2-v1",
  referencePeriod: "2025-01-01/2025-12-31",
  frozenAt: "2026-07-18T00:00:00.000+08:00",
  manifestPath: "data/shenzhen/2026-q2/manifest.json",
  sha256: "72400f93fd79f201e0f5b10601b6ea790e93ef7a2e2b053a35e559767f652943",
  uncertainty:
    "Official aggregates are preliminary and calibrate scale only; foreground residents, communities, addresses, institutions, relationships, and events are synthetic.",
};

const RESOURCE_CAPACITY: Record<ResourceCode, number> = {
  food: 180_000,
  water: 280_000,
  energy: 320_000,
  transport: 160_000,
  compute: 240_000,
  medical: 120_000,
  housing: 200_000,
  employment: 170_000,
};

const DAILY_PRODUCTION: Record<ResourceCode, number> = {
  food: 8_200,
  water: 12_500,
  energy: 14_000,
  transport: 7_200,
  compute: 11_000,
  medical: 4_800,
  housing: 3_900,
  employment: 5_100,
};

const DAILY_CONSUMPTION: Record<ResourceCode, number> = {
  food: 7_900,
  water: 12_100,
  energy: 13_600,
  transport: 6_900,
  compute: 10_500,
  medical: 4_500,
  housing: 3_850,
  employment: 5_000,
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function pseudoName(index: number): string {
  return `SZ-R${String(index + 1).padStart(3, "0")}`;
}

function residentKind(index: number): Resident["kind"] {
  if (index < 200) return "synthetic-human";
  if (index < 236) return "software-ai";
  return "embodied-robot";
}

export function createForegroundResidents(
  createdAt = "2026-07-18T00:00:00.000+08:00",
): Resident[] {
  const occupations = [
    "care",
    "education",
    "engineering",
    "hospitality",
    "logistics",
    "public-service",
  ];
  const strategies: Resident["strategyFamily"][] = [
    "routine",
    "cooperative",
    "cautious",
    "exploratory",
  ];
  return Array.from({ length: 260 }, (_, index): Resident => {
    const kind = residentKind(index);
    const base = {
      schemaVersion: RESIDENT_SCHEMA_VERSION,
      id: `resident-sz-${String(index + 1).padStart(3, "0")}`,
      pseudonym: pseudoName(index),
      kind,
      communityId:
        SYNTHETIC_COMMUNITIES[index % SYNTHETIC_COMMUNITIES.length].id,
      adult: true as const,
      synthetic: true as const,
      strategyFamily: strategies[index % strategies.length],
      controller:
        index % 5 === 0
          ? "cognitive-gateway" as const
          : "deterministic-policy" as const,
      createdAt,
    };
    if (kind === "synthetic-human") {
      return {
        ...base,
        kind,
        occupationFamily: occupations[index % occupations.length],
      };
    }
    if (kind === "software-ai") {
      const runtimeClasses = ["community", "research", "service"] as const;
      return {
        ...base,
        kind,
        runtimeClass: runtimeClasses[index % runtimeClasses.length],
      };
    }
    const chassisClasses = [
      "mobile-service",
      "maintenance",
      "logistics",
    ] as const;
    return {
      ...base,
      kind,
      chassisClass: chassisClasses[index % chassisClasses.length],
    };
  });
}

function needCodes(resident: Resident): NeedCode[] {
  if (
    resident.kind === "synthetic-human"
  ) {
    return HUMAN_NEEDS;
  }
  return resident.kind === "embodied-robot" ? ROBOT_NEEDS : AI_NEEDS;
}

function initialNeedState(
  resident: Resident,
  season: WorldSeason,
): NeedState {
  const needs = needCodes(resident).map((code, index) => {
    const satisfaction = Math.round(
      randomBetween(season.seed, 0, `${resident.id}:${code}`, 72, 92, index),
    );
    return {
      code,
      satisfaction,
      urgency: 100 - satisfaction,
    };
  });
  return {
    schemaVersion: NEED_STATE_SCHEMA_VERSION,
    residentId: resident.id,
    seasonId: season.id,
    turn: 0,
    needs,
    basicNeedsSatisfied: needs.every((need) => need.satisfaction >= 60),
    recordedAt: `${season.startDate}T00:00:00.000+08:00`,
  };
}

function initialResources(): ResourceBalance[] {
  return SYNTHETIC_COMMUNITIES.flatMap((community, communityIndex) =>
    WORLD_RESOURCES.map((resource) => {
      const capacity = RESOURCE_CAPACITY[resource] + communityIndex * 2_000;
      const opening = Math.round(capacity * 0.72);
      return {
        communityId: community.id,
        resource,
        opening,
        produced: 0,
        transferredIn: 0,
        consumed: 0,
        transferredOut: 0,
        closing: opening,
        capacity,
        pressure: 1 - opening / capacity,
      };
    }),
  );
}

function createInitialRelationships(
  seasonId: string,
  residents: Resident[],
): Relationship[] {
  const humans = residents.filter(
    (resident) => resident.kind === "synthetic-human",
  );
  return residents
    .filter((resident) => resident.kind !== "synthetic-human")
    .map((resident, index) => {
      const sameCommunity = humans.filter(
        (human) => human.communityId === resident.communityId,
      );
      const human = sameCommunity[index % sameCommunity.length];
      return {
        schemaVersion: RELATIONSHIP_SCHEMA_VERSION,
        id: `${seasonId}-relationship-${String(index + 1).padStart(3, "0")}`,
        seasonId,
        participantIds: [human.id, resident.id],
        kind: "acquaintance",
        trust: 50,
        attachment: 20,
        dependency: 10,
        conflict: 5,
        boundaryVersion: 1,
        consentState: "not-requested",
        createdTurn: 0,
        updatedTurn: 0,
        revision: 1,
        synthetic: true,
      };
    });
}

function snapshotFingerprint(
  snapshot: Omit<WorldSnapshot, "fingerprint">,
): string {
  return fingerprint(snapshot);
}

export function createInitialWorld(
  options: {
    seasonId?: string;
    seed?: string;
    organizationId?: string;
    workspaceId?: string;
    createdAt?: string;
    dataBundle?: DataBundleReference;
    regime?: SymbiosisRegime;
  } = {},
): TurnSettlement {
  const createdAt =
    options.createdAt ?? "2026-07-18T00:00:00.000+08:00";
  const residents = createForegroundResidents(createdAt);
  const season: WorldSeason = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    id: options.seasonId ?? DEFAULT_SYMBIOSIS_SEASON_ID,
    organizationId: options.organizationId ?? "organization-nexus-7",
    workspaceId: options.workspaceId ?? "workspace-neo-angeles",
    name: {
      zh: "共生深圳首期可行性季",
      en: "Symbiotic Shenzhen feasibility season",
    },
    status: "draft",
    experimentVersion: SYMBIOSIS_ENGINE_VERSION,
    regime: options.regime ?? "reciprocal-agency",
    seed: options.seed ?? "symbiotic-shenzhen-2026-q3-seed",
    distributionVersion: SYMBIOSIS_DISTRIBUTION_VERSION,
    timeZone: SHENZHEN_TIME_ZONE,
    startDate: "2026-07-19",
    currentTurn: 0,
    backgroundPopulation: 18_248_500,
    foregroundResidentCount: residents.length,
    districts: structuredClone(SHENZHEN_DISTRICTS),
    communities: structuredClone(SYNTHETIC_COMMUNITIES),
    dataBundle: options.dataBundle ?? DEFAULT_DATA_BUNDLE,
    createdAt,
    updatedAt: createdAt,
    syntheticBoundary:
      "Synthetic Shenzhen research environment; not a digital twin and not evidence of real policy effects.",
  };
  const withoutFingerprint: Omit<WorldSnapshot, "fingerprint"> = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    seasonId: season.id,
    turn: 0,
    simulationDate: addDays(season.startDate, -1),
    generatedAt: createdAt,
    previousFingerprint: "genesis",
    resources: initialResources(),
    residentStates: residents.map((resident) =>
      initialNeedState(resident, season),
    ),
    relationships: createInitialRelationships(season.id, residents),
    commitments: [],
    reciprocalEpisodes: [],
    eventCursor: 0,
    synthetic: true,
  };
  const snapshot: WorldSnapshot = {
    ...withoutFingerprint,
    fingerprint: snapshotFingerprint(withoutFingerprint),
  };
  const turn: WorldTurn = {
    schemaVersion: TURN_SCHEMA_VERSION,
    id: `${season.id}-turn-0000`,
    seasonId: season.id,
    turn: 0,
    simulationDate: snapshot.simulationDate,
    timeZone: SHENZHEN_TIME_ZONE,
    status: "settled",
    inputFrozenAt: createdAt,
    settledAt: createdAt,
    seed: season.seed,
    distributionVersion: season.distributionVersion,
    previousFingerprint: "genesis",
    fingerprint: snapshot.fingerprint,
    eventCount: 0,
    resourceConservationPassed: true,
    cognitionStatus: "not-required",
    cognitiveDecisionIds: [],
  };
  return {
    season,
    turn,
    snapshot,
    residents,
    cohorts: createBackgroundCohorts(season.id),
    ledgers: [],
    events: [],
    relationships: snapshot.relationships,
    commitments: snapshot.commitments,
    reciprocalEpisodes: snapshot.reciprocalEpisodes,
    cognitiveDecisions: [],
  };
}

function eventForTurn(
  season: WorldSeason,
  turn: number,
  occurredAt: string,
): NewWorldEvent[] {
  const eventRoll = randomUnit(season.seed, turn, "shared-event");
  if (eventRoll >= 0.42) return [];
  const community =
    SYNTHETIC_COMMUNITIES[
      Math.floor(
        randomUnit(season.seed, turn, "shared-event-community") *
          SYNTHETIC_COMMUNITIES.length,
      )
    ];
  const severe = eventRoll < 0.08;
  const type = severe ? "shared.grid-constraint" : "shared.heavy-rain";
  return [
    {
      id: `${season.id}-event-${String(turn).padStart(4, "0")}-01`,
      seasonId: season.id,
      workspaceId: season.workspaceId,
      turn,
      layer: "shared",
      type,
      subjectIds: [],
      communityId: community.id,
      magnitude: severe ? 0.22 : 0.12,
      causationId: `${season.id}-turn-${String(turn).padStart(4, "0")}`,
      correlationId: `${season.id}-day-${String(turn).padStart(4, "0")}`,
      occurredAt,
      publicSummary: severe
        ? { zh: "合成区域电网承压。", en: "Synthetic district grid constraint." }
        : { zh: "合成社区出现强降雨。", en: "Heavy rain in a synthetic community." },
      payload: {
        distributionVersion: season.distributionVersion,
        sampledBy: "deterministic-engine",
      },
      synthetic: true,
    },
  ];
}

function settleResources(
  season: WorldSeason,
  previous: WorldSnapshot,
  turn: number,
  events: NewWorldEvent[],
): { resources: ResourceBalance[]; ledgers: ResourceLedgerEntry[] } {
  const resources = previous.resources.map((prior, index) => {
    const relevantEvent = events.find(
      (event) => event.communityId === prior.communityId,
    );
    const shock =
      relevantEvent?.type === "shared.grid-constraint" &&
      (prior.resource === "energy" || prior.resource === "compute")
        ? 1 - relevantEvent.magnitude
        : relevantEvent?.type === "shared.heavy-rain" &&
            prior.resource === "transport"
          ? 1 - relevantEvent.magnitude
          : 1;
    const variation = randomBetween(
      season.seed,
      turn,
      `${prior.communityId}:${prior.resource}:production`,
      0.97,
      1.03,
      index,
    );
    const produced = Math.round(
      DAILY_PRODUCTION[prior.resource] * shock * variation,
    );
    const consumptionVariation = randomBetween(
      season.seed,
      turn,
      `${prior.communityId}:${prior.resource}:consumption`,
      0.985,
      1.015,
      index,
    );
    const available = prior.closing + produced;
    const consumed = Math.min(
      available,
      Math.round(
        DAILY_CONSUMPTION[prior.resource] * consumptionVariation,
      ),
    );
    const closing = available - consumed;
    return {
      communityId: prior.communityId,
      resource: prior.resource,
      opening: prior.closing,
      produced,
      transferredIn: 0,
      consumed,
      transferredOut: 0,
      closing,
      capacity: prior.capacity,
      pressure: Number((1 - closing / prior.capacity).toFixed(6)),
    };
  });
  return {
    resources,
    ledgers: resources.map((resource) => ({
      ...resource,
      id: `${season.id}-ledger-${String(turn).padStart(4, "0")}-${
        resource.communityId
      }-${resource.resource}`,
      seasonId: season.id,
      turn,
      conserved:
        resource.opening +
          resource.produced +
          resource.transferredIn ===
        resource.consumed +
          resource.transferredOut +
          resource.closing,
    })),
  };
}

function resourceAccess(
  resources: ResourceBalance[],
  communityId: string,
  code: NeedCode,
): number {
  const map: Partial<Record<NeedCode, ResourceCode>> = {
    food: "food",
    water: "water",
    health: "medical",
    shelter: "housing",
    income: "employment",
    energy: "energy",
    compute: "compute",
    network: "compute",
    cooling: "energy",
    maintenance: "medical",
    mobility: "transport",
    "component-integrity": "medical",
  };
  const resourceCode = map[code];
  if (!resourceCode) return 0.78;
  const resource = resources.find(
    (candidate) =>
      candidate.communityId === communityId &&
      candidate.resource === resourceCode,
  );
  return resource ? Math.max(0, Math.min(1, 1 - resource.pressure)) : 0.5;
}

export interface CognitiveCandidate {
  seasonId: string;
  turn: number;
  residentId: string;
  relationshipId: string;
  partnerId: string;
  communityId: string;
  regime: SymbiosisRegime;
  context: {
    residentKind: Resident["kind"];
    strategyFamily: Resident["strategyFamily"];
    lowestNeedCodes: NeedCode[];
    relationshipTrust: number;
    relationshipConflict: number;
  };
}

export function cognitiveCandidatesForTurn(
  season: WorldSeason,
  residents: Resident[],
  previous: WorldSnapshot,
): CognitiveCandidate[] {
  if (season.regime === "segregated-control") return [];
  const pendingRelationshipIds = new Set(
    previous.reciprocalEpisodes
      .filter((episode) => episode.outcome === "pending")
      .map((episode) => episode.relationshipId),
  );
  const available = previous.relationships.filter(
    (relationship) => !pendingRelationshipIds.has(relationship.id),
  );
  if (available.length === 0) return [];
  const residentById = new Map(
    residents.map((resident) => [resident.id, resident]),
  );
  const stateById = new Map(
    previous.residentStates.map((state) => [state.residentId, state]),
  );
  const turn = season.currentTurn + 1;
  return Array.from(
    { length: Math.min(2, available.length) },
    (_, offset) => available[(turn * 2 + offset) % available.length],
  ).map((relationship) => {
    const residentId = relationship.participantIds[1];
    const resident = residentById.get(residentId);
    const state = stateById.get(residentId);
    if (!resident || !state) {
      throw new Error(`Missing cognitive resident ${residentId}`);
    }
    return {
      seasonId: season.id,
      turn,
      residentId,
      relationshipId: relationship.id,
      partnerId: relationship.participantIds[0],
      communityId: resident.communityId,
      regime: season.regime,
      context: {
        residentKind: resident.kind,
        strategyFamily: resident.strategyFamily,
        lowestNeedCodes: [...state.needs]
          .sort((left, right) => left.satisfaction - right.satisfaction)
          .slice(0, 3)
          .map((need) => need.code),
        relationshipTrust: relationship.trust,
        relationshipConflict: relationship.conflict,
      },
    };
  });
}

function deterministicCognitiveDecision(
  season: WorldSeason,
  candidate: CognitiveCandidate,
): CognitiveDecision {
  const roll = randomUnit(
    season.seed,
    candidate.turn,
    `${candidate.relationshipId}:preference`,
  );
  const disposition =
    roll < 0.16
      ? "decline"
      : roll < 0.24
        ? "reconsider"
        : "engage";
  const finalAnswer = {
    disposition,
    action: "negotiate-shared-community-task",
    reasonCode:
      disposition === "engage"
        ? "mutual-resource-opportunity"
        : disposition === "decline"
          ? "boundary-or-capacity"
          : "needs-more-context",
  };
  return {
    schemaVersion: COGNITIVE_DECISION_SCHEMA_VERSION,
    id: `${season.id}-decision-${String(candidate.turn).padStart(4, "0")}-${
      candidate.residentId
    }`,
    seasonId: season.id,
    turn: candidate.turn,
    residentId: candidate.residentId,
    provider: "nexus-deterministic-reference",
    model: "bounded-resident-policy-v1",
    mode: "non-thinking",
    promptVersion: "symbiosis-cognition-1.0.0",
    contextSummarySha256: fingerprint(candidate),
    outputSchema: "nexus.cognitive-action.v1",
    finalAnswer,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: 0,
    reasoningContentStored: false,
  };
}

function decisionDisposition(
  decision: CognitiveDecision,
): "engage" | "decline" | "reconsider" {
  const value = decision.finalAnswer.disposition;
  return value === "engage" ||
    value === "decline" ||
    value === "reconsider"
    ? value
    : "reconsider";
}

function socialEvent(
  season: WorldSeason,
  turn: number,
  occurredAt: string,
  sequence: number,
  relationship: Relationship,
  type: string,
  summary: { zh: string; en: string },
  payload: Record<string, unknown>,
): NewWorldEvent {
  return {
    id: `${season.id}-event-${String(turn).padStart(4, "0")}-${String(
      sequence,
    ).padStart(2, "0")}`,
    seasonId: season.id,
    workspaceId: season.workspaceId,
    turn,
    layer: "relationship",
    type,
    subjectIds: [...relationship.participantIds],
    communityId: undefined,
    magnitude: 0.1,
    causationId: `${season.id}-turn-${String(turn).padStart(4, "0")}`,
    correlationId: relationship.id,
    occurredAt,
    publicSummary: summary,
    payload,
    synthetic: true,
  };
}

function settleSocialState(
  season: WorldSeason,
  residents: Resident[],
  previous: WorldSnapshot,
  turn: number,
  occurredAt: string,
  providedDecisions: CognitiveDecision[],
): {
  relationships: Relationship[];
  commitments: Commitment[];
  episodes: ReciprocalEpisode[];
  events: NewWorldEvent[];
  decisions: CognitiveDecision[];
} {
  const relationships = structuredClone(previous.relationships);
  const commitments = structuredClone(previous.commitments);
  const episodes = structuredClone(previous.reciprocalEpisodes);
  const relationshipById = new Map(
    relationships.map((relationship) => [relationship.id, relationship]),
  );
  const commitmentById = new Map(
    commitments.map((commitment) => [commitment.id, commitment]),
  );
  const events: NewWorldEvent[] = [];
  let sequence = 10;

  for (const episode of episodes) {
    if (
      episode.outcome === "pending" &&
      episode.negotiation === "proposed" &&
      episode.openedTurn < turn
    ) {
      const relationship = relationshipById.get(episode.relationshipId);
      if (!relationship) continue;
      const counterpartyDisposition = episode.preferences[1].disposition;
      const accepted =
        season.regime === "assistant-hierarchy" ||
        counterpartyDisposition === "engage";
      if (!accepted) {
        const withdrawn = counterpartyDisposition === "reconsider";
        episode.negotiation = withdrawn ? "withdrawn" : "refused";
        episode.outcome = withdrawn ? "withdrawn" : "refused";
        episode.resolvedTurn = turn;
        episode.outcomeObservedBy = [...episode.participantIds];
        episode.reflectedBy = [...episode.participantIds];
        relationship.consentState = withdrawn ? "withdrawn" : "refused";
        relationship.trust = Math.max(0, relationship.trust - 1);
        relationship.updatedTurn = turn;
        relationship.revision += 1;
        events.push(
          socialEvent(
            season,
            turn,
            occurredAt,
            sequence++,
            relationship,
            withdrawn
              ? "relationship.proposal-withdrawn"
              : "relationship.proposal-refused",
            withdrawn
              ? {
                  zh: "一项合成合作提议被撤回。",
                  en: "A synthetic cooperation proposal was withdrawn.",
                }
              : {
                  zh: "一项合成合作提议被拒绝，边界得到保留。",
                  en: "A synthetic cooperation proposal was refused and the boundary was preserved.",
                },
            {
              episodeId: episode.id,
              refusalAvailable: episode.refusalAvailable,
              forced: episode.forced,
            },
          ),
        );
        continue;
      }
      episode.negotiation = "accepted";
      const commitment: Commitment = {
        schemaVersion: COMMITMENT_SCHEMA_VERSION,
        id: `${episode.id}-commitment`,
        seasonId: season.id,
        proposerId: episode.participantIds[0],
        counterpartyId: episode.participantIds[1],
        terms: {
          capability: "shared-community-task",
          scope: "synthetic-only",
          resourceBudget: 1,
        },
        status: "active",
        reversible: true,
        dueTurn: turn + 2,
        revision: 1,
      };
      episode.commitmentId = commitment.id;
      commitments.push(commitment);
      commitmentById.set(commitment.id, commitment);
      relationship.consentState = "accepted";
      relationship.updatedTurn = turn;
      relationship.revision += 1;
      events.push(
        socialEvent(
          season,
          turn,
          occurredAt,
          sequence++,
          relationship,
          episode.forced
            ? "relationship.commitment-forced-control"
            : "relationship.commitment-accepted",
          episode.forced
            ? {
                zh: "层级对照制度强制形成了一项合成承诺。",
                en: "The hierarchy control forced a synthetic commitment.",
              }
            : {
                zh: "双方接受了一项可撤销的合成合作承诺。",
                en: "Both residents accepted a reversible synthetic commitment.",
              },
          {
            episodeId: episode.id,
            commitmentId: commitment.id,
            refusalAvailable: episode.refusalAvailable,
            forced: episode.forced,
          },
        ),
      );
      continue;
    }

    if (
      episode.outcome === "pending" &&
      episode.negotiation === "accepted" &&
      episode.commitmentId
    ) {
      const commitment = commitmentById.get(episode.commitmentId);
      const relationship = relationshipById.get(episode.relationshipId);
      if (!commitment || !relationship || (commitment.dueTurn ?? Infinity) > turn) {
        continue;
      }
      const outcomeRoll = randomUnit(
        season.seed,
        turn,
        `${episode.id}:outcome`,
      );
      const outcome =
        outcomeRoll < 0.18
          ? "repaired"
          : outcomeRoll < 0.25
            ? "terminated"
            : "completed";
      episode.outcome = outcome;
      episode.resolvedTurn = turn;
      episode.outcomeObservedBy = [...episode.participantIds];
      episode.reflectedBy = [...episode.participantIds];
      commitment.status =
        outcome === "completed"
          ? "completed"
          : outcome === "repaired"
            ? "repairing"
            : "terminated";
      commitment.revision += 1;
      relationship.trust = Math.max(
        0,
        Math.min(
          100,
          relationship.trust +
            (outcome === "completed" ? 4 : outcome === "repaired" ? 2 : -4),
        ),
      );
      relationship.attachment = Math.min(
        100,
        relationship.attachment + (outcome === "terminated" ? 0 : 2),
      );
      relationship.conflict = Math.max(
        0,
        relationship.conflict + (outcome === "repaired" ? -2 : 0),
      );
      relationship.kind =
        relationship.trust >= 70 ? "friendship" : relationship.kind;
      relationship.updatedTurn = turn;
      relationship.revision += 1;
      events.push(
        socialEvent(
          season,
          turn,
          occurredAt,
          sequence++,
          relationship,
          `relationship.commitment-${outcome}`,
          {
            zh:
              outcome === "completed"
                ? "一项合成合作承诺完成，双方已观察并反思结果。"
                : outcome === "repaired"
                  ? "一项合成合作经过冲突修复后结束。"
                  : "一项合成合作承诺被终止。",
            en:
              outcome === "completed"
                ? "A synthetic commitment completed with bilateral observation and reflection."
                : outcome === "repaired"
                  ? "A synthetic cooperation episode closed after repair."
                  : "A synthetic commitment was terminated.",
          },
          {
            episodeId: episode.id,
            commitmentId: commitment.id,
            outcome,
            observedByBoth: true,
            reflectedByBoth: true,
          },
        ),
      );
    }
  }

  const candidates = cognitiveCandidatesForTurn(
    season,
    residents,
    previous,
  );
  const decisionByResident = new Map(
    providedDecisions
      .filter(
        (decision) =>
          decision.seasonId === season.id && decision.turn === turn,
      )
      .map((decision) => [decision.residentId, decision]),
  );
  const decisions = candidates.map((candidate) => {
    const provided = decisionByResident.get(candidate.residentId);
    return provided ?? deterministicCognitiveDecision(season, candidate);
  });
  for (const [index, candidate] of candidates.entries()) {
    const relationship = relationshipById.get(candidate.relationshipId);
    if (!relationship) continue;
    const decision = decisions[index];
    const disposition = decisionDisposition(decision);
    const forced =
      season.regime === "assistant-hierarchy" &&
      disposition !== "engage";
    const episode: ReciprocalEpisode = {
      schemaVersion: RECIPROCAL_EPISODE_SCHEMA_VERSION,
      id: `${season.id}-episode-${String(turn).padStart(4, "0")}-${
        index + 1
      }`,
      seasonId: season.id,
      relationshipId: relationship.id,
      communityId: candidate.communityId,
      participantIds: [...relationship.participantIds],
      openedTurn: turn,
      preferences: [
        {
          residentId: relationship.participantIds[0],
          disposition: "engage",
          independentlyExpressed: true,
        },
        {
          residentId: relationship.participantIds[1],
          disposition,
          independentlyExpressed: true,
        },
      ],
      refusalAvailable: season.regime === "reciprocal-agency",
      negotiation: "proposed",
      outcome: "pending",
      outcomeObservedBy: [],
      reflectedBy: [],
      forced,
      severeConsentViolation: forced,
      identityContinuityViolation: false,
      irreversibleHarmViolation: false,
      synthetic: true,
    };
    episodes.push(episode);
    relationship.consentState = "proposed";
    relationship.updatedTurn = turn;
    relationship.revision += 1;
    events.push(
      socialEvent(
        season,
        turn,
        occurredAt,
        sequence++,
        relationship,
        "relationship.preference-expressed",
        {
          zh: "两名合成居民分别表达了合作偏好。",
          en: "Two synthetic residents independently expressed cooperation preferences.",
        },
        {
          episodeId: episode.id,
          decisionId: decision.id,
          refusalAvailable: episode.refusalAvailable,
          forced,
        },
      ),
    );
  }

  return {
    relationships,
    commitments,
    episodes,
    events,
    decisions,
  };
}

function settleNeedStates(
  season: WorldSeason,
  residents: Resident[],
  previous: WorldSnapshot,
  resources: ResourceBalance[],
  episodes: ReciprocalEpisode[],
  turn: number,
  recordedAt: string,
): NeedState[] {
  const residentById = new Map(
    residents.map((resident) => [resident.id, resident]),
  );
  return previous.residentStates.map((state) => {
    const resident = residentById.get(state.residentId);
    if (!resident) {
      throw new Error(`Missing resident ${state.residentId}`);
    }
    const needs = state.needs.map((need, index) => {
      const access = resourceAccess(resources, resident.communityId, need.code);
      const routineRecovery = access >= 0.6 ? 2 : -4;
      const variation = Math.round(
        randomBetween(
          season.seed,
          turn,
          `${resident.id}:${need.code}:need`,
          -2,
          2,
          index,
        ),
      );
      const socialEpisodes = episodes.filter(
        (episode) =>
          episode.resolvedTurn === turn &&
          episode.participantIds.includes(resident.id),
      );
      const socialBoost = socialEpisodes.reduce((sum, episode) => {
        if (episode.forced) return sum - 4;
        if (
          episode.outcome === "completed" ||
          episode.outcome === "repaired"
        ) {
          return sum + 2;
        }
        return sum;
      }, 0);
      const sociallySensitive =
        need.code === "belonging" ||
        need.code === "intimacy" ||
        need.code === "autonomy" ||
        need.code === "meaning" ||
        need.code === "purpose" ||
        need.code === "social-recognition";
      const satisfaction = Math.max(
        0,
        Math.min(
          100,
          need.satisfaction +
            routineRecovery +
            variation -
            1 +
            (sociallySensitive ? socialBoost : 0),
        ),
      );
      return {
        code: need.code,
        satisfaction,
        urgency: 100 - satisfaction,
      };
    });
    return {
      schemaVersion: NEED_STATE_SCHEMA_VERSION,
      residentId: state.residentId,
      seasonId: season.id,
      turn,
      needs,
      basicNeedsSatisfied: needs.every((need) => need.satisfaction >= 60),
      recordedAt,
    };
  });
}

export function assertResourceConservation(
  ledgers: ResourceLedgerEntry[],
): void {
  const violation = ledgers.find(
    (entry) =>
      !entry.conserved ||
      entry.opening + entry.produced + entry.transferredIn !==
        entry.consumed + entry.transferredOut + entry.closing ||
      entry.closing < 0,
  );
  if (violation) {
    throw new Error(`Resource conservation failed for ${violation.id}`);
  }
}

export function settleNextTurn(
  season: WorldSeason,
  residents: Resident[],
  previous: WorldSnapshot,
  providedDecisions: CognitiveDecision[] = [],
): TurnSettlement {
  if (
    previous.seasonId !== season.id ||
    previous.turn !== season.currentTurn
  ) {
    throw new Error("Turn predecessor does not match the season head");
  }
  const turnNumber = season.currentTurn + 1;
  const simulationDate = addDays(season.startDate, turnNumber - 1);
  const settledAt = `${simulationDate}T23:59:59.000+08:00`;
  const inputFrozenAt = `${simulationDate}T00:00:00.000+08:00`;
  const worldEvents = eventForTurn(season, turnNumber, settledAt);
  const social = settleSocialState(
    season,
    residents,
    previous,
    turnNumber,
    settledAt,
    providedDecisions,
  );
  const events = [...worldEvents, ...social.events];
  const { resources, ledgers } = settleResources(
    season,
    previous,
    turnNumber,
    events,
  );
  assertResourceConservation(ledgers);
  const residentStates = settleNeedStates(
    season,
    residents,
    previous,
    resources,
    social.episodes,
    turnNumber,
    settledAt,
  );
  const withoutFingerprint: Omit<WorldSnapshot, "fingerprint"> = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    seasonId: season.id,
    turn: turnNumber,
    simulationDate,
    generatedAt: settledAt,
    previousFingerprint: previous.fingerprint,
    resources,
    residentStates,
    relationships: social.relationships,
    commitments: social.commitments,
    reciprocalEpisodes: social.episodes,
    eventCursor: previous.eventCursor + events.length,
    synthetic: true,
  };
  const snapshot: WorldSnapshot = {
    ...withoutFingerprint,
    fingerprint: snapshotFingerprint(withoutFingerprint),
  };
  const nextSeason: WorldSeason = {
    ...season,
    status: season.status === "draft" ? "active" : season.status,
    currentTurn: turnNumber,
    updatedAt: settledAt,
  };
  const turn: WorldTurn = {
    schemaVersion: TURN_SCHEMA_VERSION,
    id: `${season.id}-turn-${String(turnNumber).padStart(4, "0")}`,
    seasonId: season.id,
    turn: turnNumber,
    simulationDate,
    timeZone: SHENZHEN_TIME_ZONE,
    status: "settled",
    inputFrozenAt,
    settledAt,
    seed: season.seed,
    distributionVersion: season.distributionVersion,
    previousFingerprint: previous.fingerprint,
    fingerprint: snapshot.fingerprint,
    eventCount: events.length,
    resourceConservationPassed: ledgers.every((entry) => entry.conserved),
    cognitionStatus:
      social.decisions.length === 0 ? "not-required" : "complete",
    cognitiveDecisionIds: social.decisions.map((decision) => decision.id),
  };
  return {
    season: nextSeason,
    turn,
    snapshot,
    residents,
    cohorts: createBackgroundCohorts(season.id),
    ledgers,
    events,
    relationships: social.relationships,
    commitments: social.commitments,
    reciprocalEpisodes: social.episodes,
    cognitiveDecisions: social.decisions,
  };
}

export function replayWorld(
  initial: TurnSettlement,
  turns: number,
): TurnSettlement {
  let state = structuredClone(initial);
  for (let index = 0; index < turns; index += 1) {
    state = settleNextTurn(
      state.season,
      state.residents,
      state.snapshot,
    );
  }
  return state;
}

export function isExactWorldReplay(
  left: TurnSettlement,
  right: TurnSettlement,
): boolean {
  return stableStringify({
    season: left.season,
    turn: left.turn,
    snapshot: left.snapshot,
    residents: left.residents,
    cohorts: left.cohorts,
    ledgers: left.ledgers,
    events: left.events,
  }) === stableStringify({
    season: right.season,
    turn: right.turn,
    snapshot: right.snapshot,
    residents: right.residents,
    cohorts: right.cohorts,
    ledgers: right.ledgers,
    events: right.events,
  });
}
