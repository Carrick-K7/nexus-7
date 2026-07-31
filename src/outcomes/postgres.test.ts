// @vitest-environment node

import {
  afterAll,
  describe,
  expect,
  it,
} from "vitest";
import {
  ExperimentService,
  PostgresExperimentRepository,
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

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = databaseUrl
  ? describe
  : describe.skip;

integrationDescribe("PostgreSQL outcome learning", () => {
  const repository = databaseUrl
    ? new PostgresExperimentRepository(databaseUrl)
    : null;

  afterAll(async () => {
    await repository?.close();
  });

  it("round-trips outcomes, lessons, playbooks, proposals, and invalidation lineage", async () => {
    const suffix = `${Date.now()}-${crypto.randomUUID()}`;
    let sequence = 0;
    const experiments = new ExperimentService(repository!, {
      id: () => `outcome-pg-experiment-${suffix}-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository!, {
      id: () => `outcome-pg-governance-${suffix}-${++sequence}`,
    });
    await governance.initialize();
    const city = new CityModelService(repository!, {
      id: () => `outcome-pg-city-${suffix}-${++sequence}`,
    });
    const diagnosis = new DiagnosisService(repository!, city, {
      id: () => `outcome-pg-diagnosis-${suffix}-${++sequence}`,
    });
    await diagnosis.initialize();
    const planning = new PlanningService(
      repository!,
      city,
      diagnosis,
      {
        id: () =>
          `outcome-pg-planning-${suffix}-${++sequence}`,
      },
    );
    const service = new OutcomeLearningService(
      repository!,
      city,
      diagnosis,
      {
        id: () => `outcome-pg-${suffix}-${++sequence}`,
      },
    );
    const actor: ExperimentActor = {
      id: `outcome-pg-admin-${suffix}`,
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "development",
    };
    const maximumCost =
      1_000 +
      Number.parseInt(
        crypto.randomUUID().replaceAll("-", "").slice(0, 3),
        16,
      );
    const proposed = await planning.createPlanForScenario(
      "city-economic-single-fault",
      actor,
      { maximumCost },
    );
    await planning.approvePlan(
      proposed.id,
      proposed.decision.selectedCandidateId!,
      "PostgreSQL outcome evidence approval.",
      actor,
    );
    const staged = await planning.stagePlan(
      proposed.id,
      actor,
    );
    const initial = await service.evaluateStagedPlan(
      staged.id,
      actor,
    );
    const firstOverview = await service.overview(actor);
    const initialLesson = firstOverview.lessons.find(
      (lesson) => lesson.id === initial.currentLessonId,
    )!;
    const proposal = await service.proposeGovernedChange(
      initialLesson.id,
      "test",
      "PostgreSQL delayed-outcome regression",
      "Retain the verified long-horizon synthetic effect.",
      actor,
    );
    const recomputed = await service.recordLateEvidence(
      initial.id,
      {
        classification: "fact",
        source: "postgres-synthetic-delayed-monitor",
        metric: "energy",
        delta: -100,
        appliesAtOrAfterTick: 100,
        rationale:
          "Persist and propagate delayed protected harm.",
      },
      actor,
    );

    const second = new PostgresExperimentRepository(
      databaseUrl!,
    );
    try {
      await second.initialize();
      const storedOutcome =
        await second.getLifecycleRecord(initial.id);
      const storedOldLesson =
        await second.getLifecycleRecord(initialLesson.id);
      const storedNewLesson =
        await second.getLifecycleRecord(
          recomputed.currentLessonId!,
        );
      const storedPlaybook =
        await second.getLifecycleRecord(
          `playbook-${initialLesson.id}`,
        );
      const storedProposal =
        await second.getLifecycleRecord(proposal.id);

      expect(storedOutcome?.data).toEqual(recomputed);
      expect(storedOutcome).toMatchObject({
        kind: "outcome-record",
        status: "reopened",
        revision: 2,
      });
      expect(storedOldLesson).toMatchObject({
        kind: "lesson",
        status: "invalidated",
        revision: 2,
      });
      expect(storedNewLesson).toMatchObject({
        kind: "lesson",
        status: "validated",
        revision: 1,
      });
      expect(storedPlaybook).toMatchObject({
        kind: "response-playbook",
        status: "invalidated",
        revision: 2,
      });
      expect(storedProposal?.data).toEqual(proposal);
      expect(
        await second.listLifecycleEvents(
          actor.workspaceId!,
          { aggregateId: initial.id },
        ),
      ).toHaveLength(2);
    } finally {
      await second.close();
    }
  });
});
