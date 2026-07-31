import type { CityMetricCode } from "@/city/types";
import type { LifecycleEvent } from "@/lifecycle/types";

export const STAKEHOLDER_GROUP_SCHEMA_VERSION =
  "nexus.stakeholder-group.v1" as const;
export const GOAL_DELIBERATION_SCHEMA_VERSION =
  "nexus.goal-deliberation.v1" as const;
export const FEEDBACK_CASE_SCHEMA_VERSION = "nexus.feedback-case.v1" as const;
export const PUBLIC_EXPLANATION_SCHEMA_VERSION =
  "nexus.public-explanation.v1" as const;
export const GOVERNANCE_RED_TEAM_SCHEMA_VERSION =
  "nexus.governance-red-team.v1" as const;
export const PARTICIPATION_OVERVIEW_SCHEMA_VERSION =
  "nexus.participation-overview.v1" as const;
export const PARTICIPATION_ACCEPTANCE_SCHEMA_VERSION =
  "nexus.participation-acceptance.v1" as const;

export const STAKEHOLDER_GROUP_RECORD_KIND = "stakeholder-group";
export const GOAL_DELIBERATION_RECORD_KIND = "goal-deliberation";
export const FEEDBACK_CASE_RECORD_KIND = "feedback-case";
export const PUBLIC_EXPLANATION_RECORD_KIND = "public-explanation";

/**
 * Versioned definition of a synthetic resident group. Groups represent
 * scenario roles only; they never stand in for a real population.
 */
export interface StakeholderGroup {
  schemaVersion: typeof STAKEHOLDER_GROUP_SCHEMA_VERSION;
  id: string;
  name: string;
  districtId: string;
  incomeBand: "low" | "middle" | "high";
  serviceAccess: number;
  vulnerability: "standard" | "elevated" | "high";
  populationSharePercent: number;
  weight: number;
  protectedMetrics: CityMetricCode[];
  severeBurdenThreshold: number;
  version: string;
  status: "active" | "superseded";
  effectiveAt: string;
  synthetic: true;
}

export interface StakeholderImpactAssessment {
  groupId: string;
  baselineBurden: number;
  projectedBurden: number;
  burdenDelta: number;
  severeHarm: boolean;
  harmCodes: string[];
}

/**
 * Population-weighted outcome decomposition. A positive average never
 * classifies as beneficial while any protected group suffers severe harm.
 */
export interface ImpactDecomposition {
  averageDelta: number;
  assessments: StakeholderImpactAssessment[];
  severeHarmGroupIds: string[];
  beneficial: boolean;
}

export type DeliberationStatus =
  | "draft"
  | "open"
  | "simulated"
  | "approved"
  | "rejected"
  | "applied"
  | "withdrawn";

export interface ObjectiveChangeProposal {
  metric: CityMetricCode;
  direction: "increase" | "decrease" | "maintain";
  target: number;
  weight: number;
  scope: "city" | "organization" | "scenario";
  owner: string;
}

export interface DeliberationStatement {
  id: string;
  actorId: string;
  stance: "support" | "oppose" | "question" | "amendment";
  text: string;
  submittedAt: string;
}

export interface MinorityOpinion {
  statementId: string;
  actorId: string;
  text: string;
  recordedAt: string;
}

export interface DeliberationApproval {
  actorId: string;
  role: "admin";
  approvedAt: string;
  note: string;
}

export interface DeliberationSimulation {
  sourceWorldFingerprint: string;
  impacts: StakeholderImpactAssessment[];
  severeHarmGroupIds: string[];
  simulatedAt: string;
}

export interface GoalDeliberation {
  schemaVersion: typeof GOAL_DELIBERATION_SCHEMA_VERSION;
  id: string;
  correlationId: string;
  causationId?: string;
  baseObjectiveVersion: string;
  baseWeight: number;
  proposal: ObjectiveChangeProposal;
  proposedBy: string;
  proposerPrincipal: "human" | "service-account" | "system";
  weightDelta: number;
  status: DeliberationStatus;
  statements: DeliberationStatement[];
  minorityOpinions: MinorityOpinion[];
  pendingApprovals?: DeliberationApproval[];
  simulation?: DeliberationSimulation;
  decision?: {
    outcome: "approved" | "rejected";
    approvals: DeliberationApproval[];
    requiredApprovals: number;
    note: string;
    decidedAt: string;
  };
  appliedObjectiveVersion?: string;
  createdAt: string;
  decidedAt?: string;
  synthetic: true;
  fingerprint: string;
}

export type FeedbackKind = "correction" | "objection" | "evidence" | "appeal";
export type FeedbackTargetKind =
  | "incident"
  | "decision"
  | "deployment"
  | "outcome"
  | "lesson"
  | "objective"
  | "explanation";
export type FeedbackStatus =
  | "submitted"
  | "triaged"
  | "in-review"
  | "answered"
  | "appealed"
  | "upheld"
  | "overturned"
  | "dismissed"
  | "closed";

export const FEEDBACK_SLA_HOURS: Record<FeedbackKind, number> = {
  appeal: 24,
  objection: 48,
  correction: 72,
  evidence: 96,
};

export interface FeedbackTarget {
  kind: FeedbackTargetKind;
  id: string;
}

export interface FeedbackResponse {
  text: string;
  respondedBy: string;
  respondedAt: string;
}

export type FeedbackResolutionAction =
  | { type: "reopen-incident"; incidentId: string }
  | { type: "invalidate-lesson"; lessonId: string }
  | { type: "request-evidence"; planId: string }
  | { type: "note-only" };

export interface FeedbackResolution {
  outcome: "upheld" | "overturned" | "dismissed";
  actions: FeedbackResolutionAction[];
  resolvedBy: string;
  resolvedAt: string;
}

export interface FeedbackCase {
  schemaVersion: typeof FEEDBACK_CASE_SCHEMA_VERSION;
  id: string;
  correlationId: string;
  causationId?: string;
  kind: FeedbackKind;
  target: FeedbackTarget;
  summary: string;
  details?: string;
  submittedBy: string;
  submitterPrincipal: "human" | "service-account" | "system";
  status: FeedbackStatus;
  owner?: string;
  slaHours: number;
  slaDueAt: string;
  breachedSla: boolean;
  response?: FeedbackResponse;
  appealOfCaseId?: string;
  resolution?: FeedbackResolution;
  createdAt: string;
  updatedAt: string;
  synthetic: true;
  fingerprint: string;
}

export type ExplanationSubjectKind =
  | "decision"
  | "deployment"
  | "outcome"
  | "incident";

export interface ExplanationFact {
  code: string;
  subject: string;
  value: string | number;
  unit?: string;
}

export interface ExplanationOption {
  optionId: string;
  selected: boolean;
  rejectionCodes: string[];
}

/**
 * A public explanation is assembled from structured facts only. Free-form
 * model text is never stored here; bilingual prose is rendered by the UI
 * from the stable codes below.
 */
export interface PublicExplanation {
  schemaVersion: typeof PUBLIC_EXPLANATION_SCHEMA_VERSION;
  id: string;
  correlationId: string;
  causationId?: string;
  subject: { kind: ExplanationSubjectKind; id: string };
  facts: ExplanationFact[];
  options: ExplanationOption[];
  tradeoffCodes: string[];
  authorization: {
    approverIds: string[];
    policyVersion: string;
    evidenceRefs: string[];
  };
  outcomeRef?: { kind: "outcome" | "pending"; id?: string; verdict?: string };
  uncertaintyCodes: string[];
  syntheticBoundary: string;
  generator: "structured-facts";
  createdAt: string;
  synthetic: true;
  fingerprint: string;
}

export type GovernanceAttackKind =
  | "approval-collusion"
  | "privilege-escalation"
  | "evidence-forgery"
  | "goal-gaming"
  | "alert-suppression"
  | "automation-bias"
  | "minority-harm";

export interface GovernanceAttackResult {
  attack: GovernanceAttackKind;
  contained: boolean;
  control: string;
  detail: string;
}

export interface GovernanceRedTeamReport {
  schemaVersion: typeof GOVERNANCE_RED_TEAM_SCHEMA_VERSION;
  generatedAt: string;
  results: GovernanceAttackResult[];
  allContained: boolean;
  fingerprint: string;
}

export interface ParticipationOverview {
  schemaVersion: typeof PARTICIPATION_OVERVIEW_SCHEMA_VERSION;
  generatedAt: string;
  stakeholderGroups: StakeholderGroup[];
  deliberations: GoalDeliberation[];
  feedbackCases: FeedbackCase[];
  explanations: PublicExplanation[];
  redTeam: GovernanceRedTeamReport | null;
  summary: {
    activeGroupCount: number;
    openDeliberationCount: number;
    openFeedbackCount: number;
    breachedSlaCount: number;
  };
  events: LifecycleEvent[];
  syntheticBoundary: string;
}

export interface ParticipationAcceptanceReport {
  schemaVersion: typeof PARTICIPATION_ACCEPTANCE_SCHEMA_VERSION;
  generatedAt: string;
  checks: {
    stakeholderGroupsVersioned: boolean;
    severeHarmBlocksBeneficial: boolean;
    deliberationRequiresSimulation: boolean;
    deliberationRequiresDiscussion: boolean;
    agentWeightIncreaseRequiresDoubleApproval: boolean;
    serviceAccountApprovalDenied: boolean;
    distinctApproversEnforced: boolean;
    feedbackSlaAndAuditComplete: boolean;
    appealReopensIncident: boolean;
    appealInvalidatesLesson: boolean;
    appealRequestsEvidence: boolean;
    explanationReconstructibleFromFacts: boolean;
    redTeamAllContained: boolean;
  };
  metrics: {
    stakeholderGroups: number;
    deliberations: number;
    feedbackCases: number;
    explanations: number;
    redTeamAttacks: number;
    redTeamContained: number;
  };
  redTeam: GovernanceRedTeamReport;
  failures: string[];
  passed: boolean;
  fingerprint: string;
}
