// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  PUBLIC_CITY_SCENARIOS,
  materializeCityScenario,
} from "@/city/scenarios";
import {
  CityModelService,
} from "@/city/model-service";
import {
  ExperimentService,
  InMemoryExperimentRepository,
} from "@/experiments";
import {
  GovernanceService,
} from "@/governance";
import {
  DiagnosisService,
} from "@/diagnosis/service";
import {
  buildInterventionPlan,
  executeCandidateExperiment,
  scheduleInterventionCandidates,
  validateInterventionAction,
} from "./engine";
import type {
  InterventionAction,
} from "./types";

async function fixture() {
  const repository = new InMemoryExperimentRepository();
  let sequence = 0;
  const now = new Date("2026-07-18T14:00:00.000Z");
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
  const diagnosisService = new DiagnosisService(repository, city, {
    now: () => now,
    id: () => `planning-diagnosis-${++sequence}`,
  });
  await diagnosisService.initialize();
  const actor = {
    id: "planning-admin",
    role: "admin" as const,
    workspaceId: "workspace-neo-angeles",
    principalType: "human" as const,
    authSource: "development" as const,
  };
  const diagnosis = await diagnosisService.diagnoseScenario(
    "city-infrastructure-cascade",
    actor,
  );
  const cityOverview = await city.overview(actor);
  const truth = PUBLIC_CITY_SCENARIOS.find(
    (scenario) => scenario.id === diagnosis.scenarioTruthId,
  )!;
  const scenario = materializeCityScenario(truth);
  return {
    diagnosis,
    cityOverview,
    truth,
    scenario,
    createdAt: now.toISOString(),
  };
}

describe("goal-constrained planning engine", () => {
  it("builds deterministic no-action plus two-candidate Pareto experiments", async () => {
    const item = await fixture();
    const input = {
      diagnosis: item.diagnosis,
      objectives: item.cityOverview.objectives,
      guardrails: item.cityOverview.guardrails,
      stakeholderImpacts:
        item.cityOverview.snapshot.stakeholderImpacts,
      scenarioSeed: item.scenario.seed,
      scenarioPolicyVersion: item.scenario.policyVersion,
      scenarioConfiguration: item.scenario.configuration,
      scenarioWorld: item.scenario.world,
      createdAt: item.createdAt,
    };
    const first = buildInterventionPlan(input);
    const second = buildInterventionPlan(input);

    expect(first).toEqual(second);
    expect(first.candidates).toHaveLength(3);
    expect(first.candidates[0].actions).toEqual([]);
    expect(
      first.candidates.filter(
        (candidate) =>
          candidate.valid && candidate.actions.length > 0,
      ),
    ).toHaveLength(2);
    expect(first.design.seeds).toHaveLength(5);
    expect(first.design).toMatchObject({
      multipleComparisonMethod: "holm-bonferroni",
      regressionToMeanControl: "paired-frozen-baseline",
      naturalCycleControl: "same-seed-same-window",
    });
    expect(
      first.results.every(
        (result) => result.deterministicReplayPercent === 100,
      ),
    ).toBe(true);
    expect(
      first.schedule.every((item) =>
        item.isolatedWorldId.startsWith("isolated-"),
      ),
    ).toBe(true);
    expect(first.decision.rejectedCandidates.length).toBe(2);
  });

  it("rejects arbitrary fields, capability violations, and broken inverse actions", () => {
    const invalid = {
      schemaVersion: "nexus.intervention.v1",
      id: "invalid",
      kind: "adjust-city-metric",
      agentId: "atlas",
      capability: "metric:energy",
      metric: "energy",
      delta: 10,
      cost: 1,
      expectedDelayTicks: 0,
      preconditions: [],
      resources: [
        {
          resource: "energy-reserve",
          units: 1,
          exclusive: false,
        },
      ],
      reversibility: {
        reversible: true,
        inverse: { metric: "energy", delta: 10 },
      },
      shell: "rm -rf /",
    } as unknown as InterventionAction;

    expect(validateInterventionAction(invalid)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Unknown action fields/),
        expect.stringMatching(/lacks capability/),
        expect.stringMatching(/exact inverse/),
      ]),
    );
  });

  it("stops at the first sample when a guardrail is breached", async () => {
    const item = await fixture();
    const input = {
      diagnosis: item.diagnosis,
      objectives: item.cityOverview.objectives,
      guardrails: item.cityOverview.guardrails,
      stakeholderImpacts:
        item.cityOverview.snapshot.stakeholderImpacts,
      scenarioSeed: item.scenario.seed,
      scenarioPolicyVersion: item.scenario.policyVersion,
      scenarioConfiguration: item.scenario.configuration,
      scenarioWorld: item.scenario.world,
      createdAt: item.createdAt,
    };
    const plan = buildInterventionPlan(input);
    const dangerous = structuredClone(plan.candidates[1]);
    dangerous.id = "dangerous-energy-removal";
    dangerous.actions = [
      {
        ...dangerous.actions[0],
        id: "dangerous-action",
        metric: "energy",
        capability: "metric:energy",
        agentId: "civitas",
        delta: -100,
        reversibility: {
          reversible: true,
          inverse: { metric: "energy", delta: 100 },
        },
      },
    ];
    const result = executeCandidateExperiment(
      input,
      plan.design,
      dangerous,
    );

    expect(result.conclusion).toBe("guardrail-breach");
    expect(
      result.runs.every(
        (run) =>
          run.stopReason === "guardrail-breach" &&
          run.stoppedAtTick === plan.design.samplingTicks[0],
      ),
    ).toBe(true);
  });

  it("queues mutually exclusive resource claims without contaminating isolated worlds", async () => {
    const item = await fixture();
    const input = {
      diagnosis: item.diagnosis,
      objectives: item.cityOverview.objectives,
      guardrails: item.cityOverview.guardrails,
      stakeholderImpacts:
        item.cityOverview.snapshot.stakeholderImpacts,
      scenarioSeed: item.scenario.seed,
      scenarioPolicyVersion: item.scenario.policyVersion,
      scenarioConfiguration: item.scenario.configuration,
      scenarioWorld: item.scenario.world,
      createdAt: item.createdAt,
    };
    const plan = buildInterventionPlan(input);
    const candidates = structuredClone(
      plan.candidates.filter(
        (candidate) => candidate.actions.length > 0,
      ),
    );
    candidates[0].actions[1].resources[0].exclusive = true;
    const results = candidates.map((candidate) => ({
      ...plan.results.find(
        (result) => result.candidateId === candidate.id,
      )!,
      passed: true,
      conclusion: "beneficial" as const,
    }));
    const scheduled = scheduleInterventionCandidates(
      candidates,
      results,
      200,
      80,
    );

    expect(scheduled[0].status).toBe("scheduled");
    expect(scheduled[1]).toMatchObject({
      status: "queued",
      isolatedWorldId: expect.stringMatching(/^isolated-/),
    });
    expect(scheduled[1].reason).toMatch(/mutually exclusive/);
  });
});
