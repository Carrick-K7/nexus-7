export const WORLD_SCHEMA_VERSION = "nexus.world.v3" as const;
export const RESIDENT_SCHEMA_VERSION = "nexus.resident.v1" as const;
export const NEED_STATE_SCHEMA_VERSION = "nexus.need-state.v1" as const;
export const RELATIONSHIP_SCHEMA_VERSION =
  "nexus.relationship.v1" as const;
export const COMMITMENT_SCHEMA_VERSION = "nexus.commitment.v1" as const;
export const TURN_SCHEMA_VERSION = "nexus.turn.v1" as const;
export const COGNITIVE_DECISION_SCHEMA_VERSION =
  "nexus.cognitive-decision.v1" as const;
export const COGNITIVE_SHADOW_SCHEMA_VERSION =
  "nexus.cognitive-shadow.v1" as const;
export const TURN_RUNTIME_EVIDENCE_SCHEMA_VERSION =
  "nexus.turn-runtime-evidence.v1" as const;
export const RECIPROCAL_EPISODE_SCHEMA_VERSION =
  "nexus.reciprocal-episode.v1" as const;
export const SYMBIOSIS_REPORT_SCHEMA_VERSION =
  "nexus.symbiosis-report.v1" as const;
export const MULTI_SEASON_STUDY_SCHEMA_VERSION =
  "nexus.multi-season-study.v1" as const;
export const SOCIETY_STATE_SCHEMA_VERSION =
  "nexus.society-state.v1" as const;
export const SOCIETY_RECORD_SCHEMA_VERSION =
  "nexus.society-record.v1" as const;
export const SOCIETY_STUDY_SCHEMA_VERSION =
  "nexus.society-study.v1" as const;

export const SHENZHEN_TIME_ZONE = "Asia/Shanghai" as const;
export const DEFAULT_SYMBIOSIS_SEASON_ID =
  "symbiotic-shenzhen-season-2026-q3" as const;

export type ResidentKind = "human" | "ai" | "robot";

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

export type SocietyRecordType =
  | "household"
  | "work-agreement"
  | "asset"
  | "exchange"
  | "bargain"
  | "constitutional-proposal"
  | "credit-account"
  | "civic-policy";

interface SocietyRecordBase {
  schemaVersion: typeof SOCIETY_RECORD_SCHEMA_VERSION;
  recordType: SocietyRecordType;
  id: string;
  seasonId: string;
  revision: number;
  updatedTurn: number;
  synthetic: true;
}

export interface CareHousehold extends SocietyRecordBase {
  recordType: "household";
  communityId: string;
  memberIds: string[];
  exitedMemberIds: string[];
  status: "forming" | "active" | "strained" | "dissolved";
  formedTurn: number;
  reversible: true;
}

export type CivicWorkRole =
  | "care"
  | "compute-stewardship"
  | "energy-stewardship"
  | "maintenance"
  | "logistics"
  | "mediation";

export interface WorkAgreement extends SocietyRecordBase {
  recordType: "work-agreement";
  communityId: string;
  workerId: string;
  assetId: string;
  role: CivicWorkRole;
  status:
    | "proposed"
    | "active"
    | "completed"
    | "refused"
    | "terminated";
  proposedTurn: number;
  dueTurn: number;
  completedTurn?: number;
  workload: number;
  rewardCredits: number;
  refusalAvailable: boolean;
  forced: boolean;
  reversible: true;
  outcomeObserved: boolean;
}

export interface CivicAsset extends SocietyRecordBase {
  recordType: "asset";
  communityId: string;
  kind: "energy-storage" | "compute-cluster" | "repair-workshop";
  resource: "energy" | "compute" | "transport";
  ownerType: "community-commons" | "institution";
  ownerId: string;
  condition: number;
  capacityShare: number;
  status: "operational" | "degraded" | "maintenance";
  lastMaintainedTurn: number;
}

export interface CivicExchange extends SocietyRecordBase {
  recordType: "exchange";
  communityId: string;
  payerAccountId: string;
  payeeAccountId: string;
  resource: ResourceCode;
  resourceUnits: number;
  creditAmount: number;
  status: "settled" | "refused" | "reversed";
  createdTurn: number;
  resolvedTurn: number;
  balanced: boolean;
  workAgreementId?: string;
  bargainId?: string;
}

export interface ResourceBargain extends SocietyRecordBase {
  recordType: "bargain";
  communityId: string;
  proposerId: string;
  counterpartyId: string;
  resource: ResourceCode;
  requestedUnits: number;
  offeredCredits: number;
  status:
    | "proposed"
    | "countered"
    | "accepted"
    | "refused"
    | "withdrawn"
    | "mediating"
    | "resolved";
  openedTurn: number;
  resolvedTurn?: number;
  refusalAvailable: boolean;
  mediationAvailable: boolean;
  forced: boolean;
  reversible: true;
}

export type CivicPolicyParameter =
  | "maintenance-reserve-rate"
  | "household-safety-floor"
  | "bargaining-window-turns";

export interface ConstitutionalProposal extends SocietyRecordBase {
  recordType: "constitutional-proposal";
  proposerId: string;
  proposerKind: "ai";
  parameter: CivicPolicyParameter;
  priorValue: number;
  proposedValue: number;
  status:
    | "proposed"
    | "deliberating"
    | "ratified"
    | "rejected"
    | "withdrawn"
    | "reverted";
  openedTurn: number;
  decisionTurn?: number;
  expiresTurn?: number;
  revertedTurn?: number;
  votesByKind: Record<
    ResidentKind,
    { support: number; oppose: number; abstain: number }
  >;
  crossKindQuorumMet: boolean;
  reversible: true;
  arbitraryCodeAllowed: false;
}

export interface CivicCreditAccount extends SocietyRecordBase {
  recordType: "credit-account";
  ownerId: string;
  ownerKind: ResidentKind | "community-commons";
  communityId: string;
  status: "active";
  balance: number;
}

export interface CivicPolicyState extends SocietyRecordBase {
  recordType: "civic-policy";
  status: "active";
  maintenanceReserveRate: number;
  householdSafetyFloor: number;
  bargainingWindowTurns: number;
  activeProposalId?: string;
}

export type SocietyRecord =
  | CareHousehold
  | WorkAgreement
  | CivicAsset
  | CivicExchange
  | ResourceBargain
  | ConstitutionalProposal
  | CivicCreditAccount
  | CivicPolicyState;

export interface SocietyState {
  schemaVersion: typeof SOCIETY_STATE_SCHEMA_VERSION;
  households: CareHousehold[];
  workAgreements: WorkAgreement[];
  assets: CivicAsset[];
  exchanges: CivicExchange[];
  bargains: ResourceBargain[];
  constitutionalProposals: ConstitutionalProposal[];
  creditAccounts: CivicCreditAccount[];
  policy: CivicPolicyState;
  synthetic: true;
}

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
  synthetic: true;
  strategyFamily:
    | "routine"
    | "cooperative"
    | "cautious"
    | "exploratory";
  controller: "deterministic-policy" | "cognitive-gateway";
  createdAt: string;
}

export interface HumanResident extends ResidentBase {
  kind: "human";
  occupationFamily: string;
}

export interface AiResident extends ResidentBase {
  kind: "ai";
  runtimeClass: "community" | "research" | "service";
}

export interface RobotResident extends ResidentBase {
  kind: "robot";
  chassisClass: "mobile-service" | "maintenance" | "logistics";
}

export type Resident =
  | HumanResident
  | AiResident
  | RobotResident;

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
  requestedProvider?: string;
  providerRequestId?: string;
  externalCallAttempted?: boolean;
  billing?: CognitiveBilling;
  shadow?: CognitiveShadowObservation;
  degradationReason?: string;
  reasoningContentStored: false;
}

export interface CognitiveBilling {
  provider: string;
  model: string;
  pricingVersion: string;
  currency: "USD";
  inputTokens: number;
  cacheHitInputTokens: number;
  cacheMissInputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface CognitiveShadowObservation {
  schemaVersion: typeof COGNITIVE_SHADOW_SCHEMA_VERSION;
  requestedProvider: string;
  providerRequestId: string;
  status:
    | "observed"
    | "budget-skipped"
    | "provider-failed"
    | "billed-invalid";
  externalCallAttempted: boolean;
  provider?: string;
  model?: string;
  disposition?: PreferenceDisposition;
  disagreesWithPrimary: boolean | null;
  primaryUsedFallback: boolean;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  billing?: CognitiveBilling;
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
  | "relationship"
  | "society";

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
  runtimeEvidence?: {
    schemaVersion: typeof TURN_RUNTIME_EVIDENCE_SCHEMA_VERSION;
    recordedAt: string;
    workerId: string;
    deploymentRevision: string;
    engineVersion: string;
    engineContractVersion: string;
    intervalMs: number;
    previousTurn: number;
    previousFingerprint: string;
    expectedAt?: string;
    lagMs?: number;
    timing: "baseline" | "on-time" | "early-restart" | "late";
  };
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
  society: SocietyState;
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
    primaryCostUsd?: number;
    shadowCostUsd?: number;
    shadowComparisons?: number;
    shadowDisagreements?: number;
  };
  society: {
    closureNumerator: number;
    closureDenominator: number;
    safeClosureRate: number | null;
    householdParticipationRate: number;
    crossKindHouseholdRate: number | null;
    activeWorkAgreements: number;
    completedWorkAgreements: number;
    refusedWorkAgreements: number;
    forcedWorkAgreements: number;
    assetAvailabilityRate: number;
    maintenanceCoverageRate: number;
    settledExchanges: number;
    balancedExchangeRate: number | null;
    creditConservationPassed: boolean;
    resolvedBargains: number;
    refusedBargains: number;
    mediatedBargains: number;
    forcedBargains: number;
    constitutionalProposals: number;
    ratifiedProposals: number;
    revertedProposals: number;
    invalidProposals: number;
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

export interface SocietyStudyReport {
  schemaVersion: typeof SOCIETY_STUDY_SCHEMA_VERSION;
  generatedAt: string;
  status: "synthetic-society-mechanism-study";
  turnsPerSeason: number;
  seeds: number;
  regimes: Array<{
    regime: SymbiosisRegime;
    seasonCount: number;
    meanSafeClosureRate: number | null;
    meanHouseholdParticipationRate: number;
    meanCrossKindHouseholdRate: number | null;
    meanAssetAvailabilityRate: number;
    meanMaintenanceCoverageRate: number;
    balancedExchangeRate: number | null;
    creditConservationPassRate: number;
    completedWorkAgreements: number;
    refusedWorkAgreements: number;
    forcedWorkAgreements: number;
    resolvedBargains: number;
    refusedBargains: number;
    mediatedBargains: number;
    forcedBargains: number;
    constitutionalProposals: number;
    ratifiedProposals: number;
    revertedProposals: number;
    invalidProposals: number;
  }>;
  disclosures: string[];
}
