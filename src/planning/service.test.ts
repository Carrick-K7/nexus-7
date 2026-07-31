// @vitest-environment node

import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  ExperimentConflictError,
  ExperimentService,
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
  DiagnosisService,
} from "@/diagnosis/service";
import {
  INTERVENTION_SCHEMA_VERSION,
  type InterventionCandidate,
} from "./types";
import {
  PlanningService,
} from "./service";

describe("planning service", () => {
  let repository: InMemoryExperimentRepository;
  let service: PlanningService;
  let now: Date;
  let sequence: number;

  const admin: ExperimentActor = {
    id: "planning-admin",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "development",
  };

  beforeEach(async () => {
    repository = new InMemoryExperimentRepository();
    now = new Date("2026-07-18T14:00:00.000Z");
    sequence = 0;
    const experiments = new ExperimentService(repository, {
      now: () => now,
      id: () => `planning-experiment-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository, {
      now: () => now,
      id: () => `planning-governance-${++sequence}`,
    });
    await governance.initialize();
    const city = new CityModelService(repository, {
      now: () => now,
      id: () => `planning-city-${++sequence}`,
    });
    const diagnosis = new DiagnosisService(repository, city, {
      now: () => now,
      id: () => `planning-diagnosis-${++sequence}`,
    });
    await diagnosis.initialize();
    service = new PlanningService(repository, city, diagnosis, {
      now: () => now,
      id: () => `planning-${++sequence}`,
    });
  });

  it("persists one idempotent plan with no-action, alternatives, results, and queue reasons", async () => {
    const first = await service.createPlanForScenario(
      "city-infrastructure-cascade",
      admin,
    );
    const repeated = await service.createPlanForScenario(
      "city-infrastructure-cascade",
      admin,
    );

    expect(repeated).toEqual(first);
    expect(first.status).toBe("awaiting-approval");
    expect(first.candidates).toHaveLength(3);
    expect(first.candidates[0].name).toBe("No action");
    expect(first.results).toHaveLength(3);
    expect(first.decision.selectedCandidateId).toBeDefined();
    expect(
      first.decision.rejectedCandidates.every(
        (candidate) => candidate.reasons.length > 0,
      ),
    ).toBe(true);
    const records = await repository.listLifecycleRecords(
      admin.workspaceId!,
      { kind: "intervention-plan" },
    );
    const events = await repository.listLifecycleEvents(
      admin.workspaceId!,
      { aggregateId: first.id },
    );
    expect(records).toHaveLength(1);
    expect(events.map((event) => event.type)).toEqual([
      "planning.plan-created",
    ]);
  });

  it("requires human approval, then stages only the validated budgeted selection", async () => {
    const plan = await service.createPlanForScenario(
      "city-infrastructure-cascade",
      admin,
    );
    const approved = await service.approvePlan(
      plan.id,
      plan.decision.selectedCandidateId!,
      "Paired evidence, protected metrics and inverse action are acceptable.",
      admin,
    );
    expect(approved.status).toBe("approved");
    expect(approved.decision.approvals).toHaveLength(1);

    const staged = await service.stagePlan(plan.id, admin);
    expect(staged.status).toBe("staged");
    const overview = await service.overview(admin);
    expect(overview.gates).toMatchObject({
      plansWithNoActionAndTwoCandidatesPercent: 100,
      deterministicExperimentReplayPercent: 100,
      stagedWithoutApprovalBudgetOrCapability: 0,
    });
    const events = await repository.listLifecycleEvents(
      admin.workspaceId!,
      { aggregateId: plan.id },
    );
    expect(events.map((event) => event.type)).toEqual([
      "planning.plan-created",
      "planning.plan-approved",
      "planning.plan-staged",
    ]);
  });

  it("prevents an unreserved candidate from reaching approval or staging", async () => {
    const plan = await service.createPlanForScenario(
      "city-infrastructure-cascade",
      admin,
      { maximumCost: 55 },
    );
    expect(
      plan.schedule.find(
        (item) =>
          item.candidateId ===
          plan.decision.selectedCandidateId,
      )?.status,
    ).toBe("queued");
    await expect(
      service.approvePlan(
        plan.id,
        plan.decision.selectedCandidateId!,
        "Try to bypass the budget.",
        admin,
      ),
    ).rejects.toBeInstanceOf(ExperimentConflictError);
    await expect(
      service.stagePlan(plan.id, admin),
    ).rejects.toBeInstanceOf(ExperimentConflictError);
  });

  it("requires two distinct human administrators for a selected high-risk candidate", async () => {
    const highCandidate: InterventionCandidate = {
      id: "human-high-energy-restoration",
      name: "High-intensity grid restoration",
      description: "A high-risk but reversible synthetic restoration.",
      provenance: [
        {
          source: "human",
          sourceId: "human-proposal-1",
          actorId: admin.id,
          submittedAt: now.toISOString(),
        },
      ],
      actions: [
        {
          schemaVersion: INTERVENTION_SCHEMA_VERSION,
          id: "human-high-energy-action",
          kind: "adjust-city-metric",
          agentId: "civitas",
          capability: "metric:energy",
          metric: "energy",
          delta: 50,
          cost: 30,
          expectedDelayTicks: 1,
          preconditions: [],
          resources: [
            {
              resource: "public-budget",
              units: 30,
              exclusive: true,
            },
          ],
          reversibility: {
            reversible: true,
            inverse: { metric: "energy", delta: -50 },
          },
        },
      ],
      equivalenceFingerprint: "human-high-energy-fingerprint",
      risk: "high",
      cost: 30,
      expectedInformationGain: 0.95,
      expectedBenefit: 0.99,
      expectedGroupImpacts: [
        {
          groupId: "synthetic-service-limited",
          expectedDelta: 10,
          protected: true,
          synthetic: true,
        },
      ],
      valid: true,
      validationErrors: [],
      paretoStatus: "frontier",
      dominatedByIds: [],
      rejectionReasons: [],
    };
    const plan = await service.createPlanForScenario(
      "city-infrastructure-cascade",
      admin,
      {
        maximumCost: 200,
        additionalCandidates: [highCandidate],
      },
    );
    expect(plan.decision.selectedCandidateId).toBe(
      highCandidate.id,
    );
    const first = await service.approvePlan(
      plan.id,
      highCandidate.id,
      "First independent risk approval.",
      admin,
    );
    expect(first.status).toBe("awaiting-approval");
    expect(first.decision.requiredApprovals).toBe(2);

    const secondAdmin: ExperimentActor = {
      ...admin,
      id: "planning-admin-2",
    };
    const second = await service.approvePlan(
      plan.id,
      highCandidate.id,
      "Second independent risk approval.",
      secondAdmin,
    );
    expect(second.status).toBe("approved");
    expect(
      new Set(
        second.decision.approvals.map(
          (approval) => approval.actorId,
        ),
      ).size,
    ).toBe(2);
  });

  it("persists evidence requests and rejection as explicit human decisions", async () => {
    const plan = await service.createPlanForScenario(
      "city-digital-network-cascade",
      admin,
    );
    const requested = await service.requestEvidence(
      plan.id,
      "Need a longer network continuity observation window.",
      admin,
    );
    expect(requested.status).toBe("evidence-requested");
    const rejected = await service.rejectPlan(
      plan.id,
      "Evidence remained insufficient.",
      admin,
    );
    expect(rejected.status).toBe("rejected");
  });
});
