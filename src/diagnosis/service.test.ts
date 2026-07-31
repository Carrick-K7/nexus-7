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
} from "./service";

describe("diagnosis service", () => {
  let repository: InMemoryExperimentRepository;
  let service: DiagnosisService;
  let now: Date;
  let sequence: number;

  const admin: ExperimentActor = {
    id: "diagnosis-admin",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "development",
  };

  beforeEach(async () => {
    repository = new InMemoryExperimentRepository();
    now = new Date("2026-07-18T12:00:00.000Z");
    sequence = 0;
    const experiments = new ExperimentService(repository, {
      now: () => now,
      id: () => `diagnosis-experiment-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository, {
      now: () => now,
      id: () => `diagnosis-governance-${++sequence}`,
    });
    await governance.initialize();
    const city = new CityModelService(repository, {
      now: () => now,
      id: () => `diagnosis-city-${++sequence}`,
    });
    service = new DiagnosisService(repository, city, {
      now: () => now,
      id: () => `diagnosis-${++sequence}`,
    });
    await service.initialize();
  });

  it("persists one idempotent diagnosis with alternatives, counterevidence, and agent provenance", async () => {
    const first = await service.diagnoseScenario(
      "city-infrastructure-cascade",
      admin,
    );
    const repeated = await service.diagnoseScenario(
      "city-infrastructure-cascade",
      admin,
    );

    expect(repeated).toEqual(first);
    expect(first.status).toBe("diagnosed");
    expect(first.experimentEligibility.eligible).toBe(true);
    expect(first.hypotheses[0].rootCauseCode).toBe(
      "GRID_TRANSFORMER_CAPACITY_LOSS",
    );
    expect(
      first.hypotheses.some(
        (hypothesis) => hypothesis.status === "alternative",
      ),
    ).toBe(true);
    expect(
      first.hypotheses.every((hypothesis) =>
        hypothesis.evidence.some(
          (evidence) => evidence.stance === "contradicts",
        ),
      ),
    ).toBe(true);
    expect(first.agentSubmissions.map((item) => item.agentId)).toEqual([
      "atlas",
      "economica",
      "civitas",
      "spectre",
    ]);
    const records = await repository.listLifecycleRecords(
      admin.workspaceId!,
      { kind: "causal-diagnosis" },
    );
    const events = await repository.listLifecycleEvents(
      admin.workspaceId!,
      { aggregateId: first.id },
    );
    expect(records).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "diagnosis.diagnosed",
      causationId: first.incidentId,
    });
  });

  it("persists low-confidence diagnoses but blocks experiment eligibility", async () => {
    const diagnosis = await service.diagnoseScenario(
      "city-economic-single-fault",
      admin,
      { confidenceCeiling: 0.4 },
    );

    expect(diagnosis.status).toBe("low-confidence");
    expect(diagnosis.experimentEligibility.eligible).toBe(false);
    expect(diagnosis.experimentEligibility.blockers).not.toHaveLength(0);
    const overview = await service.overview(admin);
    expect(overview.gates.lowConfidenceAutomationAttempts).toBe(0);
  });

  it("uses human-owned drift assessment to disable automation and records judgment separately", async () => {
    const trust = await service.assessDrift(
      {
        dataDistributionShift: 0.5,
        policyEffectShift: 0.1,
        modelOutputShift: 0.1,
      },
      admin,
    );
    expect(trust.mode).toBe("read-only");
    expect(trust.automationAllowed).toBe(false);

    const diagnosis = await service.diagnoseScenario(
      "city-environment-cascade",
      admin,
    );
    expect(diagnosis.status).toBe("inconclusive");
    expect(diagnosis.experimentEligibility.eligible).toBe(false);

    now = new Date("2026-07-18T13:00:00.000Z");
    const reviewed = await service.recordHumanJudgment(
      diagnosis.id,
      "Request an independent water-quality observation before intervention.",
      admin,
    );
    expect(reviewed.evidence.at(-1)).toMatchObject({
      classification: "human-judgment",
      sourceId: admin.id,
    });
    expect(reviewed.leadingConfidence).toBe(
      diagnosis.leadingConfidence,
    );
  });

  it("publishes calibration, replay, and evidence-completeness gates", async () => {
    await service.diagnoseScenario(
      "city-digital-network-conflicting-objectives",
      admin,
    );
    const overview = await service.overview(admin);

    expect(overview.calibration).toMatchObject({
      sampleCount: 45,
      top3RootCauseHitRatePercent: 100,
      passed: true,
    });
    expect(overview.gates).toMatchObject({
      diagnosedWithAlternativeAndCounterevidencePercent: 100,
      deterministicCounterfactualReplayPercent: 100,
      lowConfidenceAutomationAttempts: 0,
    });
    expect(overview.evidenceBoundary).toMatch(/never hidden model/i);
  });
});
