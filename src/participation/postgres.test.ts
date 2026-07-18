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
  verifyPublicExplanationFingerprint,
} from "./engine";
import {
  ParticipationService,
  type StakeholderGroupWriteInput,
} from "./service";
import type {
  FeedbackCase,
  PublicExplanation,
} from "./types";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe("PostgreSQL participatory governance", () => {
  const repository = databaseUrl
    ? new PostgresExperimentRepository(databaseUrl)
    : null;
  const now = new Date("2026-07-18T14:00:00.000Z");

  afterAll(async () => {
    await repository?.close();
  });

  async function createServices() {
    const suffix = `${Date.now()}-${crypto.randomUUID()}`;
    let sequence = 0;
    const experiments = new ExperimentService(repository!, {
      now: () => now,
      id: () => `participation-pg-experiment-${suffix}-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository!, {
      now: () => now,
      id: () => `participation-pg-governance-${suffix}-${++sequence}`,
    });
    await governance.initialize();
    const city = new CityModelService(repository!, {
      now: () => now,
      id: () => `participation-pg-city-${suffix}-${++sequence}`,
    });
    await city.initialize();
    const service = new ParticipationService(repository!, city, {
      now: () => now,
      id: () => `participation-pg-${suffix}-${++sequence}`,
    });
    const admin: ExperimentActor = {
      id: `participation-pg-admin-${suffix}`,
      role: "admin",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "development",
    };
    const operator: ExperimentActor = {
      ...admin,
      id: `participation-pg-operator-${suffix}`,
      role: "operator",
    };
    const viewer: ExperimentActor = {
      ...admin,
      id: `participation-pg-viewer-${suffix}`,
      role: "viewer",
    };
    return { service, city, admin, operator, viewer };
  }

  function groupInput(): StakeholderGroupWriteInput {
    return {
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
  }

  it("round-trips a registered stakeholder group through a fresh repository", async () => {
    const { service, operator } = await createServices();
    const group = await service.registerStakeholderGroup(
      operator,
      groupInput(),
    );

    const second = new PostgresExperimentRepository(databaseUrl!);
    try {
      await second.initialize();
      const stored = await second.getLifecycleRecord(group.id);
      expect(stored?.data).toEqual(group);
      expect(stored).toMatchObject({
        kind: "stakeholder-group",
        status: "active",
        revision: 1,
      });
    } finally {
      await second.close();
    }
  });

  it("increments the revision by one across the deliberation lifecycle", async () => {
    const { service, admin, operator } = await createServices();
    const group = await service.registerStakeholderGroup(
      operator,
      groupInput(),
    );
    const deliberation = await service.openDeliberation(admin, {
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
    });
    expect(
      (await repository!.getLifecycleRecord(deliberation.id))?.revision,
    ).toBe(1);

    await service.addDeliberationStatement(admin, deliberation.id, {
      stance: "support",
      text: "Supports the energy target increase.",
    });
    expect(
      (await repository!.getLifecycleRecord(deliberation.id))?.revision,
    ).toBe(2);

    await service.attachDeliberationSimulation(operator, deliberation.id, {
      sourceWorldFingerprint: "world-fingerprint-1",
      impacts: [
        {
          groupId: group.id,
          baselineBurden: 10,
          projectedBurden: 12,
          burdenDelta: 2,
          severeHarm: false,
          harmCodes: [],
        },
      ],
    });
    expect(
      (await repository!.getLifecycleRecord(deliberation.id))?.revision,
    ).toBe(3);

    await service.decideDeliberation(admin, deliberation.id, {
      outcome: "approved",
      approvals: [{ actorId: admin.id, note: "Simulation reviewed." }],
      note: "Approved with protected metrics intact.",
    });
    expect(
      (await repository!.getLifecycleRecord(deliberation.id))?.revision,
    ).toBe(4);

    const applied = await service.applyDeliberation(admin, deliberation.id);
    expect(applied.status).toBe("applied");
    expect(applied.appliedObjectiveVersion).toBeDefined();

    const second = new PostgresExperimentRepository(databaseUrl!);
    try {
      await second.initialize();
      const stored = await second.getLifecycleRecord(deliberation.id);
      expect(stored?.data).toEqual(applied);
      expect(stored).toMatchObject({
        kind: "goal-deliberation",
        status: "applied",
        revision: 5,
      });
    } finally {
      await second.close();
    }
  });

  it("preserves SLA fields across the feedback lifecycle", async () => {
    const { service, operator, viewer } = await createServices();
    const feedback = await service.submitFeedback(viewer, {
      kind: "correction",
      target: { kind: "incident", id: "city-incident-reference" },
      summary: "The recorded energy value looks stale.",
    });
    expect(
      (await repository!.getLifecycleRecord(feedback.id))?.revision,
    ).toBe(1);

    await service.triageFeedback(operator, feedback.id, {});
    expect(
      (await repository!.getLifecycleRecord(feedback.id))?.revision,
    ).toBe(2);

    await service.startFeedbackReview(operator, feedback.id);
    expect(
      (await repository!.getLifecycleRecord(feedback.id))?.revision,
    ).toBe(3);

    await service.respondFeedback(operator, feedback.id, {
      text: "Replay confirmed the value; evidence attached.",
    });
    expect(
      (await repository!.getLifecycleRecord(feedback.id))?.revision,
    ).toBe(4);

    const closed = await service.closeFeedback(operator, feedback.id);
    expect(closed.status).toBe("closed");

    const second = new PostgresExperimentRepository(databaseUrl!);
    try {
      await second.initialize();
      const stored = await second.getLifecycleRecord(feedback.id);
      expect(stored?.data).toEqual(closed);
      expect(stored).toMatchObject({
        kind: "feedback-case",
        status: "closed",
        revision: 5,
      });
      const roundTripped = stored?.data as unknown as FeedbackCase;
      expect(roundTripped.slaHours).toBe(72);
      expect(roundTripped.slaDueAt).toBe(
        new Date(now.getTime() + 72 * 3_600_000).toISOString(),
      );
      expect(roundTripped.breachedSla).toBe(false);
      expect(roundTripped.response?.respondedBy).toBe(operator.id);
    } finally {
      await second.close();
    }
  });

  it("round-trips a published explanation with a verifiable fingerprint", async () => {
    const { service, city, admin, operator } =
      await createServices();
    const incident = await city.injectScenario(
      "city-infrastructure-single-fault",
      admin,
    );
    const explanation = await service.publishExplanation(operator, {
      subject: { kind: "incident", id: incident!.id },
    });

    const second = new PostgresExperimentRepository(databaseUrl!);
    try {
      await second.initialize();
      const stored = await second.getLifecycleRecord(explanation.id);
      expect(stored?.data).toEqual(explanation);
      expect(stored).toMatchObject({
        kind: "public-explanation",
        status: "published",
        revision: 1,
      });
      expect(
        verifyPublicExplanationFingerprint(
          stored?.data as unknown as PublicExplanation,
        ),
      ).toBe(true);
    } finally {
      await second.close();
    }
  });
});
