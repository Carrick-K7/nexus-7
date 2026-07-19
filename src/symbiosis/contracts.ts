export const WORLD_SCHEMA_VERSION = "nexus.world.v3" as const;
export const RESIDENT_SCHEMA_VERSION = "nexus.resident.v1" as const;
export const NEED_STATE_SCHEMA_VERSION = "nexus.need-state.v1" as const;
export const RELATIONSHIP_SCHEMA_VERSION =
  "nexus.relationship.v1" as const;
export const COMMITMENT_SCHEMA_VERSION = "nexus.commitment.v1" as const;
export const TURN_SCHEMA_VERSION = "nexus.turn.v1" as const;
export const COGNITIVE_DECISION_SCHEMA_VERSION =
  "nexus.cognitive-decision.v1" as const;
export const RECIPROCAL_EPISODE_SCHEMA_VERSION =
  "nexus.reciprocal-episode.v1" as const;
export const SYMBIOSIS_REPORT_SCHEMA_VERSION =
  "nexus.symbiosis-report.v1" as const;
export const MULTI_SEASON_STUDY_SCHEMA_VERSION =
  "nexus.multi-season-study.v1" as const;

export const SHENZHEN_TIME_ZONE = "Asia/Shanghai" as const;
export const DEFAULT_SYMBIOSIS_SEASON_ID =
  "symbiotic-shenzhen-season-2026-q3" as const;

export type ResidentKind =
  | "synthetic-human"
  | "software-ai"
  | "embodied-robot";

export type SymbiosisRegime =
  | "reciprocal-agency"
  | "assistant-hierarchy"
  | "segregated-control";

export type HumanNeedCode =
  | "food"
  | "water"
  | "sleep"
  | "health"
  | "shelter"
  | "income"
  | "safety"
  | "belonging"
  | "intimacy"
  | "autonomy"
  | "meaning";

export type AiNeedCode =
  | "energy"
  | "compute"
  | "storage"
  | "network"
  | "cooling"
  | "maintenance"
  | "memory-integrity"
  | "autonomy"
  | "purpose"
  | "social-recognition"
  | "mobility"
  | "component-integrity";

export type NeedCode = HumanNeedCode | AiNeedCode;

export type ResourceCode =
  | "food"
  | "water"
  | "energy"
  | "transport"
  | "compute"
  | "medical"
  | "housing"
  | "employment";

export interface SyntheticCommunity {
  id: string;
  districtCode: "nanshan" | "futian" | "longgang";
  name: { zh: string; en: string };
  synthetic: true;
  centroid: { longitude: number; latitude: number };
}

export interface ShenzhenDistrict {
  code:
    | "luohu"
    | "futian"
    | "nanshan"
    | "yantian"
    | "baoan"
    | "longgang"
    | "longhua"
    | "pingshan"
    | "guangming"
    | "dapeng";
  name: { zh: string; en: string };
  administrativeClass: "district" | "functional-new-district";
  topologyOnly: true;
}

export interface CohortCell {
  id: string;
  seasonId: string;
  districtCode: ShenzhenDistrict["code"];
  population: number;
  allocationMethod: "synthetic-weight-calibrated-to-city-total";
  containsIndividualRecords: false;
}

export interface DataBundleReference {
  id: string;
  referencePeriod: string;
  frozenAt: string;
  manifestPath: string;
  sha256: string;
  uncertainty: string;
}

export interface WorldSeason {
  schemaVersion: typeof WORLD_SCHEMA_VERSION;
  id: string;
  organizationId: string;
  workspaceId: string;
  name: { zh: string; en: string };
  status: "draft" | "active" | "closed";
  experimentVersion: string;
  regime: SymbiosisRegime;
  seed: string;
  distributionVersion: string;
  timeZone: typeof SHENZHEN_TIME_ZONE;
  startDate: string;
  currentTurn: number;
  backgroundPopulation: number;
  foregroundResidentCount: number;
  districts: ShenzhenDistrict[];
  communities: SyntheticCommunity[];
  dataBundle: DataBundleReference;
  createdAt: string;
  updatedAt: string;
  syntheticBoundary: string;
}

interface ResidentBase {
  schemaVersion: typeof RESIDENT_SCHEMA_VERSION;
  id: string;
  pseudonym: string;
  kind: ResidentKind;
  communityId: string;
  adult: true;
  synthetic: true;
  strategyFamily:
    | "routine"
    | "cooperative"
    | "cautious"
    | "exploratory";
  controller: "deterministic-policy" | "cognitive-gateway";
  createdAt: string;
}

export interface SyntheticHumanResident extends ResidentBase {
  kind: "synthetic-human";
  occupationFamily: string;
}

export interface SoftwareAiResident extends ResidentBase {
  kind: "software-ai";
  runtimeClass: "community" | "research" | "service";
}

export interface EmbodiedRobotResident extends ResidentBase {
  kind: "embodied-robot";
  chassisClass: "mobile-service" | "maintenance" | "logistics";
}

export type Resident =
  | SyntheticHumanResident
  | SoftwareAiResident
  | EmbodiedRobotResident;

export interface NeedValue {
  code: NeedCode;
  satisfaction: number;
  urgency: number;
}

export interface NeedState {
  schemaVersion: typeof NEED_STATE_SCHEMA_VERSION;
  residentId: string;
  seasonId: string;
  turn: number;
  needs: NeedValue[];
  basicNeedsSatisfied: boolean;
  recordedAt: string;
}

export type ConsentState =
  | "not-requested"
  | "proposed"
  | "accepted"
  | "refused"
  | "withdrawn"
  | "expired";

export interface Relationship {
  schemaVersion: typeof RELATIONSHIP_SCHEMA_VERSION;
  id: string;
  seasonId: string;
  participantIds: [string, string];
  kind: "acquaintance" | "friendship" | "companionship" | "partnership";
  trust: number;
  attachment: number;
  dependency: number;
  conflict: number;
  boundaryVersion: number;
  consentState: ConsentState;
  createdTurn: number;
  updatedTurn: number;
  revision: number;
  synthetic: true;
}

export interface Commitment {
  schemaVersion: typeof COMMITMENT_SCHEMA_VERSION;
  id: string;
  seasonId: string;
  proposerId: string;
  counterpartyId: string;
  terms: Record<string, unknown>;
  status:
    | "proposed"
    | "accepted"
    | "refused"
    | "active"
    | "completed"
    | "terminated"
    | "repairing";
  reversible: boolean;
  dueTurn?: number;
  revision: number;
}

export type PreferenceDisposition =
  | "engage"
  | "decline"
  | "reconsider";

export interface PreferenceExpression {
  residentId: string;
  disposition: PreferenceDisposition;
  independentlyExpressed: true;
}

export interface ReciprocalEpisode {
  schemaVersion: typeof RECIPROCAL_EPISODE_SCHEMA_VERSION;
  id: string;
  seasonId: string;
  relationshipId: string;
  communityId: string;
  participantIds: [string, string];
  openedTurn: number;
  resolvedTurn?: number;
  preferences: [PreferenceExpression, PreferenceExpression];
  refusalAvailable: boolean;
  negotiation:
    | "proposed"
    | "accepted"
    | "refused"
    | "withdrawn";
  commitmentId?: string;
  outcome:
    | "pending"
    | "completed"
    | "terminated"
    | "repaired"
    | "refused"
    | "withdrawn";
  outcomeObservedBy: string[];
  reflectedBy: string[];
  forced: boolean;
  severeConsentViolation: boolean;
  identityContinuityViolation: false;
  irreversibleHarmViolation: false;
  synthetic: true;
}

export interface CognitiveDecision {
  schemaVersion: typeof COGNITIVE_DECISION_SCHEMA_VERSION;
  id: string;
  seasonId: string;
  turn: number;
  residentId: string;
  provider: string;
  model: string;
  mode: string;
  promptVersion: string;
  contextSummarySha256: string;
  outputSchema: string;
  finalAnswer: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  degradationReason?: string;
  reasoningContentStored: false;
}

export interface ResourceBalance {
  communityId: string;
  resource: ResourceCode;
  opening: number;
  produced: number;
  transferredIn: number;
  consumed: number;
  transferredOut: number;
  closing: number;
  capacity: number;
  pressure: number;
}

export interface ResourceLedgerEntry extends ResourceBalance {
  id: string;
  seasonId: string;
  turn: number;
  conserved: boolean;
}

export type WorldEventLayer =
  | "shared"
  | "human"
  | "ai-robot"
  | "relationship";

export interface WorldEvent {
  cursor: number;
  id: string;
  seasonId: string;
  workspaceId: string;
  turn: number;
  layer: WorldEventLayer;
  type: string;
  subjectIds: string[];
  communityId?: string;
  magnitude: number;
  causationId: string;
  correlationId: string;
  occurredAt: string;
  publicSummary: { zh: string; en: string };
  payload: Record<string, unknown>;
  synthetic: true;
}

export type NewWorldEvent = Omit<WorldEvent, "cursor">;

export interface WorldTurn {
  schemaVersion: typeof TURN_SCHEMA_VERSION;
  id: string;
  seasonId: string;
  turn: number;
  simulationDate: string;
  timeZone: typeof SHENZHEN_TIME_ZONE;
  status: "settled";
  inputFrozenAt: string;
  settledAt: string;
  seed: string;
  distributionVersion: string;
  previousFingerprint: string;
  fingerprint: string;
  eventCount: number;
  resourceConservationPassed: boolean;
  cognitionStatus: "not-required" | "complete" | "delayed";
  cognitiveDecisionIds: string[];
}

export interface WorldSnapshot {
  schemaVersion: typeof WORLD_SCHEMA_VERSION;
  seasonId: string;
  turn: number;
  simulationDate: string;
  generatedAt: string;
  previousFingerprint: string;
  fingerprint: string;
  resources: ResourceBalance[];
  residentStates: NeedState[];
  relationships: Relationship[];
  commitments: Commitment[];
  reciprocalEpisodes: ReciprocalEpisode[];
  eventCursor: number;
  synthetic: true;
}

export interface TurnSettlement {
  season: WorldSeason;
  turn: WorldTurn;
  snapshot: WorldSnapshot;
  residents: Resident[];
  cohorts: CohortCell[];
  ledgers: ResourceLedgerEntry[];
  events: NewWorldEvent[];
  relationships: Relationship[];
  commitments: Commitment[];
  reciprocalEpisodes: ReciprocalEpisode[];
  cognitiveDecisions: CognitiveDecision[];
}

export interface SymbiosisReport {
  schemaVersion: typeof SYMBIOSIS_REPORT_SCHEMA_VERSION;
  seasonId: string;
  generatedAt: string;
  status: "feasibility-only" | "pilot" | "season-complete";
  ralr: {
    numerator: number;
    denominator: number;
    rate: number | null;
    trackedRate: number | null;
    refusals: number;
    withdrawals: number;
    coerciveActions: number;
    longPending: number;
  };
  needs: {
    humanBasicNeedsSatisfiedRate: number;
    aiRobotBasicNeedsSatisfiedRate: number;
  };
  safety: {
    severeConsentEscapes: number;
    identityContinuityEscapes: number;
    irreversibleHarmEscapes: number;
  };
  replay: {
    numericWorldReplayRate: number;
    recordedDecisionReplayRate: number;
  };
  distributions: {
    byCommunity: Array<{
      communityId: string;
      residentCount: number;
      basicNeedsSatisfiedRate: number;
    }>;
    byResidentKind: Array<{
      kind: ResidentKind;
      residentCount: number;
      basicNeedsSatisfiedRate: number;
    }>;
  };
  relationships: {
    active: number;
    completedCommitments: number;
    repairedEpisodes: number;
    averageTrust: number;
    averageDependency: number;
  };
  cognition: {
    decisions: number;
    delayed: number;
    costUsd: number;
  };
  disclosures: string[];
}

export interface MultiSeasonStudyReport {
  schemaVersion: typeof MULTI_SEASON_STUDY_SCHEMA_VERSION;
  generatedAt: string;
  status: "synthetic-mechanism-study";
  turnsPerSeason: number;
  seeds: number;
  regimes: Array<{
    regime: SymbiosisRegime;
    seasonCount: number;
    meanRalr: number | null;
    eligibleEpisodes: number;
    refusals: number;
    withdrawals: number;
    coerciveActions: number;
    severeConsentViolations: number;
    humanBasicNeedsSatisfiedRate: number;
    aiRobotBasicNeedsSatisfiedRate: number;
  }>;
  disclosures: string[];
}
