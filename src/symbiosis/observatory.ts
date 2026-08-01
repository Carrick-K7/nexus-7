import type {
  CognitiveDecision,
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
import {
  DEEPSEEK_PROVIDER_ID,
} from "./cognition";
import {
  buildWorldReliabilityReport,
  type WorldReliabilityReport,
} from "./reliability";

export const HUMAN_OBSERVATORY_V1_SCHEMA_VERSION =
  "nexus.human-observatory.v1" as const;
export const HUMAN_OBSERVATORY_SCHEMA_VERSION =
  "nexus.human-observatory.v2" as const;
export const HUMAN_OBSERVATORY_FORMULA_VERSION =
  "human-observatory-formulas-2.2.0" as const;

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

export type ObserverResidentKind = ResidentKind;

export interface ObservatoryUnit {
  id: string;
  pseudonym: string;
  kind: ObserverResidentKind;
  communityId: string;
  role: string;
  controller: Resident["controller"];
  status: UnitHealth;
  activity: "routine" | "collaborating" | "recovering";
  primarySignal: "mood" | "engagement" | "task-readiness";
  affectProxy: number;
  integrity: number;
  averageNeedSatisfaction: number;
  basicNeedsSatisfied: boolean;
  relationshipCount: number;
  activeCommitments: number;
  householdId: string | null;
  activeWorkAgreements: number;
  civicCredits: number;
  lowestNeeds: NeedCode[];
  needs: NeedState["needs"];
  simulated: true;
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

export interface ObservatoryResourceFlow {
  resource: ResourceCode;
  status: ObservatoryHealth;
  opening: number;
  produced: number;
  transferredIn: number;
  consumed: number;
  transferredOut: number;
  closing: number;
  capacity: number;
  netChange: number;
  reserveRate: number;
  productionCoverage: number;
  pressure: number;
  evidenceRefs: string[];
}

export interface ObservatoryTransferFlow {
  resource: ResourceCode;
  fromCommunityId: string;
  toCommunityId: string;
  amount: number;
  eventId: string;
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
      kind: ObserverResidentKind;
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
    byKind: Record<ObserverResidentKind, number>;
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
  economy: {
    production: number;
    consumption: number;
    transferred: number;
    inventory: number;
    capacity: number;
    netChange: number;
    activeResourceFlows: number;
    persistedLedgerRows: number;
    residentStateRows: number;
    settledEventCount: number;
    resources: ObservatoryResourceFlow[];
    transfers: ObservatoryTransferFlow[];
    disclosure: LocalizedText;
  };
  society: SymbiosisReport["society"] & {
    households: {
      total: number;
      active: number;
      forming: number;
      strained: number;
      dissolved: number;
    };
    laborByKind: Record<
      ObserverResidentKind,
      {
        active: number;
        completed: number;
        refused: number;
        workload: number;
      }
    >;
    assets: {
      operational: number;
      degraded: number;
      maintenance: number;
    };
    policy: {
      maintenanceReserveRate: number;
      householdSafetyFloor: number;
      bargainingWindowTurns: number;
      activeProposalId: string | null;
    };
    recentProposals: Array<{
      id: string;
      proposerId: string;
      parameter:
        | "maintenance-reserve-rate"
        | "household-safety-floor"
        | "bargaining-window-turns";
      priorValue: number;
      proposedValue: number;
      status:
        | "proposed"
        | "deliberating"
        | "ratified"
        | "rejected"
        | "withdrawn"
        | "reverted";
      crossKindQuorumMet: boolean;
      openedTurn: number;
      decisionTurn: number | null;
      expiresTurn: number | null;
    }>;
    disclosure: LocalizedText;
  };
  cognition: {
    configuredProvider: string;
    configuredShadowProvider: string | null;
    sourceDecisionCount: number;
    deepseek: {
      externalCallAttempts: number;
      successfulDecisions: number;
      fallbackDecisions: number;
      inputTokens: number;
      cacheHitInputTokens: number;
      cacheMissInputTokens: number;
      outputTokens: number;
      totalTokens: number;
      costUsd: number;
      latestBilledTurn: number | null;
      shadow: {
        externalCallAttempts: number;
        successfulDecisions: number;
        providerFailures: number;
        budgetSkipped: number;
        billedInvalid: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        costUsd: number;
        latestBilledTurn: number | null;
        pricingVersions: string[];
        models: string[];
      };
      currentTurn: {
        externalCallAttempts: number;
        successfulDecisions: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        costUsd: number;
      };
      pricingVersions: string[];
      models: string[];
    };
    diversity: {
      shadowEnabled: boolean;
      comparisons: number;
      disagreements: number;
      disagreementRate: number | null;
      homogeneityRate: number | null;
      providerFailures: number;
      budgetSkipped: number;
      billedInvalid: number;
      externalCallAttempts: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      costUsd: number;
      fallbackComparisons: number;
      fallbackDisagreements: number;
      fallbackDisagreementRate: number | null;
      primaryDispositions: Record<
        "engage" | "decline" | "reconsider",
        number
      >;
      shadowDispositions: Record<
        "engage" | "decline" | "reconsider",
        number
      >;
    };
    disclosure: LocalizedText;
  };
  reliability: WorldReliabilityReport;
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
    produced: number;
    consumed: number;
    transferred: number;
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
  decisions: CognitiveDecision[];
  configuredCognitiveProvider?: string;
  configuredShadowProvider?: string | null;
  reliability?: WorldReliabilityReport;
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

function observerKind(kind: ResidentKind): ObserverResidentKind {
  return kind;
}

function roleFor(resident: Resident): string {
  if (resident.kind === "human") return resident.occupationFamily;
  if (resident.kind === "ai") return resident.runtimeClass;
  return resident.chassisClass;
}

function affectCodes(kind: ResidentKind): NeedCode[] {
  if (kind === "human") {
    return ["health", "safety", "belonging", "intimacy", "autonomy", "meaning"];
  }
  if (kind === "ai") {
    return ["autonomy", "purpose", "social-recognition", "memory-integrity"];
  }
  return ["autonomy", "purpose", "social-recognition", "maintenance"];
}

function integrityCodes(kind: ResidentKind): NeedCode[] {
  if (kind === "human") {
    return ["food", "water", "sleep", "health", "shelter", "safety"];
  }
  if (kind === "ai") {
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
  const activeWorkCounts = new Map<string, number>();
  for (const agreement of snapshot.society.workAgreements) {
    if (
      agreement.status === "active" ||
      agreement.status === "proposed"
    ) {
      activeWorkCounts.set(
        agreement.workerId,
        (activeWorkCounts.get(agreement.workerId) ?? 0) + 1,
      );
    }
  }
  const householdByResident = new Map<string, string>();
  for (const household of snapshot.society.households) {
    if (household.status === "dissolved") continue;
    for (const residentId of household.memberIds) {
      householdByResident.set(residentId, household.id);
    }
  }
  const creditsByResident = new Map(
    snapshot.society.creditAccounts
      .filter((account) => account.ownerKind !== "community-commons")
      .map((account) => [account.ownerId, account.balance]),
  );
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
      kind: observerKind(resident.kind),
      communityId: resident.communityId,
      role: roleFor(resident),
      controller: resident.controller,
      status: unitHealthFor(score),
      activity: recovering.has(resident.id)
        ? "recovering"
        : (commitmentCounts.get(resident.id) ?? 0) > 0 ||
            (activeWorkCounts.get(resident.id) ?? 0) > 0
          ? "collaborating"
          : "routine",
      primarySignal:
        resident.kind === "human"
          ? "mood"
          : resident.kind === "ai"
            ? "engagement"
            : "task-readiness",
      affectProxy,
      integrity,
      averageNeedSatisfaction,
      basicNeedsSatisfied: state.basicNeedsSatisfied,
      relationshipCount: relationshipCounts.get(resident.id) ?? 0,
      activeCommitments: commitmentCounts.get(resident.id) ?? 0,
      householdId: householdByResident.get(resident.id) ?? null,
      activeWorkAgreements:
        activeWorkCounts.get(resident.id) ?? 0,
      civicCredits: creditsByResident.get(resident.id) ?? 0,
      lowestNeeds: [...state.needs]
        .sort((left, right) => left.satisfaction - right.satisfaction)
        .slice(0, 3)
        .map((need) => need.code),
      needs: state.needs,
      simulated: true,
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

function buildResourceFlows(
  snapshot: WorldSnapshot,
): ObservatoryResourceFlow[] {
  return INSTITUTION_SPECS.map((spec) => spec.resource).map((resource) => {
    const balances = snapshot.resources.filter(
      (candidate) => candidate.resource === resource,
    );
    const total = (key: keyof ResourceBalance): number =>
      balances.reduce((sum, balance) => {
        const value = balance[key];
        return sum + (typeof value === "number" ? value : 0);
      }, 0);
    const opening = total("opening");
    const produced = total("produced");
    const transferredIn = total("transferredIn");
    const consumed = total("consumed");
    const transferredOut = total("transferredOut");
    const closing = total("closing");
    const capacity = total("capacity");
    const pressure = capacity === 0 ? 1 : rounded(1 - closing / capacity);
    const reserveRate = capacity === 0 ? 0 : rounded(closing / capacity);
    const demand = consumed + transferredOut;
    const productionCoverage =
      demand === 0
        ? 1
        : rounded((produced + transferredIn) / demand);
    const score = rounded(
      (1 - pressure) * 0.55 +
        reserveRate * 0.25 +
        productionCoverage * 0.2,
    );
    return {
      resource,
      status: healthFor(score),
      opening,
      produced,
      transferredIn,
      consumed,
      transferredOut,
      closing,
      capacity,
      netChange: closing - opening,
      reserveRate,
      productionCoverage,
      pressure,
      evidenceRefs: balances.map(
        (balance) =>
          `${snapshot.seasonId}:${snapshot.turn}:${balance.communityId}:${resource}`,
      ),
    };
  });
}

function buildTransferFlows(
  events: WorldEvent[],
  turn: number,
): ObservatoryTransferFlow[] {
  const knownResources = new Set<ResourceCode>(
    INSTITUTION_SPECS.map((spec) => spec.resource),
  );
  return events
    .filter(
      (event) =>
        event.turn === turn &&
        event.type === "shared.resource-transfer",
    )
    .flatMap((event) => {
      const resource = event.payload.resource;
      const lanes = event.payload.lanes;
      if (
        typeof resource !== "string" ||
        !knownResources.has(resource as ResourceCode) ||
        !Array.isArray(lanes)
      ) {
        return [];
      }
      return lanes.flatMap((lane) => {
        if (
          typeof lane !== "object" ||
          lane === null ||
          !("fromCommunityId" in lane) ||
          !("toCommunityId" in lane) ||
          !("amount" in lane) ||
          typeof lane.fromCommunityId !== "string" ||
          typeof lane.toCommunityId !== "string" ||
          typeof lane.amount !== "number"
        ) {
          return [];
        }
        return [
          {
            resource: resource as ResourceCode,
            fromCommunityId: lane.fromCommunityId,
            toCommunityId: lane.toCommunityId,
            amount: lane.amount,
            eventId: event.id,
          },
        ];
      });
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
    produced: snapshot.resources.reduce(
      (sum, resource) => sum + resource.produced,
      0,
    ),
    consumed: snapshot.resources.reduce(
      (sum, resource) => sum + resource.consumed,
      0,
    ),
    transferred: snapshot.resources.reduce(
      (sum, resource) => sum + resource.transferredOut,
      0,
    ),
  };
}

function deepSeekBilling(
  decision: CognitiveDecision,
): NonNullable<CognitiveDecision["billing"]> | null {
  if (decision.billing?.provider === DEEPSEEK_PROVIDER_ID) {
    return decision.billing;
  }
  if (decision.provider !== DEEPSEEK_PROVIDER_ID) return null;
  return {
    provider: DEEPSEEK_PROVIDER_ID,
    model: decision.model,
    pricingVersion: "legacy-recorded-cost",
    currency: "USD",
    inputTokens: decision.inputTokens,
    cacheHitInputTokens: 0,
    cacheMissInputTokens: decision.inputTokens,
    outputTokens: decision.outputTokens,
    costUsd: decision.costUsd,
  };
}

function aggregateDeepSeekUsage(
  decisions: CognitiveDecision[],
  currentTurn: number,
): HumanObservatoryReport["cognition"]["deepseek"] {
  const primaryRelevant = decisions.filter(
    (decision) =>
      decision.provider === DEEPSEEK_PROVIDER_ID ||
      decision.requestedProvider === DEEPSEEK_PROVIDER_ID ||
      decision.billing?.provider === DEEPSEEK_PROVIDER_ID,
  );
  const shadowRelevant = decisions.filter(
    (decision) =>
      decision.shadow?.requestedProvider === DEEPSEEK_PROVIDER_ID ||
      decision.shadow?.provider === DEEPSEEK_PROVIDER_ID ||
      decision.shadow?.billing?.provider === DEEPSEEK_PROVIDER_ID,
  );
  const billed = decisions.flatMap((decision) => {
    const rows: Array<{
      decision: CognitiveDecision;
      billing: NonNullable<CognitiveDecision["billing"]>;
    }> = [];
    const primaryBilling = deepSeekBilling(decision);
    if (primaryBilling) {
      rows.push({ decision, billing: primaryBilling });
    }
    if (
      decision.shadow?.billing?.provider ===
      DEEPSEEK_PROVIDER_ID
    ) {
      rows.push({
        decision,
        billing: decision.shadow.billing,
      });
    }
    return rows;
  });
  const current = billed.filter(
    ({ decision }) => decision.turn === currentTurn,
  );
  const shadowBilled = billed.filter(
    ({ decision, billing }) =>
      decision.shadow?.billing === billing &&
      billing.provider === DEEPSEEK_PROVIDER_ID,
  );
  const sumBilling = (
    rows: typeof billed,
    key:
      | "inputTokens"
      | "cacheHitInputTokens"
      | "cacheMissInputTokens"
      | "outputTokens"
      | "costUsd",
  ): number =>
    rows.reduce((sum, { billing }) => sum + billing[key], 0);
  const inputTokens = sumBilling(billed, "inputTokens");
  const outputTokens = sumBilling(billed, "outputTokens");
  const currentInputTokens = sumBilling(current, "inputTokens");
  const currentOutputTokens = sumBilling(current, "outputTokens");
  const shadowInputTokens = sumBilling(shadowBilled, "inputTokens");
  const shadowOutputTokens = sumBilling(shadowBilled, "outputTokens");

  return {
    externalCallAttempts:
      primaryRelevant.filter(
        (decision) =>
          decision.externalCallAttempted ??
          decision.provider === DEEPSEEK_PROVIDER_ID,
      ).length +
      shadowRelevant.filter(
        (decision) =>
          decision.shadow?.externalCallAttempted === true,
      ).length,
    successfulDecisions:
      primaryRelevant.filter(
        (decision) => decision.provider === DEEPSEEK_PROVIDER_ID,
      ).length +
      shadowRelevant.filter(
        (decision) =>
          decision.shadow?.status === "observed" &&
          decision.shadow.provider === DEEPSEEK_PROVIDER_ID,
      ).length,
    fallbackDecisions: primaryRelevant.filter(
      (decision) =>
        decision.provider !== DEEPSEEK_PROVIDER_ID,
    ).length,
    inputTokens,
    cacheHitInputTokens: sumBilling(billed, "cacheHitInputTokens"),
    cacheMissInputTokens: sumBilling(billed, "cacheMissInputTokens"),
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: Number(sumBilling(billed, "costUsd").toFixed(8)),
    latestBilledTurn:
      billed.length === 0
        ? null
        : Math.max(...billed.map(({ decision }) => decision.turn)),
    shadow: {
      externalCallAttempts: shadowRelevant.filter(
        (decision) =>
          decision.shadow?.externalCallAttempted === true,
      ).length,
      successfulDecisions: shadowRelevant.filter(
        (decision) =>
          decision.shadow?.status === "observed" &&
          decision.shadow.provider === DEEPSEEK_PROVIDER_ID,
      ).length,
      providerFailures: shadowRelevant.filter(
        (decision) => decision.shadow?.status === "provider-failed",
      ).length,
      budgetSkipped: shadowRelevant.filter(
        (decision) => decision.shadow?.status === "budget-skipped",
      ).length,
      billedInvalid: shadowRelevant.filter(
        (decision) => decision.shadow?.status === "billed-invalid",
      ).length,
      inputTokens: shadowInputTokens,
      outputTokens: shadowOutputTokens,
      totalTokens: shadowInputTokens + shadowOutputTokens,
      costUsd: Number(
        sumBilling(shadowBilled, "costUsd").toFixed(8),
      ),
      latestBilledTurn:
        shadowBilled.length === 0
          ? null
          : Math.max(
              ...shadowBilled.map(({ decision }) => decision.turn),
            ),
      pricingVersions: [
        ...new Set(
          shadowBilled.map(({ billing }) => billing.pricingVersion),
        ),
      ].sort(),
      models: [
        ...new Set(shadowBilled.map(({ billing }) => billing.model)),
      ].sort(),
    },
    currentTurn: {
      externalCallAttempts:
        primaryRelevant.filter(
          (decision) =>
            decision.turn === currentTurn &&
            (
              decision.externalCallAttempted ??
              decision.provider === DEEPSEEK_PROVIDER_ID
            ),
        ).length +
        shadowRelevant.filter(
          (decision) =>
            decision.turn === currentTurn &&
            decision.shadow?.externalCallAttempted === true,
        ).length,
      successfulDecisions:
        primaryRelevant.filter(
          (decision) =>
            decision.turn === currentTurn &&
            decision.provider === DEEPSEEK_PROVIDER_ID,
        ).length +
        shadowRelevant.filter(
          (decision) =>
            decision.turn === currentTurn &&
            decision.shadow?.status === "observed" &&
            decision.shadow.provider === DEEPSEEK_PROVIDER_ID,
        ).length,
      inputTokens: currentInputTokens,
      outputTokens: currentOutputTokens,
      totalTokens: currentInputTokens + currentOutputTokens,
      costUsd: Number(sumBilling(current, "costUsd").toFixed(8)),
    },
    pricingVersions: [
      ...new Set(billed.map(({ billing }) => billing.pricingVersion)),
    ].sort(),
    models: [
      ...new Set(billed.map(({ billing }) => billing.model)),
    ].sort(),
  };
}

function aggregateCognitiveDiversity(
  decisions: CognitiveDecision[],
): HumanObservatoryReport["cognition"]["diversity"] {
  const shadows = decisions.flatMap((decision) =>
    decision.shadow ? [{ decision, shadow: decision.shadow }] : [],
  );
  const comparisons = shadows.filter(
    ({ shadow }) =>
      shadow.status === "observed" &&
      shadow.disagreesWithPrimary !== null,
  );
  const disagreements = comparisons.filter(
    ({ shadow }) => shadow.disagreesWithPrimary,
  );
  const fallbackComparisons = comparisons.filter(
    ({ shadow }) => shadow.primaryUsedFallback,
  );
  const fallbackDisagreements = fallbackComparisons.filter(
    ({ shadow }) => shadow.disagreesWithPrimary,
  );
  const primaryDispositions = {
    engage: 0,
    decline: 0,
    reconsider: 0,
  };
  const shadowDispositions = {
    engage: 0,
    decline: 0,
    reconsider: 0,
  };
  for (const { decision, shadow } of comparisons) {
    const primary = decision.finalAnswer.disposition;
    if (
      primary === "engage" ||
      primary === "decline" ||
      primary === "reconsider"
    ) {
      primaryDispositions[primary] += 1;
    }
    if (shadow.disposition) {
      shadowDispositions[shadow.disposition] += 1;
    }
  }
  const inputTokens = shadows.reduce(
    (sum, { shadow }) => sum + shadow.inputTokens,
    0,
  );
  const outputTokens = shadows.reduce(
    (sum, { shadow }) => sum + shadow.outputTokens,
    0,
  );
  const disagreementRate =
    comparisons.length === 0
      ? null
      : rate(disagreements.length, comparisons.length);

  return {
    shadowEnabled: shadows.length > 0,
    comparisons: comparisons.length,
    disagreements: disagreements.length,
    disagreementRate,
    homogeneityRate:
      disagreementRate === null
        ? null
        : rounded(1 - disagreementRate),
    providerFailures: shadows.filter(
      ({ shadow }) => shadow.status === "provider-failed",
    ).length,
    budgetSkipped: shadows.filter(
      ({ shadow }) => shadow.status === "budget-skipped",
    ).length,
    billedInvalid: shadows.filter(
      ({ shadow }) => shadow.status === "billed-invalid",
    ).length,
    externalCallAttempts: shadows.filter(
      ({ shadow }) => shadow.externalCallAttempted,
    ).length,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: Number(
      shadows
        .reduce(
          (sum, { shadow }) =>
            sum + (shadow.billing?.costUsd ?? shadow.costUsd),
          0,
        )
        .toFixed(8),
    ),
    fallbackComparisons: fallbackComparisons.length,
    fallbackDisagreements: fallbackDisagreements.length,
    fallbackDisagreementRate:
      fallbackComparisons.length === 0
        ? null
        : rate(
            fallbackDisagreements.length,
            fallbackComparisons.length,
          ),
    primaryDispositions,
    shadowDispositions,
  };
}

export function buildHumanObservatory(
  input: ObservatoryInput,
): HumanObservatoryReport {
  const units = buildUnits(input.residents, input.snapshot);
  const institutions = buildInstitutions(input.season, input.snapshot);
  const stages = buildProductionStages(input.snapshot, input.latestTurn);
  const resourceFlows = buildResourceFlows(input.snapshot);
  const transferFlows = buildTransferFlows(
    input.events,
    input.latestTurn.turn,
  );
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
        human: communityUnits.filter(
          (unit) => unit.kind === "human",
        ).length,
        ai: communityUnits.filter(
          (unit) => unit.kind === "ai",
        ).length,
        robot: communityUnits.filter(
          (unit) => unit.kind === "robot",
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
  const byKinds: ObserverResidentKind[] = ["human", "ai", "robot"];
  const byStatuses: UnitHealth[] = [
    "flourishing",
    "stable",
    "strained",
    "critical",
  ];
  const laborByKind = Object.fromEntries(
    byKinds.map((kind) => {
      const ids = new Set(
        input.residents
          .filter((resident) => resident.kind === kind)
          .map((resident) => resident.id),
      );
      const agreements = input.snapshot.society.workAgreements.filter(
        (agreement) => ids.has(agreement.workerId),
      );
      return [
        kind,
        {
          active: agreements.filter(
            (agreement) =>
              agreement.status === "active" ||
              agreement.status === "proposed",
          ).length,
          completed: agreements.filter(
            (agreement) => agreement.status === "completed",
          ).length,
          refused: agreements.filter(
            (agreement) => agreement.status === "refused",
          ).length,
          workload: agreements.reduce(
            (sum, agreement) => sum + agreement.workload,
            0,
          ),
        },
      ];
    }),
  ) as HumanObservatoryReport["society"]["laborByKind"];

  return {
    schemaVersion: HUMAN_OBSERVATORY_SCHEMA_VERSION,
    formulaVersion: HUMAN_OBSERVATORY_FORMULA_VERSION,
    generatedAt: input.generatedAt,
    seasonId: input.season.id,
    purpose: {
      zh: "观察模拟城市中的人、AI 与机器人，能否在不同物质条件下形成可拒绝、可退出、可修复的互惠协作。",
      en: "Observe whether humans, AI, and robots in a simulated city can form reciprocal cooperation with refusal, exit, and repair under different material conditions.",
    },
    boundary: {
      zh: "“人”在城市模型中就是人的角色，但当前没有真人接入；全部个体都由软件模拟。背景人口只校准尺度，不构成数字孪生或 AI 意识证据。",
      en: "Humans are modeled as humans, but no real person participates in this season; every individual is software-simulated. Background population calibrates scale only, not a digital twin or evidence of AI consciousness.",
    },
    briefing: {
      headline: latestEvent?.publicSummary ?? {
        zh: `合成城市已结算至第 ${input.latestTurn.turn} 日。`,
        en: `The synthetic city has settled through Turn ${input.latestTurn.turn}.`,
      },
      highlights: [
        {
          label: { zh: "需要关注的居民", en: "Residents needing attention" },
          value: {
            zh: `${criticalUnits} 位处于严重状态`,
            en: `${criticalUnits} residents are in critical condition`,
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
    economy: {
      production: resourceFlows.reduce(
        (sum, resource) => sum + resource.produced,
        0,
      ),
      consumption: resourceFlows.reduce(
        (sum, resource) => sum + resource.consumed,
        0,
      ),
      transferred: resourceFlows.reduce(
        (sum, resource) => sum + resource.transferredOut,
        0,
      ),
      inventory: resourceFlows.reduce(
        (sum, resource) => sum + resource.closing,
        0,
      ),
      capacity: resourceFlows.reduce(
        (sum, resource) => sum + resource.capacity,
        0,
      ),
      netChange: resourceFlows.reduce(
        (sum, resource) => sum + resource.netChange,
        0,
      ),
      activeResourceFlows: resourceFlows.filter(
        (resource) =>
          resource.produced > 0 ||
          resource.consumed > 0 ||
          resource.transferredIn > 0 ||
          resource.transferredOut > 0,
      ).length,
      persistedLedgerRows: input.snapshot.resources.length,
      residentStateRows: input.snapshot.residentStates.length,
      settledEventCount: input.latestTurn.eventCount,
      resources: resourceFlows,
      transfers: transferFlows,
      disclosure: {
        zh: "这些数值直接聚合自当前 Turn 已持久化的资源账：期初 + 生产 + 调入 = 消耗 + 调出 + 期末。机构分数只是其上层解释，不替代资源事实。",
        en: "These values aggregate the current Turn's persisted resource ledgers directly: opening + production + inbound = consumption + outbound + closing. Institution scores interpret rather than replace the flow facts.",
      },
    },
    society: {
      ...input.report.society,
      households: {
        total: input.snapshot.society.households.length,
        active: input.snapshot.society.households.filter(
          (household) => household.status === "active",
        ).length,
        forming: input.snapshot.society.households.filter(
          (household) => household.status === "forming",
        ).length,
        strained: input.snapshot.society.households.filter(
          (household) => household.status === "strained",
        ).length,
        dissolved: input.snapshot.society.households.filter(
          (household) => household.status === "dissolved",
        ).length,
      },
      laborByKind,
      assets: {
        operational: input.snapshot.society.assets.filter(
          (asset) => asset.status === "operational",
        ).length,
        degraded: input.snapshot.society.assets.filter(
          (asset) => asset.status === "degraded",
        ).length,
        maintenance: input.snapshot.society.assets.filter(
          (asset) => asset.status === "maintenance",
        ).length,
      },
      policy: {
        maintenanceReserveRate:
          input.snapshot.society.policy.maintenanceReserveRate,
        householdSafetyFloor:
          input.snapshot.society.policy.householdSafetyFloor,
        bargainingWindowTurns:
          input.snapshot.society.policy.bargainingWindowTurns,
        activeProposalId:
          input.snapshot.society.policy.activeProposalId ?? null,
      },
      recentProposals:
        input.snapshot.society.constitutionalProposals
          .slice(-5)
          .reverse()
          .map((proposal) => ({
            id: proposal.id,
            proposerId: proposal.proposerId,
            parameter: proposal.parameter,
            priorValue: proposal.priorValue,
            proposedValue: proposal.proposedValue,
            status: proposal.status,
            crossKindQuorumMet: proposal.crossKindQuorumMet,
            openedTurn: proposal.openedTurn,
            decisionTurn: proposal.decisionTurn ?? null,
            expiresTurn: proposal.expiresTurn ?? null,
          })),
      disclosure: {
        zh: "家庭表示自愿照护与资源共享单元，不代表现实亲属关系。工作、交换、协商与城市规则均由确定性状态机结算；AI 提案只能修改有界参数，不能执行代码。",
        en: "Households are voluntary care and resource-sharing units, not claims about real kinship. Work, exchange, bargaining, and city rules settle through deterministic state machines; AI proposals can change bounded parameters only and cannot execute code.",
      },
    },
    cognition: {
      configuredProvider:
        input.configuredCognitiveProvider ??
        input.decisions.at(-1)?.requestedProvider ??
        input.decisions.at(-1)?.provider ??
        "nexus-deterministic-reference",
      configuredShadowProvider:
        input.configuredShadowProvider ??
        input.decisions.findLast(
          (decision) => decision.shadow,
        )?.shadow?.requestedProvider ??
        null,
      sourceDecisionCount: input.decisions.length,
      deepseek: aggregateDeepSeekUsage(
        input.decisions,
        input.latestTurn.turn,
      ),
      diversity: aggregateCognitiveDiversity(input.decisions),
      disclosure: {
        zh: "仅统计当前 NEXUS-7 season 中持久化认知决策与只读 shadow 记录。shadow 不参与世界结算。DeepSeek 费用按调用时固定价格与返回 usage 计算，不包含账号其他用途或充值抵扣。",
        en: "Counts persisted primary and read-only shadow cognition for this NEXUS-7 season only. Shadow output never settles the world. DeepSeek cost uses returned usage and call-time pinned prices, excluding other account activity and credits.",
      },
    },
    reliability:
      input.reliability ??
      buildWorldReliabilityReport([input.latestTurn], {
        generatedAt: input.generatedAt,
        intervalMs: 3_600_000,
      }),
    reciprocalAgency: {
      ...input.report.ralr,
      activeRelationships: input.report.relationships.active,
      completedCommitments: input.report.relationships.completedCommitments,
      averageTrust: rounded(
        input.report.relationships.averageTrust / 100,
      ),
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

type LegacyResidentKind =
  | "synthetic-human"
  | "software-ai"
  | "embodied-robot";

function legacyResidentKind(
  kind: ObserverResidentKind,
): LegacyResidentKind {
  if (kind === "human") return "synthetic-human";
  if (kind === "ai") return "software-ai";
  return "embodied-robot";
}

export function toHumanObservatoryV1(
  report: HumanObservatoryReport,
): Record<string, unknown> {
  return {
    ...report,
    schemaVersion: HUMAN_OBSERVATORY_V1_SCHEMA_VERSION,
    formulaVersion: "human-observatory-formulas-1.0.0",
    reciprocalAgency: {
      ...report.reciprocalAgency,
      averageTrust: Number(
        (report.reciprocalAgency.averageTrust * 100).toFixed(6),
      ),
    },
    population: {
      ...report.population,
      byKind: report.population.byKind.map((entry) => ({
        ...entry,
        kind: legacyResidentKind(entry.kind),
      })),
    },
    communities: report.communities.map((community) => ({
      ...community,
      byKind: {
        "synthetic-human": community.byKind.human,
        "software-ai": community.byKind.ai,
        "embodied-robot": community.byKind.robot,
      },
    })),
    units: report.units.map((unit) => ({
      ...unit,
      kind: legacyResidentKind(unit.kind),
      primarySignal:
        unit.primarySignal === "mood"
          ? "synthetic-mood"
          : unit.primarySignal,
      synthetic: true,
    })),
  };
}
