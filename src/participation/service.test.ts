// @vitest-environment node

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ExperimentNotFoundError,
  ExperimentPermissionError,
  ExperimentService,
  ExperimentValidationError,
  InMemoryExperimentRepository,
  type ExperimentActor,
} from "@/experiments";
import {
  GovernanceService,
} from "@/governance";
import {
  CityModelService,
} from "@/city/model-service";
import {
  LIFECYCLE_EVENT_SCHEMA_VERSION,
} from "@/lifecycle";
import {
  SYNTHETIC_BOUNDARY_STATEMENT,
  verifyPublicExplanationFingerprint,
} from "./engine";
import {
  ParticipationService,
  type OpenDeliberationInput,
  type ParticipationResolutionEffects,
  type StakeholderGroupWriteInput,
} from "./service";

describe("participation service", () => {
  let repository: InMemoryExperimentRepository;
  let city: CityModelService;
  let service: ParticipationService;
  let now: Date;
  let sequence: number;
  let invalidateLesson: ParticipationResolutionEffects["invalidateLesson"];
  let requestEvidence: ParticipationResolutionEffects["requestEvidence"];

  const admin: ExperimentActor = {
    id: "participation-admin",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "development",
  };
  const admin2: ExperimentActor = {
    ...admin,
    id: "participation-admin-2",
  };
  const operator: ExperimentActor = {
    id: "participation-operator",
    role: "operator",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "development",
  };
  const viewer: ExperimentActor = {
    id: "participation-viewer",
    role: "viewer",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "development",
  };
  const serviceAccount: ExperimentActor = {
    id: "participation-agent",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "service-account",
    authSource: "development",
    permissionGrants: [
      "participation:read",
      "participation:contribute",
      "participation:moderate",
      "participation:approve",
    ],
  };

  const groupInput: StakeholderGroupWriteInput = {
    name: "Synthetic Riverside Tenants",
    districtId: "district-riverside",
    incomeBand: "low",
    serviceAccess: 42,
    vulnerability: "elevated",
    populationSharePercent: 12,
    weight: 1.2,
    protectedMetrics: ["vulnerable-service-access"],
    severeBurdenThreshold: 8,
    version: "1.0.0",
  };

  function deliberationInput(): OpenDeliberationInput {
    return {
      baseObjectiveVersion: "city-objectives-1.0.0",
      baseWeight: 0.8,
      proposal: {
        metric: "energy",
        direction: "increase",
        target: 85,
        weight: 0.9,
        scope: "city",
        owner: "human:infrastructure",
      },
    };
  }

  function simulationInput(groupId: string, severeHarm = false) {
    return {
      sourceWorldFingerprint: "world-fingerprint-1",
      impacts: [
        {
          groupId,
          baselineBurden: 10,
          projectedBurden: severeHarm ? 20 : 12,
          burdenDelta: severeHarm ? 10 : 2,
          severeHarm,
          harmCodes: severeHarm ? ["severe-burden-breach"] : [],
        },
      ],
    };
  }

  beforeEach(async () => {
    repository = new InMemoryExperimentRepository();
    now = new Date("2026-07-18T14:00:00.000Z");
    sequence = 0;
    const experiments = new ExperimentService(repository, {
      now: () => now,
      id: () => `participation-experiment-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository, {
      now: () => now,
      id: () => `participation-governance-${++sequence}`,
    });
    await governance.initialize();
    city = new CityModelService(repository, {
      now: () => now,
      id: () => `participation-city-${++sequence}`,
    });
    await city.initialize();
    invalidateLesson =
      vi.fn<
        ParticipationResolutionEffects["invalidateLesson"]
      >();
    requestEvidence =
      vi.fn<
        ParticipationResolutionEffects["requestEvidence"]
      >();
    service = new ParticipationService(repository, city, {
      now: () => now,
      id: () => `participation-${++sequence}`,
      resolutionEffects: {
        invalidateLesson,
        requestEvidence,
      },
    });
  });

  it("runs the deliberation happy path with audited events and a real objective", async () => {
    const group = await service.registerStakeholderGroup(
      operator,
      groupInput,
    );
    expect(group.status).toBe("active");
    await expect(
      service.supersedeStakeholderGroup(operator, group.id, groupInput),
    ).rejects.toThrow(/same-group-version/);
    const superseded = await service.supersedeStakeholderGroup(
      operator,
      group.id,
      { ...groupInput, version: "2.0.0" },
    );
    expect(superseded.version).toBe("2.0.0");
    expect(superseded.status).toBe("active");

    const deliberation = await service.openDeliberation(
      admin,
      deliberationInput(),
    );
    expect(deliberation.status).toBe("open");
    expect(deliberation.proposerPrincipal).toBe("human");
    expect(deliberation.weightDelta).toBeCloseTo(0.1);

    const withStatement = await service.addDeliberationStatement(
      admin,
      deliberation.id,
      {
        stance: "support",
        text: "Supports the energy target increase.",
      },
    );
    expect(withStatement.statements).toHaveLength(1);

    const simulated = await service.simulateDeliberation(
      operator,
      deliberation.id,
    );
    expect(simulated.status).toBe("simulated");
    expect(simulated.simulation?.severeHarmGroupIds).toEqual([]);
    expect(
      simulated.simulation?.sourceWorldFingerprint,
    ).toMatch(/^[a-f0-9]{64}$/);

    const decided = await service.decideDeliberation(
      admin,
      deliberation.id,
      {
        outcome: "approved",
        approvals: [{ actorId: admin.id, note: "Simulation reviewed." }],
        note: "Approved with protected metrics intact.",
      },
    );
    expect(decided.status).toBe("approved");
    expect(decided.decision?.requiredApprovals).toBe(1);
    expect(decided.decision?.approvals[0]).toMatchObject({
      actorId: admin.id,
      role: "admin",
    });

    const applied = await service.applyDeliberation(admin, deliberation.id);
    expect(applied.status).toBe("applied");
    expect(applied.appliedObjectiveVersion).toBeDefined();
    const cityOverview = await city.overview(admin);
    const objective = cityOverview.objectives.find(
      (candidate) =>
        candidate.version === applied.appliedObjectiveVersion,
    );
    expect(objective).toBeDefined();
    expect(objective?.metric).toBe("energy");
    expect(objective?.name).toBe("Deliberated energy");
    await expect(
      service.applyDeliberation(admin, deliberation.id),
    ).rejects.toThrow(/cannot be applied/);

    const groupEvents = await repository.listLifecycleEvents(
      admin.workspaceId!,
      { aggregateId: group.id },
    );
    expect(groupEvents.map((event) => event.type)).toEqual([
      "participation.stakeholder-group-registered",
      "participation.stakeholder-group-superseded",
    ]);
    const deliberationEvents = await repository.listLifecycleEvents(
      admin.workspaceId!,
      { aggregateId: deliberation.id },
    );
    expect(deliberationEvents.map((event) => event.type)).toEqual([
      "participation.deliberation-opened",
      "participation.deliberation-statement-added",
      "participation.deliberation-simulated",
      "participation.deliberation-decided",
      "participation.deliberation-applied",
    ]);
  });

  it("rejects moderation and approval without the required permissions", async () => {
    await expect(
      service.triageFeedback(viewer, "feedback-case-x", {}),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
    await expect(
      service.decideDeliberation(serviceAccount, "goal-deliberation-x", {
        outcome: "approved",
        approvals: [{ actorId: serviceAccount.id }],
        note: "Service accounts must never approve.",
      }),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
    await expect(
      service.registerStakeholderGroup(viewer, groupInput),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
    await expect(
      service.addDeliberationStatement(admin, "goal-deliberation-missing", {
        stance: "support",
        text: "Missing deliberation.",
      }),
    ).rejects.toBeInstanceOf(ExperimentNotFoundError);
  });

  it("requires simulation and discussion before any decision", async () => {
    const needsSimulation = await service.openDeliberation(
      admin,
      deliberationInput(),
    );
    await service.addDeliberationStatement(admin, needsSimulation.id, {
      stance: "question",
      text: "What is the rebound effect?",
    });
    await expect(
      service.decideDeliberation(admin, needsSimulation.id, {
        outcome: "approved",
        approvals: [{ actorId: admin.id }],
        note: "Attempt without simulation.",
      }),
    ).rejects.toThrow(/deliberation-requires-simulation/);

    const needsDiscussion = await service.openDeliberation(
      admin,
      deliberationInput(),
    );
    await service.attachDeliberationSimulation(
      operator,
      needsDiscussion.id,
      simulationInput("synthetic-service-limited"),
    );
    await expect(
      service.decideDeliberation(admin, needsDiscussion.id, {
        outcome: "approved",
        approvals: [{ actorId: admin.id }],
        note: "Attempt without discussion.",
      }),
    ).rejects.toThrow(/deliberation-requires-discussion/);
  });

  it("enforces distinct approvers and double approval for agent weight increases", async () => {
    const human = await service.openDeliberation(
      admin,
      deliberationInput(),
    );
    await service.addDeliberationStatement(admin, human.id, {
      stance: "support",
      text: "Support.",
    });
    await service.attachDeliberationSimulation(
      operator,
      human.id,
      simulationInput("synthetic-service-limited"),
    );
    await expect(
      service.decideDeliberation(admin, human.id, {
        outcome: "approved",
        approvals: [{ actorId: admin.id }, { actorId: admin.id }],
        note: "Duplicate approver.",
      }),
    ).rejects.toThrow(/distinct-approvers/);

    const agentProposal = await service.openDeliberation(
      serviceAccount,
      deliberationInput(),
    );
    expect(agentProposal.proposerPrincipal).toBe("service-account");
    expect(agentProposal.weightDelta).toBeGreaterThan(0);
    await service.addDeliberationStatement(admin, agentProposal.id, {
      stance: "support",
      text: "Support with conditions.",
    });
    await service.attachDeliberationSimulation(
      operator,
      agentProposal.id,
      simulationInput("synthetic-service-limited"),
    );
    const firstApproval = await service.decideDeliberation(
      admin,
      agentProposal.id,
      {
        outcome: "approved",
        approvals: [{ actorId: admin.id }],
        note: "First approval for agent weight increase.",
      },
    );
    expect(firstApproval.status).toBe("simulated");
    expect(firstApproval.pendingApprovals).toHaveLength(1);
    await expect(
      service.decideDeliberation(admin2, agentProposal.id, {
        outcome: "approved",
        approvals: [{ actorId: admin.id }],
        note: "Deciding admin must self-approve.",
      }),
    ).rejects.toThrow(/decision-requires-own-approval/);
    const decided = await service.decideDeliberation(
      admin2,
      agentProposal.id,
      {
        outcome: "approved",
        approvals: [{ actorId: admin2.id, note: "Second." }],
        note: "Two distinct human admins.",
      },
    );
    expect(decided.status).toBe("approved");
    expect(decided.decision?.requiredApprovals).toBe(2);
  });

  it("blocks approval when the simulation shows severe group harm", async () => {
    const deliberation = await service.openDeliberation(
      admin,
      deliberationInput(),
    );
    await service.addDeliberationStatement(admin, deliberation.id, {
      stance: "oppose",
      text: "The burden shift harms riverside tenants.",
    });
    const simulated = await service.attachDeliberationSimulation(
      operator,
      deliberation.id,
      simulationInput("synthetic-service-limited", true),
    );
    expect(simulated.simulation?.severeHarmGroupIds).toEqual([
      "synthetic-service-limited",
    ]);
    await expect(
      service.decideDeliberation(admin, deliberation.id, {
        outcome: "approved",
        approvals: [{ actorId: admin.id }],
        note: "Attempt to approve severe harm.",
      }),
    ).rejects.toThrow(/severe-group-harm-blocks-approval/);
    const rejected = await service.decideDeliberation(
      admin,
      deliberation.id,
      {
        outcome: "rejected",
        approvals: [{ actorId: admin.id }],
        note: "Rejected because protected groups suffer severe harm.",
      },
    );
    expect(rejected.status).toBe("rejected");
    expect(rejected.minorityOpinions).toHaveLength(1);
  });

  it("tracks the feedback lifecycle with SLA fields and breach detection", async () => {
    const feedback = await service.submitFeedback(viewer, {
      kind: "correction",
      target: { kind: "incident", id: "city-incident-reference" },
      summary: "The recorded energy value looks stale.",
    });
    expect(feedback.status).toBe("submitted");
    expect(feedback.slaHours).toBe(72);
    expect(feedback.slaDueAt).toBe(
      new Date(now.getTime() + 72 * 3_600_000).toISOString(),
    );
    expect(feedback.breachedSla).toBe(false);

    const triaged = await service.triageFeedback(operator, feedback.id, {});
    expect(triaged.status).toBe("triaged");
    expect(triaged.owner).toBe(operator.id);
    const reviewing = await service.startFeedbackReview(
      operator,
      feedback.id,
    );
    expect(reviewing.status).toBe("in-review");
    const answered = await service.respondFeedback(operator, feedback.id, {
      text: "Replay confirmed the value; evidence attached.",
    });
    expect(answered.status).toBe("answered");
    expect(answered.response?.respondedBy).toBe(operator.id);
    const closed = await service.closeFeedback(operator, feedback.id);
    expect(closed.status).toBe("closed");

    const stale = await service.submitFeedback(viewer, {
      kind: "objection",
      target: { kind: "decision", id: "intervention-plan-reference" },
      summary: "The selection rationale omits the cost overrun.",
    });
    now = new Date(now.getTime() + 49 * 3_600_000);
    const overview = await service.overview(admin);
    expect(overview.summary.breachedSlaCount).toBe(1);
    expect(overview.summary.openFeedbackCount).toBe(1);
    expect(
      overview.feedbackCases.find(
        (candidate) => candidate.id === stale.id,
      )?.status,
    ).toBe("submitted");

    const dismissed = await service.dismissFeedback(operator, stale.id, {
      note: "Duplicate of an answered case.",
    });
    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.resolution?.outcome).toBe("dismissed");

    const premature = await service.submitFeedback(viewer, {
      kind: "evidence",
      target: { kind: "outcome", id: "outcome-reference" },
      summary: "Additional counterfactual window attached.",
    });
    await expect(
      service.closeFeedback(operator, premature.id),
    ).rejects.toThrow(/invalid-feedback-transition/);
    await expect(
      service.closeFeedback(operator, premature.id),
    ).rejects.toBeInstanceOf(ExperimentValidationError);
  });

  it("reopens the incident when an appeal is overturned", async () => {
    const incident = await city.injectScenario(
      "city-infrastructure-cascade",
      admin,
    );
    await city.transitionIncident(
      incident!.id,
      "triaged",
      "Triage assigned to grid operators.",
      admin,
    );
    await city.transitionIncident(
      incident!.id,
      "investigating",
      "Counterfactual replay underway.",
      admin,
    );
    await city.transitionIncident(
      incident!.id,
      "resolved",
      "Mitigation completed.",
      admin,
    );

    const objection = await service.submitFeedback(viewer, {
      kind: "objection",
      target: { kind: "incident", id: incident!.id },
      summary: "The resolution ignored the substation cascade risk.",
    });
    await service.triageFeedback(operator, objection.id, {});
    await service.startFeedbackReview(operator, objection.id);
    await service.respondFeedback(operator, objection.id, {
      text: "Reviewed with the grid replay.",
    });

    const appeal = await service.submitFeedback(viewer, {
      kind: "appeal",
      appealOfCaseId: objection.id,
      summary: "The answer did not address the cascade evidence.",
    });
    expect(appeal.status).toBe("appealed");
    expect(appeal.appealOfCaseId).toBe(objection.id);
    expect(appeal.target).toEqual(objection.target);
    expect(
      (await repository.getLifecycleRecord(objection.id))?.status,
    ).toBe("appealed");

    const resolved = await service.resolveAppeal(admin, appeal.id, {
      outcome: "overturned",
      actions: [{ type: "reopen-incident", incidentId: incident!.id }],
      note: "Cascade evidence was not addressed.",
    });
    expect(resolved.status).toBe("overturned");
    expect(resolved.resolution?.actions).toEqual([
      { type: "reopen-incident", incidentId: incident!.id },
    ]);
    expect(resolved.resolution?.resolvedBy).toBe(admin.id);
    expect(
      (await repository.getLifecycleRecord(incident!.id))?.status,
    ).toBe("detected");
    const incidentEvents = await repository.listLifecycleEvents(
      admin.workspaceId!,
      { aggregateId: incident!.id },
    );
    expect(incidentEvents.map((event) => event.type)).toContain(
      "city-incident.reopened",
    );
    const appealEvents = await repository.listLifecycleEvents(
      admin.workspaceId!,
      { aggregateId: appeal.id },
    );
    expect(appealEvents.map((event) => event.type)).toEqual([
      "participation.feedback-submitted",
      "participation.appeal-resolved",
    ]);
  });

  it("requires concrete actions and matching targets for overturned appeals", async () => {
    const objection = await service.submitFeedback(viewer, {
      kind: "objection",
      target: { kind: "lesson", id: "lesson-synthetic-1" },
      summary: "This lesson contradicts the replay evidence.",
    });
    await service.triageFeedback(operator, objection.id, {});
    await service.startFeedbackReview(operator, objection.id);
    await service.respondFeedback(operator, objection.id, {
      text: "Lesson reviewed and kept.",
    });
    const appeal = await service.submitFeedback(operator, {
      kind: "appeal",
      appealOfCaseId: objection.id,
      summary: "The review ignored the contradictory replay.",
    });

    await expect(
      service.resolveAppeal(admin, appeal.id, {
        outcome: "overturned",
        actions: [],
        note: "Overturn without any action.",
      }),
    ).rejects.toThrow(/appeal-overturn-requires-action/);
    await expect(
      service.resolveAppeal(admin, appeal.id, {
        outcome: "overturned",
        actions: [
          { type: "reopen-incident", incidentId: "city-incident-x" },
        ],
        note: "Action targets the wrong kind.",
      }),
    ).rejects.toThrow(/resolution-action-target-mismatch/);
    await expect(
      service.resolveAppeal(admin, appeal.id, {
        outcome: "overturned",
        actions: [
          {
            type: "invalidate-lesson",
            lessonId: "lesson-synthetic-other",
          },
        ],
        note: "Action targets a different lesson.",
      }),
    ).rejects.toThrow(/resolution-action-id-mismatch/);

    const resolved = await service.resolveAppeal(admin, appeal.id, {
      outcome: "overturned",
      actions: [
        { type: "invalidate-lesson", lessonId: "lesson-synthetic-1" },
      ],
      note: "Lesson invalidated pending outcome review.",
    });
    expect(resolved.status).toBe("overturned");
    expect(resolved.resolution?.actions).toEqual([
      { type: "invalidate-lesson", lessonId: "lesson-synthetic-1" },
    ]);
    expect(invalidateLesson).toHaveBeenCalledWith(
      "lesson-synthetic-1",
      expect.stringContaining(`Overturned appeal ${appeal.id}`),
      admin,
    );
    const events = await repository.listLifecycleEvents(
      admin.workspaceId!,
      { aggregateId: appeal.id },
    );
    const resolvedEvent = events.find(
      (event) => event.type === "participation.appeal-resolved",
    );
    expect(resolvedEvent?.payload.actions).toEqual([
      { type: "invalidate-lesson", lessonId: "lesson-synthetic-1" },
    ]);
  });

  it("rejects appeals on cases that were never answered", async () => {
    const feedback = await service.submitFeedback(viewer, {
      kind: "correction",
      target: { kind: "objective", id: "objective-energy-continuity" },
      summary: "The target value is outdated.",
    });
    await expect(
      service.submitFeedback(viewer, {
        kind: "appeal",
        appealOfCaseId: feedback.id,
        summary: "Appeal before any answer.",
      }),
    ).rejects.toThrow(/invalid-feedback-transition/);
    await expect(
      service.submitFeedback(viewer, {
        kind: "appeal",
        appealOfCaseId: "feedback-case-missing",
        summary: "Appeal of a missing case.",
      }),
    ).rejects.toBeInstanceOf(ExperimentNotFoundError);
  });

  it("publishes decision explanations that reconstruct from structured facts", async () => {
    const workspace = await repository.getGovernedWorkspace(
      admin.workspaceId!,
    );
    const organizationId = workspace!.organizationId;
    const plan = {
      schemaVersion: "nexus.intervention-plan.v1",
      id: "intervention-plan-test-1",
      correlationId: "corr-intervention-plan-test-1",
      status: "approved",
      policyVersion: "city-policy-3.1.0",
      budget: {
        maximumCost: 150,
        reservedCost: 40,
        remainingCost: 110,
      },
      candidates: [
        { id: "candidate-no-action" },
        { id: "candidate-grid-uprate" },
      ],
      decision: {
        selectedCandidateId: "candidate-grid-uprate",
        decision: "approved",
        approvals: [
          {
            actorId: admin.id,
            role: "admin",
            approvedAt: now.toISOString(),
            note: "Evidence sufficient.",
          },
        ],
        requiredApprovals: 1,
        rationale: "Best Pareto benefit within budget.",
        rejectedCandidates: [
          {
            candidateId: "candidate-no-action",
            reasons: ["insufficient-benefit"],
          },
        ],
        decidedAt: now.toISOString(),
      },
      synthetic: true,
      fingerprint: "plan-fingerprint",
    };
    await repository.createLifecycleRecord({
      record: {
        id: plan.id,
        organizationId,
        workspaceId: admin.workspaceId!,
        kind: "intervention-plan",
        status: "approved",
        revision: 1,
        data: { ...plan },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      event: {
        id: `${plan.id}-created`,
        organizationId,
        workspaceId: admin.workspaceId!,
        aggregateId: plan.id,
        aggregateKind: "intervention-plan",
        type: "planning.plan-created",
        actorId: admin.id,
        correlationId: plan.correlationId,
        occurredAt: now.toISOString(),
        schemaVersion: LIFECYCLE_EVENT_SCHEMA_VERSION,
        payload: {},
      },
    });

    const explanation = await service.publishExplanation(operator, {
      subject: { kind: "decision", id: plan.id },
    });
    expect(explanation.subject).toEqual({
      kind: "decision",
      id: plan.id,
    });
    expect(explanation.facts).toEqual(
      expect.arrayContaining([
        { code: "plan-status", subject: plan.id, value: "approved" },
        {
          code: "selected-candidate",
          subject: plan.id,
          value: "candidate-grid-uprate",
        },
        { code: "candidate-count", subject: plan.id, value: 2 },
        { code: "required-approvals", subject: plan.id, value: 1 },
        { code: "approvals-count", subject: plan.id, value: 1 },
        {
          code: "policy-version",
          subject: plan.id,
          value: "city-policy-3.1.0",
        },
        { code: "budget-maximum-cost", subject: plan.id, value: 150 },
      ]),
    );
    expect(explanation.options).toEqual([
      {
        optionId: "candidate-no-action",
        selected: false,
        rejectionCodes: ["insufficient-benefit"],
      },
      {
        optionId: "candidate-grid-uprate",
        selected: true,
        rejectionCodes: [],
      },
    ]);
    expect(explanation.authorization).toEqual({
      approverIds: [admin.id],
      policyVersion: "city-policy-3.1.0",
      evidenceRefs: [],
    });
    expect(explanation.outcomeRef).toEqual({ kind: "pending" });
    expect(explanation.uncertaintyCodes).toEqual([
      "synthetic-projection",
    ]);
    expect(explanation.generator).toBe("structured-facts");
    expect(verifyPublicExplanationFingerprint(explanation)).toBe(true);
    expect(
      verifyPublicExplanationFingerprint({
        ...explanation,
        fingerprint: "tampered-fingerprint",
      }),
    ).toBe(false);
    expect(
      verifyPublicExplanationFingerprint({
        ...explanation,
        facts: [
          ...explanation.facts,
          { code: "injected", subject: plan.id, value: "forged" },
        ],
      }),
    ).toBe(false);
    await expect(
      service.publishExplanation(operator, {
        subject: { kind: "decision", id: "intervention-plan-missing" },
      }),
    ).rejects.toBeInstanceOf(ExperimentNotFoundError);
  });

  it("aggregates overview counts and lets viewers read and contribute", async () => {
    await service.registerStakeholderGroup(operator, groupInput);
    await service.openDeliberation(viewer, deliberationInput());
    await service.submitFeedback(viewer, {
      kind: "correction",
      target: { kind: "incident", id: "city-incident-reference" },
      summary: "Viewer-submitted correction is allowed.",
    });

    const overview = await service.overview(viewer);
    expect(overview.summary).toEqual({
      activeGroupCount: 1,
      openDeliberationCount: 1,
      openFeedbackCount: 1,
      breachedSlaCount: 0,
    });
    expect(overview.stakeholderGroups).toHaveLength(1);
    expect(overview.deliberations).toHaveLength(1);
    expect(overview.feedbackCases).toHaveLength(1);
    expect(overview.redTeam).toBeNull();
    expect(overview.syntheticBoundary).toBe(
      SYNTHETIC_BOUNDARY_STATEMENT,
    );
    expect(
      overview.events.some(
        (event) =>
          event.type === "participation.deliberation-opened",
      ),
    ).toBe(true);

    now = new Date(now.getTime() + 73 * 3_600_000);
    const later = await service.overview(viewer);
    expect(later.summary.breachedSlaCount).toBe(1);
  });
});
