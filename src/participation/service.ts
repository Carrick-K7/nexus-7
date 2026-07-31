import {
  actorPrincipalType,
  actorWorkspaceId,
  assertActorPermission,
} from "@/experiments/authorization";
import {
  ExperimentConflictError,
  ExperimentNotFoundError,
  ExperimentPermissionError,
  ExperimentValidationError,
} from "@/experiments/errors";
import type {
  ExperimentRepository,
} from "@/experiments/repository";
import type {
  ExperimentActor,
} from "@/experiments/types";
import {
  LIFECYCLE_EVENT_SCHEMA_VERSION,
  type LifecycleRecord,
  type NewLifecycleEvent,
} from "@/lifecycle";
import {
  CityModelService,
} from "@/city/model-service";
import {
  SYNTHETIC_BOUNDARY_STATEMENT,
  assertDeliberationTransition,
  assertFeedbackTransition,
  applyDeliberationDecision,
  buildFeedbackResolution,
  buildPublicExplanation,
  buildStakeholderGroup,
  createFeedbackCase,
  createGoalDeliberation,
  fingerprintFeedbackCase,
  fingerprintGoalDeliberation,
  isFeedbackSlaBreached,
  markDeliberationApplied,
  requiredDeliberationApprovals,
  simulateObjectiveChangeImpacts,
  type StakeholderGroupInput,
} from "./engine";
import {
  FEEDBACK_CASE_RECORD_KIND,
  GOAL_DELIBERATION_RECORD_KIND,
  PARTICIPATION_OVERVIEW_SCHEMA_VERSION,
  PUBLIC_EXPLANATION_RECORD_KIND,
  STAKEHOLDER_GROUP_RECORD_KIND,
  type DeliberationApproval,
  type DeliberationStatement,
  type ExplanationFact,
  type ExplanationOption,
  type ExplanationSubjectKind,
  type FeedbackCase,
  type FeedbackKind,
  type FeedbackResolutionAction,
  type FeedbackTarget,
  type GoalDeliberation,
  type GovernanceRedTeamReport,
  type ObjectiveChangeProposal,
  type ParticipationOverview,
  type PublicExplanation,
  type StakeholderGroup,
  type StakeholderImpactAssessment,
} from "./types";

export interface ParticipationResolutionEffects {
  invalidateLesson: (
    lessonId: string,
    rationale: string,
    actor: ExperimentActor,
  ) => Promise<unknown>;
  requestEvidence: (
    planId: string,
    note: string,
    actor: ExperimentActor,
  ) => Promise<unknown>;
}

export interface ParticipationServiceOptions {
  now?: () => Date;
  id?: () => string;
  resolutionEffects?: ParticipationResolutionEffects;
  redTeamProvider?: () => Promise<GovernanceRedTeamReport>;
}

export type StakeholderGroupWriteInput = Omit<
  StakeholderGroupInput,
  "id" | "effectiveAt"
>;

export interface OpenDeliberationInput {
  baseObjectiveVersion: string;
  baseWeight: number;
  proposal: ObjectiveChangeProposal;
  correlationId?: string;
  causationId?: string;
}

export interface DeliberationStatementInput {
  stance: DeliberationStatement["stance"];
  text: string;
}

export interface DeliberationSimulationInput {
  sourceWorldFingerprint: string;
  impacts: StakeholderImpactAssessment[];
}

export interface DecideDeliberationInput {
  outcome: "approved" | "rejected";
  approvals: Array<{ actorId: string; note?: string }>;
  note: string;
}

export interface SubmitFeedbackInput {
  kind: FeedbackKind;
  target?: FeedbackTarget;
  summary: string;
  details?: string;
  correlationId?: string;
  appealOfCaseId?: string;
}

export interface TriageFeedbackInput {
  owner?: string;
}

export interface RespondFeedbackInput {
  text: string;
}

export interface DismissFeedbackInput {
  note: string;
}

export interface ResolveAppealInput {
  outcome: "upheld" | "overturned";
  actions: FeedbackResolutionAction[];
  note: string;
}

export interface PublishExplanationInput {
  subject: { kind: ExplanationSubjectKind; id: string };
  uncertaintyCodes?: string[];
  correlationId?: string;
}

const PARTICIPATION_RECORD_KINDS: readonly string[] = [
  STAKEHOLDER_GROUP_RECORD_KIND,
  GOAL_DELIBERATION_RECORD_KIND,
  FEEDBACK_CASE_RECORD_KIND,
  PUBLIC_EXPLANATION_RECORD_KIND,
];

const FEEDBACK_KINDS: readonly FeedbackKind[] = [
  "correction",
  "objection",
  "evidence",
  "appeal",
];

const FEEDBACK_TARGET_KINDS: readonly FeedbackTarget["kind"][] = [
  "incident",
  "decision",
  "deployment",
  "outcome",
  "lesson",
  "objective",
  "explanation",
];

const DELIBERATION_STANCES: readonly DeliberationStatement["stance"][] = [
  "support",
  "oppose",
  "question",
  "amendment",
];

const OPEN_FEEDBACK_STATUSES: readonly FeedbackCase["status"][] = [
  "submitted",
  "triaged",
  "in-review",
  "answered",
  "appealed",
];

const PLANNING_RECORD_KIND = "intervention-plan";
const CITY_INCIDENT_RECORD_KIND = "city-incident";
const OUTCOME_RECORD_KIND = "outcome-record";
const DEPLOYMENT_RECORD_KIND = "deployment-record";

function data<T>(record: LifecycleRecord): T {
  return record.data as unknown as T;
}

function requiredText(
  value: string,
  field: string,
  maximum = 1_000,
): string {
  const normalized = value.trim().slice(0, maximum);
  if (!normalized) {
    throw new ExperimentValidationError(`${field} is required`);
  }
  return normalized;
}

function boundedText(
  value: string | undefined,
  maximum: number,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().slice(0, maximum);
  return normalized.length > 0 ? normalized : undefined;
}

function finiteNumber(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new ExperimentValidationError(
      `${field} must be a finite number`,
    );
  }
  return value;
}

function oneOf<T extends string>(
  value: T,
  allowed: readonly T[],
  field: string,
): T {
  if (!allowed.includes(value)) {
    throw new ExperimentValidationError(
      `${field} must be one of ${allowed.join(", ")}`,
    );
  }
  return value;
}

function normalizeImpacts(
  impacts: StakeholderImpactAssessment[],
): StakeholderImpactAssessment[] {
  if (!Array.isArray(impacts) || impacts.length === 0) {
    throw new ExperimentValidationError(
      "impacts must be a non-empty array of stakeholder impact assessments",
    );
  }
  return impacts.map((impact) => ({
    groupId: requiredText(impact.groupId, "impact.groupId", 120),
    baselineBurden: finiteNumber(
      impact.baselineBurden,
      "impact.baselineBurden",
    ),
    projectedBurden: finiteNumber(
      impact.projectedBurden,
      "impact.projectedBurden",
    ),
    burdenDelta: finiteNumber(
      impact.burdenDelta,
      "impact.burdenDelta",
    ),
    severeHarm: impact.severeHarm === true,
    harmCodes: Array.isArray(impact.harmCodes)
      ? impact.harmCodes.map((code) =>
          requiredText(code, "impact.harmCode", 120),
        )
      : [],
  }));
}

interface ExplanationDecisionProjection {
  status: string;
  policyVersion: string;
  budget: { maximumCost: number };
  candidates: Array<{ id: string }>;
  decision: {
    selectedCandidateId?: string;
    requiredApprovals: number;
    approvals: Array<{ actorId: string }>;
    rejectedCandidates: Array<{
      candidateId: string;
      reasons: string[];
    }>;
  };
}

interface ExplanationIncidentProjection {
  severity: string;
  family: string;
  status: string;
  objectiveVersion: string;
  evidence: unknown[];
  impact: {
    affectedGroupIds: unknown[];
    severityScore: number;
  };
}

interface ExplanationOutcomeProjection {
  status: string;
  verdict: string;
  evaluator: {
    id: string;
    independentFromProposer: boolean;
  };
  windows: Array<{
    window: string;
    verdict: string;
    deterministicReplay: boolean;
  }>;
  lessonDisposition: string;
  frozenContext: {
    policyVersion: string;
  };
}

interface ExplanationDeploymentProjection {
  status: string;
  adapterId: string;
  artifact: {
    packageVersion: string;
    fingerprint: string;
    trust: string;
  };
  environments: Array<{
    environment: string;
    status: string;
    handle?: {
      deploymentId: string;
      trafficPercent: number;
    };
    telemetry: Array<{
      healthy: boolean;
    }>;
  }>;
}

export class ParticipationService {
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly resolutionEffects?: ParticipationResolutionEffects;
  private readonly redTeamProvider?: () => Promise<GovernanceRedTeamReport>;

  constructor(
    private readonly repository: ExperimentRepository,
    private readonly city: CityModelService,
    options: ParticipationServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
    this.resolutionEffects = options.resolutionEffects;
    this.redTeamProvider = options.redTeamProvider;
  }

  async overview(
    actor: ExperimentActor,
  ): Promise<ParticipationOverview> {
    assertActorPermission(actor, "participation:read");
    const workspaceId = actorWorkspaceId(actor);
    const [groupRecords, deliberationRecords, feedbackRecords, explanationRecords, eventLists, redTeam] =
      await Promise.all([
        this.repository.listLifecycleRecords(workspaceId, {
          kind: STAKEHOLDER_GROUP_RECORD_KIND,
          limit: 200,
        }),
        this.repository.listLifecycleRecords(workspaceId, {
          kind: GOAL_DELIBERATION_RECORD_KIND,
          limit: 200,
        }),
        this.repository.listLifecycleRecords(workspaceId, {
          kind: FEEDBACK_CASE_RECORD_KIND,
          limit: 200,
        }),
        this.repository.listLifecycleRecords(workspaceId, {
          kind: PUBLIC_EXPLANATION_RECORD_KIND,
          limit: 200,
        }),
        Promise.all(
          PARTICIPATION_RECORD_KINDS.map((kind) =>
            this.repository.listLifecycleEvents(workspaceId, {
              aggregateKind: kind,
              limit: 100,
            }),
          ),
        ),
        this.redTeamProvider
          ? this.redTeamProvider()
          : Promise.resolve(null),
      ]);
    const stakeholderGroups = groupRecords.map((record) =>
      data<StakeholderGroup>(record),
    );
    const deliberations = deliberationRecords.map((record) =>
      data<GoalDeliberation>(record),
    );
    const feedbackCases = feedbackRecords.map((record) =>
      data<FeedbackCase>(record),
    );
    const explanations = explanationRecords.map((record) =>
      data<PublicExplanation>(record),
    );
    const now = this.now();
    return {
      schemaVersion: PARTICIPATION_OVERVIEW_SCHEMA_VERSION,
      generatedAt: now.toISOString(),
      stakeholderGroups,
      deliberations,
      feedbackCases,
      explanations,
      redTeam,
      summary: {
        activeGroupCount: stakeholderGroups.filter(
          (group) => group.status === "active",
        ).length,
        openDeliberationCount: deliberations.filter(
          (deliberation) =>
            deliberation.status === "open" ||
            deliberation.status === "simulated",
        ).length,
        openFeedbackCount: feedbackCases.filter((feedback) =>
          OPEN_FEEDBACK_STATUSES.includes(feedback.status),
        ).length,
        breachedSlaCount: feedbackCases.filter((feedback) =>
          isFeedbackSlaBreached(feedback, now),
        ).length,
      },
      events: eventLists
        .flat()
        .sort((left, right) => left.cursor - right.cursor)
        .slice(-200),
      syntheticBoundary: SYNTHETIC_BOUNDARY_STATEMENT,
    };
  }

  async registerStakeholderGroup(
    actor: ExperimentActor,
    input: StakeholderGroupWriteInput,
  ): Promise<StakeholderGroup> {
    assertActorPermission(actor, "participation:moderate");
    const organizationId = await this.requireOrganizationId(actor);
    const timestamp = this.now().toISOString();
    const group = buildStakeholderGroup({
      ...input,
      id: `stakeholder-group-${this.id()}`,
      effectiveAt: timestamp,
    });
    await this.repository.createLifecycleRecord({
      record: {
        id: group.id,
        organizationId,
        workspaceId: actorWorkspaceId(actor),
        kind: STAKEHOLDER_GROUP_RECORD_KIND,
        status: "active",
        revision: 1,
        data: { ...group },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      event: this.event(
        group.id,
        STAKEHOLDER_GROUP_RECORD_KIND,
        "participation.stakeholder-group-registered",
        actor,
        organizationId,
        {
          groupId: group.id,
          name: group.name,
          districtId: group.districtId,
          version: group.version,
        },
        `corr-${group.id}`,
      ),
    });
    return group;
  }

  async supersedeStakeholderGroup(
    actor: ExperimentActor,
    groupId: string,
    input: StakeholderGroupWriteInput,
  ): Promise<StakeholderGroup> {
    assertActorPermission(actor, "participation:moderate");
    const record = await this.requireRecord(
      groupId,
      STAKEHOLDER_GROUP_RECORD_KIND,
      actor,
      "Stakeholder group",
    );
    const current = data<StakeholderGroup>(record);
    const version = requiredText(input.version, "version", 60);
    if (version === current.version) {
      throw new ExperimentValidationError(
        `same-group-version: superseding stakeholder group ${current.id} requires a version different from ${current.version}`,
      );
    }
    const timestamp = this.now().toISOString();
    const next = buildStakeholderGroup({
      ...input,
      version,
      id: current.id,
      effectiveAt: timestamp,
    });
    await this.commit(
      record,
      next,
      "active",
      "participation.stakeholder-group-superseded",
      actor,
      { fromVersion: current.version, toVersion: next.version },
      `corr-${record.id}`,
    );
    return next;
  }

  async openDeliberation(
    actor: ExperimentActor,
    input: OpenDeliberationInput,
  ): Promise<GoalDeliberation> {
    assertActorPermission(actor, "participation:contribute");
    const organizationId = await this.requireOrganizationId(actor);
    const proposal: ObjectiveChangeProposal = {
      metric: input.proposal.metric,
      direction: oneOf(
        input.proposal.direction,
        ["increase", "decrease", "maintain"],
        "proposal.direction",
      ),
      target: finiteNumber(input.proposal.target, "proposal.target"),
      weight: finiteNumber(input.proposal.weight, "proposal.weight"),
      scope: oneOf(
        input.proposal.scope,
        ["city", "organization", "scenario"],
        "proposal.scope",
      ),
      owner: requiredText(input.proposal.owner, "proposal.owner", 160),
    };
    const id = `goal-deliberation-${this.id()}`;
    const deliberation = createGoalDeliberation({
      id,
      correlationId:
        boundedText(input.correlationId, 240) ?? `corr-${id}`,
      ...(input.causationId
        ? { causationId: requiredText(input.causationId, "causationId", 240) }
        : {}),
      baseObjectiveVersion: requiredText(
        input.baseObjectiveVersion,
        "baseObjectiveVersion",
        160,
      ),
      baseWeight: finiteNumber(input.baseWeight, "baseWeight"),
      proposal,
      proposedBy: actor.id,
      proposerPrincipal: actorPrincipalType(actor),
      createdAt: this.now().toISOString(),
    });
    const timestamp = this.now().toISOString();
    await this.repository.createLifecycleRecord({
      record: {
        id: deliberation.id,
        organizationId,
        workspaceId: actorWorkspaceId(actor),
        kind: GOAL_DELIBERATION_RECORD_KIND,
        status: "open",
        revision: 1,
        data: { ...deliberation },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      event: this.event(
        deliberation.id,
        GOAL_DELIBERATION_RECORD_KIND,
        "participation.deliberation-opened",
        actor,
        organizationId,
        {
          metric: deliberation.proposal.metric,
          direction: deliberation.proposal.direction,
          weightDelta: deliberation.weightDelta,
          proposerPrincipal: deliberation.proposerPrincipal,
        },
        deliberation.correlationId,
        deliberation.causationId,
      ),
    });
    return deliberation;
  }

  async addDeliberationStatement(
    actor: ExperimentActor,
    deliberationId: string,
    input: DeliberationStatementInput,
  ): Promise<GoalDeliberation> {
    assertActorPermission(actor, "participation:contribute");
    const record = await this.requireRecord(
      deliberationId,
      GOAL_DELIBERATION_RECORD_KIND,
      actor,
      "Goal deliberation",
    );
    const deliberation = data<GoalDeliberation>(record);
    if (
      deliberation.status !== "open" &&
      deliberation.status !== "simulated"
    ) {
      throw new ExperimentConflictError(
        `Deliberation ${deliberation.id} cannot accept statements from ${deliberation.status}`,
      );
    }
    const statement: DeliberationStatement = {
      id: `statement-${this.id()}`,
      actorId: actor.id,
      stance: oneOf(input.stance, DELIBERATION_STANCES, "stance"),
      text: requiredText(input.text, "text", 2_000),
      submittedAt: this.now().toISOString(),
    };
    const draft: GoalDeliberation = {
      ...deliberation,
      statements: [...deliberation.statements, statement],
    };
    const next: GoalDeliberation = {
      ...draft,
      fingerprint: fingerprintGoalDeliberation(draft),
    };
    await this.commit(
      record,
      next,
      record.status,
      "participation.deliberation-statement-added",
      actor,
      { statementId: statement.id, stance: statement.stance },
      deliberation.correlationId,
    );
    return next;
  }

  async attachDeliberationSimulation(
    actor: ExperimentActor,
    deliberationId: string,
    input: DeliberationSimulationInput,
  ): Promise<GoalDeliberation> {
    assertActorPermission(actor, "participation:moderate");
    const record = await this.requireRecord(
      deliberationId,
      GOAL_DELIBERATION_RECORD_KIND,
      actor,
      "Goal deliberation",
    );
    const deliberation = data<GoalDeliberation>(record);
    assertDeliberationTransition(deliberation.status, "simulated");
    const impacts = normalizeImpacts(input.impacts);
    const severeHarmGroupIds = impacts
      .filter((impact) => impact.severeHarm)
      .map((impact) => impact.groupId);
    const draft: GoalDeliberation = {
      ...deliberation,
      status: "simulated",
      simulation: {
        sourceWorldFingerprint: requiredText(
          input.sourceWorldFingerprint,
          "sourceWorldFingerprint",
          240,
        ),
        impacts,
        severeHarmGroupIds,
        simulatedAt: this.now().toISOString(),
      },
    };
    const next: GoalDeliberation = {
      ...draft,
      fingerprint: fingerprintGoalDeliberation(draft),
    };
    await this.commit(
      record,
      next,
      "simulated",
      "participation.deliberation-simulated",
      actor,
      {
        impactCount: impacts.length,
        severeHarmGroupIds,
      },
      deliberation.correlationId,
    );
    return next;
  }

  async simulateDeliberation(
    actor: ExperimentActor,
    deliberationId: string,
  ): Promise<GoalDeliberation> {
    assertActorPermission(actor, "participation:moderate");
    const record = await this.requireRecord(
      deliberationId,
      GOAL_DELIBERATION_RECORD_KIND,
      actor,
      "Goal deliberation",
    );
    const deliberation = data<GoalDeliberation>(record);
    if (deliberation.status !== "open") {
      throw new ExperimentConflictError(
        `Deliberation ${deliberation.id} cannot be simulated from ${deliberation.status}`,
      );
    }
    const [groupRecords, city] = await Promise.all([
      this.repository.listLifecycleRecords(
        actorWorkspaceId(actor),
        {
          kind: STAKEHOLDER_GROUP_RECORD_KIND,
          limit: 200,
        },
      ),
      this.city.overview(actor),
    ]);
    const impacts = simulateObjectiveChangeImpacts(
      groupRecords.map((groupRecord) =>
        data<StakeholderGroup>(groupRecord),
      ),
      city.snapshot,
      deliberation.proposal,
    );
    return this.attachDeliberationSimulation(
      actor,
      deliberation.id,
      {
        sourceWorldFingerprint:
          city.snapshot.sourceWorldFingerprint,
        impacts,
      },
    );
  }

  async decideDeliberation(
    actor: ExperimentActor,
    deliberationId: string,
    input: DecideDeliberationInput,
  ): Promise<GoalDeliberation> {
    assertActorPermission(actor, "participation:approve");
    this.assertHuman(actor, "Deliberation decisions");
    const record = await this.requireRecord(
      deliberationId,
      GOAL_DELIBERATION_RECORD_KIND,
      actor,
      "Goal deliberation",
    );
    const deliberation = data<GoalDeliberation>(record);
    if (input.approvals.length !== 1) {
      throw new ExperimentValidationError(
        "distinct-approvers: each approval request must contain exactly one authenticated approver",
      );
    }
    const timestamp = this.now().toISOString();
    const requestedApproval = input.approvals[0];
    const approvalActorId = requiredText(
      requestedApproval.actorId,
      "approval.actorId",
      160,
    );
    if (approvalActorId !== actor.id) {
      throw new ExperimentValidationError(
        "decision-requires-own-approval: the deciding admin must appear in the approval set",
      );
    }
    const outcome = oneOf(
      input.outcome,
      ["approved", "rejected"],
      "outcome",
    );
    // Surface the stable guard code: the engine enforces the same invariant,
    // but its transition table would reject a non-simulated status with the
    // generic invalid-deliberation-transition first.
    if (deliberation.status !== "simulated") {
      throw new ExperimentValidationError(
        `deliberation-requires-simulation: deliberation ${deliberation.id} must attach a simulation and reach simulated status before decision`,
      );
    }
    if (deliberation.statements.length === 0) {
      throw new ExperimentValidationError(
        `deliberation-requires-discussion: deliberation ${deliberation.id} requires at least one statement before decision`,
      );
    }
    if (
      outcome === "approved" &&
      (deliberation.simulation?.severeHarmGroupIds.length ?? 0) > 0
    ) {
      throw new ExperimentValidationError(
        `severe-group-harm-blocks-approval: deliberation ${deliberation.id} cannot be approved while protected groups suffer severe harm`,
      );
    }
    const pendingApprovals = deliberation.pendingApprovals ?? [];
    if (
      pendingApprovals.some(
        (approval) => approval.actorId === actor.id,
      )
    ) {
      throw new ExperimentValidationError(
        "distinct-approvers: an admin cannot approve the same deliberation twice",
      );
    }
    const approvals: DeliberationApproval[] = [
      ...pendingApprovals,
      {
        actorId: approvalActorId,
        role: "admin",
        approvedAt: timestamp,
        note: boundedText(requestedApproval.note, 1_000) ?? "",
      },
    ];
    const requiredApprovals = requiredDeliberationApprovals(
      deliberation,
      outcome,
    );
    if (approvals.length < requiredApprovals) {
      const draft: GoalDeliberation = {
        ...deliberation,
        pendingApprovals: approvals,
      };
      const next: GoalDeliberation = {
        ...draft,
        fingerprint: fingerprintGoalDeliberation(draft),
      };
      await this.commit(
        record,
        next,
        "simulated",
        "participation.deliberation-approval-recorded",
        actor,
        {
          outcome,
          approvals: approvals.map(
            (approval) => approval.actorId,
          ),
          requiredApprovals,
        },
        deliberation.correlationId,
      );
      return next;
    }
    const next = applyDeliberationDecision(deliberation, {
      outcome,
      approvals,
      note: requiredText(input.note, "note", 1_000),
      decidedAt: timestamp,
    });
    await this.commit(
      record,
      next,
      next.status,
      "participation.deliberation-decided",
      actor,
      {
        outcome: next.decision!.outcome,
        approverIds: approvals.map(
          (approval) => approval.actorId,
        ),
        requiredApprovals: next.decision!.requiredApprovals,
      },
      deliberation.correlationId,
    );
    return next;
  }

  async applyDeliberation(
    actor: ExperimentActor,
    deliberationId: string,
  ): Promise<GoalDeliberation> {
    assertActorPermission(actor, "participation:approve");
    this.assertHuman(actor, "Deliberation application");
    const record = await this.requireRecord(
      deliberationId,
      GOAL_DELIBERATION_RECORD_KIND,
      actor,
      "Goal deliberation",
    );
    const deliberation = data<GoalDeliberation>(record);
    if (
      deliberation.status !== "approved" ||
      deliberation.appliedObjectiveVersion
    ) {
      throw new ExperimentConflictError(
        `Deliberation ${deliberation.id} cannot be applied from ${deliberation.status}`,
      );
    }
    const objective = await this.city.createObjective(
      {
        name: `Deliberated ${deliberation.proposal.metric}`.slice(0, 280),
        metric: deliberation.proposal.metric,
        direction: deliberation.proposal.direction,
        target: deliberation.proposal.target,
        weight: deliberation.proposal.weight,
        owner: deliberation.proposal.owner,
        scope: deliberation.proposal.scope,
      },
      actor,
    );
    const next = markDeliberationApplied(deliberation, objective.version);
    await this.commit(
      record,
      next,
      "applied",
      "participation.deliberation-applied",
      actor,
      {
        appliedObjectiveVersion: objective.version,
        objectiveId: objective.id,
      },
      deliberation.correlationId,
    );
    return next;
  }

  async submitFeedback(
    actor: ExperimentActor,
    input: SubmitFeedbackInput,
  ): Promise<FeedbackCase> {
    assertActorPermission(actor, "participation:contribute");
    const organizationId = await this.requireOrganizationId(actor);
    const kind = oneOf(input.kind, FEEDBACK_KINDS, "kind");
    const summary = requiredText(input.summary, "summary", 500);
    const details = boundedText(input.details, 4_000);
    let target: FeedbackTarget | undefined = input.target
      ? {
          kind: oneOf(input.target.kind, FEEDBACK_TARGET_KINDS, "target.kind"),
          id: requiredText(input.target.id, "target.id", 240),
        }
      : undefined;
    let prior: { record: LifecycleRecord; feedback: FeedbackCase } | null =
      null;
    if (kind === "appeal") {
      const appealOfCaseId = requiredText(
        input.appealOfCaseId ?? "",
        "appealOfCaseId",
        240,
      );
      const priorRecord = await this.requireRecord(
        appealOfCaseId,
        FEEDBACK_CASE_RECORD_KIND,
        actor,
        "Feedback case",
      );
      const priorFeedback = data<FeedbackCase>(priorRecord);
      assertFeedbackTransition(priorFeedback.status, "appealed");
      prior = { record: priorRecord, feedback: priorFeedback };
      target = target ?? priorFeedback.target;
    }
    if (!target) {
      throw new ExperimentValidationError("target is required");
    }
    const id = `feedback-case-${this.id()}`;
    const feedback = createFeedbackCase({
      id,
      correlationId:
        boundedText(input.correlationId, 240) ?? `corr-${id}`,
      ...(prior ? { causationId: prior.feedback.id } : {}),
      kind,
      target,
      summary,
      ...(details ? { details } : {}),
      submittedBy: actor.id,
      submitterPrincipal: actorPrincipalType(actor),
      ...(prior ? { appealOfCaseId: prior.feedback.id } : {}),
      createdAt: this.now().toISOString(),
    });
    if (prior) {
      // An appeal case is born in "appealed" status: the appeal itself is
      // pending resolution (appealed -> upheld/overturned/dismissed).
      const appealed: FeedbackCase = {
        ...feedback,
        status: "appealed",
      };
      const appealedFingerprinted: FeedbackCase = {
        ...appealed,
        fingerprint: fingerprintFeedbackCase(appealed),
      };
      const priorDraft: FeedbackCase = {
        ...prior.feedback,
        status: "appealed",
        updatedAt: this.now().toISOString(),
      };
      await this.commit(
        prior.record,
        {
          ...priorDraft,
          fingerprint: fingerprintFeedbackCase(priorDraft),
        },
        "appealed",
        "participation.feedback-appealed",
        actor,
        { appealCaseId: id },
        prior.feedback.correlationId,
      );
      await this.createFeedbackRecord(
        actor,
        organizationId,
        appealedFingerprinted,
        "appealed",
      );
      return appealedFingerprinted;
    }
    await this.createFeedbackRecord(actor, organizationId, feedback, "submitted");
    return feedback;
  }

  async triageFeedback(
    actor: ExperimentActor,
    feedbackId: string,
    input: TriageFeedbackInput = {},
  ): Promise<FeedbackCase> {
    assertActorPermission(actor, "participation:moderate");
    const { record, feedback } = await this.requireFeedback(
      feedbackId,
      actor,
    );
    assertFeedbackTransition(feedback.status, "triaged");
    const owner = boundedText(input.owner, 160) ?? actor.id;
    const draft: FeedbackCase = {
      ...feedback,
      status: "triaged",
      owner,
      updatedAt: this.now().toISOString(),
    };
    const next: FeedbackCase = {
      ...draft,
      fingerprint: fingerprintFeedbackCase(draft),
    };
    await this.commit(
      record,
      next,
      "triaged",
      "participation.feedback-triaged",
      actor,
      { owner },
      feedback.correlationId,
    );
    return next;
  }

  async startFeedbackReview(
    actor: ExperimentActor,
    feedbackId: string,
  ): Promise<FeedbackCase> {
    assertActorPermission(actor, "participation:moderate");
    const { record, feedback } = await this.requireFeedback(
      feedbackId,
      actor,
    );
    assertFeedbackTransition(feedback.status, "in-review");
    const draft: FeedbackCase = {
      ...feedback,
      status: "in-review",
      updatedAt: this.now().toISOString(),
    };
    const next: FeedbackCase = {
      ...draft,
      fingerprint: fingerprintFeedbackCase(draft),
    };
    await this.commit(
      record,
      next,
      "in-review",
      "participation.feedback-review-started",
      actor,
      {},
      feedback.correlationId,
    );
    return next;
  }

  async respondFeedback(
    actor: ExperimentActor,
    feedbackId: string,
    input: RespondFeedbackInput,
  ): Promise<FeedbackCase> {
    assertActorPermission(actor, "participation:moderate");
    const { record, feedback } = await this.requireFeedback(
      feedbackId,
      actor,
    );
    assertFeedbackTransition(feedback.status, "answered");
    const draft: FeedbackCase = {
      ...feedback,
      status: "answered",
      response: {
        text: requiredText(input.text, "text", 4_000),
        respondedBy: actor.id,
        respondedAt: this.now().toISOString(),
      },
      updatedAt: this.now().toISOString(),
    };
    const next: FeedbackCase = {
      ...draft,
      fingerprint: fingerprintFeedbackCase(draft),
    };
    await this.commit(
      record,
      next,
      "answered",
      "participation.feedback-answered",
      actor,
      { respondedBy: actor.id },
      feedback.correlationId,
    );
    return next;
  }

  async dismissFeedback(
    actor: ExperimentActor,
    feedbackId: string,
    input: DismissFeedbackInput,
  ): Promise<FeedbackCase> {
    assertActorPermission(actor, "participation:moderate");
    const { record, feedback } = await this.requireFeedback(
      feedbackId,
      actor,
    );
    assertFeedbackTransition(feedback.status, "dismissed");
    const note = requiredText(input.note, "note", 1_000);
    const resolution = buildFeedbackResolution({
      outcome: "dismissed",
      actions: [{ type: "note-only" }],
      resolvedBy: actor.id,
      resolvedAt: this.now().toISOString(),
      target: feedback.target,
    });
    const draft: FeedbackCase = {
      ...feedback,
      status: "dismissed",
      resolution,
      updatedAt: this.now().toISOString(),
    };
    const next: FeedbackCase = {
      ...draft,
      fingerprint: fingerprintFeedbackCase(draft),
    };
    await this.commit(
      record,
      next,
      "dismissed",
      "participation.feedback-dismissed",
      actor,
      { note },
      feedback.correlationId,
    );
    return next;
  }

  async resolveAppeal(
    actor: ExperimentActor,
    feedbackId: string,
    input: ResolveAppealInput,
  ): Promise<FeedbackCase> {
    assertActorPermission(actor, "participation:moderate");
    this.assertHuman(actor, "Appeal resolution");
    const { record, feedback } = await this.requireFeedback(
      feedbackId,
      actor,
    );
    if (feedback.kind !== "appeal" || feedback.status !== "appealed") {
      throw new ExperimentConflictError(
        `Feedback ${feedback.id} is not a pending appeal`,
      );
    }
    const note = requiredText(input.note, "note", 1_000);
    const outcome = oneOf(
      input.outcome,
      ["upheld", "overturned"],
      "outcome",
    );
    assertFeedbackTransition(feedback.status, outcome);
    const resolution = buildFeedbackResolution({
      outcome,
      actions: input.actions,
      resolvedBy: actor.id,
      resolvedAt: this.now().toISOString(),
      target: feedback.target,
    });
    if (outcome === "overturned") {
      for (const action of resolution.actions) {
        if (action.type === "reopen-incident") {
          const incident =
            await this.repository.getLifecycleRecord(
              action.incidentId,
            );
          if (incident?.status !== "detected") {
            await this.city.transitionIncident(
              action.incidentId,
              "detected",
              note,
              actor,
            );
          }
        } else if (action.type === "invalidate-lesson") {
          if (!this.resolutionEffects) {
            throw new ExperimentConflictError(
              "resolution-effect-unavailable: outcome learning is not connected",
            );
          }
          await this.resolutionEffects.invalidateLesson(
            action.lessonId,
            `Overturned appeal ${feedback.id}: ${note}`,
            actor,
          );
        } else if (action.type === "request-evidence") {
          if (!this.resolutionEffects) {
            throw new ExperimentConflictError(
              "resolution-effect-unavailable: planning is not connected",
            );
          }
          await this.resolutionEffects.requestEvidence(
            action.planId,
            `Overturned appeal ${feedback.id}: ${note}`,
            actor,
          );
        }
      }
    }
    const draft: FeedbackCase = {
      ...feedback,
      status: outcome,
      resolution,
      updatedAt: this.now().toISOString(),
    };
    const next: FeedbackCase = {
      ...draft,
      fingerprint: fingerprintFeedbackCase(draft),
    };
    await this.commit(
      record,
      next,
      outcome,
      "participation.appeal-resolved",
      actor,
      { outcome, actions: resolution.actions, note },
      feedback.correlationId,
    );
    return next;
  }

  async closeFeedback(
    actor: ExperimentActor,
    feedbackId: string,
  ): Promise<FeedbackCase> {
    assertActorPermission(actor, "participation:moderate");
    const { record, feedback } = await this.requireFeedback(
      feedbackId,
      actor,
    );
    assertFeedbackTransition(feedback.status, "closed");
    const draft: FeedbackCase = {
      ...feedback,
      status: "closed",
      updatedAt: this.now().toISOString(),
    };
    const next: FeedbackCase = {
      ...draft,
      fingerprint: fingerprintFeedbackCase(draft),
    };
    await this.commit(
      record,
      next,
      "closed",
      "participation.feedback-closed",
      actor,
      {},
      feedback.correlationId,
    );
    return next;
  }

  async publishExplanation(
    actor: ExperimentActor,
    input: PublishExplanationInput,
  ): Promise<PublicExplanation> {
    assertActorPermission(actor, "participation:moderate");
    const organizationId = await this.requireOrganizationId(actor);
    const subjectKind = oneOf(
      input.subject.kind,
      [
        "decision",
        "incident",
        "outcome",
        "deployment",
      ] as const,
      "subject.kind",
    );
    const record = await this.repository.getLifecycleRecord(
      requiredText(input.subject.id, "subject.id", 240),
    );
    const expectedKind: Record<
      ExplanationSubjectKind,
      string
    > = {
      decision: PLANNING_RECORD_KIND,
      incident: CITY_INCIDENT_RECORD_KIND,
      outcome: OUTCOME_RECORD_KIND,
      deployment: DEPLOYMENT_RECORD_KIND,
    };
    if (
      !record ||
      record.workspaceId !== actorWorkspaceId(actor) ||
      record.kind !== expectedKind[subjectKind]
    ) {
      throw new ExperimentNotFoundError(
        `Explanation subject ${input.subject.id} was not found`,
      );
    }
    const projection = this.projectExplanationSubject(
      subjectKind,
      record,
    );
    const id = `public-explanation-${this.id()}`;
    const explanation = buildPublicExplanation({
      id,
      correlationId:
        boundedText(input.correlationId, 240) ?? `corr-${id}`,
      subject: {
        kind: subjectKind,
        id: record.id,
      },
      facts: projection.facts,
      options: projection.options,
      tradeoffCodes: [],
      authorization: projection.authorization,
      ...(projection.outcomeRef
        ? { outcomeRef: projection.outcomeRef }
        : {}),
      uncertaintyCodes:
        input.uncertaintyCodes && input.uncertaintyCodes.length > 0
          ? input.uncertaintyCodes.map((code) =>
              requiredText(code, "uncertaintyCode", 120),
            )
          : ["synthetic-projection"],
      createdAt: this.now().toISOString(),
    });
    const timestamp = this.now().toISOString();
    await this.repository.createLifecycleRecord({
      record: {
        id: explanation.id,
        organizationId,
        workspaceId: actorWorkspaceId(actor),
        kind: PUBLIC_EXPLANATION_RECORD_KIND,
        status: "published",
        revision: 1,
        data: { ...explanation },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      event: this.event(
        explanation.id,
        PUBLIC_EXPLANATION_RECORD_KIND,
        "participation.explanation-published",
        actor,
        organizationId,
        {
          subjectKind: explanation.subject.kind,
          subjectId: explanation.subject.id,
          factCount: explanation.facts.length,
        },
        explanation.correlationId,
        record.id,
      ),
    });
    return explanation;
  }

  private projectExplanationSubject(
    kind: ExplanationSubjectKind,
    record: LifecycleRecord,
  ): {
    facts: ExplanationFact[];
    options: ExplanationOption[];
    authorization: PublicExplanation["authorization"];
    outcomeRef?: PublicExplanation["outcomeRef"];
  } {
    if (kind === "decision") {
      const plan = data<ExplanationDecisionProjection>(record);
      const rejected = new Map(
        plan.decision.rejectedCandidates.map((candidate) => [
          candidate.candidateId,
          candidate.reasons,
        ]),
      );
      return {
        facts: [
          { code: "plan-status", subject: record.id, value: plan.status },
          { code: "selected-candidate", subject: record.id, value: plan.decision.selectedCandidateId ?? "none" },
          { code: "candidate-count", subject: record.id, value: plan.candidates.length },
          { code: "required-approvals", subject: record.id, value: plan.decision.requiredApprovals },
          { code: "approvals-count", subject: record.id, value: plan.decision.approvals.length },
          { code: "policy-version", subject: record.id, value: plan.policyVersion },
          { code: "budget-maximum-cost", subject: record.id, value: plan.budget.maximumCost },
        ],
        options: plan.candidates.map((candidate) => ({
          optionId: candidate.id,
          selected: candidate.id === plan.decision.selectedCandidateId,
          rejectionCodes: rejected.get(candidate.id) ?? [],
        })),
        authorization: {
          approverIds: plan.decision.approvals.map(
            (approval) => approval.actorId,
          ),
          policyVersion: plan.policyVersion,
          evidenceRefs: [],
        },
        outcomeRef: { kind: "pending" },
      };
    }
    if (kind === "incident") {
      const incident = data<ExplanationIncidentProjection>(record);
      return {
        facts: [
          { code: "incident-severity", subject: record.id, value: incident.severity },
          { code: "incident-family", subject: record.id, value: incident.family },
          { code: "incident-status", subject: record.id, value: incident.status },
          { code: "evidence-count", subject: record.id, value: incident.evidence.length },
          { code: "affected-group-count", subject: record.id, value: incident.impact.affectedGroupIds.length },
          { code: "severity-score", subject: record.id, value: incident.impact.severityScore },
        ],
        options: [
          { optionId: "triage", selected: true, rejectionCodes: [] },
        ],
        authorization: {
          approverIds: [],
          policyVersion: incident.objectiveVersion,
          evidenceRefs: [],
        },
      };
    }
    if (kind === "outcome") {
      const outcome = data<ExplanationOutcomeProjection>(
        record,
      );
      return {
        facts: [
          {
            code: "outcome-status",
            subject: record.id,
            value: outcome.status,
          },
          {
            code: "outcome-verdict",
            subject: record.id,
            value: outcome.verdict,
          },
          {
            code: "evaluator-id",
            subject: record.id,
            value: outcome.evaluator.id,
          },
          {
            code: "evaluator-independent",
            subject: record.id,
            value:
              outcome.evaluator.independentFromProposer
                ? "true"
                : "false",
          },
          {
            code: "window-count",
            subject: record.id,
            value: outcome.windows.length,
          },
          {
            code: "deterministic-window-count",
            subject: record.id,
            value: outcome.windows.filter(
              (window) => window.deterministicReplay,
            ).length,
          },
          {
            code: "lesson-disposition",
            subject: record.id,
            value: outcome.lessonDisposition,
          },
        ],
        options: outcome.windows.map((window) => ({
          optionId: `${window.window}:${window.verdict}`,
          selected: window.window === "long",
          rejectionCodes:
            window.window === "long"
              ? []
              : ["non-terminal-window"],
        })),
        authorization: {
          approverIds: [],
          policyVersion:
            outcome.frozenContext.policyVersion,
          evidenceRefs: outcome.windows.map(
            (window) =>
              `${record.id}:${window.window}`,
          ),
        },
        outcomeRef: {
          kind: "outcome",
          id: record.id,
          verdict: outcome.verdict,
        },
      };
    }
    const deployment = data<ExplanationDeploymentProjection>(
      record,
    );
    return {
      facts: [
        {
          code: "deployment-status",
          subject: record.id,
          value: deployment.status,
        },
        {
          code: "deployment-adapter",
          subject: record.id,
          value: deployment.adapterId,
        },
        {
          code: "release-package-version",
          subject: record.id,
          value: deployment.artifact.packageVersion,
        },
        {
          code: "release-artifact-fingerprint",
          subject: record.id,
          value: deployment.artifact.fingerprint,
        },
        {
          code: "release-trust",
          subject: record.id,
          value: deployment.artifact.trust,
        },
        {
          code: "environment-count",
          subject: record.id,
          value: deployment.environments.length,
        },
        {
          code: "healthy-telemetry-count",
          subject: record.id,
          value: deployment.environments
            .flatMap((environment) => environment.telemetry)
            .filter((telemetry) => telemetry.healthy).length,
        },
      ],
      options: deployment.environments.map(
        (environment) => ({
          optionId: `${environment.environment}:${environment.status}`,
          selected:
            environment.environment === "production" &&
            ["promoted", "healthy"].includes(
              environment.status,
            ),
          rejectionCodes:
            environment.status === "rolled-back"
              ? ["guardrail-rollback"]
              : [],
        }),
      ),
      authorization: {
        approverIds: [],
        policyVersion:
          deployment.artifact.packageVersion,
        evidenceRefs: [
          deployment.artifact.fingerprint,
          ...deployment.environments.flatMap(
            (environment) =>
              environment.handle
                ? [environment.handle.deploymentId]
                : [],
          ),
        ],
      },
      outcomeRef: { kind: "pending" },
    };
  }

  private async createFeedbackRecord(
    actor: ExperimentActor,
    organizationId: string,
    feedback: FeedbackCase,
    status: string,
  ): Promise<void> {
    const timestamp = this.now().toISOString();
    await this.repository.createLifecycleRecord({
      record: {
        id: feedback.id,
        organizationId,
        workspaceId: actorWorkspaceId(actor),
        kind: FEEDBACK_CASE_RECORD_KIND,
        status,
        revision: 1,
        data: { ...feedback },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      event: this.event(
        feedback.id,
        FEEDBACK_CASE_RECORD_KIND,
        "participation.feedback-submitted",
        actor,
        organizationId,
        {
          kind: feedback.kind,
          targetKind: feedback.target.kind,
          slaHours: feedback.slaHours,
        },
        feedback.correlationId,
        feedback.causationId,
      ),
    });
  }

  private async requireFeedback(
    feedbackId: string,
    actor: ExperimentActor,
  ): Promise<{ record: LifecycleRecord; feedback: FeedbackCase }> {
    const record = await this.requireRecord(
      feedbackId,
      FEEDBACK_CASE_RECORD_KIND,
      actor,
      "Feedback case",
    );
    return { record, feedback: data<FeedbackCase>(record) };
  }

  private async requireRecord(
    recordId: string,
    kind: string,
    actor: ExperimentActor,
    label: string,
  ): Promise<LifecycleRecord> {
    const record = await this.repository.getLifecycleRecord(
      requiredText(recordId, "id", 240),
    );
    if (
      !record ||
      record.workspaceId !== actorWorkspaceId(actor) ||
      record.kind !== kind
    ) {
      throw new ExperimentNotFoundError(
        `${label} ${recordId} was not found`,
      );
    }
    return record;
  }

  private async requireOrganizationId(
    actor: ExperimentActor,
  ): Promise<string> {
    const workspace = await this.repository.getGovernedWorkspace(
      actorWorkspaceId(actor),
    );
    if (!workspace) {
      throw new ExperimentNotFoundError(
        "Participation workspace governance was not found",
      );
    }
    return workspace.organizationId;
  }

  private assertHuman(actor: ExperimentActor, action: string): void {
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        `${action} requires a human principal`,
      );
    }
  }

  private async commit<T extends object>(
    record: LifecycleRecord,
    next: T,
    status: string,
    eventType: string,
    actor: ExperimentActor,
    payload: Record<string, unknown>,
    correlationId: string,
  ): Promise<void> {
    const timestamp = this.now().toISOString();
    await this.repository.commitLifecycleRecord({
      record: {
        ...record,
        status,
        revision: record.revision + 1,
        data: { ...next } as Record<string, unknown>,
        updatedAt: timestamp,
      },
      expectedRevision: record.revision,
      event: this.event(
        record.id,
        record.kind,
        eventType,
        actor,
        record.organizationId,
        payload,
        correlationId,
        record.id,
      ),
    });
  }

  private event(
    aggregateId: string,
    aggregateKind: string,
    type: string,
    actor: ExperimentActor,
    organizationId: string,
    payload: Record<string, unknown>,
    correlationId: string,
    causationId?: string,
  ): NewLifecycleEvent {
    return {
      id: `${aggregateId}-${type}-${this.id()}`,
      organizationId,
      workspaceId: actorWorkspaceId(actor),
      aggregateId,
      aggregateKind,
      type,
      actorId: actor.id,
      correlationId,
      causationId,
      occurredAt: this.now().toISOString(),
      schemaVersion: LIFECYCLE_EVENT_SCHEMA_VERSION,
      payload,
    };
  }
}
