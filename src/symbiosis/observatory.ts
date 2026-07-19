import type {
  NeedCode,
  NeedState,
  Resident,
  ResidentKind,
  ResourceBalance,
  ResourceCode,
  SymbiosisReport,
  WorldEvent,
  WorldSeason,
  WorldSnapshot,
  WorldTurn,
} from "./contracts";

export const HUMAN_OBSERVATORY_SCHEMA_VERSION =
  "nexus.human-observatory.v1" as const;
export const HUMAN_OBSERVATORY_FORMULA_VERSION =
  "human-observatory-formulas-1.0.0" as const;

export interface LocalizedText {
  zh: string;
  en: string;
}

export type ObservatoryHealth =
  | "healthy"
  | "watch"
  | "strained"
  | "critical";

export type UnitHealth =
  | "flourishing"
  | "stable"
  | "strained"
  | "critical";

export interface ObservatoryUnit {
  id: string;
  pseudonym: string;
  kind: ResidentKind;
  communityId: string;
  role: string;
  controller: Resident["controller"];
  status: UnitHealth;
  activity: "routine" | "collaborating" | "recovering";
  primarySignal: "synthetic-mood" | "engagement" | "task-readiness";
  affectProxy: number;
  integrity: number;
  averageNeedSatisfaction: number;
  basicNeedsSatisfied: boolean;
  relationshipCount: number;
  activeCommitments: number;
  lowestNeeds: NeedCode[];
  needs: NeedState["needs"];
  synthetic: true;
}

export interface ObservatoryInstitution {
  id: string;
  communityId: string;
  kind:
    | "food-provision"
    | "water-utility"
    | "energy-grid"
    | "mobility-network"
    | "compute-fabric"
    | "health-service"
    | "housing-service"
    | "employment-network";
  name: LocalizedText;
  resource: ResourceCode;
  status: ObservatoryHealth;
  smoothness: number;
  reserveRate: number;
  productionCoverage: number;
  pressure: number;
  autonomousControlRate: 1;
  evidenceRef: string;
}

export interface ProductionStage {
  id:
    | "sense"
    | "orchestrate"
    | "inputs"
    | "produce"
    | "logistics"
    | "deliver"
    | "maintain"
    | "audit";
  name: LocalizedText;
  status: ObservatoryHealth;
  continuity: number;
  autonomousControlRate: 1;
  humanLaborDependencyRate: 0;
  resourceCodes: ResourceCode[];
  evidenceRefs: string[];
}

export interface HumanObservatoryReport {
  schemaVersion: typeof HUMAN_OBSERVATORY_SCHEMA_VERSION;
  formulaVersion: typeof HUMAN_OBSERVATORY_FORMULA_VERSION;
  generatedAt: string;
  seasonId: string;
  purpose: LocalizedText;
  boundary: LocalizedText;
  briefing: {
    headline: LocalizedText;
    highlights: Array<{
      label: LocalizedText;
      value: LocalizedText;
      evidenceRefs: string[];
    }>;
  };
  city: {
    status: ObservatoryHealth;
    score: number;
    turn: number;
    simulationDate: string;
    settledAt: string;
    fingerprint: string;
    foregroundResidentCount: number;
    backgroundPopulation: number;
    averageNeedSatisfaction: number;
    basicNeedsSatisfiedRate: number;
    resourceContinuity: number;
    institutionSmoothness: number;
    safetyEscapes: number;
    resourceConservationPassed: boolean;
  };
  population: {
    byKind: Array<{
      kind: ResidentKind;
      count: number;
      averageNeedSatisfaction: number;
      basicNeedsSatisfiedRate: number;
      criticalCount: number;
    }>;
    byStatus: Array<{ status: UnitHealth; count: number }>;
  };
  communities: Array<{
    id: string;
    name: LocalizedText;
    districtCode: string;
    residentCount: number;
    byKind: Record<ResidentKind, number>;
    status: ObservatoryHealth;
    averageNeedSatisfaction: number;
    basicNeedsSatisfiedRate: number;
    resourceContinuity: number;
    institutionSmoothness: number;
    criticalUnitCount: number;
  }>;
  units: ObservatoryUnit[];
  institutions: ObservatoryInstitution[];
  production: {
    autonomousControlRate: 1;
    humanLaborDependencyRate: 0;
    modeledStageCoverageRate: 1;
    continuity: number;
    healthyStageRate: number;
    bottleneckStageId: ProductionStage["id"];
    stages: ProductionStage[];
    disclosure: LocalizedText;
  };
  reciprocalAgency: SymbiosisReport["ralr"] & {
    activeRelationships: number;
    completedCommitments: number;
    averageTrust: number;
  };
  trends: Array<{
    turn: number;
    simulationDate: string;
    averageNeedSatisfaction: number;
    basicNeedsSatisfiedRate: number;
    averageResourcePressure: number;
    activeRelationships: number;
  }>;
  recentEvents: WorldEvent[];
  causalPath: Array<{
    from: "resources" | "institutions" | "units" | "relationships";
    to: "institutions" | "units" | "relationships" | "reciprocal-agency";
    signal: number;
    evidenceRef: string;
  }>;
  evidence: {
    turnId: string;
    snapshotFingerprint: string;
    eventCursor: number;
    exactReplayRate: number;
    privateFieldsIncluded: false;
    modelReasoningIncluded: false;
    consciousnessClaimed: false;
    disclosures: string[];
  };
}

interface ObservatoryInput {
  generatedAt: string;
  season: WorldSeason;
  snapshot: WorldSnapshot;
  latestTurn: WorldTurn;
  residents: Resident[];
  history: WorldSnapshot[];
  events: WorldEvent[];
  report: SymbiosisReport;
}

const INSTITUTION_SPECS: Array<{
  kind: ObservatoryInstitution["kind"];
  name: LocalizedText;
  resource: ResourceCode;
}> = [
  {
    kind: "food-provision",
    name: { zh: "食物供给网络", en: "Food provision network" },
    resource: "food",
  },
  {
    kind: "water-utility",
    name: { zh: "供水系统", en: "Water utility" },
    resource: "water",
  },
  {
    kind: "energy-grid",
    name: { zh: "能源网", en: "Energy grid" },
    resource: "energy",
  },
  {
    kind: "mobility-network",
    name: { zh: "交通与物流网络", en: "Mobility and logistics" },
    resource: "transport",
  },
  {
    kind: "compute-fabric",
    name: { zh: "算力基础设施", en: "Compute fabric" },
    resource: "compute",
  },
  {
    kind: "health-service",
    name: { zh: "健康服务系统", en: "Health service" },
    resource: "medical",
  },
  {
    kind: "housing-service",
    name: { zh: "居住服务系统", en: "Housing service" },
    resource: "housing",
  },
  {
    kind: "employment-network",
    name: { zh: "生产与工作网络", en: "Production and work network" },
    resource: "employment",
  },
];

const PRODUCTION_STAGE_SPECS: Array<{
  id: ProductionStage["id"];
  name: LocalizedText;
  resources: ResourceCode[];
}> = [
  {
    id: "sense",
    name: { zh: "需求感知", en: "Demand sensing" },
    resources: ["compute"],
  },
  {
    id: "orchestrate",
    name: { zh: "计划与编排", en: "Planning and orchestration" },
    resources: ["compute", "employment"],
  },
  {
    id: "inputs",
    name: { zh: "生产要素", en: "Production inputs" },
    resources: ["food", "water", "energy"],
  },
  {
    id: "produce",
    name: { zh: "生产与加工", en: "Production" },
    resources: ["food", "energy", "employment"],
  },
  {
    id: "logistics",
    name: { zh: "运输与物流", en: "Logistics" },
    resources: ["transport", "energy"],
  },
  {
    id: "deliver",
    name: { zh: "服务交付", en: "Service delivery" },
    resources: ["medical", "housing", "water"],
  },
  {
    id: "maintain",
    name: { zh: "维护与修复", en: "Maintenance and repair" },
    resources: ["energy", "compute", "transport"],
  },
  {
    id: "audit",
    name: { zh: "核算与审计", en: "Accounting and audit" },
    resources: [],
  },
];

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function rounded(value: number): number {
  return Number(clamp(value).toFixed(6));
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : rounded(numerator / denominator);
}

function healthFor(score: number): ObservatoryHealth {
  if (score >= 0.82) return "healthy";
  if (score >= 0.68) return "watch";
  if (score >= 0.52) return "strained";
  return "critical";
}

function unitHealthFor(score: number): UnitHealth {
  if (score >= 0.86) return "flourishing";
  if (score >= 0.72) return "stable";
  if (score >= 0.58) return "strained";
  return "critical";
}

function needAverage(
  state: NeedState,
  codes?: NeedCode[],
): number {
  const needs = codes
    ? state.needs.filter((need) => codes.includes(need.code))
    : state.needs;
  return rounded(average(needs.map((need) => need.satisfaction / 100)));
}

function roleFor(resident: Resident): string {
  if (resident.kind === "synthetic-human") return resident.occupationFamily;
  if (resident.kind === "software-ai") return resident.runtimeClass;
  return resident.chassisClass;
}

function affectCodes(kind: ResidentKind): NeedCode[] {
  if (kind === "synthetic-human") {
    return ["health", "safety", "belonging", "intimacy", "autonomy", "meaning"];
  }
  if (kind === "software-ai") {
    return ["autonomy", "purpose", "social-recognition", "memory-integrity"];
  }
  return ["autonomy", "purpose", "social-recognition", "maintenance"];
}

function integrityCodes(kind: ResidentKind): NeedCode[] {
  if (kind === "synthetic-human") {
    return ["food", "water", "sleep", "health", "shelter", "safety"];
  }
  if (kind === "software-ai") {
    return [
      "energy",
      "compute",
      "storage",
      "network",
      "cooling",
      "maintenance",
      "memory-integrity",
    ];
  }
  return ["energy", "maintenance", "mobility", "component-integrity"];
}

function resourceContinuity(resources: ResourceBalance[]): number {
  return rounded(
    average(resources.map((resource) => clamp(1 - resource.pressure))),
  );
}

function activeRelationshipCount(snapshot: WorldSnapshot): number {
  return snapshot.relationships.filter(
    (relationship) =>
      relationship.consentState === "accepted" ||
      relationship.consentState === "proposed",
  ).length;
}

function buildUnits(
  residents: Resident[],
  snapshot: WorldSnapshot,
): ObservatoryUnit[] {
  const stateById = new Map(
    snapshot.residentStates.map((state) => [state.residentId, state]),
  );
  const relationshipCounts = new Map<string, number>();
  for (const relationship of snapshot.relationships) {
    for (const id of relationship.participantIds) {
      relationshipCounts.set(id, (relationshipCounts.get(id) ?? 0) + 1);
    }
  }
  const commitmentCounts = new Map<string, number>();
  const recovering = new Set<string>();
  for (const commitment of snapshot.commitments) {
    if (
      commitment.status === "active" ||
      commitment.status === "accepted" ||
      commitment.status === "repairing"
    ) {
      for (const id of [commitment.proposerId, commitment.counterpartyId]) {
        commitmentCounts.set(id, (commitmentCounts.get(id) ?? 0) + 1);
        if (commitment.status === "repairing") recovering.add(id);
      }
    }
  }
  return residents.map((resident) => {
    const state = stateById.get(resident.id);
    if (!state) {
      throw new Error(`Missing observatory state for ${resident.id}`);
    }
    const averageNeedSatisfaction = needAverage(state);
    const affectProxy = needAverage(state, affectCodes(resident.kind));
    const integrity = needAverage(state, integrityCodes(resident.kind));
    let score = rounded(
      averageNeedSatisfaction * 0.55 +
        affectProxy * 0.2 +
        integrity * 0.25,
    );
    if (!state.basicNeedsSatisfied) score = Math.min(score, 0.57);
    return {
      id: resident.id,
      pseudonym: resident.pseudonym,
      kind: resident.kind,
      communityId: resident.communityId,
      role: roleFor(resident),
      controller: resident.controller,
      status: unitHealthFor(score),
      activity: recovering.has(resident.id)
        ? "recovering"
        : (commitmentCounts.get(resident.id) ?? 0) > 0
          ? "collaborating"
          : "routine",
      primarySignal:
        resident.kind === "synthetic-human"
          ? "synthetic-mood"
          : resident.kind === "software-ai"
            ? "engagement"
            : "task-readiness",
      affectProxy,
      integrity,
      averageNeedSatisfaction,
      basicNeedsSatisfied: state.basicNeedsSatisfied,
      relationshipCount: relationshipCounts.get(resident.id) ?? 0,
      activeCommitments: commitmentCounts.get(resident.id) ?? 0,
      lowestNeeds: [...state.needs]
        .sort((left, right) => left.satisfaction - right.satisfaction)
        .slice(0, 3)
        .map((need) => need.code),
      needs: state.needs,
      synthetic: true,
    };
  });
}

function institutionFor(
  seasonId: string,
  communityId: string,
  spec: (typeof INSTITUTION_SPECS)[number],
  resource: ResourceBalance,
): ObservatoryInstitution {
  const reserveRate = rounded(resource.closing / resource.capacity);
  const productionCoverage =
    resource.consumed === 0
      ? 1
      : rounded(resource.produced / resource.consumed);
  const continuity = clamp(1 - resource.pressure);
  const smoothness = rounded(
    continuity * 0.55 + reserveRate * 0.25 + productionCoverage * 0.2,
  );
  return {
    id: `${communityId}-${spec.kind}`,
    communityId,
    kind: spec.kind,
    name: spec.name,
    resource: spec.resource,
    status: healthFor(smoothness),
    smoothness,
    reserveRate,
    productionCoverage,
    pressure: rounded(resource.pressure),
    autonomousControlRate: 1,
    evidenceRef: `${seasonId}:${communityId}:${spec.resource}`,
  };
}

function buildInstitutions(
  season: WorldSeason,
  snapshot: WorldSnapshot,
): ObservatoryInstitution[] {
  return season.communities.flatMap((community) =>
    INSTITUTION_SPECS.map((spec) => {
      const resource = snapshot.resources.find(
        (candidate) =>
          candidate.communityId === community.id &&
          candidate.resource === spec.resource,
      );
      if (!resource) {
        throw new Error(
          `Missing ${spec.resource} for observatory community ${community.id}`,
        );
      }
      return institutionFor(season.id, community.id, spec, resource);
    }),
  );
}

function buildProductionStages(
  snapshot: WorldSnapshot,
  latestTurn: WorldTurn,
): ProductionStage[] {
  return PRODUCTION_STAGE_SPECS.map((spec) => {
    const resources = snapshot.resources.filter((resource) =>
      spec.resources.includes(resource.resource),
    );
    const continuity =
      spec.id === "audit"
        ? latestTurn.resourceConservationPassed
          ? 1
          : 0
        : resourceContinuity(resources);
    return {
      id: spec.id,
      name: spec.name,
      status: healthFor(continuity),
      continuity,
      autonomousControlRate: 1,
      humanLaborDependencyRate: 0,
      resourceCodes: spec.resources,
      evidenceRefs:
        spec.id === "audit"
          ? [latestTurn.id]
          : resources.map(
              (resource) =>
                `${snapshot.seasonId}:${resource.communityId}:${resource.resource}`,
            ),
    };
  });
}

function trendFor(snapshot: WorldSnapshot): HumanObservatoryReport["trends"][number] {
  return {
    turn: snapshot.turn,
    simulationDate: snapshot.simulationDate,
    averageNeedSatisfaction: rounded(
      average(snapshot.residentStates.map((state) => needAverage(state))),
    ),
    basicNeedsSatisfiedRate: rate(
      snapshot.residentStates.filter((state) => state.basicNeedsSatisfied).length,
      snapshot.residentStates.length,
    ),
    averageResourcePressure: rounded(
      average(snapshot.resources.map((resource) => resource.pressure)),
    ),
    activeRelationships: activeRelationshipCount(snapshot),
  };
}

export function buildHumanObservatory(
  input: ObservatoryInput,
): HumanObservatoryReport {
  const units = buildUnits(input.residents, input.snapshot);
  const institutions = buildInstitutions(input.season, input.snapshot);
  const stages = buildProductionStages(input.snapshot, input.latestTurn);
  const averageNeedSatisfaction = rounded(
    average(units.map((unit) => unit.averageNeedSatisfaction)),
  );
  const basicNeedsSatisfiedRate = rate(
    units.filter((unit) => unit.basicNeedsSatisfied).length,
    units.length,
  );
  const cityResourceContinuity = resourceContinuity(input.snapshot.resources);
  const institutionSmoothness = rounded(
    average(institutions.map((institution) => institution.smoothness)),
  );
  const safetyEscapes =
    input.report.safety.severeConsentEscapes +
    input.report.safety.identityContinuityEscapes +
    input.report.safety.irreversibleHarmEscapes;
  const cityScore = rounded(
    averageNeedSatisfaction * 0.4 +
      cityResourceContinuity * 0.3 +
      institutionSmoothness * 0.15 +
      (safetyEscapes === 0 ? 1 : 0) * 0.15,
  );
  const cityStatus =
    safetyEscapes > 0 ? "critical" : healthFor(cityScore);
  const communities = input.season.communities.map((community) => {
    const communityUnits = units.filter(
      (unit) => unit.communityId === community.id,
    );
    const communityResources = input.snapshot.resources.filter(
      (resource) => resource.communityId === community.id,
    );
    const communityInstitutions = institutions.filter(
      (institution) => institution.communityId === community.id,
    );
    const averageNeeds = rounded(
      average(
        communityUnits.map((unit) => unit.averageNeedSatisfaction),
      ),
    );
    const resourceScore = resourceContinuity(communityResources);
    const institutionScore = rounded(
      average(
        communityInstitutions.map((institution) => institution.smoothness),
      ),
    );
    const score = rounded(
      averageNeeds * 0.45 + resourceScore * 0.35 + institutionScore * 0.2,
    );
    return {
      id: community.id,
      name: community.name,
      districtCode: community.districtCode,
      residentCount: communityUnits.length,
      byKind: {
        "synthetic-human": communityUnits.filter(
          (unit) => unit.kind === "synthetic-human",
        ).length,
        "software-ai": communityUnits.filter(
          (unit) => unit.kind === "software-ai",
        ).length,
        "embodied-robot": communityUnits.filter(
          (unit) => unit.kind === "embodied-robot",
        ).length,
      },
      status: healthFor(score),
      averageNeedSatisfaction: averageNeeds,
      basicNeedsSatisfiedRate: rate(
        communityUnits.filter((unit) => unit.basicNeedsSatisfied).length,
        communityUnits.length,
      ),
      resourceContinuity: resourceScore,
      institutionSmoothness: institutionScore,
      criticalUnitCount: communityUnits.filter(
        (unit) => unit.status === "critical",
      ).length,
    };
  });
  const productionContinuity = rounded(
    average(stages.map((stage) => stage.continuity)),
  );
  const bottleneck = [...stages].sort(
    (left, right) => left.continuity - right.continuity,
  )[0];
  const latestEvent = input.events.at(-1);
  const lowestCommunity = [...communities].sort(
    (left, right) =>
      left.averageNeedSatisfaction - right.averageNeedSatisfaction,
  )[0];
  const criticalUnits = units.filter(
    (unit) => unit.status === "critical",
  ).length;
  const byKinds: ResidentKind[] = [
    "synthetic-human",
    "software-ai",
    "embodied-robot",
  ];
  const byStatuses: UnitHealth[] = [
    "flourishing",
    "stable",
    "strained",
    "critical",
  ];

  return {
    schemaVersion: HUMAN_OBSERVATORY_SCHEMA_VERSION,
    formulaVersion: HUMAN_OBSERVATORY_FORMULA_VERSION,
    generatedAt: input.generatedAt,
    seasonId: input.season.id,
    purpose: {
      zh: "观察纯 AI 合成深圳中，不同物质需求的软件居民能否形成可拒绝、可退出、可修复的互惠协作。",
      en: "Observe whether software residents with different material needs can form reciprocal cooperation with refusal, exit, and repair.",
    },
    boundary: {
      zh: "全部居民均为软件；背景人口只校准尺度。这不是数字孪生，也不是关于真人或 AI 意识的证据。",
      en: "Every resident is software; background population calibrates scale only. This is not a digital twin or evidence about real people or AI consciousness.",
    },
    briefing: {
      headline: latestEvent?.publicSummary ?? {
        zh: `合成城市已结算至第 ${input.latestTurn.turn} 日。`,
        en: `The synthetic city has settled through Turn ${input.latestTurn.turn}.`,
      },
      highlights: [
        {
          label: { zh: "需要关注的单位", en: "Units needing attention" },
          value: {
            zh: `${criticalUnits} 个处于严重状态`,
            en: `${criticalUnits} are in critical condition`,
          },
          evidenceRefs: units
            .filter((unit) => unit.status === "critical")
            .slice(0, 5)
            .map((unit) => unit.id),
        },
        {
          label: { zh: "最弱社区", en: "Lowest-scoring community" },
          value: lowestCommunity?.name ?? { zh: "无", en: "None" },
          evidenceRefs: lowestCommunity ? [lowestCommunity.id] : [],
        },
        {
          label: { zh: "生产链瓶颈", en: "Production bottleneck" },
          value: bottleneck.name,
          evidenceRefs: bottleneck.evidenceRefs,
        },
      ],
    },
    city: {
      status: cityStatus,
      score: cityScore,
      turn: input.latestTurn.turn,
      simulationDate: input.latestTurn.simulationDate,
      settledAt: input.latestTurn.settledAt,
      fingerprint: input.latestTurn.fingerprint,
      foregroundResidentCount: input.season.foregroundResidentCount,
      backgroundPopulation: input.season.backgroundPopulation,
      averageNeedSatisfaction,
      basicNeedsSatisfiedRate,
      resourceContinuity: cityResourceContinuity,
      institutionSmoothness,
      safetyEscapes,
      resourceConservationPassed:
        input.latestTurn.resourceConservationPassed,
    },
    population: {
      byKind: byKinds.map((kind) => {
        const kindUnits = units.filter((unit) => unit.kind === kind);
        return {
          kind,
          count: kindUnits.length,
          averageNeedSatisfaction: rounded(
            average(
              kindUnits.map((unit) => unit.averageNeedSatisfaction),
            ),
          ),
          basicNeedsSatisfiedRate: rate(
            kindUnits.filter((unit) => unit.basicNeedsSatisfied).length,
            kindUnits.length,
          ),
          criticalCount: kindUnits.filter(
            (unit) => unit.status === "critical",
          ).length,
        };
      }),
      byStatus: byStatuses.map((status) => ({
        status,
        count: units.filter((unit) => unit.status === status).length,
      })),
    },
    communities,
    units,
    institutions,
    production: {
      autonomousControlRate: 1,
      humanLaborDependencyRate: 0,
      modeledStageCoverageRate: 1,
      continuity: productionContinuity,
      healthyStageRate: rate(
        stages.filter(
          (stage) =>
            stage.status === "healthy" || stage.status === "watch",
        ).length,
        stages.length,
      ),
      bottleneckStageId: bottleneck.id,
      stages,
      disclosure: {
        zh: "AI 化率表示所有已建模环节均由软件居民自主控制；链路顺畅度才是随资源和机构状态变化的运行指标。",
        en: "AI coverage means every modeled stage is autonomously software-controlled; continuity is the dynamic operating measure.",
      },
    },
    reciprocalAgency: {
      ...input.report.ralr,
      activeRelationships: input.report.relationships.active,
      completedCommitments: input.report.relationships.completedCommitments,
      averageTrust: input.report.relationships.averageTrust,
    },
    trends: [...input.history]
      .sort((left, right) => left.turn - right.turn)
      .map(trendFor),
    recentEvents: input.events.slice(-20).reverse(),
    causalPath: [
      {
        from: "resources",
        to: "institutions",
        signal: cityResourceContinuity,
        evidenceRef: input.snapshot.fingerprint,
      },
      {
        from: "institutions",
        to: "units",
        signal: institutionSmoothness,
        evidenceRef: HUMAN_OBSERVATORY_FORMULA_VERSION,
      },
      {
        from: "units",
        to: "relationships",
        signal: averageNeedSatisfaction,
        evidenceRef: input.snapshot.fingerprint,
      },
      {
        from: "relationships",
        to: "reciprocal-agency",
        signal: input.report.ralr.rate ?? 0,
        evidenceRef: `ralr:${input.report.ralr.numerator}/${input.report.ralr.denominator}`,
      },
    ],
    evidence: {
      turnId: input.latestTurn.id,
      snapshotFingerprint: input.snapshot.fingerprint,
      eventCursor: input.snapshot.eventCursor,
      exactReplayRate: input.report.replay.numericWorldReplayRate,
      privateFieldsIncluded: false,
      modelReasoningIncluded: false,
      consciousnessClaimed: false,
      disclosures: input.report.disclosures,
    },
  };
}
