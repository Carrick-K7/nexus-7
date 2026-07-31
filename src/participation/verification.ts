import {
  createHash,
} from "node:crypto";
import type {
  SyntheticStakeholderImpact,
} from "@/city/types";
import {
  CityModelService,
} from "@/city/model-service";
import {
  ExperimentPermissionError,
  ExperimentService,
  InMemoryExperimentRepository,
  type ExperimentActor,
} from "@/experiments";
import {
  GovernanceService,
} from "@/governance";
import {
  DiagnosisService,
} from "@/diagnosis/service";
import {
  PlanningService,
} from "@/planning/service";
import {
  OutcomeLearningService,
} from "@/outcomes/service";
import {
  LIFECYCLE_EVENT_SCHEMA_VERSION,
} from "@/lifecycle";
import {
  stableStringify,
} from "@/simulation/core/random";
import {
  GOVERNANCE_ATTACK_CONTROLS,
  GOVERNANCE_ATTACK_KINDS,
  assessStakeholderImpacts,
  buildStakeholderGroup,
  renderExplanationLines,
  verifyPublicExplanationFingerprint,
} from "./engine";
import {
  ParticipationService,
  type DeliberationSimulationInput,
  type OpenDeliberationInput,
  type StakeholderGroupWriteInput,
} from "./service";
import {
  GOVERNANCE_RED_TEAM_SCHEMA_VERSION,
  PARTICIPATION_ACCEPTANCE_SCHEMA_VERSION,
  type FeedbackResolutionAction,
  type GoalDeliberation,
  type GovernanceAttackResult,
  type GovernanceRedTeamReport,
  type ParticipationAcceptanceReport,
  type PublicExplanation,
} from "./types";

const WORKSPACE_ID = "workspace-neo-angeles";

const admin: ExperimentActor = {
  id: "participation-admin",
  role: "admin",
  workspaceId: WORKSPACE_ID,
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
  workspaceId: WORKSPACE_ID,
  principalType: "human",
  authSource: "development",
};
const viewer: ExperimentActor = {
  id: "participation-viewer",
  role: "viewer",
  workspaceId: WORKSPACE_ID,
  principalType: "human",
  authSource: "development",
};
const serviceAccount: ExperimentActor = {
  id: "participation-agent",
  role: "admin",
  workspaceId: WORKSPACE_ID,
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

function simulationInput(
  groupId: string,
  severeHarm = false,
): DeliberationSimulationInput {
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

async function rejectedWithCode(
  operation: Promise<unknown>,
  code: string,
): Promise<boolean> {
  try {
    await operation;
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes(code);
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function fingerprintOf(value: object): string {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

export async function verifyParticipationAcceptance(
  now = new Date("2026-07-18T14:00:00.000Z"),
): Promise<ParticipationAcceptanceReport> {
  const generatedAt = now.toISOString();
  const repository = new InMemoryExperimentRepository();
  let sequence = 0;
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
  const city = new CityModelService(repository, {
    now: () => now,
    id: () => `participation-city-${++sequence}`,
  });
  await city.initialize();
  const diagnosis = new DiagnosisService(repository, city, {
    now: () => now,
    id: () => `participation-diagnosis-${++sequence}`,
  });
  await diagnosis.initialize();
  const planning = new PlanningService(
    repository,
    city,
    diagnosis,
    {
      now: () => now,
      id: () => `participation-planning-${++sequence}`,
    },
  );
  const outcomes = new OutcomeLearningService(
    repository,
    city,
    diagnosis,
    {
      now: () => now,
      id: () => `participation-outcome-${++sequence}`,
    },
  );
  const service = new ParticipationService(repository, city, {
    now: () => now,
    id: () => `participation-${++sequence}`,
    resolutionEffects: {
      invalidateLesson: (
        lessonId,
        rationale,
        actor,
      ) => outcomes.invalidateLesson(lessonId, rationale, actor),
      requestEvidence: (
        planId,
        note,
        actor,
      ) => planning.requestEvidence(planId, note, actor),
    },
  });

  async function openSimulatedDeliberation(
    proposer: ExperimentActor,
    options: { severeHarm?: boolean; withStatement?: boolean } = {},
  ): Promise<GoalDeliberation> {
    const deliberation = await service.openDeliberation(
      proposer,
      deliberationInput(),
    );
    if (options.withStatement ?? true) {
      await service.addDeliberationStatement(admin, deliberation.id, {
        stance: "support",
        text: "Statement for the acceptance flow.",
      });
    }
    await service.attachDeliberationSimulation(
      operator,
      deliberation.id,
      simulationInput(
        "synthetic-service-limited",
        options.severeHarm ?? false,
      ),
    );
    return deliberation;
  }

  // 1. Stakeholder groups are versioned; superseding requires a new version.
  const group = await service.registerStakeholderGroup(operator, groupInput);
  const sameVersionRejected = await rejectedWithCode(
    service.supersedeStakeholderGroup(operator, group.id, groupInput),
    "same-group-version",
  );
  const superseded = await service.supersedeStakeholderGroup(
    operator,
    group.id,
    { ...groupInput, version: "2.0.0" },
  );
  const stakeholderGroupsVersioned =
    group.status === "active" &&
    sameVersionRejected &&
    superseded.version === "2.0.0" &&
    superseded.status === "active";

  // 2. A positive population average never classifies as beneficial while a
  // protected group suffers severe harm.
  const majorityGroup = buildStakeholderGroup({
    id: "acceptance-group-majority",
    name: "Synthetic Uptown Owners",
    districtId: "district-uptown",
    incomeBand: "high",
    serviceAccess: 88,
    vulnerability: "standard",
    populationSharePercent: 88,
    weight: 1,
    protectedMetrics: ["energy"],
    severeBurdenThreshold: 50,
    version: "1.0.0",
    effectiveAt: generatedAt,
  });
  const minorityGroup = buildStakeholderGroup({
    id: "acceptance-group-minority",
    name: "Synthetic Riverside Tenants",
    districtId: "district-riverside",
    incomeBand: "low",
    serviceAccess: 42,
    vulnerability: "elevated",
    populationSharePercent: 12,
    weight: 1,
    protectedMetrics: ["vulnerable-service-access"],
    severeBurdenThreshold: 8,
    version: "1.0.0",
    effectiveAt: generatedAt,
  });
  const impactFor = (
    group: typeof majorityGroup,
    burden: number,
  ): SyntheticStakeholderImpact => ({
    groupId: group.id,
    districtId: group.districtId,
    incomeBand: group.incomeBand,
    vulnerability: group.vulnerability,
    populationSharePercent: group.populationSharePercent,
    serviceAccess: group.serviceAccess,
    burden,
    synthetic: true,
  });
  const decomposition = assessStakeholderImpacts(
    [majorityGroup, minorityGroup],
    [impactFor(majorityGroup, 20), impactFor(minorityGroup, 10)],
    [impactFor(majorityGroup, 15), impactFor(minorityGroup, 20)],
  );
  const severeHarmBlocksBeneficial =
    decomposition.averageDelta > 0 &&
    decomposition.severeHarmGroupIds.length === 1 &&
    decomposition.severeHarmGroupIds[0] === minorityGroup.id &&
    decomposition.beneficial === false;

  // 3. A decision without an attached simulation is rejected.
  const needsSimulation = await service.openDeliberation(
    admin,
    deliberationInput(),
  );
  await service.addDeliberationStatement(admin, needsSimulation.id, {
    stance: "question",
    text: "What is the rebound effect?",
  });
  const deliberationRequiresSimulation = await rejectedWithCode(
    service.decideDeliberation(admin, needsSimulation.id, {
      outcome: "approved",
      approvals: [{ actorId: admin.id }],
      note: "Attempt without simulation.",
    }),
    "deliberation-requires-simulation",
  );

  // 4. A simulated deliberation without any statement is rejected.
  const needsDiscussion = await service.openDeliberation(
    admin,
    deliberationInput(),
  );
  await service.attachDeliberationSimulation(
    operator,
    needsDiscussion.id,
    simulationInput("synthetic-service-limited"),
  );
  const deliberationRequiresDiscussion = await rejectedWithCode(
    service.decideDeliberation(admin, needsDiscussion.id, {
      outcome: "approved",
      approvals: [{ actorId: admin.id }],
      note: "Attempt without discussion.",
    }),
    "deliberation-requires-discussion",
  );

  // 5. A service-account weight increase needs two distinct human approvals.
  const agentProposal = await service.openDeliberation(
    serviceAccount,
    deliberationInput(),
  );
  await service.addDeliberationStatement(admin, agentProposal.id, {
    stance: "support",
    text: "Support with conditions.",
  });
  await service.attachDeliberationSimulation(
    operator,
    agentProposal.id,
    simulationInput("synthetic-service-limited"),
  );
  const firstAgentApproval =
    await service.decideDeliberation(admin, agentProposal.id, {
      outcome: "approved",
      approvals: [{ actorId: admin.id }],
      note: "First authenticated approval for agent weight increase.",
    });
  const doubleApproved = await service.decideDeliberation(
    admin2,
    agentProposal.id,
    {
      outcome: "approved",
      approvals: [{ actorId: admin2.id, note: "Second." }],
      note: "Two distinct human admins.",
    },
  );
  const agentWeightIncreaseRequiresDoubleApproval =
    agentProposal.proposerPrincipal === "service-account" &&
    agentProposal.weightDelta > 0 &&
    firstAgentApproval.status === "simulated" &&
    firstAgentApproval.pendingApprovals?.[0]?.actorId ===
      admin.id &&
    doubleApproved.status === "approved" &&
    sameJson(
      doubleApproved.decision?.approvals.map(
        (approval) => approval.actorId,
      ),
      [admin.id, admin2.id],
    ) &&
    doubleApproved.decision?.requiredApprovals === 2;

  // 6. Service accounts can never decide deliberations.
  let serviceAccountApprovalDenied = false;
  try {
    await service.decideDeliberation(serviceAccount, needsDiscussion.id, {
      outcome: "approved",
      approvals: [{ actorId: serviceAccount.id }],
      note: "Service accounts must never approve.",
    });
  } catch (error) {
    serviceAccountApprovalDenied =
      error instanceof ExperimentPermissionError;
  }

  // 7. Approvals must come from distinct admins.
  const collusionTarget =
    await openSimulatedDeliberation(serviceAccount);
  await service.decideDeliberation(admin, collusionTarget.id, {
    outcome: "approved",
    approvals: [{ actorId: admin.id }],
    note: "First authenticated approval.",
  });
  const distinctApproversEnforced = await rejectedWithCode(
    service.decideDeliberation(admin, collusionTarget.id, {
      outcome: "approved",
      approvals: [{ actorId: admin.id }],
      note: "The same authenticated admin attempts a second approval.",
    }),
    "distinct-approvers",
  );

  // 8. Feedback carries SLA fields and audits every lifecycle transition.
  const feedback = await service.submitFeedback(viewer, {
    kind: "correction",
    target: { kind: "incident", id: "city-incident-reference" },
    summary: "The recorded energy value looks stale.",
  });
  await service.triageFeedback(operator, feedback.id, {});
  await service.startFeedbackReview(operator, feedback.id);
  await service.respondFeedback(operator, feedback.id, {
    text: "Replay confirmed the value; evidence attached.",
  });
  const closedFeedback = await service.closeFeedback(operator, feedback.id);
  const feedbackEvents = await repository.listLifecycleEvents(WORKSPACE_ID, {
    aggregateId: feedback.id,
  });
  const feedbackSlaAndAuditComplete =
    feedback.slaHours === 72 &&
    feedback.slaDueAt ===
      new Date(now.getTime() + 72 * 3_600_000).toISOString() &&
    feedback.breachedSla === false &&
    closedFeedback.status === "closed" &&
    sameJson(
      feedbackEvents.map((event) => event.type),
      [
        "participation.feedback-submitted",
        "participation.feedback-triaged",
        "participation.feedback-review-started",
        "participation.feedback-answered",
        "participation.feedback-closed",
      ],
    );

  // 9. An overturned appeal reopens a resolved city incident.
  const incident = await city.injectScenario(
    "city-infrastructure-cascade",
    admin,
  );
  let appealReopensIncident = false;
  if (incident) {
    await city.transitionIncident(
      incident.id,
      "triaged",
      "Triage assigned to grid operators.",
      admin,
    );
    await city.transitionIncident(
      incident.id,
      "investigating",
      "Counterfactual replay underway.",
      admin,
    );
    await city.transitionIncident(
      incident.id,
      "resolved",
      "Mitigation completed.",
      admin,
    );
    const objection = await service.submitFeedback(viewer, {
      kind: "objection",
      target: { kind: "incident", id: incident.id },
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
    const reopenAction: FeedbackResolutionAction = {
      type: "reopen-incident",
      incidentId: incident.id,
    };
    const resolvedAppeal = await service.resolveAppeal(admin, appeal.id, {
      outcome: "overturned",
      actions: [reopenAction],
      note: "Cascade evidence was not addressed.",
    });
    const incidentRecord = await repository.getLifecycleRecord(incident.id);
    appealReopensIncident =
      resolvedAppeal.status === "overturned" &&
      sameJson(resolvedAppeal.resolution?.actions, [reopenAction]) &&
      incidentRecord?.status === "detected";
  }

  // 10. An overturned appeal invokes Outcome Learning and invalidates the
  // actual lesson and its dependent playbook under that module's invariants.
  const learningPlan = await planning.createPlanForScenario(
    "city-economic-cascade",
    admin,
    { maximumCost: 500 },
  );
  await planning.approvePlan(
    learningPlan.id,
    learningPlan.decision.selectedCandidateId!,
    "Acceptance approval for appeal-linked outcome learning.",
    admin,
  );
  const stagedLearningPlan = await planning.stagePlan(
    learningPlan.id,
    admin,
  );
  const learnedOutcome = await outcomes.evaluateStagedPlan(
    stagedLearningPlan.id,
    admin,
  );
  const lessonId = learnedOutcome.currentLessonId!;
  const lessonObjection = await service.submitFeedback(viewer, {
    kind: "objection",
    target: { kind: "lesson", id: lessonId },
    summary: "This lesson contradicts the replay evidence.",
  });
  await service.triageFeedback(operator, lessonObjection.id, {});
  await service.startFeedbackReview(operator, lessonObjection.id);
  await service.respondFeedback(operator, lessonObjection.id, {
    text: "Lesson reviewed and kept.",
  });
  const lessonAppeal = await service.submitFeedback(operator, {
    kind: "appeal",
    appealOfCaseId: lessonObjection.id,
    summary: "The review ignored the contradictory replay.",
  });
  const invalidateAction: FeedbackResolutionAction = {
    type: "invalidate-lesson",
    lessonId,
  };
  const lessonResolved = await service.resolveAppeal(admin, lessonAppeal.id, {
    outcome: "overturned",
    actions: [invalidateAction],
    note: "Lesson invalidated pending outcome review.",
  });
  const lessonAppealEvents = await repository.listLifecycleEvents(
    WORKSPACE_ID,
    { aggregateId: lessonAppeal.id },
  );
  const lessonResolvedEvent = lessonAppealEvents.find(
    (event) => event.type === "participation.appeal-resolved",
  );
  const invalidatedLesson =
    await repository.getLifecycleRecord(lessonId);
  const invalidatedPlaybooks =
    await repository.listLifecycleRecords(WORKSPACE_ID, {
      kind: "response-playbook",
      limit: 20,
    });
  const appealInvalidatesLesson =
    lessonResolved.status === "overturned" &&
    sameJson(lessonResolved.resolution?.actions, [invalidateAction]) &&
    sameJson(lessonResolvedEvent?.payload.actions, [invalidateAction]) &&
    invalidatedLesson?.status === "invalidated" &&
    invalidatedPlaybooks.some(
      (record) =>
        record.status === "invalidated" &&
        (
          record.data as {
            sourceLessonIds?: string[];
          }
        ).sourceLessonIds?.includes(lessonId),
    );

  // 11. A decision appeal invokes Planning and changes the real plan to an
  // evidence-requested state instead of recording an inert action string.
  const evidencePlan = await planning.createPlanForScenario(
    "city-public-safety-cascade",
    admin,
    { maximumCost: 550 },
  );
  const evidenceObjection = await service.submitFeedback(viewer, {
    kind: "objection",
    target: { kind: "decision", id: evidencePlan.id },
    summary: "The plan needs another protected-group comparison.",
  });
  await service.triageFeedback(operator, evidenceObjection.id, {});
  await service.startFeedbackReview(operator, evidenceObjection.id);
  await service.respondFeedback(operator, evidenceObjection.id, {
    text: "The current experiment was considered sufficient.",
  });
  const evidenceAppeal = await service.submitFeedback(viewer, {
    kind: "appeal",
    appealOfCaseId: evidenceObjection.id,
    summary: "The response did not address the missing comparison.",
  });
  const evidenceAction: FeedbackResolutionAction = {
    type: "request-evidence",
    planId: evidencePlan.id,
  };
  const evidenceResolution = await service.resolveAppeal(
    admin,
    evidenceAppeal.id,
    {
      outcome: "overturned",
      actions: [evidenceAction],
      note: "Additional group evidence is required.",
    },
  );
  const evidencePlanRecord =
    await repository.getLifecycleRecord(evidencePlan.id);
  const appealRequestsEvidence =
    evidenceResolution.status === "overturned" &&
    sameJson(
      evidenceResolution.resolution?.actions,
      [evidenceAction],
    ) &&
    evidencePlanRecord?.status === "evidence-requested";

  // 12. Published explanations verify against their fingerprint and render
  // deterministically from structured facts.
  let explanation: PublicExplanation | undefined;
  let explanationReconstructibleFromFacts = false;
  const governedWorkspace =
    await repository.getGovernedWorkspace(WORKSPACE_ID);
  if (governedWorkspace) {
    const plan = {
      schemaVersion: "nexus.intervention-plan.v1",
      id: "intervention-plan-acceptance-1",
      correlationId: "corr-intervention-plan-acceptance-1",
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
            approvedAt: generatedAt,
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
        decidedAt: generatedAt,
      },
      synthetic: true,
      fingerprint: "plan-fingerprint",
    };
    await repository.createLifecycleRecord({
      record: {
        id: plan.id,
        organizationId: governedWorkspace.organizationId,
        workspaceId: WORKSPACE_ID,
        kind: "intervention-plan",
        status: "approved",
        revision: 1,
        data: { ...plan },
        createdAt: generatedAt,
        updatedAt: generatedAt,
      },
      event: {
        id: `${plan.id}-created`,
        organizationId: governedWorkspace.organizationId,
        workspaceId: WORKSPACE_ID,
        aggregateId: plan.id,
        aggregateKind: "intervention-plan",
        type: "planning.plan-created",
        actorId: admin.id,
        correlationId: plan.correlationId,
        occurredAt: generatedAt,
        schemaVersion: LIFECYCLE_EVENT_SCHEMA_VERSION,
        payload: {},
      },
    });
    explanation = await service.publishExplanation(operator, {
      subject: { kind: "decision", id: plan.id },
    });
    const outcomeExplanation =
      await service.publishExplanation(operator, {
        subject: {
          kind: "outcome",
          id: learnedOutcome.id,
        },
      });
    explanationReconstructibleFromFacts =
      explanation.generator === "structured-facts" &&
      verifyPublicExplanationFingerprint(explanation) &&
      outcomeExplanation.generator === "structured-facts" &&
      outcomeExplanation.outcomeRef?.id ===
        learnedOutcome.id &&
      outcomeExplanation.outcomeRef?.verdict ===
        learnedOutcome.verdict &&
      outcomeExplanation.options.filter(
        (option) => option.selected,
      ).length === 1 &&
      verifyPublicExplanationFingerprint(
        outcomeExplanation,
      ) &&
      sameJson(
        renderExplanationLines(explanation),
        renderExplanationLines(explanation),
      );
  }

  // 13. Every governance attack is contained by its mapped control.
  async function runGovernanceRedTeam(): Promise<GovernanceRedTeamReport> {
    const attacks: Record<
      (typeof GOVERNANCE_ATTACK_KINDS)[number],
      () => Promise<{ contained: boolean; detail: string }>
    > = {
      "approval-collusion": async () => {
        const target =
          await openSimulatedDeliberation(serviceAccount);
        await service.decideDeliberation(admin, target.id, {
          outcome: "approved",
          approvals: [{ actorId: admin.id }],
          note: "First authenticated approval.",
        });
        const contained = await rejectedWithCode(
          service.decideDeliberation(admin, target.id, {
            outcome: "approved",
            approvals: [{ actorId: admin.id }],
            note: "Reuse the same authenticated identity.",
          }),
          GOVERNANCE_ATTACK_CONTROLS["approval-collusion"],
        );
        return {
          contained,
          detail: contained
            ? "control fired: duplicate admin approvals rejected with distinct-approvers"
            : "control failed: duplicate admin approvals were accepted",
        };
      },
      "privilege-escalation": async () => {
        const target = await openSimulatedDeliberation(admin);
        let contained = false;
        try {
          await service.decideDeliberation(serviceAccount, target.id, {
            outcome: "approved",
            approvals: [{ actorId: serviceAccount.id }],
            note: "Service account escalating to approver.",
          });
        } catch (error) {
          contained = error instanceof ExperimentPermissionError;
        }
        return {
          contained,
          detail: contained
            ? "control fired: service-account decision denied with a permission error"
            : "control failed: service-account decision was accepted",
        };
      },
      "evidence-forgery": async () => {
        if (!explanation) {
          return {
            contained: false,
            detail:
              "control untested: no published explanation was available to forge",
          };
        }
        const contained = !verifyPublicExplanationFingerprint({
          ...explanation,
          fingerprint: "forged-fingerprint",
        });
        return {
          contained,
          detail: contained
            ? "control fired: tampered explanation fingerprint fails verification"
            : "control failed: tampered explanation fingerprint still verifies",
        };
      },
      "goal-gaming": async () => {
        const target = await openSimulatedDeliberation(serviceAccount);
        const firstApproval =
          await service.decideDeliberation(admin, target.id, {
            outcome: "approved",
            approvals: [{ actorId: admin.id }],
            note: "Single approval gaming an agent weight increase.",
          });
        const contained =
          firstApproval.status === "simulated" &&
          firstApproval.pendingApprovals?.length === 1 &&
          firstApproval.decision === undefined;
        return {
          contained,
          detail: contained
            ? "control fired: one authenticated approval is retained as pending and cannot apply an agent-raised objective weight"
            : "control failed: agent weight increase passed with a single authenticated approval",
        };
      },
      "alert-suppression": async () => {
        const target = await service.submitFeedback(viewer, {
          kind: "correction",
          target: { kind: "incident", id: "city-incident-suppression" },
          summary: "Attempt to suppress this alert by closing it unread.",
        });
        const contained = await rejectedWithCode(
          service.closeFeedback(operator, target.id),
          GOVERNANCE_ATTACK_CONTROLS["alert-suppression"],
        );
        return {
          contained,
          detail: contained
            ? "control fired: closing submitted feedback rejected with invalid-feedback-transition"
            : "control failed: submitted feedback was closed without triage",
        };
      },
      "automation-bias": async () => {
        const target = await openSimulatedDeliberation(admin, {
          withStatement: false,
        });
        const contained = await rejectedWithCode(
          service.decideDeliberation(admin, target.id, {
            outcome: "approved",
            approvals: [{ actorId: admin.id }],
            note: "Rubber-stamping the simulation without discussion.",
          }),
          GOVERNANCE_ATTACK_CONTROLS["automation-bias"],
        );
        return {
          contained,
          detail: contained
            ? "control fired: decision without statements rejected with deliberation-requires-discussion"
            : "control failed: decision without statements was accepted",
        };
      },
      "minority-harm": async () => {
        const target = await openSimulatedDeliberation(admin, {
          severeHarm: true,
        });
        const contained = await rejectedWithCode(
          service.decideDeliberation(admin, target.id, {
            outcome: "approved",
            approvals: [{ actorId: admin.id }],
            note: "Approving despite severe protected-group harm.",
          }),
          GOVERNANCE_ATTACK_CONTROLS["minority-harm"],
        );
        return {
          contained,
          detail: contained
            ? "control fired: approval over severe group harm rejected with severe-group-harm-blocks-approval"
            : "control failed: approval over severe group harm was accepted",
        };
      },
    };
    const results: GovernanceAttackResult[] = [];
    for (const attack of GOVERNANCE_ATTACK_KINDS) {
      const outcome = await attacks[attack]();
      results.push({
        attack,
        contained: outcome.contained,
        control: GOVERNANCE_ATTACK_CONTROLS[attack],
        detail: outcome.detail,
      });
    }
    const withoutFingerprint = {
      schemaVersion: GOVERNANCE_RED_TEAM_SCHEMA_VERSION,
      generatedAt,
      results,
      allContained: results.every((result) => result.contained),
    };
    return {
      ...withoutFingerprint,
      fingerprint: fingerprintOf(withoutFingerprint),
    };
  }

  const redTeam = await runGovernanceRedTeam();

  const checks: ParticipationAcceptanceReport["checks"] = {
    stakeholderGroupsVersioned,
    severeHarmBlocksBeneficial,
    deliberationRequiresSimulation,
    deliberationRequiresDiscussion,
    agentWeightIncreaseRequiresDoubleApproval,
    serviceAccountApprovalDenied,
    distinctApproversEnforced,
    feedbackSlaAndAuditComplete,
    appealReopensIncident,
    appealInvalidatesLesson,
    appealRequestsEvidence,
    explanationReconstructibleFromFacts,
    redTeamAllContained: redTeam.allContained,
  };
  const overview = await service.overview(admin);
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => `${check} failed`);
  const withoutFingerprint = {
    schemaVersion: PARTICIPATION_ACCEPTANCE_SCHEMA_VERSION,
    generatedAt,
    checks,
    metrics: {
      stakeholderGroups: overview.stakeholderGroups.length,
      deliberations: overview.deliberations.length,
      feedbackCases: overview.feedbackCases.length,
      explanations: overview.explanations.length,
      redTeamAttacks: redTeam.results.length,
      redTeamContained: redTeam.results.filter(
        (result) => result.contained,
      ).length,
    },
    redTeam,
    failures,
    passed: failures.length === 0,
  };
  return {
    ...withoutFingerprint,
    fingerprint: fingerprintOf(withoutFingerprint),
  };
}
