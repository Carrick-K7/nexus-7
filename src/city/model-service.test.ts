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
} from "./model-service";

describe("coherent city model service", () => {
  let repository: InMemoryExperimentRepository;
  let service: CityModelService;
  let now: Date;
  let sequence: number;

  const admin: ExperimentActor = {
    id: "city-admin",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "development",
  };

  beforeEach(async () => {
    repository = new InMemoryExperimentRepository();
    now = new Date("2026-07-18T10:00:00.000Z");
    sequence = 0;
    const experiments = new ExperimentService(repository, {
      now: () => now,
      id: () => `city-experiment-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository, {
      now: () => now,
      id: () => `city-governance-${++sequence}`,
    });
    await governance.initialize();
    service = new CityModelService(repository, {
      now: () => now,
      id: () => `city-${++sequence}`,
    });
    await service.initialize();
  });

  it("persists ontology-linked objectives, guardrails, and 20 scenario truths", async () => {
    const overview = await service.overview(admin);
    expect(overview.ontology.metrics.length).toBeGreaterThanOrEqual(20);
    expect(overview.objectives.length).toBeGreaterThanOrEqual(8);
    expect(overview.guardrails.length).toBeGreaterThanOrEqual(5);
    expect(overview.scenarioTruth).toHaveLength(20);
    expect(overview.scenarioVerification).toMatchObject({
      precisionPercent: 100,
      recallPercent: 100,
      deterministicReplayPercent: 100,
      passed: true,
    });
    expect(overview.snapshot.synthetic).toBe(true);
    expect(overview.syntheticBoundary).toContain("not claims about real");
  });

  it("deduplicates scenario incidents and scores duration, groups, and irreversibility", async () => {
    const first = await service.injectScenario(
      "city-infrastructure-cascade",
      admin,
    );
    const repeated = await service.injectScenario(
      "city-infrastructure-cascade",
      admin,
    );
    expect(first).not.toBeNull();
    expect(repeated).toEqual(first);
    expect(first).toMatchObject({
      status: "detected",
      family: "infrastructure",
      synthetic: true,
      hiddenTruth: {
        code: "GRID_TRANSFORMER_CAPACITY_LOSS",
      },
    });
    expect(first!.evidence.length).toBeGreaterThan(0);
    expect(first!.impact).toMatchObject({
      affectedGroupIds: [
        "synthetic-industrial-workers",
        "synthetic-service-limited",
      ],
      vulnerableGroupCount: 2,
    });
    expect(first!.impact.severityScore).toBeGreaterThan(0);
    expect(
      await service.injectScenario(
        "city-infrastructure-normal",
        admin,
      ),
    ).toBeNull();

    const records = await repository.listLifecycleRecords(
      admin.workspaceId!,
      { kind: "city-incident" },
    );
    expect(records).toHaveLength(1);
    const events = await repository.listLifecycleEvents(
      admin.workspaceId!,
      { aggregateId: first!.id },
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "city-incident.detected",
      correlationId: first!.correlationId,
      causationId: first!.causationId,
    });
  });

  it("enforces human state transitions and retains immutable event history", async () => {
    const incident = await service.injectScenario(
      "city-digital-network-conflicting-objectives",
      admin,
    );
    const triaged = await service.transitionIncident(
      incident!.id,
      "triaged",
      "SPECTRE and ATLAS own independent evidence collection",
      admin,
    );
    expect(triaged.status).toBe("triaged");
    await expect(
      service.transitionIncident(
        incident!.id,
        "detected",
        "Invalid backwards transition",
        admin,
      ),
    ).rejects.toBeInstanceOf(ExperimentConflictError);
    const investigating = await service.transitionIncident(
      incident!.id,
      "investigating",
      "Counterfactual diagnosis required",
      admin,
    );
    now = new Date("2026-07-18T11:00:00.000Z");
    const resolved = await service.transitionIncident(
      incident!.id,
      "resolved",
      "Synthetic scenario observation window completed",
      admin,
    );
    expect(investigating.status).toBe("investigating");
    expect(resolved).toMatchObject({
      status: "resolved",
      resolvedAt: now.toISOString(),
    });
    const events = await repository.listLifecycleEvents(
      admin.workspaceId!,
      { aggregateId: incident!.id },
    );
    expect(events.map((event) => event.type)).toEqual([
      "city-incident.detected",
      "city-incident.triaged",
      "city-incident.investigating",
      "city-incident.resolved",
    ]);
  });

  it("allows only a human policy owner to add bounded objectives and guardrails", async () => {
    const objective = await service.createObjective(
      {
        name: "Reduce migration pressure",
        metric: "migration-pressure",
        direction: "decrease",
        target: 40,
        weight: 0.7,
        owner: "human:civic-policy",
      },
      admin,
    );
    const guardrail = await service.createGuardrail(
      {
        name: "Network continuity floor",
        metric: "network-continuity",
        comparison: "minimum",
        threshold: 50,
        severity: "critical",
        breachAction: "rollback",
        owner: "human:digital-services",
      },
      admin,
    );
    expect(objective.metric).toBe("migration-pressure");
    expect(guardrail.metric).toBe("network-continuity");
    await expect(
      service.createObjective(
        {
          name: "Invalid weight",
          metric: "crime",
          direction: "decrease",
          target: 30,
          weight: 2,
          owner: "system",
        },
        admin,
      ),
    ).rejects.toThrow("weight must be between 0 and 1");
  });
});
