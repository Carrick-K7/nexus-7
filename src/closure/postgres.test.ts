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

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = databaseUrl
  ? describe
  : describe.skip;

integrationDescribe("PostgreSQL closed-loop orchestrator", () => {
  const repository = databaseUrl
    ? new PostgresExperimentRepository(databaseUrl)
    : null;
  const now = new Date("2026-07-18T18:00:00.000Z");
  const actor: ExperimentActor = {
    id: "closure-postgres-admin",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "development",
  };

  afterAll(async () => {
    await repository?.close();
  });

  async function createService() {
    let sequence = 0;
    const experiments = new ExperimentService(repository!, {
      now: () => now,
      id: () => `closure-pg-experiment-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository!, {
      now: () => now,
      id: () => `closure-pg-governance-${++sequence}`,
    });
    await governance.initialize();
    const city = new CityModelService(repository!, {
      now: () => now,
      id: () => `closure-pg-city-${++sequence}`,
    });
    const diagnosis = new DiagnosisService(
      repository!,
      city,
      {
        now: () => now,
        id: () => `closure-pg-diagnosis-${++sequence}`,
      },
    );
    await diagnosis.initialize();
    const planning = new PlanningService(
      repository!,
      city,
      diagnosis,
      {
        now: () => now,
        id: () => `closure-pg-planning-${++sequence}`,
      },
    );
    const outcomes = new OutcomeLearningService(
      repository!,
      city,
      diagnosis,
      {
        now: () => now,
        id: () => `closure-pg-outcome-${++sequence}`,
      },
    );
    return new ClosedLoopService(
      repository!,
      city,
      diagnosis,
      planning,
      outcomes,
      new InMemoryDeploymentAdapter(),
      {
        now: () => now,
        id: () => `closure-pg-${++sequence}`,
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
  }

  it("round-trips a complete case, deployment, and trace through a fresh repository", async () => {
    const service = await createService();
    let value = await service.startCase(
      "city-public-safety-single-fault",
      "closure-pg-start",
      actor,
    );
    for (let index = 0; index < 20 && value.status !== "closed"; index += 1) {
      value = await service.command(
        value.id,
        "advance",
        `closure-pg-advance-${index}-${value.status}`,
        actor,
      );
    }
    expect(value.status).toBe("closed");
    expect(
      verifyClosedLoopCaseIntegrity(value, {
        now,
        requireClosed: true,
      }).passed,
    ).toBe(true);

    const second = new PostgresExperimentRepository(
      databaseUrl!,
    );
    try {
      await second.initialize();
      const stored = await second.getLifecycleRecord(value.id);
      expect(stored?.data).toEqual(value);
      expect(stored).toMatchObject({
        kind: "closed-loop-case",
        status: "closed",
      });
      expect(
        await second.getLifecycleRecord(
          value.links.deploymentId!,
        ),
      ).toMatchObject({
        kind: "deployment-record",
        status: "healthy",
      });
      expect(
        await second.listLifecycleEvents(
          value.workspaceId,
          {
            aggregateId: value.id,
            limit: 100,
          },
        ),
      ).toHaveLength(value.transitions.length + 1);
    } finally {
      await second.close();
    }
  }, 20_000);
});
