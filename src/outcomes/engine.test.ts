// @vitest-environment node

import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
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
  PUBLIC_CITY_SCENARIOS,
  materializeCityScenario,
} from "@/city/scenarios";
import {
  assessPlaybookApplicability,
  buildGovernedLearningProposal,
  buildOutcome,
  buildResponsePlaybook,
  deriveLesson,
  invalidateLesson,
  invalidatePlaybook,
  rebuildLessonRegistry,
} from "./engine";
import type {
  LateOutcomeEvidence,
  OutcomeRecord,
} from "./types";

describe("independent outcome and learning engine", () => {
  let plan: Awaited<
    ReturnType<PlanningService["stagePlan"]>
  >;
  let now: Date;

  const admin: ExperimentActor = {
    id: "outcome-engine-admin",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "development",
  };

  beforeEach(async () => {
    const repository = new InMemoryExperimentRepository();
    now = new Date("2026-07-18T16:00:00.000Z");
    let sequence = 0;
    const experiments = new ExperimentService(repository, {
      now: () => now,
      id: () => `outcome-engine-experiment-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository, {
      now: () => now,
      id: () => `outcome-engine-governance-${++sequence}`,
    });
    await governance.initialize();
    const city = new CityModelService(repository, {
      now: () => now,
      id: () => `outcome-engine-city-${++sequence}`,
    });
    const diagnosis = new DiagnosisService(repository, city, {
      now: () => now,
      id: () => `outcome-engine-diagnosis-${++sequence}`,
    });
    await diagnosis.initialize();
    const planning = new PlanningService(
      repository,
      city,
      diagnosis,
      {
        now: () => now,
        id: () => `outcome-engine-planning-${++sequence}`,
      },
    );
    const proposed = await planning.createPlanForScenario(
      "city-economic-cascade",
      admin,
    );
    await planning.approvePlan(
      proposed.id,
      proposed.decision.selectedCandidateId!,
      "Approve frozen paired evidence for outcome tests.",
      admin,
    );
    plan = await planning.stagePlan(proposed.id, admin);
  });

  function outcome(
    lateEvidence: LateOutcomeEvidence[] = [],
    revision = 1,
  ): OutcomeRecord {
    const truth = PUBLIC_CITY_SCENARIOS.find(
      (scenario) =>
        scenario.id === "city-economic-cascade",
    )!;
    const scenario = materializeCityScenario(truth);
    return buildOutcome({
      plan,
      scenarioId: truth.id,
      scenarioFamily: truth.family,
      scenarioSeed: scenario.seed,
      scenarioPolicyVersion: scenario.policyVersion,
      scenarioConfiguration: scenario.configuration,
      scenarioWorld: scenario.world,
      evaluatedAt: now.toISOString(),
      revision,
      lateEvidence,
    });
  }

  it("evaluates independent short, medium, and long windows with exact replay and prediction error", () => {
    const first = outcome();
    const repeated = outcome();

    expect(first).toEqual(repeated);
    expect(first.evaluator).toMatchObject({
      independentFromProposer: true,
      modelProvider: "deterministic-reference",
    });
    expect(first.windows.map((window) => window.window)).toEqual([
      "short",
      "medium",
      "long",
    ]);
    expect(
      first.windows.every(
        (window) =>
          window.deterministicReplay &&
          window.observedFingerprint ===
            window.repeatedObservedFingerprint &&
          Number.isFinite(window.predictionError),
      ),
    ).toBe(true);
    expect(
      first.windows.every(
        (window) =>
          window.comparisons.frozenCounterfactualValue ===
          window.comparisons.sameSeedSeasonalValue,
      ),
    ).toBe(true);
  });

  it("turns late protected harm into a harmful lesson and invalidates prior positive memory", () => {
    const initial = outcome();
    const initialLesson = deriveLesson(initial);
    expect(initial.verdict).toBe("beneficial");
    expect(initialLesson.positiveRetrievalEligible).toBe(true);
    const playbook = buildResponsePlaybook(
      initialLesson,
      plan,
      now.toISOString(),
    );

    const evidence: LateOutcomeEvidence = {
      id: "late-energy-collapse",
      classification: "fact",
      source: "synthetic-delayed-monitor",
      metric: "energy",
      delta: -100,
      observedAt: now.toISOString(),
      appliesAtOrAfterTick: 100,
      rationale:
        "A delayed synthetic energy collapse crosses a critical floor.",
      synthetic: true,
    };
    const recomputed = outcome([evidence], 2);
    const replacement = deriveLesson(
      recomputed,
      initialLesson.id,
    );
    const invalidated = invalidateLesson(
      initialLesson,
      evidence.id,
      now.toISOString(),
    );
    const invalidatedPlaybook = invalidatePlaybook(
      playbook,
      "Late harm invalidated its source lesson.",
      now.toISOString(),
    );

    expect(recomputed.verdict).toBe("harmful");
    expect(recomputed.windows[2].guardrails).toContainEqual(
      expect.objectContaining({
        metric: "energy",
        breached: true,
        severity: "critical",
      }),
    );
    expect(replacement).toMatchObject({
      recommendation: "avoid",
      positiveRetrievalEligible: false,
      status: "validated",
    });
    expect(invalidated).toMatchObject({
      status: "invalidated",
      positiveRetrievalEligible: false,
    });
    expect(invalidatedPlaybook.status).toBe("invalidated");
  });

  it("rebuilds deterministic memory and keeps every change proposal inside release governance", () => {
    const first = outcome();
    const rebuiltA = rebuildLessonRegistry([first]);
    const rebuiltB = rebuildLessonRegistry([
      structuredClone(first),
    ]);
    expect(rebuiltA).toEqual(rebuiltB);
    const lesson = rebuiltA[0];
    const proposal = buildGovernedLearningProposal({
      lesson,
      target: "test",
      title: "Add delayed effect regression",
      expectedImpact:
        "Catch a repeated synthetic long-horizon failure.",
      actorId: admin.id,
      createdAt: now.toISOString(),
    });
    expect(proposal).toMatchObject({
      status: "awaiting-release-governance",
      governanceRoute: "existing-controlled-iteration",
      bypassAllowed: false,
    });
    expect(proposal.requiredGates).toContain(
      "human-approval",
    );
  });

  it("rechecks context, trust, capability, budget, experiment, and approval before playbook reuse", () => {
    const lesson = deriveLesson(outcome());
    const playbook = buildResponsePlaybook(
      lesson,
      plan,
      now.toISOString(),
    );
    const applicable = assessPlaybookApplicability({
      playbook,
      lesson,
      plan,
      scenarioFamily: "economic",
      diagnosticTrustActive: true,
      assessedAt: now.toISOString(),
    });
    const drifted = assessPlaybookApplicability({
      playbook,
      lesson,
      plan,
      scenarioFamily: "infrastructure",
      diagnosticTrustActive: false,
      assessedAt: now.toISOString(),
    });

    expect(applicable.applicable).toBe(true);
    expect(drifted.applicable).toBe(false);
    expect(drifted.failures).toEqual(
      expect.arrayContaining([
        "scenarioFamilyMatches",
        "diagnosticTrustActive",
      ]),
    );
  });
});
