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
  OutcomeLearningService,
} from "@/outcomes/service";
import {
  InMemoryDeploymentAdapter,
} from "@/deployment/memory-adapter";
import {
  bindReleaseArtifact,
  verifyClosedLoopCaseIntegrity,
} from "./engine";
import {
  ClosedLoopService,
} from "./service";

const admin: ExperimentActor = {
  id: "closure-admin",
  role: "admin",
  workspaceId: "workspace-neo-angeles",
  principalType: "human",
  authSource: "development",
};

describe("closed-loop orchestrator service", () => {
  let repository: InMemoryExperimentRepository;
  let deployment: InMemoryDeploymentAdapter;
  let service: ClosedLoopService;
  let sequence: number;
  const now = new Date("2026-07-18T18:00:00.000Z");
  let clock = now;

  beforeEach(async () => {
    sequence = 0;
    clock = now;
    repository = new InMemoryExperimentRepository();
    const experiments = new ExperimentService(repository, {
      now: () => clock,
      id: () => `closure-experiment-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository, {
      now: () => clock,
      id: () => `closure-governance-${++sequence}`,
    });
    await governance.initialize();
    const city = new CityModelService(repository, {
      now: () => clock,
      id: () => `closure-city-${++sequence}`,
    });
    const diagnosis = new DiagnosisService(repository, city, {
      now: () => clock,
      id: () => `closure-diagnosis-${++sequence}`,
    });
    await diagnosis.initialize();
    const planning = new PlanningService(
      repository,
      city,
      diagnosis,
      {
        now: () => clock,
        id: () => `closure-planning-${++sequence}`,
      },
    );
    const outcomes = new OutcomeLearningService(
      repository,
      city,
      diagnosis,
      {
        now: () => clock,
        id: () => `closure-outcome-${++sequence}`,
      },
    );
    deployment = new InMemoryDeploymentAdapter();
    service = new ClosedLoopService(
      repository,
      city,
      diagnosis,
      planning,
      outcomes,
      deployment,
      {
        now: () => clock,
        id: () => `closure-${++sequence}`,
        releaseArtifact: bindReleaseArtifact({
          packageVersion: "2.0.0",
          repository: "Carrick-K7/nexus-7",
          commitSha: "a".repeat(40),
          dirty: false,
          artifactDigest: "b".repeat(64),
          evidenceManifestFingerprint: "c".repeat(64),
          trust: "local-committed",
          boundAt: now.toISOString(),
        }),
      },
    );
  });

  it("closes a real incident-to-lesson flow with durable links and one artifact", async () => {
    const result = await service.runReferenceFlow(admin);
    expect(result).toMatchObject({
      status: "closed",
      disposition: "beneficial",
      detected: true,
    });
    expect(result.stages).toHaveLength(10);
    expect(
      result.stages.every(
        (stage) => stage.status === "completed",
      ),
    ).toBe(true);
    expect(result.links).toMatchObject({
      incidentId: expect.any(String),
      diagnosisId: expect.any(String),
      planId: expect.any(String),
      deploymentId: expect.any(String),
      outcomeId: expect.any(String),
      lessonId: expect.any(String),
      learningProposalId: expect.any(String),
    });
    expect(
      verifyClosedLoopCaseIntegrity(result, {
        now,
        requireClosed: true,
      }),
    ).toMatchObject({ passed: true });
    const recordKinds = await Promise.all(
      Object.values(result.links)
        .filter((id): id is string => typeof id === "string")
        .map(async (id) =>
          (await repository.getLifecycleRecord(id))?.kind,
        ),
    );
    expect(recordKinds).toEqual(
      expect.arrayContaining([
        "city-incident",
        "causal-diagnosis",
        "intervention-plan",
        "deployment-record",
        "outcome-record",
        "lesson",
        "learning-proposal",
      ]),
    );
  });

  it("returns the same case for a repeated idempotency key and rejects key reuse", async () => {
    const first = await service.startCase(
      "city-economic-single-fault",
      "idempotent-start",
      admin,
    );
    const repeated = await service.startCase(
      "city-economic-single-fault",
      "idempotent-start",
      admin,
    );
    expect(repeated.fingerprint).toBe(first.fingerprint);
    const paused = await service.command(
      first.id,
      "pause",
      "control-key",
      admin,
      { reason: "Operator inspection" },
    );
    expect(paused.status).toBe("paused");
    await expect(
      service.command(
        first.id,
        "resume",
        "control-key",
        admin,
        { reason: "Conflicting reuse" },
      ),
    ).rejects.toThrow("Idempotency key");
  });

  it("supports human pause/resume while denying service-account control", async () => {
    const started = await service.startCase(
      "city-digital-network-single-fault",
      "pause-start",
      admin,
    );
    const paused = await service.command(
      started.id,
      "pause",
      "pause-command",
      admin,
      { reason: "Inspect unexpected evidence" },
    );
    expect(paused.control.resumeStatus).toBe("detected");
    const resumed = await service.command(
      started.id,
      "resume",
      "resume-command",
      admin,
      { reason: "Inspection complete" },
    );
    expect(resumed.status).toBe("detected");
    await expect(
      service.command(
        started.id,
        "pause",
        "service-account-pause",
        {
          ...admin,
          id: "closure-service-account",
          principalType: "service-account",
          permissionGrants: [
            "closure:read",
            "closure:operate",
            "closure:control",
          ],
        },
        { reason: "Unauthorized control" },
      ),
    ).rejects.toThrow();
  });

  it("closes normal variation as an explicit no-action record", async () => {
    const result = await service.startCase(
      "city-environment-normal",
      "normal-no-action",
      admin,
    );
    expect(result).toMatchObject({
      status: "closed",
      disposition: "no-action",
      eligibleProblem: false,
      detected: false,
    });
    expect(
      result.stages.every((stage) =>
        ["completed", "skipped"].includes(stage.status),
      ),
    ).toBe(true);
    expect(
      verifyClosedLoopCaseIntegrity(result, {
        now,
        requireClosed: true,
      }).passed,
    ).toBe(true);
  });

  it("serializes concurrent advances and records exactly one transition", async () => {
    const started = await service.startCase(
      "city-infrastructure-single-fault",
      "concurrent-start",
      admin,
    );
    const results = await Promise.allSettled([
      service.command(
        started.id,
        "advance",
        "concurrent-advance-a",
        admin,
      ),
      service.command(
        started.id,
        "advance",
        "concurrent-advance-b",
        admin,
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const stored = (await service.overview(admin)).cases.find(
      (item) => item.id === started.id,
    )!;
    expect(stored.status).toBe("triaged");
    expect(stored.transitions).toHaveLength(1);
  });

  it("blocks an expired stage, compensates, and renews its deadline on human resume", async () => {
    const started = await service.startCase(
      "city-digital-network-single-fault",
      "deadline-start",
      admin,
    );
    clock = new Date(now.getTime() + 5 * 3_600_000);
    const blocked = await service.command(
      started.id,
      "advance",
      "deadline-expired",
      admin,
    );
    expect(blocked.status).toBe("blocked");
    expect(blocked.control.blockers[0]?.code).toBe(
      "stage-deadline-expired",
    );
    expect(blocked.compensations).toEqual([
      expect.objectContaining({
        trigger: "deadline",
        status: "completed",
      }),
    ]);
    const resumed = await service.command(
      started.id,
      "resume",
      "deadline-resume",
      admin,
      { reason: "Human owner reviewed and renewed the triage SLO." },
    );
    expect(resumed.status).toBe("detected");
    expect(
      Date.parse(
        resumed.stages.find(
          (stage) => stage.code === "triage",
        )!.deadlineAt,
      ),
    ).toBeGreaterThan(clock.getTime());
    const advanced = await service.command(
      started.id,
      "advance",
      "deadline-after-resume",
      admin,
    );
    expect(advanced.status).toBe("triaged");
  });

  it("turns a real injected canary fault into rollback, outcome, lesson, and closure", async () => {
    let value = await service.startCase(
      "city-economic-single-fault",
      "fault-start",
      admin,
    );
    for (
      let index = 0;
      index < 12 && value.status !== "staged";
      index += 1
    ) {
      value = await service.command(
        value.id,
        "advance",
        `fault-stage-${index}-${value.status}`,
        admin,
      );
    }
    expect(value.status).toBe("staged");
    const deploymentRecord = (
      await service.overview(admin)
    ).deployments.find(
      (item) => item.id === value.links.deploymentId,
    )!;
    const production = deploymentRecord.environments.find(
      (item) => item.environment === "production",
    )!;
    await deployment.injectRollbackDrill(
      production.handle!.deploymentId,
    );
    value = await service.command(
      value.id,
      "advance",
      "fault-observe",
      admin,
    );
    expect(value).toMatchObject({
      status: "rolled-back",
      disposition: "rolled-back",
      guardrails: {
        rollbackRequired: true,
        rollbackCompleted: true,
      },
    });
    for (
      let index = 0;
      index < 6 && value.status !== "closed";
      index += 1
    ) {
      value = await service.command(
        value.id,
        "advance",
        `fault-close-${index}-${value.status}`,
        admin,
      );
    }
    expect(value.status).toBe("closed");
    expect(value.links).toMatchObject({
      outcomeId: expect.any(String),
      lessonId: expect.any(String),
    });
    expect(
      verifyClosedLoopCaseIntegrity(value, {
        now: clock,
        requireClosed: true,
      }),
    ).toMatchObject({ passed: true });
  });
});
