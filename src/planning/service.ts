import {
  createHash,
} from "node:crypto";
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
  stableStringify,
} from "@/simulation/core/random";
import {
  CityModelService,
} from "@/city/model-service";
import {
  PUBLIC_CITY_SCENARIOS,
  materializeCityScenario,
} from "@/city/scenarios";
import {
  DiagnosisService,
} from "@/diagnosis/service";
import {
  buildInterventionPlan,
  fingerprintInterventionPlan,
  requiredPlanningApprovals,
  validateInterventionCandidate,
} from "./engine";
import type {
  InterventionCandidate,
  InterventionPlan,
  PlanningOverview,
} from "./types";

export const PLANNING_RECORD_KIND = "intervention-plan";

interface PlanningServiceOptions {
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

function boundedCost(value: number): number {
  if (!Number.isFinite(value) || value < 1 || value > 10_000) {
    throw new ExperimentValidationError(
      "maximumCost must be between 1 and 10000",
    );
  }
  return value;
}

export class PlanningService {
  private readonly now: () => Date;
  private readonly id: () => string;

  constructor(
    private readonly repository: ExperimentRepository,
    private readonly city: CityModelService,
    private readonly diagnosis: DiagnosisService,
    options: PlanningServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
  }

  async overview(actor: ExperimentActor): Promise<PlanningOverview> {
    assertActorPermission(actor, "workspace:read");
    const workspaceId = actorWorkspaceId(actor);
    const [records, events] = await Promise.all([
      this.repository.listLifecycleRecords(workspaceId, {
        kind: PLANNING_RECORD_KIND,
        limit: 200,
      }),
      this.repository.listLifecycleEvents(workspaceId, {
        aggregateKind: PLANNING_RECORD_KIND,
        limit: 400,
      }),
    ]);
    const plans = records.map((record) =>
      data<InterventionPlan>(record),
    );
    const complete = plans.filter(
      (plan) =>
        plan.candidates.some(
          (candidate) => candidate.actions.length === 0,
        ) &&
        plan.candidates.filter(
          (candidate) =>
            candidate.actions.length > 0 && candidate.valid,
        ).length >= 2,
    ).length;
    const runs = plans.flatMap((plan) =>
      plan.results.flatMap((result) => result.runs),
    );
    const guardrailStops = runs.filter(
      (run) => run.guardrailBreaches.length > 0,
    );
    return {
      schemaVersion: "nexus.planning-overview.v1",
      generatedAt: this.now().toISOString(),
      plans,
      events,
      gates: {
        plansWithNoActionAndTwoCandidatesPercent:
          plans.length === 0
            ? 100
            : (complete / plans.length) * 100,
        deterministicExperimentReplayPercent:
          runs.length === 0
            ? 100
            : (
                runs.filter((run) => run.deterministicReplay)
                  .length / runs.length
              ) * 100,
        firstSampleGuardrailStopPercent:
          guardrailStops.length === 0
            ? 100
            : (
                guardrailStops.filter((run) =>
                  run.guardrailBreaches.every(
                    (breach) =>
                      breach.sampledAtTick ===
                      plans
                        .find((plan) =>
                          plan.results.some((result) =>
                            result.runs.some(
                              (candidateRun) =>
                                candidateRun.id === run.id,
                            ),
                          ),
                        )
                        ?.design.samplingTicks[0],
                  ),
                ).length / guardrailStops.length
              ) * 100,
        stagedWithoutApprovalBudgetOrCapability: plans.filter(
          (plan) =>
            plan.status === "staged" &&
            !this.stageGates(plan).passed,
        ).length,
      },
      evidenceBoundary:
        "Plans and effects are synthetic experiment records. Staged means authorized for the lab workflow, not deployed to a real city.",
    };
  }

  async createPlanForScenario(
    scenarioId: string,
    actor: ExperimentActor,
    options: {
      maximumCost?: number;
      additionalCandidates?: InterventionCandidate[];
    } = {},
  ): Promise<InterventionPlan> {
    assertActorPermission(actor, "iterations:propose");
    const diagnosis = await this.diagnosis.diagnoseScenario(
      requiredText(scenarioId, "scenarioId", 160),
      actor,
    );
    if (!diagnosis.experimentEligibility.eligible) {
      throw new ExperimentConflictError(
        "Diagnosis is not eligible for planning",
      );
    }
    const truth = PUBLIC_CITY_SCENARIOS.find(
      (scenario) => scenario.id === scenarioId,
    );
    if (!truth) {
      throw new ExperimentNotFoundError(
        `Scenario ${scenarioId} was not found`,
      );
    }
    const scenario = materializeCityScenario(truth);
    const city = await this.city.overview(actor, scenario.world);
    const maximumCost =
      options.maximumCost === undefined
        ? 150
        : boundedCost(options.maximumCost);
    for (const candidate of options.additionalCandidates ?? []) {
      const errors = validateInterventionCandidate(candidate);
      if (errors.length > 0) {
        throw new ExperimentValidationError(
          `Invalid supplied candidate: ${errors.join("; ")}`,
        );
      }
    }
    const contextHash = createHash("sha256")
      .update(
        stableStringify({
          diagnosisFingerprint: diagnosis.fingerprint,
          maximumCost,
          candidateFingerprints: (
            options.additionalCandidates ?? []
          ).map((candidate) =>
            stableStringify(candidate.actions),
          ),
        }),
        "utf8",
      )
      .digest("hex")
      .slice(0, 16);
    const planId = `intervention-plan-${diagnosis.incidentId}-${contextHash}`;
    const existing =
      await this.repository.getLifecycleRecord(planId);
    if (existing) {
      if (
        existing.workspaceId !== actorWorkspaceId(actor) ||
        existing.kind !== PLANNING_RECORD_KIND
      ) {
        throw new ExperimentNotFoundError(
          `Plan ${planId} was not found`,
        );
      }
      return data<InterventionPlan>(existing);
    }
    const workspace =
      await this.repository.getGovernedWorkspace(
        actorWorkspaceId(actor),
      );
    if (!workspace) {
      throw new ExperimentNotFoundError(
        "Planning workspace governance was not found",
      );
    }
    const timestamp = this.now().toISOString();
    const plan = buildInterventionPlan({
      planId,
      diagnosis,
      objectives: city.objectives,
      guardrails: city.guardrails,
      stakeholderImpacts: city.snapshot.stakeholderImpacts,
      scenarioSeed: scenario.seed,
      scenarioPolicyVersion: scenario.policyVersion,
      scenarioConfiguration: scenario.configuration,
      scenarioWorld: scenario.world,
      createdAt: timestamp,
      maximumCost,
      additionalCandidates: options.additionalCandidates,
    });
    await this.repository.createLifecycleRecord({
      record: {
        id: plan.id,
        organizationId: workspace.organizationId,
        workspaceId: workspace.workspaceId,
        kind: PLANNING_RECORD_KIND,
        status: plan.status,
        revision: 1,
        data: { ...plan },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      event: this.event(
        plan.id,
        "planning.plan-created",
        actor,
        workspace.organizationId,
        {
          diagnosisId: diagnosis.id,
          candidateIds: plan.candidates.map(
            (candidate) => candidate.id,
          ),
          experimentDesignId: plan.design.id,
          selectedCandidateId:
            plan.decision.selectedCandidateId,
          budget: plan.budget,
        },
        plan.correlationId,
        diagnosis.id,
      ),
    });
    return plan;
  }

  async approvePlan(
    planId: string,
    selectedCandidateId: string,
    note: string,
    actor: ExperimentActor,
  ): Promise<InterventionPlan> {
    assertActorPermission(actor, "iterations:approve");
    this.assertHuman(actor);
    const record = await this.requirePlan(planId, actor);
    const plan = data<InterventionPlan>(record);
    if (
      !["awaiting-approval", "approved"].includes(plan.status)
    ) {
      throw new ExperimentConflictError(
        `Plan cannot be approved from ${plan.status}`,
      );
    }
    const candidate = plan.candidates.find(
      (item) => item.id === selectedCandidateId,
    );
    const result = plan.results.find(
      (item) => item.candidateId === selectedCandidateId,
    );
    if (
      !candidate ||
      candidate.actions.length === 0 ||
      !candidate.valid ||
      !result?.passed
    ) {
      throw new ExperimentValidationError(
        "Selected candidate did not pass validation and experiment gates",
      );
    }
    const scheduled = plan.schedule.find(
      (item) => item.candidateId === selectedCandidateId,
    );
    if (scheduled?.status !== "scheduled") {
      throw new ExperimentConflictError(
        `Selected candidate is ${scheduled?.status ?? "unscheduled"}`,
      );
    }
    const approvals = plan.decision.approvals.some(
      (approval) => approval.actorId === actor.id,
    )
      ? plan.decision.approvals
      : [
          ...plan.decision.approvals,
          {
            actorId: actor.id,
            role: "admin" as const,
            approvedAt: this.now().toISOString(),
            note: requiredText(note, "note"),
          },
        ];
    const requiredApprovals =
      requiredPlanningApprovals(candidate);
    const approved = approvals.length >= requiredApprovals;
    const next: InterventionPlan = {
      ...plan,
      status: approved ? "approved" : "awaiting-approval",
      decision: {
        ...plan.decision,
        selectedCandidateId,
        decision: approved ? "approved" : "pending",
        approvals,
        requiredApprovals,
        rationale:
          `${requiredText(note, "note")} ` +
          `${approvals.length}/${requiredApprovals} distinct human approval(s) recorded. ` +
          "All alternatives and rejection reasons remain frozen.",
        decidedAt: approved
          ? this.now().toISOString()
          : undefined,
      },
      fingerprint: "",
    };
    next.fingerprint = fingerprintInterventionPlan(next);
    return this.commit(
      record,
      next,
      "planning.plan-approved",
      actor,
      {
        selectedCandidateId,
        approvals: approvals.map(
          (approval) => approval.actorId,
        ),
        requiredApprovals,
        approved,
      },
    );
  }

  async requestEvidence(
    planId: string,
    note: string,
    actor: ExperimentActor,
  ): Promise<InterventionPlan> {
    assertActorPermission(actor, "iterations:approve");
    this.assertHuman(actor);
    const record = await this.requirePlan(planId, actor);
    const plan = data<InterventionPlan>(record);
    if (plan.status !== "awaiting-approval") {
      throw new ExperimentConflictError(
        `Evidence cannot be requested from ${plan.status}`,
      );
    }
    const next: InterventionPlan = {
      ...plan,
      status: "evidence-requested",
      decision: {
        ...plan.decision,
        decision: "evidence-requested",
        rationale: requiredText(note, "note"),
        decidedAt: this.now().toISOString(),
      },
      fingerprint: "",
    };
    next.fingerprint = fingerprintInterventionPlan(next);
    return this.commit(
      record,
      next,
      "planning.evidence-requested",
      actor,
      { note: next.decision.rationale },
    );
  }

  async rejectPlan(
    planId: string,
    note: string,
    actor: ExperimentActor,
  ): Promise<InterventionPlan> {
    assertActorPermission(actor, "iterations:approve");
    this.assertHuman(actor);
    const record = await this.requirePlan(planId, actor);
    const plan = data<InterventionPlan>(record);
    if (
      !["awaiting-approval", "evidence-requested"].includes(
        plan.status,
      )
    ) {
      throw new ExperimentConflictError(
        `Plan cannot be rejected from ${plan.status}`,
      );
    }
    const next: InterventionPlan = {
      ...plan,
      status: "rejected",
      decision: {
        ...plan.decision,
        decision: "rejected",
        rationale: requiredText(note, "note"),
        decidedAt: this.now().toISOString(),
      },
      fingerprint: "",
    };
    next.fingerprint = fingerprintInterventionPlan(next);
    return this.commit(
      record,
      next,
      "planning.plan-rejected",
      actor,
      { note: next.decision.rationale },
    );
  }

  async stagePlan(
    planId: string,
    actor: ExperimentActor,
  ): Promise<InterventionPlan> {
    assertActorPermission(actor, "deployment:control");
    this.assertHuman(actor);
    const record = await this.requirePlan(planId, actor);
    const plan = data<InterventionPlan>(record);
    if (plan.status !== "approved") {
      throw new ExperimentConflictError(
        `Plan cannot be staged from ${plan.status}`,
      );
    }
    const trust = (await this.diagnosis.overview(actor)).trust;
    if (!trust.automationAllowed) {
      throw new ExperimentConflictError(
        `Current diagnostic trust mode ${trust.mode} blocks staging`,
      );
    }
    const gates = this.stageGates(plan);
    if (!gates.passed) {
      throw new ExperimentConflictError(
        `Plan staging gates failed: ${gates.failures.join("; ")}`,
      );
    }
    const next: InterventionPlan = {
      ...plan,
      status: "staged",
      fingerprint: "",
    };
    next.fingerprint = fingerprintInterventionPlan(next);
    return this.commit(
      record,
      next,
      "planning.plan-staged",
      actor,
      {
        selectedCandidateId:
          next.decision.selectedCandidateId,
        budget: next.budget,
        approvalActorIds: next.decision.approvals.map(
          (approval) => approval.actorId,
        ),
      },
    );
  }

  private stageGates(plan: InterventionPlan): {
    passed: boolean;
    failures: string[];
  } {
    const failures: string[] = [];
    const selected = plan.candidates.find(
      (candidate) =>
        candidate.id === plan.decision.selectedCandidateId,
    );
    const result = plan.results.find(
      (item) =>
        item.candidateId === plan.decision.selectedCandidateId,
    );
    const scheduled = plan.schedule.find(
      (item) =>
        item.candidateId === plan.decision.selectedCandidateId,
    );
    if (!selected?.valid) {
      failures.push("selected candidate capability/DSL validation");
    }
    if (!result?.passed) {
      failures.push("selected candidate experiment");
    }
    if (scheduled?.status !== "scheduled") {
      failures.push("selected candidate budget/resource reservation");
    }
    if (
      plan.decision.decision !== "approved" ||
      plan.decision.approvals.length <
        plan.decision.requiredApprovals
    ) {
      failures.push("human approval");
    }
    if (plan.budget.remainingCost < 0) {
      failures.push("budget");
    }
    return { passed: failures.length === 0, failures };
  }

  private async requirePlan(
    planId: string,
    actor: ExperimentActor,
  ): Promise<LifecycleRecord> {
    const record =
      await this.repository.getLifecycleRecord(
        requiredText(planId, "planId", 240),
      );
    if (
      !record ||
      record.workspaceId !== actorWorkspaceId(actor) ||
      record.kind !== PLANNING_RECORD_KIND
    ) {
      throw new ExperimentNotFoundError(
        `Intervention plan ${planId} was not found`,
      );
    }
    return record;
  }

  private assertHuman(actor: ExperimentActor): void {
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        "Planning review requires a human principal",
      );
    }
  }

  private async commit(
    record: LifecycleRecord,
    plan: InterventionPlan,
    eventType: string,
    actor: ExperimentActor,
    payload: Record<string, unknown>,
  ): Promise<InterventionPlan> {
    const timestamp = this.now().toISOString();
    await this.repository.commitLifecycleRecord({
      record: {
        ...record,
        status: plan.status,
        revision: record.revision + 1,
        data: { ...plan },
        updatedAt: timestamp,
      },
      expectedRevision: record.revision,
      event: this.event(
        record.id,
        eventType,
        actor,
        record.organizationId,
        payload,
        plan.correlationId,
        record.id,
      ),
    });
    return plan;
  }

  private event(
    aggregateId: string,
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
      aggregateKind: PLANNING_RECORD_KIND,
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
