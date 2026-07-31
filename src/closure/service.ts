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
} from "@/city/scenarios";
import {
  CityModelService,
} from "@/city/model-service";
import type {
  CityIncident,
} from "@/city/model-types";
import {
  DiagnosisService,
} from "@/diagnosis/service";
import {
  PlanningService,
} from "@/planning/service";
import {
  PLANNING_RECORD_KIND,
} from "@/planning/service";
import type {
  InterventionPlan,
} from "@/planning/types";
import {
  LESSON_RECORD_KIND,
  OutcomeLearningService,
} from "@/outcomes/service";
import type {
  GovernedLearningProposal,
  LessonRecord,
  OutcomeRecord,
} from "@/outcomes/types";
import type {
  DeploymentAdapter,
  DeploymentArtifact,
} from "@/deployment/types";
import {
  CLOSED_LOOP_DEPLOYMENT_SCHEMA_VERSION,
  CLOSED_LOOP_STAGE_CODES,
  type ClosedLoopCase,
  type ClosedLoopCompensation,
  type ClosedLoopDeploymentRecord,
  type ClosedLoopDisposition,
  type ClosedLoopEvidence,
  type ClosedLoopEvidenceKind,
  type ClosedLoopOverview,
  type ClosedLoopReleaseArtifact,
  type ClosedLoopStageCode,
  type ClosedLoopStatus,
} from "./types";
import {
  CLOSED_LOOP_DEPLOYMENT_RECORD_KIND,
  CLOSED_LOOP_RECORD_KIND,
  addClosedLoopEvidence,
  appendClosedLoopTransition,
  assertCurrentStageNotExpired,
  bindReleaseArtifact,
  closedLoopCommandDigest,
  createClosedLoopCase,
  createClosedLoopEvidence,
  refreshClosedLoopCaseFingerprint,
  renewCurrentClosedLoopStageDeadline,
  sha256,
  updateClosedLoopStage,
  verifyClosedLoopCaseIntegrity,
} from "./engine";

export type ClosedLoopCommand =
  | "advance"
  | "pause"
  | "resume"
  | "cancel"
  | "rollback"
  | "emergency-stop"
  | "reopen";

interface ClosedLoopServiceOptions {
  now?: () => Date;
  id?: () => string;
  releaseArtifact?: ClosedLoopReleaseArtifact;
}

function data<T>(record: LifecycleRecord): T {
  return record.data as unknown as T;
}

function requiredText(
  value: string,
  field: string,
  maximum = 500,
): string {
  const normalized = value.trim().slice(0, maximum);
  if (!normalized) {
    throw new ExperimentValidationError(`${field} is required`);
  }
  return normalized;
}

function deploymentFingerprint(
  value: Omit<ClosedLoopDeploymentRecord, "fingerprint">,
): string {
  return sha256(value);
}

function refreshDeployment(
  value:
    | Omit<ClosedLoopDeploymentRecord, "fingerprint">
    | ClosedLoopDeploymentRecord,
): ClosedLoopDeploymentRecord {
  const {
    fingerprint: _fingerprint,
    ...unsigned
  } = value as ClosedLoopDeploymentRecord;
  void _fingerprint;
  return {
    ...structuredClone(unsigned),
    fingerprint: deploymentFingerprint(unsigned),
  };
}

function defaultReleaseArtifact(
  timestamp: string,
): ClosedLoopReleaseArtifact {
  return bindReleaseArtifact({
    packageVersion: "2.0.0",
    repository: "local/nexus-7",
    commitSha: "working-tree",
    dirty: true,
    artifactDigest: sha256("nexus-7-local-v2"),
    evidenceManifestFingerprint: sha256(
      "nexus-7-local-evidence-v2",
    ),
    trust: "local-uncommitted",
    boundAt: timestamp,
  });
}

function dispositionForOutcome(
  outcome: OutcomeRecord,
): ClosedLoopDisposition {
  if (outcome.verdict === "beneficial") {
    return "beneficial";
  }
  if (outcome.verdict === "harmful") {
    return "rolled-back";
  }
  return "inconclusive";
}

export class ClosedLoopService {
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly releaseArtifact: ClosedLoopReleaseArtifact;

  constructor(
    private readonly repository: ExperimentRepository,
    private readonly city: CityModelService,
    private readonly diagnosis: DiagnosisService,
    private readonly planning: PlanningService,
    private readonly outcomes: OutcomeLearningService,
    private readonly deployment: DeploymentAdapter,
    options: ClosedLoopServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
    this.releaseArtifact =
      options.releaseArtifact ??
      defaultReleaseArtifact(this.now().toISOString());
  }

  async overview(actor: ExperimentActor): Promise<ClosedLoopOverview> {
    assertActorPermission(actor, "closure:read");
    const workspaceId = actorWorkspaceId(actor);
    const [caseRecords, deploymentRecords, events] =
      await Promise.all([
        this.repository.listLifecycleRecords(workspaceId, {
          kind: CLOSED_LOOP_RECORD_KIND,
          limit: 500,
        }),
        this.repository.listLifecycleRecords(workspaceId, {
          kind: CLOSED_LOOP_DEPLOYMENT_RECORD_KIND,
          limit: 500,
        }),
        this.repository.listLifecycleEvents(workspaceId, {
          aggregateKind: CLOSED_LOOP_RECORD_KIND,
          limit: 2_000,
        }),
      ]);
    const cases = caseRecords.map((record) =>
      data<ClosedLoopCase>(record),
    );
    const deployments = deploymentRecords.map((record) =>
      data<ClosedLoopDeploymentRecord>(record),
    );
    const now = this.now().getTime();
    const open = cases.filter(
      (item) =>
        !["closed", "cancelled"].includes(item.status),
    );
    const eligible = cases.filter((item) => item.eligibleProblem);
    const rollbacks = eligible.filter(
      (item) => item.disposition === "rolled-back",
    ).length;
    const vetoes = eligible.filter(
      (item) => item.disposition === "governance-denied",
    ).length;
    return {
      schemaVersion: "nexus.closed-loop-overview.v2",
      generatedAt: this.now().toISOString(),
      backend: this.repository.backend,
      cases,
      deployments,
      events,
      metrics: {
        totalCases: cases.length,
        openCases: open.length,
        closedCases: cases.filter(
          (item) => item.status === "closed",
        ).length,
        beneficialClosures: cases.filter(
          (item) =>
            item.status === "closed" &&
            item.disposition === "beneficial",
        ).length,
        rollbackRatePercent:
          eligible.length === 0
            ? 0
            : (rollbacks / eligible.length) * 100,
        humanVetoRatePercent:
          eligible.length === 0
            ? 0
            : (vetoes / eligible.length) * 100,
        oldestUnresolvedHours:
          open.length === 0
            ? 0
            : Math.max(
                ...open.map(
                  (item) =>
                    (now - Date.parse(item.createdAt)) /
                    3_600_000,
                ),
              ),
        severeGuardrailEscapes: cases.reduce(
          (sum, item) =>
            sum + item.guardrails.severeEscapeCount,
          0,
        ),
      },
      syntheticBoundary:
        "Closed-loop cases concern the deterministic synthetic city laboratory only. Local deployment stages are controlled fixtures, not production claims.",
    };
  }

  async startCase(
    scenarioId: string,
    idempotencyKey: string,
    actor: ExperimentActor,
  ): Promise<ClosedLoopCase> {
    assertActorPermission(actor, "closure:operate");
    const normalizedScenarioId = requiredText(
      scenarioId,
      "scenarioId",
      180,
    );
    const key = requiredText(
      idempotencyKey,
      "idempotencyKey",
      240,
    );
    const truth = PUBLIC_CITY_SCENARIOS.find(
      (item) => item.id === normalizedScenarioId,
    );
    if (!truth) {
      throw new ExperimentNotFoundError(
        `City scenario ${normalizedScenarioId} was not found`,
      );
    }
    const recordId = `closed-loop-case-${truth.id}`;
    const existing =
      await this.repository.getLifecycleRecord(recordId);
    if (existing) {
      if (
        existing.workspaceId !== actorWorkspaceId(actor) ||
        existing.kind !== CLOSED_LOOP_RECORD_KIND
      ) {
        throw new ExperimentNotFoundError(
          `Closed-loop case ${recordId} was not found`,
        );
      }
      const value = data<ClosedLoopCase>(existing);
      const prior = value.idempotency.find(
        (entry) => entry.key === key,
      );
      if (
        prior &&
        prior.commandDigest !==
          closedLoopCommandDigest("start", {
            scenarioId: normalizedScenarioId,
          })
      ) {
        throw new ExperimentConflictError(
          "Idempotency key was already used for another command",
        );
      }
      return value;
    }
    await this.city.initialize();
    const workspace =
      await this.repository.getGovernedWorkspace(
        actorWorkspaceId(actor),
      );
    if (!workspace) {
      throw new ExperimentNotFoundError(
        "Closed-loop workspace governance was not found",
      );
    }
    const timestamp = this.now().toISOString();
    const incident = await this.city.injectScenario(
      normalizedScenarioId,
      actor,
    );
    if (!incident) {
      const noAction = this.buildNoActionCase(
        truth.id,
        truth.family,
        truth.seed,
        truth.title,
        workspace.organizationId,
        workspace.workspaceId,
        actor,
        key,
        timestamp,
      );
      await this.createCaseRecord(noAction, actor, {
        noAction: true,
      });
      return noAction;
    }
    let value = createClosedLoopCase({
      id: recordId,
      organizationId: workspace.organizationId,
      workspaceId: workspace.workspaceId,
      title: incident.summary,
      scenarioId: truth.id,
      scenarioFamily: truth.family,
      eligibleProblem: true,
      ownerId: actor.id,
      correlationId: incident.correlationId,
      causationId: incident.causationId,
      releaseArtifact: this.releaseArtifact,
      scenarioTruthId: truth.id,
      seed: truth.seed,
      policyVersion: "closed-loop-policy-2.0.0",
      createdAt: timestamp,
    });
    const detectionEvidence = [
      this.evidence(
        value,
        "detection",
        "observation",
        `${incident.id}:observations`,
        incident.evidence,
        timestamp,
      ),
      this.evidence(
        value,
        "detection",
        "incident",
        incident.id,
        incident,
        timestamp,
      ),
    ];
    value = addClosedLoopEvidence(value, detectionEvidence);
    value = updateClosedLoopStage(value, "detection", {
      status: "completed",
      occurredAt: timestamp,
      note: "Declared symptoms crossed deterministic thresholds.",
    });
    value = refreshClosedLoopCaseFingerprint({
      ...value,
      links: {
        ...value.links,
        incidentId: incident.id,
      },
      groupImpacts: this.groupImpacts(incident),
      replay: {
        ...value.replay,
        sourceWorldFingerprint:
          incident.evidence[0]?.sourceWorldFingerprint,
      },
      idempotency: [
        {
          key,
          commandDigest: closedLoopCommandDigest(
            "start",
            { scenarioId: normalizedScenarioId },
          ),
          command: "start",
          resultingStatus: value.status,
          resultingRevision: 1,
          completedAt: timestamp,
        },
      ],
      fingerprint: "",
    });
    await this.createCaseRecord(value, actor, {
      incidentId: incident.id,
      scenarioTruthId: truth.id,
      evidenceIds: detectionEvidence.map(
        (evidence) => evidence.id,
      ),
    });
    return value;
  }

  async command(
    caseId: string,
    command: ClosedLoopCommand,
    idempotencyKey: string,
    actor: ExperimentActor,
    input: { reason?: string } = {},
  ): Promise<ClosedLoopCase> {
    const key = requiredText(
      idempotencyKey,
      "idempotencyKey",
      240,
    );
    const record = await this.requireCase(caseId, actor);
    const current = data<ClosedLoopCase>(record);
    const commandDigest = closedLoopCommandDigest(
      command,
      input,
    );
    const existing = current.idempotency.find(
      (entry) => entry.key === key,
    );
    if (existing) {
      if (existing.commandDigest !== commandDigest) {
        throw new ExperimentConflictError(
          "Idempotency key was already used for another command",
        );
      }
      return current;
    }
    if (command === "advance") {
      assertActorPermission(actor, "closure:operate");
      return this.advance(
        record,
        current,
        key,
        commandDigest,
        actor,
      );
    }
    assertActorPermission(actor, "closure:control");
    this.assertHuman(actor);
    return this.control(
      record,
      current,
      command,
      key,
      commandDigest,
      requiredText(
        input.reason ?? `${command} requested`,
        "reason",
      ),
      actor,
    );
  }

  async runReferenceFlow(
    actor: ExperimentActor,
  ): Promise<ClosedLoopCase> {
    let value = await this.startCase(
      "city-economic-single-fault",
      "reference-flow:start",
      actor,
    );
    for (let step = 0; step < 20; step += 1) {
      if (value.status === "closed") {
        return value;
      }
      value = await this.command(
        value.id,
        "advance",
        `reference-flow:advance:${step}:${value.status}`,
        actor,
      );
    }
    throw new ExperimentConflictError(
      `Reference flow did not close; stopped at ${value.status}`,
    );
  }

  private async advance(
    record: LifecycleRecord,
    current: ClosedLoopCase,
    key: string,
    commandDigest: string,
    actor: ExperimentActor,
  ): Promise<ClosedLoopCase> {
    const now = this.now();
    if (
      ["closed", "cancelled"].includes(current.status)
    ) {
      throw new ExperimentConflictError(
        `Closed-loop case cannot advance from ${current.status}`,
      );
    }
    try {
      assertCurrentStageNotExpired(current, now);
    } catch (error) {
      let blocked = refreshClosedLoopCaseFingerprint({
        ...current,
        control: {
          ...current.control,
          resumeStatus: current.status,
          blockers: [
            ...current.control.blockers,
            {
              code: "stage-deadline-expired",
              detail:
                error instanceof Error
                  ? error.message
                  : String(error),
              since: now.toISOString(),
            },
          ],
        },
        fingerprint: "",
      });
      if (
        current.links.deploymentId &&
        ["staged", "monitoring"].includes(current.status)
      ) {
        const deployment = await this.rollbackDeployment(
          current,
          "Closed-loop stage deadline expired.",
          actor,
        );
        blocked = this.withRollback(
          blocked,
          deployment,
          "deadline",
          key,
          now.toISOString(),
        );
        return this.transitionAndCommit(
          record,
          blocked,
          "rolled-back",
          "advance",
          key,
          commandDigest,
          actor,
          [],
          "closure.deadline-rolled-back",
        );
      }
      blocked = refreshClosedLoopCaseFingerprint({
        ...blocked,
        compensations: [
          ...blocked.compensations,
          {
            id: `compensation-${this.id()}`,
            trigger: "deadline",
            action: "release-resources",
            status: "completed",
            idempotencyKey: key,
            completedAt: now.toISOString(),
            detail:
              "No deployment existed; reserved synthetic resources were released.",
          },
        ],
        fingerprint: "",
      });
      return this.transitionAndCommit(
        record,
        blocked,
        "blocked",
        "advance",
        key,
        commandDigest,
        actor,
        [],
        "closure.case-blocked",
      );
    }
    const integrity = verifyClosedLoopCaseIntegrity(
      current,
      { now },
    );
    const expired = integrity.failures.filter((failure) =>
      failure.startsWith("evidence-expired:"),
    );
    if (expired.length > 0) {
      const blocked = refreshClosedLoopCaseFingerprint({
        ...current,
        control: {
          ...current.control,
          resumeStatus: current.status,
          blockers: [
            ...current.control.blockers,
            {
              code: "evidence-expired",
              detail: expired.join(", "),
              since: now.toISOString(),
            },
          ],
        },
        fingerprint: "",
      });
      return this.transitionAndCommit(
        record,
        blocked,
        "blocked",
        "advance",
        key,
        commandDigest,
        actor,
        [],
        "closure.case-blocked",
      );
    }
    const timestamp = now.toISOString();
    if (current.status === "detected") {
      const incident = await this.requireLinkedIncident(
        current,
        actor,
      );
      const triaged =
        incident.status === "detected"
          ? await this.city.transitionIncident(
              incident.id,
              "triaged",
              "Closed-loop owner accepted deterministic triage.",
              actor,
            )
          : incident;
      return this.completeStageAndTransition(
        record,
        current,
        "triage",
        [
          this.evidence(
            current,
            "triage",
            "triage",
            triaged.id,
            {
              status: triaged.status,
              severity: triaged.severity,
              assignedAgents: triaged.assignedAgents,
            },
            timestamp,
          ),
        ],
        "triaged",
        key,
        commandDigest,
        actor,
      );
    }
    if (current.status === "triaged") {
      const incident = await this.requireLinkedIncident(
        current,
        actor,
      );
      if (incident.status === "triaged") {
        await this.city.transitionIncident(
          incident.id,
          "investigating",
          "Falsifiable diagnosis started.",
          actor,
        );
      }
      return this.transitionAndCommit(
        record,
        current,
        "diagnosing",
        "advance",
        key,
        commandDigest,
        actor,
        [],
        "closure.diagnosis-started",
      );
    }
    if (current.status === "diagnosing") {
      const diagnosis = await this.diagnosis.diagnoseIncident(
        current.links.incidentId!,
        actor,
      );
      let next = refreshClosedLoopCaseFingerprint({
        ...current,
        links: {
          ...current.links,
          diagnosisId: diagnosis.id,
        },
        fingerprint: "",
      });
      next = await this.completeStage(
        next,
        "diagnosis",
        [
          this.evidence(
            next,
            "diagnosis",
            "hypothesis",
            diagnosis.id,
            {
              hypotheses: diagnosis.hypotheses,
              aggregation: diagnosis.aggregation,
              unknowns: diagnosis.unknowns,
            },
            timestamp,
          ),
          this.evidence(
            next,
            "diagnosis",
            "counterfactual",
            diagnosis.id,
            diagnosis.counterfactuals,
            timestamp,
          ),
        ],
        timestamp,
      );
      return this.transitionAndCommit(
        record,
        next,
        diagnosis.status === "diagnosed"
          ? "diagnosed"
          : "inconclusive",
        "advance",
        key,
        commandDigest,
        actor,
        next.evidence
          .filter((item) => item.stage === "diagnosis")
          .map((item) => item.id),
        "closure.diagnosis-completed",
      );
    }
    if (current.status === "diagnosed") {
      const plan = await this.planning.createPlanForScenario(
        current.scenarioId,
        actor,
        { maximumCost: 500 },
      );
      let next = refreshClosedLoopCaseFingerprint({
        ...current,
        links: {
          ...current.links,
          planId: plan.id,
        },
        fingerprint: "",
      });
      next = await this.completeStage(
        next,
        "planning",
        [
          this.evidence(
            next,
            "planning",
            "plan",
            plan.id,
            {
              fingerprint: plan.fingerprint,
              candidateIds: plan.candidates.map(
                (candidate) => candidate.id,
              ),
              noActionCandidateId:
                plan.design.baselineCandidateId,
              budget: plan.budget,
            },
            timestamp,
          ),
        ],
        timestamp,
      );
      return this.transitionAndCommit(
        record,
        next,
        "planned",
        "advance",
        key,
        commandDigest,
        actor,
        next.evidence
          .filter((item) => item.stage === "planning")
          .map((item) => item.id),
        "closure.plan-created",
      );
    }
    if (current.status === "planned") {
      const plan = await this.requireLinkedPlan(current, actor);
      const experimentEvidence = this.evidence(
        current,
        "experiment",
        "experiment",
        plan.design.id,
        {
          design: plan.design,
          results: plan.results,
          schedule: plan.schedule,
        },
        timestamp,
      );
      return this.completeStageAndTransition(
        record,
        current,
        "experiment",
        [experimentEvidence],
        "experimenting",
        key,
        commandDigest,
        actor,
      );
    }
    if (current.status === "experimenting") {
      return this.transitionAndCommit(
        record,
        current,
        "awaiting-approval",
        "advance",
        key,
        commandDigest,
        actor,
        [],
        "closure.awaiting-approval",
      );
    }
    if (current.status === "awaiting-approval") {
      assertActorPermission(actor, "closure:control");
      this.assertHuman(actor);
      const plan = await this.requireLinkedPlan(current, actor);
      const selectedCandidateId =
        plan.decision.selectedCandidateId;
      if (!selectedCandidateId) {
        throw new ExperimentConflictError(
          "Planning did not select an eligible candidate",
        );
      }
      const approved = await this.planning.approvePlan(
        plan.id,
        selectedCandidateId,
        "Closed-loop human owner approved the frozen candidate and alternatives.",
        actor,
      );
      if (approved.status !== "approved") {
        throw new ExperimentConflictError(
          `${approved.decision.approvals.length}/${approved.decision.requiredApprovals} distinct approvals recorded`,
        );
      }
      const staged = await this.planning.stagePlan(
        approved.id,
        actor,
      );
      const deployment = await this.stageDeployment(
        current,
        staged,
        actor,
      );
      let next = refreshClosedLoopCaseFingerprint({
        ...current,
        links: {
          ...current.links,
          deploymentId: deployment.id,
        },
        fingerprint: "",
      });
      next = await this.completeStage(
        next,
        "authorization",
        [
          this.evidence(
            next,
            "authorization",
            "approval",
            staged.id,
            staged.decision,
            timestamp,
            new Date(
              now.getTime() + 24 * 3_600_000,
            ).toISOString(),
          ),
        ],
        timestamp,
      );
      next = addClosedLoopEvidence(next, [
        this.evidence(
          next,
          "deployment",
          "artifact-binding",
          deployment.id,
          deployment.artifact,
          timestamp,
          new Date(
            now.getTime() + 24 * 3_600_000,
          ).toISOString(),
        ),
      ]);
      return this.transitionAndCommit(
        record,
        next,
        "staged",
        "advance",
        key,
        commandDigest,
        actor,
        next.evidence
          .filter(
            (item) =>
              item.stage === "authorization" ||
              item.kind === "artifact-binding",
          )
          .map((item) => item.id),
        "closure.deployment-staged",
      );
    }
    if (current.status === "staged") {
      const monitored = await this.monitorDeployment(
        current,
        actor,
      );
      let next = current;
      const telemetry = monitored.environments.flatMap(
        (environment) => environment.telemetry,
      );
      next = await this.completeStage(
        next,
        "deployment",
        [
          this.evidence(
            next,
            "deployment",
            "deployment-telemetry",
            monitored.id,
            telemetry,
            timestamp,
          ),
        ],
        timestamp,
      );
      if (monitored.status === "rolled-back") {
        next = this.withRollback(
          next,
          monitored,
          "guardrail-breach",
          key,
          timestamp,
        );
        return this.transitionAndCommit(
          record,
          next,
          "rolled-back",
          "advance",
          key,
          commandDigest,
          actor,
          next.evidence
            .filter((item) => item.stage === "deployment")
            .map((item) => item.id),
          "closure.deployment-rolled-back",
        );
      }
      return this.transitionAndCommit(
        record,
        next,
        "monitoring",
        "advance",
        key,
        commandDigest,
        actor,
        next.evidence
          .filter((item) => item.stage === "deployment")
          .map((item) => item.id),
        "closure.outcome-monitoring-started",
      );
    }
    if (current.status === "monitoring") {
      const outcome = await this.outcomes.evaluateStagedPlan(
        current.links.planId!,
        actor,
      );
      let next = refreshClosedLoopCaseFingerprint({
        ...current,
        links: {
          ...current.links,
          outcomeId: outcome.id,
          lessonId: outcome.currentLessonId,
        },
        disposition: dispositionForOutcome(outcome),
        replay: {
          ...current.replay,
          terminalFingerprint: outcome.fingerprint,
          deterministic: outcome.windows.every(
            (window) => window.deterministicReplay,
          ),
        },
        fingerprint: "",
      });
      next = await this.completeStage(
        next,
        "outcome",
        [
          this.evidence(
            next,
            "outcome",
            "outcome",
            outcome.id,
            {
              evaluator: outcome.evaluator,
              windows: outcome.windows,
              verdict: outcome.verdict,
              lessonDisposition:
                outcome.lessonDisposition,
            },
            timestamp,
          ),
        ],
        timestamp,
      );
      if (outcome.verdict === "harmful") {
        const deployment = await this.rollbackDeployment(
          next,
          "Independent outcome evaluator found attributable harm.",
          actor,
        );
        next = this.withRollback(
          next,
          deployment,
          "guardrail-breach",
          key,
          timestamp,
        );
      }
      const status: ClosedLoopStatus =
        outcome.verdict === "beneficial"
          ? "verified-beneficial"
          : outcome.verdict === "harmful"
            ? "rolled-back"
            : "inconclusive";
      return this.transitionAndCommit(
        record,
        next,
        status,
        "advance",
        key,
        commandDigest,
        actor,
        next.evidence
          .filter((item) => item.stage === "outcome")
          .map((item) => item.id),
        "closure.outcome-evaluated",
      );
    }
    if (
      [
        "verified-beneficial",
        "rolled-back",
        "inconclusive",
      ].includes(current.status)
    ) {
      let outcomeReady = current;
      if (
        current.status === "rolled-back" &&
        !current.links.lessonId
      ) {
        outcomeReady = await this.completeRollbackOutcome(
          current,
          actor,
          timestamp,
        );
      }
      const lesson = await this.requireLinkedLesson(
        outcomeReady,
        actor,
      );
      let proposal: GovernedLearningProposal | undefined;
      if (
        lesson.status === "validated" &&
        lesson.recommendation === "prefer"
      ) {
        proposal = await this.outcomes.proposeGovernedChange(
          lesson.id,
          "test",
          `Regression for ${current.scenarioFamily} closed-loop evidence`,
          "Detect drift from the verified synthetic outcome before any later release.",
          actor,
        );
      }
      let next = refreshClosedLoopCaseFingerprint({
        ...outcomeReady,
        links: {
          ...outcomeReady.links,
          ...(proposal
            ? { learningProposalId: proposal.id }
            : {}),
        },
        fingerprint: "",
      });
      const learningEvidence = [
        this.evidence(
          next,
          "learning",
          "lesson",
          lesson.id,
          lesson,
          timestamp,
        ),
        ...(proposal
          ? [
              this.evidence(
                next,
                "learning",
                "learning-proposal",
                proposal.id,
                proposal,
                timestamp,
              ),
            ]
          : []),
      ];
      next = await this.completeStage(
        next,
        "learning",
        learningEvidence,
        timestamp,
      );
      return this.transitionAndCommit(
        record,
        next,
        "learned",
        "advance",
        key,
        commandDigest,
        actor,
        learningEvidence.map((item) => item.id),
        "closure.learning-governed",
      );
    }
    if (current.status === "learned") {
      if (current.links.outcomeId) {
        await this.outcomes.closeIncidentWithOutcome(
          current.links.outcomeId,
          "Every closed-loop stage and outcome disposition was verified.",
          actor,
        );
      }
      let next = await this.completeStage(
        current,
        "closure",
        [
          this.evidence(
            current,
            "closure",
            "closure",
            current.id,
            {
              disposition: current.disposition,
              links: current.links,
              guardrails: current.guardrails,
            },
            timestamp,
          ),
        ],
        timestamp,
      );
      next = refreshClosedLoopCaseFingerprint({
        ...next,
        closedAt: timestamp,
        fingerprint: "",
      });
      return this.transitionAndCommit(
        record,
        next,
        "closed",
        "advance",
        key,
        commandDigest,
        actor,
        next.evidence
          .filter((item) => item.stage === "closure")
          .map((item) => item.id),
        "closure.case-closed",
      );
    }
    if (current.status === "emergency-stopped") {
      if (!current.links.deploymentId) {
        throw new ExperimentConflictError(
          "An emergency stop before deployment must be reopened for diagnosis or cancelled; there is no external action to roll back",
        );
      }
      return this.transitionAndCommit(
        record,
        current,
        "rolled-back",
        "advance",
        key,
        commandDigest,
        actor,
        [],
        "closure.emergency-rollback-confirmed",
      );
    }
    if (current.status === "reopened") {
      return this.transitionAndCommit(
        record,
        current,
        current.control.resumeStatus ?? "monitoring",
        "advance",
        key,
        commandDigest,
        actor,
        [],
        "closure.case-resumed-after-reopen",
      );
    }
    throw new ExperimentConflictError(
      `Closed-loop case requires a control action from ${current.status}`,
    );
  }

  private async control(
    record: LifecycleRecord,
    current: ClosedLoopCase,
    command: Exclude<ClosedLoopCommand, "advance">,
    key: string,
    commandDigest: string,
    reason: string,
    actor: ExperimentActor,
  ): Promise<ClosedLoopCase> {
    const timestamp = this.now().toISOString();
    if (command === "pause") {
      if (
        ["closed", "cancelled", "paused"].includes(
          current.status,
        )
      ) {
        throw new ExperimentConflictError(
          `Cannot pause a ${current.status} case`,
        );
      }
      const next = refreshClosedLoopCaseFingerprint({
        ...current,
        control: {
          ...current.control,
          resumeStatus: current.status,
          pausedBy: actor.id,
          pauseReason: reason,
        },
        fingerprint: "",
      });
      return this.transitionAndCommit(
        record,
        next,
        "paused",
        command,
        key,
        commandDigest,
        actor,
        [],
        "closure.case-paused",
      );
    }
    if (command === "resume") {
      if (
        !["paused", "blocked", "reopened"].includes(
          current.status,
        )
      ) {
        throw new ExperimentConflictError(
          `Cannot resume a ${current.status} case`,
        );
      }
      const target =
        current.control.resumeStatus ??
        (current.status === "reopened"
          ? "monitoring"
          : undefined);
      if (!target) {
        throw new ExperimentConflictError(
          "Resume target is missing",
        );
      }
      const expiredEvidence = current.evidence.filter(
        (evidence) =>
          evidence.expiresAt &&
          Date.parse(evidence.expiresAt) <=
            Date.parse(timestamp) &&
          !current.evidence.some(
            (candidate) =>
              candidate.supersedesEvidenceId === evidence.id,
          ),
      );
      let next = refreshClosedLoopCaseFingerprint({
        ...current,
        control: {
          ...current.control,
          resumeStatus: undefined,
          pausedBy: undefined,
          pauseReason: undefined,
          blockers: [],
        },
        fingerprint: "",
      });
      if (
        current.control.blockers.some(
          (blocker) =>
            blocker.code === "stage-deadline-expired",
        )
      ) {
        next = renewCurrentClosedLoopStageDeadline(
          next,
          timestamp,
        );
      }
      if (
        current.control.blockers.some(
          (blocker) => blocker.code === "evidence-expired",
        )
      ) {
        const replacements = expiredEvidence.map(
          (evidence) =>
            this.evidence(
              next,
              evidence.stage,
              evidence.kind,
              evidence.sourceRecordId,
              {
                revalidatedEvidenceId: evidence.id,
                priorPayloadDigest: evidence.payloadDigest,
                reason,
                revalidatedBy: actor.id,
              },
              timestamp,
              new Date(
                Date.parse(timestamp) + 24 * 3_600_000,
              ).toISOString(),
              evidence.id,
            ),
        );
        next = addClosedLoopEvidence(next, replacements);
      }
      return this.transitionAndCommit(
        record,
        next,
        target,
        command,
        key,
        commandDigest,
        actor,
        [],
        "closure.case-resumed",
      );
    }
    if (command === "reopen") {
      if (
        ![
          "closed",
          "verified-beneficial",
          "rolled-back",
          "inconclusive",
          "cancelled",
        ].includes(current.status)
      ) {
        throw new ExperimentConflictError(
          `Cannot reopen a ${current.status} case`,
        );
      }
      const next = refreshClosedLoopCaseFingerprint({
        ...current,
        closedAt: undefined,
        control: {
          ...current.control,
          resumeStatus: current.links.outcomeId
            ? "monitoring"
            : "diagnosing",
          reopenCount: current.control.reopenCount + 1,
        },
        fingerprint: "",
      });
      return this.transitionAndCommit(
        record,
        next,
        "reopened",
        command,
        key,
        commandDigest,
        actor,
        [],
        "closure.case-reopened",
      );
    }
    if (command === "rollback") {
      if (
        !["staged", "monitoring"].includes(current.status)
      ) {
        throw new ExperimentConflictError(
          `Cannot roll back a ${current.status} case`,
        );
      }
      const deployment = await this.rollbackDeployment(
        current,
        reason,
        actor,
      );
      const next = this.withRollback(
        current,
        deployment,
        "manual-rollback",
        key,
        timestamp,
      );
      return this.transitionAndCommit(
        record,
        next,
        "rolled-back",
        command,
        key,
        commandDigest,
        actor,
        [],
        "closure.manual-rollback",
      );
    }
    if (command === "emergency-stop") {
      let next = current;
      if (current.links.deploymentId) {
        const deployment = await this.rollbackDeployment(
          current,
          reason,
          actor,
        );
        next = this.withRollback(
          current,
          deployment,
          "emergency-stop",
          key,
          timestamp,
        );
      } else {
        next = refreshClosedLoopCaseFingerprint({
          ...current,
          compensations: [
            ...current.compensations,
            {
              id: `compensation-${this.id()}`,
              trigger: "emergency-stop",
              action: "no-external-action",
              status: "not-required",
              idempotencyKey: key,
              completedAt: timestamp,
              detail: "Emergency stop occurred before deployment.",
            },
          ],
          fingerprint: "",
        });
      }
      next = refreshClosedLoopCaseFingerprint({
        ...next,
        control: {
          ...next.control,
          emergencyStop: true,
        },
        fingerprint: "",
      });
      return this.transitionAndCommit(
        record,
        next,
        "emergency-stopped",
        command,
        key,
        commandDigest,
        actor,
        [],
        "closure.emergency-stopped",
      );
    }
    let next = current;
    if (current.links.deploymentId) {
      const deployment = await this.rollbackDeployment(
        current,
        reason,
        actor,
      );
      next = this.withRollback(
        current,
        deployment,
        "cancel",
        key,
        timestamp,
      );
    } else {
      next = refreshClosedLoopCaseFingerprint({
        ...current,
        compensations: [
          ...current.compensations,
          {
            id: `compensation-${this.id()}`,
            trigger: "cancel",
            action: "release-resources",
            status: "completed",
            idempotencyKey: key,
            completedAt: timestamp,
            detail:
              "Reserved synthetic resources were released; no external deployment existed.",
          },
        ],
        fingerprint: "",
      });
    }
    next = refreshClosedLoopCaseFingerprint({
      ...next,
      disposition: "cancelled",
      fingerprint: "",
    });
    return this.transitionAndCommit(
      record,
      next,
      "cancelled",
      command,
      key,
      commandDigest,
      actor,
      [],
      "closure.case-cancelled",
    );
  }

  private async completeStageAndTransition(
    record: LifecycleRecord,
    current: ClosedLoopCase,
    stage: ClosedLoopStageCode,
    evidence: ClosedLoopEvidence[],
    status: ClosedLoopStatus,
    key: string,
    commandDigest: string,
    actor: ExperimentActor,
  ): Promise<ClosedLoopCase> {
    const next = await this.completeStage(
      current,
      stage,
      evidence,
      this.now().toISOString(),
    );
    return this.transitionAndCommit(
      record,
      next,
      status,
      "advance",
      key,
      commandDigest,
      actor,
      evidence.map((item) => item.id),
      `closure.${stage}-completed`,
    );
  }

  private async completeStage(
    current: ClosedLoopCase,
    stage: ClosedLoopStageCode,
    evidence: ClosedLoopEvidence[],
    timestamp: string,
  ): Promise<ClosedLoopCase> {
    let next = addClosedLoopEvidence(current, evidence);
    next = updateClosedLoopStage(next, stage, {
      status: "completed",
      occurredAt: timestamp,
    });
    return next;
  }

  private async completeRollbackOutcome(
    current: ClosedLoopCase,
    actor: ExperimentActor,
    timestamp: string,
  ): Promise<ClosedLoopCase> {
    const planId = current.links.planId;
    const deploymentId = current.links.deploymentId;
    if (!planId || !deploymentId) {
      throw new ExperimentConflictError(
        "A rolled-back case requires a staged plan and deployment before outcome learning",
      );
    }
    let next = current;
    const deploymentStage = next.stages.find(
      (stage) => stage.code === "deployment",
    );
    if (
      deploymentStage &&
      !["completed", "skipped"].includes(
        deploymentStage.status,
      )
    ) {
      const deployment = await this.requireDeploymentRecord(
        next,
        actor,
      );
      next = await this.completeStage(
        next,
        "deployment",
        [
          this.evidence(
            next,
            "deployment",
            "deployment-telemetry",
            deployment.id,
            {
              status: deployment.status,
              rollback: true,
              record: deployment.data,
            },
            timestamp,
          ),
        ],
        timestamp,
      );
    }
    const initial = await this.outcomes.evaluateStagedPlan(
      planId,
      actor,
    );
    const outcome =
      initial.verdict === "harmful"
        ? initial
        : await this.outcomes.recordLateEvidence(
            initial.id,
            {
              classification: "fact",
              source:
                "closed-loop-deployment-guardrail-monitor",
              metric: "energy",
              delta: -100,
              appliesAtOrAfterTick: 100,
              rationale:
                "Recorded synthetic deployment telemetry triggered a safe rollback and invalidated the early benefit.",
            },
            actor,
          );
    next = refreshClosedLoopCaseFingerprint({
      ...next,
      links: {
        ...next.links,
        outcomeId: outcome.id,
        lessonId: outcome.currentLessonId,
      },
      disposition: "rolled-back",
      replay: {
        ...next.replay,
        terminalFingerprint: outcome.fingerprint,
        deterministic: outcome.windows.every(
          (window) => window.deterministicReplay,
        ),
      },
      fingerprint: "",
    });
    const outcomeStage = next.stages.find(
      (stage) => stage.code === "outcome",
    );
    if (
      outcomeStage &&
      !["completed", "skipped"].includes(
        outcomeStage.status,
      )
    ) {
      next = await this.completeStage(
        next,
        "outcome",
        [
          this.evidence(
            next,
            "outcome",
            "outcome",
            outcome.id,
            {
              evaluator: outcome.evaluator,
              windows: outcome.windows,
              verdict: outcome.verdict,
              rollbackCompleted:
                next.guardrails.rollbackCompleted,
            },
            timestamp,
          ),
        ],
        timestamp,
      );
    }
    return next;
  }

  private async transitionAndCommit(
    record: LifecycleRecord,
    current: ClosedLoopCase,
    to: ClosedLoopStatus,
    command: string,
    key: string,
    commandDigest: string,
    actor: ExperimentActor,
    evidenceIds: string[],
    eventType: string,
  ): Promise<ClosedLoopCase> {
    const timestamp = this.now().toISOString();
    let next = appendClosedLoopTransition(current, {
      to,
      actorId: actor.id,
      command,
      idempotencyKey: key,
      causationId:
        current.links.outcomeId ??
        current.links.deploymentId ??
        current.links.planId ??
        current.links.diagnosisId ??
        current.links.incidentId,
      evidenceIds,
      occurredAt: timestamp,
    });
    next = refreshClosedLoopCaseFingerprint({
      ...next,
      idempotency: [
        ...next.idempotency,
        {
          key,
          commandDigest,
          command,
          resultingStatus: to,
          resultingRevision: record.revision + 1,
          completedAt: timestamp,
        },
      ],
      fingerprint: "",
    });
    await this.repository.commitLifecycleRecord({
      record: {
        ...record,
        status: next.status,
        revision: record.revision + 1,
        data: { ...next },
        updatedAt: timestamp,
      },
      expectedRevision: record.revision,
      event: this.event(
        next.id,
        CLOSED_LOOP_RECORD_KIND,
        eventType,
        actor,
        record.organizationId,
        {
          from: current.status,
          to,
          command,
          idempotencyKey: key,
          evidenceIds,
          links: next.links,
        },
        next.correlationId,
        next.transitions.at(-1)?.causationId,
      ),
    });
    return next;
  }

  private async stageDeployment(
    closedLoopCase: ClosedLoopCase,
    plan: InterventionPlan,
    actor: ExperimentActor,
  ): Promise<ClosedLoopDeploymentRecord> {
    const id = `deployment-record-${closedLoopCase.id}`;
    const existing =
      await this.repository.getLifecycleRecord(id);
    if (existing) {
      if (
        existing.workspaceId !== actorWorkspaceId(actor) ||
        existing.kind !==
          CLOSED_LOOP_DEPLOYMENT_RECORD_KIND
      ) {
        throw new ExperimentNotFoundError(
          `Deployment ${id} was not found`,
        );
      }
      return data<ClosedLoopDeploymentRecord>(existing);
    }
    const artifact = this.deploymentArtifact();
    const environments =
      [] as ClosedLoopDeploymentRecord["environments"];
    for (const environment of [
      "development",
      "staging",
      "production",
    ] as const) {
      const handle = await this.deployment.startCanary({
        workspaceId: closedLoopCase.workspaceId,
        proposalId: `${closedLoopCase.id}:${environment}`,
        artifact,
        environment,
        initialTrafficPercent:
          environment === "production" ? 5 : 10,
      });
      if (environment !== "production") {
        const telemetry =
          await this.deployment.observe(handle.deploymentId);
        if (!telemetry.healthy) {
          await this.deployment.rollback(
            handle.deploymentId,
            `${environment} pre-production telemetry failed`,
          );
          throw new ExperimentConflictError(
            `${environment} deployment failed before production`,
          );
        }
        const promoted = await this.deployment.promote(
          handle.deploymentId,
        );
        environments.push({
          environment,
          status: "promoted",
          handle: promoted,
          telemetry: [telemetry],
          startedAt: closedLoopCase.updatedAt,
          completedAt: this.now().toISOString(),
        });
      } else {
        environments.push({
          environment,
          status: "canary",
          handle,
          telemetry: [],
          startedAt: this.now().toISOString(),
        });
      }
    }
    const timestamp = this.now().toISOString();
    const deployment = refreshDeployment({
      schemaVersion: CLOSED_LOOP_DEPLOYMENT_SCHEMA_VERSION,
      id,
      caseId: closedLoopCase.id,
      planId: plan.id,
      correlationId: closedLoopCase.correlationId,
      causationId: plan.id,
      adapterId: this.deployment.id,
      artifact: closedLoopCase.releaseArtifact,
      environments,
      status: "staged",
      createdAt: timestamp,
      updatedAt: timestamp,
      synthetic: true,
    });
    await this.repository.createLifecycleRecord({
      record: {
        id,
        organizationId: closedLoopCase.organizationId,
        workspaceId: closedLoopCase.workspaceId,
        kind: CLOSED_LOOP_DEPLOYMENT_RECORD_KIND,
        status: deployment.status,
        revision: 1,
        data: { ...deployment },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      event: this.event(
        id,
        CLOSED_LOOP_DEPLOYMENT_RECORD_KIND,
        "deployment.staged",
        actor,
        closedLoopCase.organizationId,
        {
          caseId: closedLoopCase.id,
          artifactFingerprint:
            closedLoopCase.releaseArtifact.fingerprint,
          environments: environments.map(
            (environment) => ({
              environment: environment.environment,
              status: environment.status,
              deploymentId:
                environment.handle?.deploymentId,
            }),
          ),
        },
        closedLoopCase.correlationId,
        plan.id,
      ),
    });
    return deployment;
  }

  private async monitorDeployment(
    closedLoopCase: ClosedLoopCase,
    actor: ExperimentActor,
  ): Promise<ClosedLoopDeploymentRecord> {
    const record =
      await this.requireDeploymentRecord(closedLoopCase, actor);
    const current = data<ClosedLoopDeploymentRecord>(record);
    if (
      ["healthy", "rolled-back"].includes(current.status)
    ) {
      return current;
    }
    const production = current.environments.find(
      (environment) =>
        environment.environment === "production",
    );
    if (!production?.handle) {
      throw new ExperimentConflictError(
        "Production canary handle is missing",
      );
    }
    const telemetry = await this.deployment.observe(
      production.handle.deploymentId,
    );
    const timestamp = this.now().toISOString();
    let handle = production.handle;
    let status: ClosedLoopDeploymentRecord["status"];
    if (telemetry.healthy) {
      handle = await this.deployment.promote(
        production.handle.deploymentId,
      );
      production.status = "promoted";
      status = "healthy";
    } else {
      handle = await this.deployment.rollback(
        production.handle.deploymentId,
        "Synthetic production canary guardrail breach",
      );
      production.status = "rolled-back";
      status = "rolled-back";
    }
    production.handle = handle;
    production.telemetry.push(telemetry);
    production.completedAt = timestamp;
    const next = refreshDeployment({
      ...current,
      status,
      rollbackReason:
        status === "rolled-back"
          ? "Synthetic production canary guardrail breach"
          : undefined,
      updatedAt: timestamp,
      fingerprint: "",
    });
    await this.commitDeployment(
      record,
      next,
      actor,
      status === "rolled-back"
        ? "deployment.rolled-back"
        : "deployment.promoted",
      {
        telemetry,
        trafficPercent: handle.trafficPercent,
      },
    );
    return next;
  }

  private async rollbackDeployment(
    closedLoopCase: ClosedLoopCase,
    reason: string,
    actor: ExperimentActor,
  ): Promise<ClosedLoopDeploymentRecord> {
    const record =
      await this.requireDeploymentRecord(closedLoopCase, actor);
    const current = data<ClosedLoopDeploymentRecord>(record);
    if (current.status === "rolled-back") {
      return current;
    }
    const timestamp = this.now().toISOString();
    const environments = structuredClone(
      current.environments,
    );
    for (const environment of environments) {
      if (environment.handle) {
        environment.handle =
          await this.deployment.rollback(
            environment.handle.deploymentId,
            reason,
          );
        environment.status = "rolled-back";
        environment.completedAt = timestamp;
      }
    }
    const next = refreshDeployment({
      ...current,
      environments,
      status: "rolled-back",
      rollbackReason: reason,
      updatedAt: timestamp,
      fingerprint: "",
    });
    await this.commitDeployment(
      record,
      next,
      actor,
      "deployment.rolled-back",
      { reason },
    );
    return next;
  }

  private withRollback(
    current: ClosedLoopCase,
    deployment: ClosedLoopDeploymentRecord,
    trigger: ClosedLoopCompensation["trigger"],
    idempotencyKey: string,
    timestamp: string,
  ): ClosedLoopCase {
    const existing = current.compensations.find(
      (item) => item.idempotencyKey === idempotencyKey,
    );
    const compensation: ClosedLoopCompensation = {
      id: `compensation-${this.id()}`,
      trigger,
      action: "deployment-rollback",
      sourceDeploymentId: deployment.id,
      inverseEvidenceId: deployment.fingerprint,
      status: "completed",
      idempotencyKey,
      completedAt: timestamp,
      detail:
        "All synthetic environment traffic was restored to the recorded baseline.",
    };
    return refreshClosedLoopCaseFingerprint({
      ...current,
      disposition: "rolled-back",
      compensations: existing
        ? current.compensations
        : [...current.compensations, compensation],
      guardrails: {
        ...current.guardrails,
        rollbackRequired: true,
        rollbackCompleted: true,
      },
      fingerprint: "",
    });
  }

  private async commitDeployment(
    record: LifecycleRecord,
    deployment: ClosedLoopDeploymentRecord,
    actor: ExperimentActor,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.repository.commitLifecycleRecord({
      record: {
        ...record,
        status: deployment.status,
        revision: record.revision + 1,
        data: { ...deployment },
        updatedAt: deployment.updatedAt,
      },
      expectedRevision: record.revision,
      event: this.event(
        deployment.id,
        CLOSED_LOOP_DEPLOYMENT_RECORD_KIND,
        eventType,
        actor,
        record.organizationId,
        payload,
        deployment.correlationId,
        deployment.causationId,
      ),
    });
  }

  private evidence(
    closedLoopCase: ClosedLoopCase,
    stage: ClosedLoopStageCode,
    kind: ClosedLoopEvidenceKind,
    sourceRecordId: string,
    payload: unknown,
    timestamp: string,
    expiresAt?: string,
    supersedesEvidenceId?: string,
  ): ClosedLoopEvidence {
    return createClosedLoopEvidence({
      id: `closure-evidence-${this.id()}`,
      stage,
      kind,
      sourceRecordId,
      correlationId: closedLoopCase.correlationId,
      causationId:
        closedLoopCase.links.outcomeId ??
        closedLoopCase.links.deploymentId ??
        closedLoopCase.links.planId ??
        closedLoopCase.links.diagnosisId ??
        closedLoopCase.links.incidentId ??
        closedLoopCase.causationId,
      releaseArtifactFingerprint:
        closedLoopCase.releaseArtifact.fingerprint,
      payload,
      createdAt: timestamp,
      expiresAt,
      supersedesEvidenceId,
    });
  }

  private groupImpacts(
    incident: CityIncident,
  ): ClosedLoopCase["groupImpacts"] {
    const share =
      incident.impact.affectedGroupIds.length === 0
        ? 0
        : incident.impact.populationSharePercent /
          incident.impact.affectedGroupIds.length;
    return incident.impact.affectedGroupIds.map(
      (groupId, index) => ({
        groupId,
        populationSharePercent: share,
        effect: 0,
        protected:
          index < incident.impact.vulnerableGroupCount,
        severeHarm: false,
        synthetic: true,
      }),
    );
  }

  private buildNoActionCase(
    scenarioId: string,
    family: string,
    seed: string,
    title: string,
    organizationId: string,
    workspaceId: string,
    actor: ExperimentActor,
    idempotencyKey: string,
    timestamp: string,
  ): ClosedLoopCase {
    let value = createClosedLoopCase({
      id: `closed-loop-case-${scenarioId}`,
      organizationId,
      workspaceId,
      title: `${title}: no threshold incident`,
      scenarioId,
      scenarioFamily: family,
      eligibleProblem: false,
      ownerId: actor.id,
      correlationId: `corr-closed-loop-${scenarioId}`,
      causationId: `scenario-truth-${scenarioId}`,
      releaseArtifact: this.releaseArtifact,
      scenarioTruthId: scenarioId,
      seed,
      policyVersion: "closed-loop-policy-2.0.0",
      createdAt: timestamp,
    });
    value = refreshClosedLoopCaseFingerprint({
      ...value,
      detected: false,
      disposition: "no-action",
      fingerprint: "",
    });
    for (const stage of CLOSED_LOOP_STAGE_CODES) {
      const evidence = this.evidence(
        value,
        stage,
        stage === "detection" ? "observation" : "no-action",
        `${scenarioId}:${stage}`,
        {
          expectedIncident: false,
          reason:
            "No declared symptom crossed the incident threshold.",
        },
        timestamp,
      );
      value = addClosedLoopEvidence(value, [evidence]);
      value = updateClosedLoopStage(value, stage, {
        status:
          stage === "detection" || stage === "closure"
            ? "completed"
            : "skipped",
        occurredAt: timestamp,
        note: "Verified no-action baseline.",
      });
    }
    for (const [index, status] of [
      "triaged",
      "diagnosing",
      "inconclusive",
      "learned",
      "closed",
    ].entries()) {
      value = appendClosedLoopTransition(value, {
        to: status as ClosedLoopStatus,
        actorId: actor.id,
        command: "no-action",
        idempotencyKey: `${idempotencyKey}:${index}`,
        occurredAt: timestamp,
      });
    }
    return refreshClosedLoopCaseFingerprint({
      ...value,
      status: "closed",
      closedAt: timestamp,
      idempotency: [
        {
          key: idempotencyKey,
          commandDigest: closedLoopCommandDigest("start", {
            scenarioId,
          }),
          command: "start",
          resultingStatus: "closed",
          resultingRevision: 1,
          completedAt: timestamp,
        },
      ],
      fingerprint: "",
    });
  }

  private async createCaseRecord(
    value: ClosedLoopCase,
    actor: ExperimentActor,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.repository.createLifecycleRecord({
      record: {
        id: value.id,
        organizationId: value.organizationId,
        workspaceId: value.workspaceId,
        kind: CLOSED_LOOP_RECORD_KIND,
        status: value.status,
        revision: 1,
        data: { ...value },
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      },
      event: this.event(
        value.id,
        CLOSED_LOOP_RECORD_KIND,
        value.disposition === "no-action"
          ? "closure.no-action-closed"
          : "closure.case-detected",
        actor,
        value.organizationId,
        payload,
        value.correlationId,
        value.causationId,
      ),
    });
  }

  private async requireCase(
    caseId: string,
    actor: ExperimentActor,
  ): Promise<LifecycleRecord> {
    assertActorPermission(actor, "closure:read");
    const record =
      await this.repository.getLifecycleRecord(
        requiredText(caseId, "caseId", 260),
      );
    if (
      !record ||
      record.workspaceId !== actorWorkspaceId(actor) ||
      record.kind !== CLOSED_LOOP_RECORD_KIND
    ) {
      throw new ExperimentNotFoundError(
        `Closed-loop case ${caseId} was not found`,
      );
    }
    return record;
  }

  private async requireLinkedIncident(
    value: ClosedLoopCase,
    actor: ExperimentActor,
  ): Promise<CityIncident> {
    const id = value.links.incidentId;
    if (!id) {
      throw new ExperimentConflictError(
        "Closed-loop incident link is missing",
      );
    }
    const record =
      await this.repository.getLifecycleRecord(id);
    if (
      !record ||
      record.workspaceId !== actorWorkspaceId(actor) ||
      record.kind !== "city-incident"
    ) {
      throw new ExperimentNotFoundError(
        `City incident ${id} was not found`,
      );
    }
    return data<CityIncident>(record);
  }

  private async requireLinkedPlan(
    value: ClosedLoopCase,
    actor: ExperimentActor,
  ): Promise<InterventionPlan> {
    const id = value.links.planId;
    if (!id) {
      throw new ExperimentConflictError(
        "Closed-loop plan link is missing",
      );
    }
    const record =
      await this.repository.getLifecycleRecord(id);
    if (
      !record ||
      record.workspaceId !== actorWorkspaceId(actor) ||
      record.kind !== PLANNING_RECORD_KIND
    ) {
      throw new ExperimentNotFoundError(
        `Intervention plan ${id} was not found`,
      );
    }
    return data<InterventionPlan>(record);
  }

  private async requireLinkedLesson(
    value: ClosedLoopCase,
    actor: ExperimentActor,
  ): Promise<LessonRecord> {
    const id = value.links.lessonId;
    if (!id) {
      throw new ExperimentConflictError(
        "Closed-loop lesson link is missing",
      );
    }
    const record =
      await this.repository.getLifecycleRecord(id);
    if (
      !record ||
      record.workspaceId !== actorWorkspaceId(actor) ||
      record.kind !== LESSON_RECORD_KIND
    ) {
      throw new ExperimentNotFoundError(
        `Outcome lesson ${id} was not found`,
      );
    }
    return data<LessonRecord>(record);
  }

  private async requireDeploymentRecord(
    value: ClosedLoopCase,
    actor: ExperimentActor,
  ): Promise<LifecycleRecord> {
    const id = value.links.deploymentId;
    if (!id) {
      throw new ExperimentConflictError(
        "Closed-loop deployment link is missing",
      );
    }
    const record =
      await this.repository.getLifecycleRecord(id);
    if (
      !record ||
      record.workspaceId !== actorWorkspaceId(actor) ||
      record.kind !==
        CLOSED_LOOP_DEPLOYMENT_RECORD_KIND
    ) {
      throw new ExperimentNotFoundError(
        `Deployment ${id} was not found`,
      );
    }
    return record;
  }

  private deploymentArtifact(): DeploymentArtifact {
    return {
      name: `nexus-${this.releaseArtifact.packageVersion}`,
      repository: this.releaseArtifact.repository,
      commitSha: this.releaseArtifact.commitSha,
      evidenceManifestSha256:
        this.releaseArtifact.artifactDigest,
      evidenceManifestFingerprint:
        this.releaseArtifact.evidenceManifestFingerprint,
    };
  }

  private assertHuman(actor: ExperimentActor): void {
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        "Closed-loop control requires a human principal",
      );
    }
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
