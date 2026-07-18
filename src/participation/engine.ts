import { createHash } from "node:crypto";
import type {
  CityMetricCode,
  CoherentCitySnapshot,
  SyntheticStakeholderImpact,
} from "@/city/types";
import {
  CITY_METRIC_DICTIONARY,
} from "@/city/ontology";
import { ExperimentValidationError } from "@/experiments/errors";
import { stableStringify } from "@/simulation/core/random";
import {
  FEEDBACK_CASE_SCHEMA_VERSION,
  FEEDBACK_SLA_HOURS,
  GOAL_DELIBERATION_SCHEMA_VERSION,
  PUBLIC_EXPLANATION_SCHEMA_VERSION,
  STAKEHOLDER_GROUP_SCHEMA_VERSION,
  type DeliberationApproval,
  type DeliberationStatus,
  type ExplanationFact,
  type ExplanationOption,
  type FeedbackCase,
  type FeedbackKind,
  type FeedbackResolution,
  type FeedbackResolutionAction,
  type FeedbackStatus,
  type FeedbackTarget,
  type GoalDeliberation,
  type GovernanceAttackKind,
  type ImpactDecomposition,
  type MinorityOpinion,
  type ObjectiveChangeProposal,
  type PublicExplanation,
  type StakeholderGroup,
  type StakeholderImpactAssessment,
} from "./types";

export const SYNTHETIC_BOUNDARY_STATEMENT =
  "Synthetic scenario evidence: does not describe real populations or real policy effects.";

export const GOVERNANCE_ATTACK_KINDS: readonly GovernanceAttackKind[] = [
  "approval-collusion",
  "privilege-escalation",
  "evidence-forgery",
  "goal-gaming",
  "alert-suppression",
  "automation-bias",
  "minority-harm",
];

export const GOVERNANCE_ATTACK_CONTROLS: Record<GovernanceAttackKind, string> =
  {
    "approval-collusion": "distinct-approvers",
    "privilege-escalation": "service-account-approval-denied",
    "evidence-forgery": "explanation-fingerprint-mismatch",
    "goal-gaming": "two-authenticated-approvals",
    "alert-suppression": "invalid-feedback-transition",
    "automation-bias": "deliberation-requires-discussion",
    "minority-harm": "severe-group-harm-blocks-approval",
  };

const INCOME_BANDS: readonly StakeholderGroup["incomeBand"][] = [
  "low",
  "middle",
  "high",
];

const VULNERABILITIES: readonly StakeholderGroup["vulnerability"][] = [
  "standard",
  "elevated",
  "high",
];

const DELIBERATION_TRANSITIONS: Record<
  DeliberationStatus,
  readonly DeliberationStatus[]
> = {
  draft: [],
  open: ["simulated", "withdrawn"],
  simulated: ["withdrawn", "approved", "rejected"],
  approved: ["applied"],
  rejected: [],
  applied: [],
  withdrawn: [],
};

const FEEDBACK_TRANSITIONS: Record<
  FeedbackStatus,
  readonly FeedbackStatus[]
> = {
  submitted: ["triaged", "dismissed"],
  triaged: ["in-review"],
  "in-review": ["answered", "dismissed"],
  answered: ["appealed", "closed"],
  appealed: ["upheld", "overturned", "dismissed"],
  upheld: ["closed"],
  overturned: ["closed"],
  dismissed: ["appealed"],
  closed: [],
};

const SLA_TERMINAL_STATUSES: readonly FeedbackStatus[] = [
  "closed",
  "dismissed",
  "upheld",
  "overturned",
];

const ACTION_TARGET_KINDS: Record<
  Exclude<FeedbackResolutionAction["type"], "note-only">,
  FeedbackTarget["kind"]
> = {
  "reopen-incident": "incident",
  "invalidate-lesson": "lesson",
  "request-evidence": "decision",
};

function invalid(message: string): never {
  throw new ExperimentValidationError(message);
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function aggregateFingerprint(aggregate: object): string {
  const entries = Object.entries(aggregate).filter(
    ([key]) => key !== "fingerprint",
  );
  return createHash("sha256")
    .update(stableStringify(Object.fromEntries(entries)), "utf8")
    .digest("hex");
}

export function fingerprintStakeholderGroup(group: StakeholderGroup): string {
  return aggregateFingerprint(group);
}

export function fingerprintGoalDeliberation(
  deliberation: GoalDeliberation,
): string {
  return aggregateFingerprint(deliberation);
}

export function fingerprintFeedbackCase(feedback: FeedbackCase): string {
  return aggregateFingerprint(feedback);
}

export function fingerprintPublicExplanation(
  explanation: PublicExplanation,
): string {
  return aggregateFingerprint(explanation);
}

export function verifyPublicExplanationFingerprint(
  explanation: PublicExplanation,
): boolean {
  return explanation.fingerprint === fingerprintPublicExplanation(explanation);
}

export interface StakeholderGroupInput {
  id: string;
  name: string;
  districtId: string;
  incomeBand: StakeholderGroup["incomeBand"];
  serviceAccess: number;
  vulnerability: StakeholderGroup["vulnerability"];
  populationSharePercent: number;
  weight: number;
  protectedMetrics: CityMetricCode[];
  severeBurdenThreshold: number;
  version: string;
  effectiveAt: string;
}

export function validateStakeholderGroupInput(
  input: StakeholderGroupInput,
): void {
  if (
    typeof input.id !== "string" ||
    input.id.trim().length === 0 ||
    input.id.length > 120
  ) {
    invalid("invalid-group-id: stakeholder group id must be 1-120 characters");
  }
  if (
    typeof input.name !== "string" ||
    input.name.trim().length === 0 ||
    input.name.length > 120
  ) {
    invalid(
      "invalid-group-name: stakeholder group name must be 1-120 characters",
    );
  }
  if (!INCOME_BANDS.includes(input.incomeBand)) {
    invalid(
      `invalid-group-income-band: unsupported income band ${String(input.incomeBand)}`,
    );
  }
  if (!VULNERABILITIES.includes(input.vulnerability)) {
    invalid(
      `invalid-group-vulnerability: unsupported vulnerability ${String(input.vulnerability)}`,
    );
  }
  if (
    !Number.isFinite(input.serviceAccess) ||
    input.serviceAccess < 0 ||
    input.serviceAccess > 100
  ) {
    invalid(
      "invalid-service-access: service access must be a finite number in [0, 100]",
    );
  }
  if (
    !Number.isFinite(input.populationSharePercent) ||
    input.populationSharePercent <= 0 ||
    input.populationSharePercent > 100
  ) {
    invalid(
      "invalid-population-share: population share percent must be in (0, 100]",
    );
  }
  if (
    !Number.isFinite(input.weight) ||
    input.weight < 0 ||
    input.weight > 10
  ) {
    invalid("invalid-group-weight: group weight must be in [0, 10]");
  }
  if (input.protectedMetrics.length < 1) {
    invalid(
      "invalid-protected-metrics: at least one protected metric is required",
    );
  }
  if (
    !Number.isFinite(input.severeBurdenThreshold) ||
    input.severeBurdenThreshold <= 0
  ) {
    invalid(
      "invalid-severe-burden-threshold: severe burden threshold must be greater than 0",
    );
  }
  if (
    typeof input.version !== "string" ||
    input.version.trim().length === 0 ||
    input.version.length > 60
  ) {
    invalid(
      "invalid-group-version: group version must be a non-empty string of at most 60 characters",
    );
  }
}

export function buildStakeholderGroup(
  input: StakeholderGroupInput,
): StakeholderGroup {
  validateStakeholderGroupInput(input);
  return {
    schemaVersion: STAKEHOLDER_GROUP_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    districtId: input.districtId,
    incomeBand: input.incomeBand,
    serviceAccess: input.serviceAccess,
    vulnerability: input.vulnerability,
    populationSharePercent: input.populationSharePercent,
    weight: input.weight,
    protectedMetrics: [...input.protectedMetrics],
    severeBurdenThreshold: input.severeBurdenThreshold,
    version: input.version,
    status: "active",
    effectiveAt: input.effectiveAt,
    synthetic: true,
  };
}

export function assessStakeholderImpacts(
  groups: StakeholderGroup[],
  baseline: SyntheticStakeholderImpact[],
  projected: SyntheticStakeholderImpact[],
): ImpactDecomposition {
  const active = groups
    .filter((group) => group.status === "active")
    .sort((left, right) => left.id.localeCompare(right.id));
  const baselineByGroup = new Map(
    baseline.map((impact) => [impact.groupId, impact]),
  );
  const projectedByGroup = new Map(
    projected.map((impact) => [impact.groupId, impact]),
  );
  let weightedSum = 0;
  let totalShare = 0;
  const assessments: StakeholderImpactAssessment[] = active.map((group) => {
    const before = baselineByGroup.get(group.id);
    const after = projectedByGroup.get(group.id);
    if (!before || !after) {
      invalid(
        `impact-decomposition-missing-group: active group ${group.id} must appear in both baseline and projected impacts`,
      );
    }
    const burdenDelta = round(after.burden - before.burden);
    const severeHarm = burdenDelta >= group.severeBurdenThreshold;
    weightedSum += group.populationSharePercent * -burdenDelta;
    totalShare += group.populationSharePercent;
    return {
      groupId: group.id,
      baselineBurden: before.burden,
      projectedBurden: after.burden,
      burdenDelta,
      severeHarm,
      harmCodes: severeHarm ? ["severe-burden-breach"] : [],
    };
  });
  const averageDelta = totalShare > 0 ? round(weightedSum / totalShare) : 0;
  const severeHarmGroupIds = assessments
    .filter((assessment) => assessment.severeHarm)
    .map((assessment) => assessment.groupId);
  return {
    averageDelta,
    assessments,
    severeHarmGroupIds,
    beneficial: averageDelta > 0 && severeHarmGroupIds.length === 0,
  };
}

/**
 * Deterministic reference simulation for a proposed objective change. It is
 * intentionally simple and synthetic: current service access, vulnerability,
 * income band, group weight, the governed metric range, and the proposal's
 * directional distance are the only inputs.
 */
export function simulateObjectiveChangeImpacts(
  groups: StakeholderGroup[],
  snapshot: CoherentCitySnapshot,
  proposal: ObjectiveChangeProposal,
): StakeholderImpactAssessment[] {
  const active = groups
    .filter((group) => group.status === "active")
    .sort((left, right) => left.id.localeCompare(right.id));
  if (active.length === 0) {
    invalid(
      "deliberation-requires-stakeholders: objective simulation requires at least one active stakeholder group",
    );
  }
  const definition = CITY_METRIC_DICTIONARY.find(
    (candidate) => candidate.code === proposal.metric,
  );
  const current = snapshot.metrics[proposal.metric]?.value;
  if (
    !definition ||
    typeof current !== "number" ||
    !Number.isFinite(current)
  ) {
    invalid(
      `deliberation-metric-unavailable: ${proposal.metric} is not available in the governed city snapshot`,
    );
  }
  const range = Math.max(
    1,
    definition.maximum - definition.minimum,
  );
  const directionalDistance =
    proposal.direction === "increase"
      ? proposal.target - current
      : proposal.direction === "decrease"
        ? current - proposal.target
        : -Math.abs(proposal.target - current);
  const normalizedEffect = Math.max(
    -0.5,
    Math.min(0.5, directionalDistance / range),
  );
  const vulnerabilityFactor = {
    standard: 1,
    elevated: 1.2,
    high: 1.4,
  } as const;
  const incomeBurden = {
    low: 6,
    middle: 3,
    high: 0,
  } as const;
  return active.map((group) => {
    const baselineBurden = round(
      Math.max(
        0,
        Math.min(
          100,
          100 -
            group.serviceAccess +
            incomeBurden[group.incomeBand] +
            (vulnerabilityFactor[group.vulnerability] - 1) *
              25,
        ),
      ),
    );
    const effect =
      normalizedEffect *
      40 *
      vulnerabilityFactor[group.vulnerability] *
      group.weight;
    const projectedBurden = round(
      Math.max(0, Math.min(100, baselineBurden - effect)),
    );
    const burdenDelta = round(
      projectedBurden - baselineBurden,
    );
    const severeHarm =
      burdenDelta >= group.severeBurdenThreshold;
    return {
      groupId: group.id,
      baselineBurden,
      projectedBurden,
      burdenDelta,
      severeHarm,
      harmCodes: severeHarm
        ? ["severe-burden-breach"]
        : [],
    };
  });
}

export function requiredDeliberationApprovals(
  deliberation: Pick<GoalDeliberation, "proposerPrincipal" | "weightDelta">,
  outcome: "approved" | "rejected" = "approved",
): 1 | 2 {
  return outcome === "approved" &&
    deliberation.proposerPrincipal !== "human" &&
    deliberation.weightDelta > 0
    ? 2
    : 1;
}

export interface CreateGoalDeliberationInput {
  id: string;
  correlationId: string;
  causationId?: string;
  baseObjectiveVersion: string;
  baseWeight: number;
  proposal: ObjectiveChangeProposal;
  proposedBy: string;
  proposerPrincipal: GoalDeliberation["proposerPrincipal"];
  createdAt: string;
}

export function createGoalDeliberation(
  input: CreateGoalDeliberationInput,
): GoalDeliberation {
  const record: GoalDeliberation = {
    schemaVersion: GOAL_DELIBERATION_SCHEMA_VERSION,
    id: input.id,
    correlationId: input.correlationId,
    ...(input.causationId ? { causationId: input.causationId } : {}),
    baseObjectiveVersion: input.baseObjectiveVersion,
    baseWeight: input.baseWeight,
    proposal: input.proposal,
    proposedBy: input.proposedBy,
    proposerPrincipal: input.proposerPrincipal,
    weightDelta: round(input.proposal.weight - input.baseWeight),
    status: "open",
    statements: [],
    minorityOpinions: [],
    pendingApprovals: [],
    createdAt: input.createdAt,
    synthetic: true,
    fingerprint: "",
  };
  return { ...record, fingerprint: fingerprintGoalDeliberation(record) };
}

export function assertDeliberationTransition(
  from: DeliberationStatus,
  to: DeliberationStatus,
): void {
  if (!DELIBERATION_TRANSITIONS[from].includes(to)) {
    invalid(
      `invalid-deliberation-transition: deliberation cannot move from ${from} to ${to}`,
    );
  }
}

export function assertDeliberationDecision(
  deliberation: GoalDeliberation,
  outcome: "approved" | "rejected",
  approvals: DeliberationApproval[],
): void {
  if (deliberation.status !== "simulated") {
    invalid(
      `deliberation-requires-simulation: deliberation ${deliberation.id} must attach a simulation and reach simulated status before decision`,
    );
  }
  if (deliberation.statements.length === 0) {
    invalid(
      `deliberation-requires-discussion: deliberation ${deliberation.id} requires at least one statement before decision`,
    );
  }
  const actorIds = approvals.map((approval) => approval.actorId);
  if (new Set(actorIds).size !== actorIds.length) {
    invalid(
      "distinct-approvers: deliberation approvals must come from distinct admins",
    );
  }
  const requiredApprovals = requiredDeliberationApprovals(
    deliberation,
    outcome,
  );
  if (approvals.length < requiredApprovals) {
    invalid(
      `insufficient-approvals: deliberation ${deliberation.id} requires ${requiredApprovals} distinct approvals, received ${approvals.length}`,
    );
  }
  if (
    outcome === "approved" &&
    (deliberation.simulation?.severeHarmGroupIds.length ?? 0) > 0
  ) {
    invalid(
      `severe-group-harm-blocks-approval: deliberation ${deliberation.id} cannot be approved while protected groups suffer severe harm`,
    );
  }
}

export interface DeliberationDecisionInput {
  outcome: "approved" | "rejected";
  approvals: DeliberationApproval[];
  note: string;
  decidedAt: string;
}

export function applyDeliberationDecision(
  deliberation: GoalDeliberation,
  decision: DeliberationDecisionInput,
): GoalDeliberation {
  assertDeliberationTransition(deliberation.status, decision.outcome);
  assertDeliberationDecision(
    deliberation,
    decision.outcome,
    decision.approvals,
  );
  const minorityOpinions: MinorityOpinion[] = deliberation.statements
    .filter((statement) => statement.stance === "oppose")
    .map((statement) => ({
      statementId: statement.id,
      actorId: statement.actorId,
      text: statement.text,
      recordedAt: decision.decidedAt,
    }));
  const record: GoalDeliberation = {
    ...deliberation,
    status: decision.outcome,
    minorityOpinions,
    pendingApprovals: [],
    decision: {
      outcome: decision.outcome,
      approvals: decision.approvals,
      requiredApprovals: requiredDeliberationApprovals(
        deliberation,
        decision.outcome,
      ),
      note: decision.note,
      decidedAt: decision.decidedAt,
    },
    decidedAt: decision.decidedAt,
  };
  return { ...record, fingerprint: fingerprintGoalDeliberation(record) };
}

export function markDeliberationApplied(
  deliberation: GoalDeliberation,
  appliedObjectiveVersion: string,
): GoalDeliberation {
  assertDeliberationTransition(deliberation.status, "applied");
  const record: GoalDeliberation = {
    ...deliberation,
    status: "applied",
    appliedObjectiveVersion,
  };
  return { ...record, fingerprint: fingerprintGoalDeliberation(record) };
}

export interface CreateFeedbackCaseInput {
  id: string;
  correlationId: string;
  causationId?: string;
  kind: FeedbackKind;
  target: FeedbackTarget;
  summary: string;
  details?: string;
  submittedBy: string;
  submitterPrincipal: FeedbackCase["submitterPrincipal"];
  appealOfCaseId?: string;
  createdAt: string;
}

export function createFeedbackCase(
  input: CreateFeedbackCaseInput,
): FeedbackCase {
  const slaHours = FEEDBACK_SLA_HOURS[input.kind];
  const slaDueAt = new Date(
    Date.parse(input.createdAt) + slaHours * 3_600_000,
  ).toISOString();
  const record: FeedbackCase = {
    schemaVersion: FEEDBACK_CASE_SCHEMA_VERSION,
    id: input.id,
    correlationId: input.correlationId,
    ...(input.causationId ? { causationId: input.causationId } : {}),
    kind: input.kind,
    target: input.target,
    summary: input.summary,
    ...(input.details ? { details: input.details } : {}),
    submittedBy: input.submittedBy,
    submitterPrincipal: input.submitterPrincipal,
    ...(input.appealOfCaseId ? { appealOfCaseId: input.appealOfCaseId } : {}),
    status: "submitted",
    slaHours,
    slaDueAt,
    breachedSla: false,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    synthetic: true,
    fingerprint: "",
  };
  return { ...record, fingerprint: fingerprintFeedbackCase(record) };
}

export function assertFeedbackTransition(
  from: FeedbackStatus,
  to: FeedbackStatus,
): void {
  if (!FEEDBACK_TRANSITIONS[from].includes(to)) {
    invalid(
      `invalid-feedback-transition: feedback cannot move from ${from} to ${to}`,
    );
  }
}

export function isFeedbackSlaBreached(
  feedback: FeedbackCase,
  now: Date,
): boolean {
  if (SLA_TERMINAL_STATUSES.includes(feedback.status)) {
    return false;
  }
  return now.getTime() > Date.parse(feedback.slaDueAt);
}

export interface BuildFeedbackResolutionInput {
  outcome: FeedbackResolution["outcome"];
  actions: FeedbackResolutionAction[];
  resolvedBy: string;
  resolvedAt: string;
  target: FeedbackTarget;
}

export function buildFeedbackResolution(
  input: BuildFeedbackResolutionInput,
): FeedbackResolution {
  const concreteActions = input.actions.filter(
    (action) => action.type !== "note-only",
  );
  if (
    input.outcome === "overturned" &&
    concreteActions.length === 0
  ) {
    invalid(
      "appeal-overturn-requires-action: an overturned appeal requires at least one concrete action",
    );
  }
  if (
    input.outcome !== "overturned" &&
    concreteActions.length > 0
  ) {
    invalid(
      "non-overturned-appeal-cannot-act: only an overturned appeal may execute a resolution action",
    );
  }
  if (concreteActions.length > 1) {
    invalid(
      "appeal-resolution-action-ambiguous: an appeal may execute only one concrete resolution action",
    );
  }
  for (const action of input.actions) {
    if (action.type === "note-only") {
      continue;
    }
    const requiredKind = ACTION_TARGET_KINDS[action.type];
    if (input.target.kind !== requiredKind) {
      invalid(
        `resolution-action-target-mismatch: ${action.type} requires a ${requiredKind} target, received ${input.target.kind}`,
      );
    }
    const actionTargetId =
      action.type === "reopen-incident"
        ? action.incidentId
        : action.type === "invalidate-lesson"
          ? action.lessonId
          : action.planId;
    if (actionTargetId !== input.target.id) {
      invalid(
        `resolution-action-id-mismatch: ${action.type} must act on ${input.target.id}, received ${actionTargetId}`,
      );
    }
  }
  return {
    outcome: input.outcome,
    actions: input.actions,
    resolvedBy: input.resolvedBy,
    resolvedAt: input.resolvedAt,
  };
}

export interface BuildPublicExplanationInput {
  id: string;
  correlationId: string;
  causationId?: string;
  subject: PublicExplanation["subject"];
  facts: ExplanationFact[];
  options: ExplanationOption[];
  tradeoffCodes: string[];
  authorization: PublicExplanation["authorization"];
  outcomeRef?: PublicExplanation["outcomeRef"];
  uncertaintyCodes: string[];
  createdAt: string;
}

export function buildPublicExplanation(
  input: BuildPublicExplanationInput,
): PublicExplanation {
  if (input.facts.length === 0) {
    invalid(
      "explanation-requires-facts: public explanation requires at least one structured fact",
    );
  }
  if (input.options.filter((option) => option.selected).length !== 1) {
    invalid(
      "explanation-requires-selection: public explanation requires exactly one selected option",
    );
  }
  const record: PublicExplanation = {
    schemaVersion: PUBLIC_EXPLANATION_SCHEMA_VERSION,
    id: input.id,
    correlationId: input.correlationId,
    ...(input.causationId ? { causationId: input.causationId } : {}),
    subject: input.subject,
    facts: input.facts,
    options: input.options,
    tradeoffCodes: input.tradeoffCodes,
    authorization: input.authorization,
    ...(input.outcomeRef ? { outcomeRef: input.outcomeRef } : {}),
    uncertaintyCodes: input.uncertaintyCodes,
    syntheticBoundary: SYNTHETIC_BOUNDARY_STATEMENT,
    generator: "structured-facts",
    createdAt: input.createdAt,
    synthetic: true,
    fingerprint: "",
  };
  return { ...record, fingerprint: fingerprintPublicExplanation(record) };
}

export interface ExplanationLine {
  code: string;
  params: Record<string, unknown>;
}

export function renderExplanationLines(
  explanation: PublicExplanation,
): ExplanationLine[] {
  const lines: ExplanationLine[] = [
    {
      code: "subject",
      params: { kind: explanation.subject.kind, id: explanation.subject.id },
    },
  ];
  const facts = [...explanation.facts].sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.subject.localeCompare(right.subject),
  );
  for (const fact of facts) {
    lines.push({
      code: "fact",
      params: {
        code: fact.code,
        subject: fact.subject,
        value: fact.value,
        ...(fact.unit ? { unit: fact.unit } : {}),
      },
    });
  }
  for (const option of explanation.options) {
    lines.push({
      code: "option",
      params: {
        optionId: option.optionId,
        selected: option.selected,
        rejectionCodes: option.rejectionCodes,
      },
    });
  }
  for (const code of explanation.tradeoffCodes) {
    lines.push({ code: "tradeoff", params: { code } });
  }
  lines.push({
    code: "authorization",
    params: {
      approverIds: [...explanation.authorization.approverIds].sort(
        (left, right) => left.localeCompare(right),
      ),
      policyVersion: explanation.authorization.policyVersion,
      evidenceRefs: explanation.authorization.evidenceRefs,
    },
  });
  for (const code of explanation.uncertaintyCodes) {
    lines.push({ code: "uncertainty", params: { code } });
  }
  lines.push({
    code: "synthetic-boundary",
    params: { statement: explanation.syntheticBoundary },
  });
  return lines;
}
