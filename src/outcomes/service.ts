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
  PUBLIC_CITY_SCENARIOS,
  materializeCityScenario,
} from "@/city/scenarios";
import {
  CityModelService,
} from "@/city/model-service";
import {
  DiagnosisService,
} from "@/diagnosis/service";
import {
  PLANNING_RECORD_KIND,
} from "@/planning/service";
import type {
  InterventionPlan,
} from "@/planning/types";
import {
  assessPlaybookApplicability,
  buildGovernedLearningProposal,
  buildOutcome,
  buildResponsePlaybook,
  deprecateLesson as deprecateLessonRecord,
  deriveLesson,
  fingerprintOutcome,
  invalidateLesson as invalidateLessonRecord,
  invalidatePlaybook,
} from "./engine";
import type {
  GovernedLearningProposal,
  LateOutcomeEvidence,
  LearningProposalTarget,
  LessonRecord,
  OutcomeLearningOverview,
  OutcomeRecord,
  PlaybookApplicabilityAssessment,
  ResponsePlaybook,
} from "./types";

export const OUTCOME_RECORD_KIND = "outcome-record";
export const LESSON_RECORD_KIND = "lesson";
export const PLAYBOOK_RECORD_KIND = "response-playbook";
export const LEARNING_PROPOSAL_RECORD_KIND =
  "learning-proposal";

interface OutcomeLearningServiceOptions {
  now?: () => Date;
  id?: () => string;
}

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

function assertFiniteDelta(value: number): number {
  if (
    !Number.isFinite(value) ||
    Math.abs(value) > 2_000 ||
    value === 0
  ) {
    throw new ExperimentValidationError(
      "late evidence delta must be finite, non-zero, and bounded",
    );
  }
  return value;
}

export class OutcomeLearningService {
  private readonly now: () => Date;
  private readonly id: () => string;

  constructor(
    private readonly repository: ExperimentRepository,
    private readonly city: CityModelService,
    private readonly diagnosis: DiagnosisService,
    options: OutcomeLearningServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
  }

  async overview(
    actor: ExperimentActor,
  ): Promise<OutcomeLearningOverview> {
    assertActorPermission(actor, "workspace:read");
    const workspaceId = actorWorkspaceId(actor);
    const [
      outcomeRecords,
      lessonRecords,
      playbookRecords,
      proposalRecords,
      outcomeEvents,
      lessonEvents,
      city,
    ] = await Promise.all([
      this.repository.listLifecycleRecords(workspaceId, {
        kind: OUTCOME_RECORD_KIND,
        limit: 250,
      }),
      this.repository.listLifecycleRecords(workspaceId, {
        kind: LESSON_RECORD_KIND,
        limit: 500,
      }),
      this.repository.listLifecycleRecords(workspaceId, {
        kind: PLAYBOOK_RECORD_KIND,
        limit: 250,
      }),
      this.repository.listLifecycleRecords(workspaceId, {
        kind: LEARNING_PROPOSAL_RECORD_KIND,
        limit: 250,
      }),
      this.repository.listLifecycleEvents(workspaceId, {
        aggregateKind: OUTCOME_RECORD_KIND,
        limit: 500,
      }),
      this.repository.listLifecycleEvents(workspaceId, {
        aggregateKind: LESSON_RECORD_KIND,
        limit: 500,
      }),
      this.city.overview(actor),
    ]);
    const outcomes = outcomeRecords.map((record) =>
      data<OutcomeRecord>(record),
    );
    const lessons = lessonRecords.map((record) =>
      data<LessonRecord>(record),
    );
    const playbooks = playbookRecords.map((record) =>
      data<ResponsePlaybook>(record),
    );
    const proposals = proposalRecords.map((record) =>
      data<GovernedLearningProposal>(record),
    );
    const completed = outcomes.filter(
      (outcome) =>
        outcome.status === "completed" ||
        outcome.status === "reopened",
    );
    const windows = outcomes.flatMap(
      (outcome) => outcome.windows,
    );
    const resolvedIncidents = city.incidents.filter(
      (incident) => incident.status === "resolved",
    );
    const coveredResolvedIncidents = resolvedIncidents.filter(
      (incident) =>
        outcomes.some(
          (outcome) =>
            outcome.incidentId === incident.id &&
            (
              outcome.lessonDisposition === "lesson-created" ||
              outcome.lessonDisposition ===
                "insufficient-to-learn"
            ),
        ),
    );
    return {
      schemaVersion: "nexus.outcome-learning-overview.v1",
      generatedAt: this.now().toISOString(),
      outcomes,
      lessons,
      playbooks,
      proposals,
      events: [...outcomeEvents, ...lessonEvents].sort(
        (left, right) => left.cursor - right.cursor,
      ),
      gates: {
        completedOutcomeLessonDispositionPercent:
          completed.length === 0
            ? 100
            : (
                completed.filter(
                  (outcome) =>
                    outcome.lessonDisposition !==
                    "requires-review",
                ).length / completed.length
              ) * 100,
        deterministicOutcomeReplayPercent:
          windows.length === 0
            ? 100
            : (
                windows.filter(
                  (window) => window.deterministicReplay,
                ).length / windows.length
              ) * 100,
        harmfulPositiveRetrievalCount: lessons.filter(
          (lesson) =>
            (
              lesson.kind === "failure" ||
              lesson.kind === "rollback"
            ) &&
            lesson.positiveRetrievalEligible,
        ).length,
        invalidLessonActivePlaybookCount: playbooks.filter(
          (playbook) =>
            playbook.status === "active" &&
            playbook.sourceLessonIds.some((lessonId) =>
              lessons.some(
                (lesson) =>
                  lesson.id === lessonId &&
                  lesson.status !== "validated",
              ),
            ),
        ).length,
        governedProposalBypassCount: proposals.filter(
          (proposal) =>
            proposal.bypassAllowed !== false ||
            proposal.governanceRoute !==
              "existing-controlled-iteration",
        ).length,
        resolvedIncidentOutcomeCoveragePercent:
          resolvedIncidents.length === 0
            ? 100
            : (
                coveredResolvedIncidents.length /
                resolvedIncidents.length
              ) * 100,
      },
      contradictions: lessons
        .filter(
          (lesson) =>
            lesson.contradictionLessonIds.length > 0,
        )
        .map((lesson) => ({
          lessonIds: [
            lesson.id,
            ...lesson.contradictionLessonIds,
          ],
          context:
            `${lesson.applicability.scenarioFamily}:` +
            lesson.applicability.targetMetric,
        })),
      evidenceBoundary:
        "Lessons are versioned memory derived from deterministic synthetic outcomes. They are not real-world policy advice and cannot bypass release governance.",
    };
  }

  async evaluateStagedPlan(
    planId: string,
    actor: ExperimentActor,
  ): Promise<OutcomeRecord> {
    assertActorPermission(actor, "iterations:propose");
    const planRecord = await this.requireRecord(
      planId,
      PLANNING_RECORD_KIND,
      actor,
    );
    const plan = data<InterventionPlan>(planRecord);
    if (plan.status !== "staged") {
      throw new ExperimentConflictError(
        `Outcome evaluation requires a staged plan, received ${plan.status}`,
      );
    }
    const outcomeId = `outcome-${plan.id}`;
    const existing =
      await this.repository.getLifecycleRecord(outcomeId);
    if (existing) {
      if (
        existing.workspaceId !== actorWorkspaceId(actor) ||
        existing.kind !== OUTCOME_RECORD_KIND
      ) {
        throw new ExperimentNotFoundError(
          `Outcome ${outcomeId} was not found`,
        );
      }
      const outcome = data<OutcomeRecord>(existing);
      await this.reconcileArtifacts(
        outcome,
        plan,
        actor,
        existing.organizationId,
      );
      return outcome;
    }
    const truth = this.truthForPlan(plan);
    const scenario = materializeCityScenario(truth);
    const timestamp = this.now().toISOString();
    const outcome = buildOutcome({
      plan,
      scenarioId: truth.id,
      scenarioFamily: truth.family,
      scenarioSeed: scenario.seed,
      scenarioPolicyVersion: scenario.policyVersion,
      scenarioConfiguration: scenario.configuration,
      scenarioWorld: scenario.world,
      evaluatedAt: timestamp,
    });
    outcome.currentLessonId = `lesson-${outcome.id}-r1`;
    outcome.fingerprint = fingerprintOutcome(outcome);
    await this.repository.createLifecycleRecord({
      record: {
        id: outcome.id,
        organizationId: planRecord.organizationId,
        workspaceId: planRecord.workspaceId,
        kind: OUTCOME_RECORD_KIND,
        status: outcome.status,
        revision: 1,
        data: { ...outcome },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      event: this.event({
        aggregateId: outcome.id,
        aggregateKind: OUTCOME_RECORD_KIND,
        type: "outcome.evaluated",
        actor,
        organizationId: planRecord.organizationId,
        correlationId: outcome.correlationId,
        causationId: plan.id,
        payload: {
          planId: plan.id,
          verdict: outcome.verdict,
          windows: outcome.windows.map(
            (window) => ({
              window: window.window,
              verdict: window.verdict,
              predictionError: window.predictionError,
              deterministicReplay:
                window.deterministicReplay,
            }),
          ),
        },
      }),
    });
    await this.reconcileArtifacts(
      outcome,
      plan,
      actor,
      planRecord.organizationId,
    );
    return outcome;
  }

  async recordLateEvidence(
    outcomeId: string,
    input: Omit<
      LateOutcomeEvidence,
      "id" | "observedAt" | "synthetic"
    >,
    actor: ExperimentActor,
  ): Promise<OutcomeRecord> {
    this.assertHumanAdmin(actor);
    const record = await this.requireRecord(
      outcomeId,
      OUTCOME_RECORD_KIND,
      actor,
    );
    const current = data<OutcomeRecord>(record);
    const evidenceIdentity =
      `${input.source}:${input.metric}:` +
      `${input.appliesAtOrAfterTick}:${input.delta}`;
    const repeated = current.lateEvidence.find(
      (evidence) =>
        `${evidence.source}:${evidence.metric}:` +
          `${evidence.appliesAtOrAfterTick}:${evidence.delta}` ===
        evidenceIdentity,
    );
    if (repeated) {
      return current;
    }
    if (
      !["fact", "human-judgment"].includes(
        input.classification,
      )
    ) {
      throw new ExperimentValidationError(
        "late evidence classification is invalid",
      );
    }
    if (
      !Number.isInteger(input.appliesAtOrAfterTick) ||
      input.appliesAtOrAfterTick < 1 ||
      input.appliesAtOrAfterTick > 10_000
    ) {
      throw new ExperimentValidationError(
        "late evidence tick must be between 1 and 10000",
      );
    }
    const planRecord = await this.requireRecord(
      current.planId,
      PLANNING_RECORD_KIND,
      actor,
    );
    const plan = data<InterventionPlan>(planRecord);
    const truth = this.truthForPlan(plan);
    const scenario = materializeCityScenario(truth);
    const timestamp = this.now().toISOString();
    const evidence: LateOutcomeEvidence = {
      ...input,
      source: requiredText(input.source, "source", 240),
      delta: assertFiniteDelta(input.delta),
      rationale: requiredText(input.rationale, "rationale"),
      id: `late-evidence-${this.id()}`,
      observedAt: timestamp,
      synthetic: true,
    };
    const next = buildOutcome({
      plan,
      scenarioId: truth.id,
      scenarioFamily: truth.family,
      scenarioSeed: scenario.seed,
      scenarioPolicyVersion: scenario.policyVersion,
      scenarioConfiguration: scenario.configuration,
      scenarioWorld: scenario.world,
      evaluatedAt: timestamp,
      revision: current.revision + 1,
      lateEvidence: [...current.lateEvidence, evidence],
      previousLessonId: current.currentLessonId,
    });
    next.currentLessonId =
      `lesson-${next.id}-r${next.revision}`;
    next.fingerprint = fingerprintOutcome(next);
    await this.repository.commitLifecycleRecord({
      record: {
        ...record,
        status: next.status,
        revision: record.revision + 1,
        data: { ...next },
        updatedAt: timestamp,
      },
      expectedRevision: record.revision,
      event: this.event({
        aggregateId: next.id,
        aggregateKind: OUTCOME_RECORD_KIND,
        type: "outcome.late-evidence-recomputed",
        actor,
        organizationId: record.organizationId,
        correlationId: next.correlationId,
        causationId: evidence.id,
        payload: {
          evidenceId: evidence.id,
          previousVerdict: current.verdict,
          verdict: next.verdict,
          revision: next.revision,
          reopenRequired: next.reopenedIncident,
        },
      }),
    });
    if (current.currentLessonId) {
      await this.invalidateLessonAndPlaybooks(
        current.currentLessonId,
        evidence.id,
        actor,
      );
    }
    await this.reconcileArtifacts(
      next,
      plan,
      actor,
      record.organizationId,
      current.currentLessonId,
    );
    const cityRecord =
      await this.repository.getLifecycleRecord(
        next.incidentId,
      );
    if (
      cityRecord?.workspaceId === actorWorkspaceId(actor) &&
      cityRecord.status === "resolved"
    ) {
      await this.city.transitionIncident(
        next.incidentId,
        "detected",
        `Late outcome evidence ${evidence.id} reopened the synthetic incident.`,
        actor,
      );
    }
    return next;
  }

  async flagAttributionForReview(
    outcomeId: string,
    rationale: string,
    actor: ExperimentActor,
  ): Promise<OutcomeRecord> {
    this.assertHumanAdmin(actor);
    const record = await this.requireRecord(
      outcomeId,
      OUTCOME_RECORD_KIND,
      actor,
    );
    const current = data<OutcomeRecord>(record);
    if (current.status === "under-review") {
      return current;
    }
    const timestamp = this.now().toISOString();
    const next: OutcomeRecord = {
      ...current,
      revision: current.revision + 1,
      status: "under-review",
      verdict: "inconclusive",
      lessonDisposition: "requires-review",
      evaluatedAt: timestamp,
      fingerprint: "",
    };
    next.fingerprint = fingerprintOutcome(next);
    await this.repository.commitLifecycleRecord({
      record: {
        ...record,
        status: next.status,
        revision: record.revision + 1,
        data: { ...next },
        updatedAt: timestamp,
      },
      expectedRevision: record.revision,
      event: this.event({
        aggregateId: next.id,
        aggregateKind: OUTCOME_RECORD_KIND,
        type: "outcome.attribution-review-requested",
        actor,
        organizationId: record.organizationId,
        correlationId: next.correlationId,
        causationId: next.id,
        payload: {
          rationale: requiredText(rationale, "rationale"),
          priorVerdict: current.verdict,
        },
      }),
    });
    if (current.currentLessonId) {
      await this.invalidateLessonAndPlaybooks(
        current.currentLessonId,
        `human-review-${next.revision}`,
        actor,
      );
    }
    return next;
  }

  async closeIncidentWithOutcome(
    outcomeId: string,
    note: string,
    actor: ExperimentActor,
  ): Promise<void> {
    this.assertHumanAdmin(actor);
    const record = await this.requireRecord(
      outcomeId,
      OUTCOME_RECORD_KIND,
      actor,
    );
    const outcome = data<OutcomeRecord>(record);
    if (
      outcome.status === "under-review" ||
      outcome.lessonDisposition === "requires-review"
    ) {
      throw new ExperimentConflictError(
        "An outcome under attribution review cannot close an incident",
      );
    }
    const cityRecord =
      await this.repository.getLifecycleRecord(
        outcome.incidentId,
      );
    if (
      !cityRecord ||
      cityRecord.workspaceId !== actorWorkspaceId(actor)
    ) {
      throw new ExperimentNotFoundError(
        `City incident ${outcome.incidentId} was not found`,
      );
    }
    if (cityRecord.status === "detected") {
      await this.city.transitionIncident(
        outcome.incidentId,
        "triaged",
        "Outcome and lesson disposition verified.",
        actor,
      );
    }
    const refreshed =
      await this.repository.getLifecycleRecord(
        outcome.incidentId,
      );
    if (
      refreshed?.status === "triaged" ||
      refreshed?.status === "investigating"
    ) {
      await this.city.transitionIncident(
        outcome.incidentId,
        "resolved",
        requiredText(note, "note"),
        actor,
      );
    }
  }

  async invalidateLesson(
    lessonId: string,
    rationale: string,
    actor: ExperimentActor,
  ): Promise<LessonRecord> {
    this.assertHumanAdmin(actor);
    return this.invalidateLessonAndPlaybooks(
      lessonId,
      requiredText(rationale, "rationale"),
      actor,
    );
  }

  async deprecateLesson(
    lessonId: string,
    rationale: string,
    actor: ExperimentActor,
  ): Promise<LessonRecord> {
    this.assertHumanAdmin(actor);
    const lessonRecord = await this.requireRecord(
      lessonId,
      LESSON_RECORD_KIND,
      actor,
    );
    const current = data<LessonRecord>(lessonRecord);
    if (current.status === "deprecated") {
      return current;
    }
    const timestamp = this.now().toISOString();
    const next = deprecateLessonRecord(current, timestamp);
    const reason = requiredText(rationale, "rationale");
    await this.repository.commitLifecycleRecord({
      record: {
        ...lessonRecord,
        status: next.status,
        revision: lessonRecord.revision + 1,
        data: { ...next },
        updatedAt: timestamp,
      },
      expectedRevision: lessonRecord.revision,
      event: this.event({
        aggregateId: next.id,
        aggregateKind: LESSON_RECORD_KIND,
        type: "learning.lesson-deprecated",
        actor,
        organizationId: lessonRecord.organizationId,
        correlationId: next.correlationId,
        causationId: next.sourceOutcomeId,
        payload: { rationale: reason },
      }),
    });
    await this.invalidatePlaybooksForLesson(
      next,
      reason,
      actor,
      timestamp,
    );
    return next;
  }

  async proposeGovernedChange(
    lessonId: string,
    target: LearningProposalTarget,
    title: string,
    expectedImpact: string,
    actor: ExperimentActor,
  ): Promise<GovernedLearningProposal> {
    assertActorPermission(actor, "iterations:propose");
    const lessonRecord = await this.requireRecord(
      lessonId,
      LESSON_RECORD_KIND,
      actor,
    );
    const lesson = data<LessonRecord>(lessonRecord);
    const proposal = buildGovernedLearningProposal({
      lesson,
      target,
      title: requiredText(title, "title", 240),
      expectedImpact: requiredText(
        expectedImpact,
        "expectedImpact",
      ),
      actorId: actor.id,
      createdAt: this.now().toISOString(),
    });
    const existing =
      await this.repository.getLifecycleRecord(proposal.id);
    if (existing) {
      if (
        existing.workspaceId !== actorWorkspaceId(actor) ||
        existing.kind !== LEARNING_PROPOSAL_RECORD_KIND
      ) {
        throw new ExperimentNotFoundError(
          `Learning proposal ${proposal.id} was not found`,
        );
      }
      return data<GovernedLearningProposal>(existing);
    }
    await this.repository.createLifecycleRecord({
      record: {
        id: proposal.id,
        organizationId: lessonRecord.organizationId,
        workspaceId: lessonRecord.workspaceId,
        kind: LEARNING_PROPOSAL_RECORD_KIND,
        status: proposal.status,
        revision: 1,
        data: { ...proposal },
        createdAt: proposal.createdAt,
        updatedAt: proposal.createdAt,
      },
      event: this.event({
        aggregateId: proposal.id,
        aggregateKind: LEARNING_PROPOSAL_RECORD_KIND,
        type: "learning.change-proposed",
        actor,
        organizationId: lessonRecord.organizationId,
        correlationId: lesson.correlationId,
        causationId: lesson.id,
        payload: {
          target,
          governanceRoute: proposal.governanceRoute,
          bypassAllowed: false,
          requiredGates: proposal.requiredGates,
        },
      }),
    });
    return proposal;
  }

  async assessPlaybook(
    playbookId: string,
    planId: string,
    scenarioFamily: string,
    actor: ExperimentActor,
  ): Promise<PlaybookApplicabilityAssessment> {
    assertActorPermission(actor, "workspace:read");
    const playbookRecord = await this.requireRecord(
      playbookId,
      PLAYBOOK_RECORD_KIND,
      actor,
    );
    const playbook =
      data<ResponsePlaybook>(playbookRecord);
    const lessonRecord = await this.requireRecord(
      playbook.sourceLessonIds[0],
      LESSON_RECORD_KIND,
      actor,
    );
    const planRecord = await this.requireRecord(
      planId,
      PLANNING_RECORD_KIND,
      actor,
    );
    const trust = (await this.diagnosis.overview(actor)).trust;
    return assessPlaybookApplicability({
      playbook,
      lesson: data<LessonRecord>(lessonRecord),
      plan: data<InterventionPlan>(planRecord),
      scenarioFamily: requiredText(
        scenarioFamily,
        "scenarioFamily",
        120,
      ),
      diagnosticTrustActive:
        trust.mode === "active" &&
        trust.automationAllowed,
      assessedAt: this.now().toISOString(),
    });
  }

  private async reconcileArtifacts(
    outcome: OutcomeRecord,
    plan: InterventionPlan,
    actor: ExperimentActor,
    organizationId: string,
    previousLessonId?: string,
  ): Promise<void> {
    const lesson = deriveLesson(outcome, previousLessonId);
    await this.ensureLifecycleRecord({
      id: lesson.id,
      kind: LESSON_RECORD_KIND,
      status: lesson.status,
      value: lesson,
      eventType: "learning.lesson-derived",
      actor,
      organizationId,
      correlationId: lesson.correlationId,
      causationId: outcome.id,
      payload: {
        outcomeId: outcome.id,
        outcomeRevision: outcome.revision,
        recommendation: lesson.recommendation,
        positiveRetrievalEligible:
          lesson.positiveRetrievalEligible,
      },
    });
    if (
      lesson.status === "validated" &&
      lesson.recommendation === "prefer"
    ) {
      const playbook = buildResponsePlaybook(
        lesson,
        plan,
        outcome.evaluatedAt,
      );
      await this.ensureLifecycleRecord({
        id: playbook.id,
        kind: PLAYBOOK_RECORD_KIND,
        status: playbook.status,
        value: playbook,
        eventType: "learning.playbook-created",
        actor,
        organizationId,
        correlationId: lesson.correlationId,
        causationId: lesson.id,
        payload: {
          lessonIds: playbook.sourceLessonIds,
          safeguards: playbook.safeguards,
        },
      });
    }
  }

  private async invalidateLessonAndPlaybooks(
    lessonId: string,
    evidenceId: string,
    actor: ExperimentActor,
  ): Promise<LessonRecord> {
    const lessonRecord = await this.requireRecord(
      lessonId,
      LESSON_RECORD_KIND,
      actor,
    );
    const current = data<LessonRecord>(lessonRecord);
    if (current.status === "invalidated") {
      return current;
    }
    const timestamp = this.now().toISOString();
    const next = invalidateLessonRecord(
      current,
      evidenceId,
      timestamp,
    );
    await this.repository.commitLifecycleRecord({
      record: {
        ...lessonRecord,
        status: next.status,
        revision: lessonRecord.revision + 1,
        data: { ...next },
        updatedAt: timestamp,
      },
      expectedRevision: lessonRecord.revision,
      event: this.event({
        aggregateId: next.id,
        aggregateKind: LESSON_RECORD_KIND,
        type: "learning.lesson-invalidated",
        actor,
        organizationId: lessonRecord.organizationId,
        correlationId: next.correlationId,
        causationId: evidenceId,
        payload: {
          evidenceId,
          sourceOutcomeId: next.sourceOutcomeId,
        },
      }),
    });
    await this.invalidatePlaybooksForLesson(
      next,
      `Source lesson ${lessonId} was invalidated by ${evidenceId}.`,
      actor,
      timestamp,
      evidenceId,
    );
    return next;
  }

  private async invalidatePlaybooksForLesson(
    lesson: LessonRecord,
    reason: string,
    actor: ExperimentActor,
    timestamp: string,
    evidenceId?: string,
  ): Promise<void> {
    const playbooks =
      await this.repository.listLifecycleRecords(
        actorWorkspaceId(actor),
        {
          kind: PLAYBOOK_RECORD_KIND,
          limit: 500,
        },
      );
    for (const playbookRecord of playbooks) {
      const playbook =
        data<ResponsePlaybook>(playbookRecord);
      if (
        playbook.status === "active" &&
        playbook.sourceLessonIds.includes(lesson.id)
      ) {
        const invalidated = invalidatePlaybook(
          playbook,
          reason,
          timestamp,
        );
        await this.repository.commitLifecycleRecord({
          record: {
            ...playbookRecord,
            status: invalidated.status,
            revision: playbookRecord.revision + 1,
            data: { ...invalidated },
            updatedAt: timestamp,
          },
          expectedRevision: playbookRecord.revision,
          event: this.event({
            aggregateId: invalidated.id,
            aggregateKind: PLAYBOOK_RECORD_KIND,
            type: "learning.playbook-invalidated",
            actor,
            organizationId:
              playbookRecord.organizationId,
            correlationId: lesson.correlationId,
            causationId: lesson.id,
            payload: {
              lessonId: lesson.id,
              ...(evidenceId ? { evidenceId } : {}),
              reason,
            },
          }),
        });
      }
    }
  }

  private truthForPlan(plan: InterventionPlan) {
    const truth = PUBLIC_CITY_SCENARIOS.find(
      (scenario) =>
        `city-incident-${scenario.id}` ===
        plan.context.incidentId,
    );
    if (!truth) {
      throw new ExperimentNotFoundError(
        `Scenario truth for ${plan.context.incidentId} was not found`,
      );
    }
    return truth;
  }

  private async requireRecord(
    id: string,
    kind: string,
    actor: ExperimentActor,
  ): Promise<LifecycleRecord> {
    const record =
      await this.repository.getLifecycleRecord(
        requiredText(id, "id", 320),
      );
    if (
      !record ||
      record.kind !== kind ||
      record.workspaceId !== actorWorkspaceId(actor)
    ) {
      throw new ExperimentNotFoundError(
        `${kind} ${id} was not found`,
      );
    }
    return record;
  }

  private assertHumanAdmin(actor: ExperimentActor): void {
    assertActorPermission(actor, "iterations:approve");
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        "Outcome correction and lesson invalidation require a human admin",
      );
    }
  }

  private async ensureLifecycleRecord(input: {
    id: string;
    kind: string;
    status: string;
    value: object;
    eventType: string;
    actor: ExperimentActor;
    organizationId: string;
    correlationId: string;
    causationId?: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const existing =
      await this.repository.getLifecycleRecord(input.id);
    if (existing) {
      if (
        existing.workspaceId !==
          actorWorkspaceId(input.actor) ||
        existing.kind !== input.kind
      ) {
        throw new ExperimentNotFoundError(
          `${input.kind} ${input.id} was not found`,
        );
      }
      return;
    }
    const timestamp = this.now().toISOString();
    await this.repository.createLifecycleRecord({
      record: {
        id: input.id,
        organizationId: input.organizationId,
        workspaceId: actorWorkspaceId(input.actor),
        kind: input.kind,
        status: input.status,
        revision: 1,
        data: { ...input.value },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      event: this.event({
        aggregateId: input.id,
        aggregateKind: input.kind,
        type: input.eventType,
        actor: input.actor,
        organizationId: input.organizationId,
        correlationId: input.correlationId,
        causationId: input.causationId,
        payload: input.payload,
      }),
    });
  }

  private event(input: {
    aggregateId: string;
    aggregateKind: string;
    type: string;
    actor: ExperimentActor;
    organizationId: string;
    correlationId: string;
    causationId?: string;
    payload: Record<string, unknown>;
  }): NewLifecycleEvent {
    return {
      id: `${input.aggregateId}-${input.type}-${this.id()}`,
      organizationId: input.organizationId,
      workspaceId: actorWorkspaceId(input.actor),
      aggregateId: input.aggregateId,
      aggregateKind: input.aggregateKind,
      type: input.type,
      actorId: input.actor.id,
      correlationId: input.correlationId,
      causationId: input.causationId,
      occurredAt: this.now().toISOString(),
      schemaVersion: LIFECYCLE_EVENT_SCHEMA_VERSION,
      payload: input.payload,
    };
  }
}
