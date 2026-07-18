// @vitest-environment node

import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
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
  CityModelService,
} from "@/city/model-service";
import {
  DiagnosisService,
} from "@/diagnosis/service";
import {
  PlanningService,
} from "@/planning/service";
import {
  OutcomeLearningService,
} from "./service";

describe("outcome learning service", () => {
  let repository: InMemoryExperimentRepository;
  let city: CityModelService;
  let service: OutcomeLearningService;
  let planId: string;
  let now: Date;
  let sequence: number;

  const admin: ExperimentActor = {
    id: "outcome-admin",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "development",
  };

  beforeEach(async () => {
    repository = new InMemoryExperimentRepository();
    now = new Date("2026-07-18T16:00:00.000Z");
    sequence = 0;
    const experiments = new ExperimentService(repository, {
      now: () => now,
      id: () => `outcome-experiment-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository, {
      now: () => now,
      id: () => `outcome-governance-${++sequence}`,
    });
    await governance.initialize();
    city = new CityModelService(repository, {
      now: () => now,
      id: () => `outcome-city-${++sequence}`,
    });
    const diagnosis = new DiagnosisService(repository, city, {
      now: () => now,
      id: () => `outcome-diagnosis-${++sequence}`,
    });
    await diagnosis.initialize();
    const planning = new PlanningService(
      repository,
      city,
      diagnosis,
      {
        now: () => now,
        id: () => `outcome-planning-${++sequence}`,
      },
    );
    const proposed = await planning.createPlanForScenario(
      "city-economic-cascade",
      admin,
    );
    await planning.approvePlan(
      proposed.id,
      proposed.decision.selectedCandidateId!,
      "Approve bounded intervention for delayed evaluation.",
      admin,
    );
    const staged = await planning.stagePlan(
      proposed.id,
      admin,
    );
    planId = staged.id;
    service = new OutcomeLearningService(
      repository,
      city,
      diagnosis,
      {
        now: () => now,
        id: () => `outcome-${++sequence}`,
      },
    );
  });

  it("idempotently persists outcome, lesson, playbook, closure coverage, and causal events", async () => {
    const first = await service.evaluateStagedPlan(
      planId,
      admin,
    );
    const repeated = await service.evaluateStagedPlan(
      planId,
      admin,
    );
    expect(repeated).toEqual(first);
    expect(first.verdict).toBe("beneficial");
    expect(first.windows).toHaveLength(3);

    await service.closeIncidentWithOutcome(
      first.id,
      "Independent long-horizon outcome and lesson disposition are recorded.",
      admin,
    );
    const overview = await service.overview(admin);
    expect(overview).toMatchObject({
      gates: {
        completedOutcomeLessonDispositionPercent: 100,
        deterministicOutcomeReplayPercent: 100,
        harmfulPositiveRetrievalCount: 0,
        invalidLessonActivePlaybookCount: 0,
        governedProposalBypassCount: 0,
        resolvedIncidentOutcomeCoveragePercent: 100,
      },
    });
    expect(overview.lessons).toHaveLength(1);
    expect(overview.playbooks).toHaveLength(1);
    expect(
      overview.events.map((event) => event.type),
    ).toEqual(
      expect.arrayContaining([
        "outcome.evaluated",
        "learning.lesson-derived",
      ]),
    );
  });

  it("recomputes late harm, reopens the incident, and propagates invalidation", async () => {
    const initial = await service.evaluateStagedPlan(
      planId,
      admin,
    );
    await service.closeIncidentWithOutcome(
      initial.id,
      "Close after initially beneficial evidence.",
      admin,
    );
    now = new Date("2026-07-19T16:00:00.000Z");
    const recomputed = await service.recordLateEvidence(
      initial.id,
      {
        classification: "fact",
        source: "synthetic-long-horizon-monitor",
        metric: "energy",
        delta: -100,
        appliesAtOrAfterTick: 100,
        rationale:
          "Delayed critical energy harm invalidates the early benefit.",
      },
      admin,
    );
    expect(recomputed).toMatchObject({
      revision: 2,
      status: "reopened",
      verdict: "harmful",
      reopenedIncident: true,
    });
    const overview = await service.overview(admin);
    expect(
      overview.lessons.find(
        (lesson) =>
          lesson.id === `lesson-${initial.id}-r1`,
      ),
    ).toMatchObject({
      status: "invalidated",
      positiveRetrievalEligible: false,
    });
    expect(
      overview.lessons.find(
        (lesson) =>
          lesson.id === `lesson-${initial.id}-r2`,
      ),
    ).toMatchObject({
      status: "validated",
      recommendation: "avoid",
      positiveRetrievalEligible: false,
    });
    expect(overview.playbooks[0].status).toBe(
      "invalidated",
    );
    expect(
      (await city.overview(admin)).incidents.find(
        (incident) => incident.id === recomputed.incidentId,
      )?.status,
    ).toBe("detected");
  });

  it("routes proposals through existing governance and lets humans challenge attribution", async () => {
    const outcome = await service.evaluateStagedPlan(
      planId,
      admin,
    );
    const overview = await service.overview(admin);
    const lesson = overview.lessons[0];
    const proposal = await service.proposeGovernedChange(
      lesson.id,
      "test",
      "Add late-harm regression",
      "Prevent an early synthetic benefit from hiding delayed harm.",
      admin,
    );
    expect(proposal).toMatchObject({
      governanceRoute: "existing-controlled-iteration",
      bypassAllowed: false,
      status: "awaiting-release-governance",
    });

    const reviewed =
      await service.flagAttributionForReview(
        outcome.id,
        "The causal attribution needs independent human review.",
        admin,
      );
    expect(reviewed).toMatchObject({
      status: "under-review",
      verdict: "inconclusive",
      lessonDisposition: "requires-review",
    });
    expect(
      (await service.overview(admin)).lessons[0].status,
    ).toBe("invalidated");
  });

  it("prevents service accounts from correcting outcomes or invalidating lessons", async () => {
    const outcome = await service.evaluateStagedPlan(
      planId,
      admin,
    );
    const lesson = (await service.overview(admin)).lessons[0];
    const serviceAccount: ExperimentActor = {
      ...admin,
      id: "outcome-service-account",
      principalType: "service-account",
      permissionGrants: [
        "workspace:read",
        "iterations:propose",
      ],
    };
    await expect(
      service.recordLateEvidence(
        outcome.id,
        {
          classification: "human-judgment",
          source: "unauthorized-service-account",
          metric: "energy",
          delta: -100,
          appliesAtOrAfterTick: 100,
          rationale: "Attempt unauthorized correction.",
        },
        serviceAccount,
      ),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
    await expect(
      service.invalidateLesson(
        lesson.id,
        "Attempt unauthorized invalidation.",
        serviceAccount,
      ),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
  });
});
