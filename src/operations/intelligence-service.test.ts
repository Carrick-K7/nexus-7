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
  OperationalIntelligenceService,
} from "./intelligence-service";
import {
  OperationalTelemetryCollector,
} from "./telemetry-collector";
import type {
  NotificationAttemptResult,
  NotificationTransport,
} from "./signed-webhook";

class FakeTransport implements NotificationTransport {
  readonly deliveries: string[] = [];
  results: NotificationAttemptResult[] = [];

  async send(
    _channel: Parameters<NotificationTransport["send"]>[0],
    delivery: Parameters<NotificationTransport["send"]>[1],
  ): Promise<NotificationAttemptResult> {
    this.deliveries.push(delivery.id);
    return this.results.shift() ?? {
      delivered: true,
      responseStatus: 202,
    };
  }
}

describe("operational intelligence", () => {
  let repository: InMemoryExperimentRepository;
  let service: OperationalIntelligenceService;
  let transport: FakeTransport;
  let sequence: number;
  let now: Date;

  const admin: ExperimentActor = {
    id: "operations-admin",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "development",
  };

  beforeEach(async () => {
    repository = new InMemoryExperimentRepository();
    sequence = 0;
    now = new Date("2026-07-18T08:00:00.000Z");
    transport = new FakeTransport();
    const experiments = new ExperimentService(repository, {
      now: () => now,
      id: () => `experiment-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository, {
      now: () => now,
      id: () => `governance-${++sequence}`,
    });
    await governance.initialize();
    service = new OperationalIntelligenceService(repository, {
      now: () => now,
      id: () => `operations-${++sequence}`,
      transport,
    });
  });

  async function configureErrorRateRule(): Promise<void> {
    const channel = await service.createChannel(
      {
        name: "Operations webhook",
        endpointUrl: "https://operations.example.test/incidents",
        secretEnvName: "NEXUS_TEST_WEBHOOK_SECRET",
        events: [
          "incident.opened",
          "incident.reopened",
          "incident.acknowledged",
          "incident.resolved",
        ],
      },
      admin,
    );
    await service.createRule(
      {
        code: "deployment.error-rate",
        name: "Deployment error rate exceeded",
        source: "deployment",
        metric: "error-rate-percent",
        comparison: "greater-than",
        threshold: 1,
        severity: "critical",
        groupBy: ["environment", "artifact"],
        notificationChannelIds: [channel.id],
      },
      admin,
    );
  }

  it("deduplicates, resolves, and reopens incidents with causal occurrences", async () => {
    await configureErrorRateRule();
    const first = await service.recordSample(
      {
        source: "deployment",
        metric: "error-rate-percent",
        value: 4.2,
        unit: "percent",
        status: "breaching",
        dimensions: {
          environment: "production",
          artifact: "nexus-web@abc",
        },
      },
      admin,
    );
    expect(first.incidents[0]).toMatchObject({
      status: "open",
      occurrenceCount: 1,
      code: "deployment.error-rate",
    });
    expect(first.occurrences[0].disposition).toBe("opened");

    now = new Date("2026-07-18T08:01:00.000Z");
    const repeated = await service.recordSample(
      {
        source: "deployment",
        metric: "error-rate-percent",
        value: 3.1,
        unit: "percent",
        status: "breaching",
        dimensions: {
          artifact: "nexus-web@abc",
          environment: "production",
        },
      },
      admin,
    );
    expect(repeated.incidents[0]).toMatchObject({
      id: first.incidents[0].id,
      status: "open",
      occurrenceCount: 2,
    });
    expect(repeated.occurrences[0].disposition).toBe("updated");

    now = new Date("2026-07-18T08:02:00.000Z");
    const healthy = await service.recordSample(
      {
        source: "deployment",
        metric: "error-rate-percent",
        value: 0.2,
        unit: "percent",
        status: "healthy",
        dimensions: {
          environment: "production",
          artifact: "nexus-web@abc",
        },
      },
      admin,
    );
    expect(healthy.incidents[0]).toMatchObject({
      id: first.incidents[0].id,
      status: "resolved",
    });
    expect(healthy.occurrences[0].disposition).toBe("auto-resolved");

    now = new Date("2026-07-18T08:03:00.000Z");
    const reopened = await service.recordSample(
      {
        source: "deployment",
        metric: "error-rate-percent",
        value: 2.5,
        unit: "percent",
        status: "breaching",
        dimensions: {
          environment: "production",
          artifact: "nexus-web@abc",
        },
      },
      admin,
    );
    expect(reopened.incidents[0]).toMatchObject({
      id: first.incidents[0].id,
      status: "open",
      occurrenceCount: 3,
    });
    expect(reopened.occurrences[0].disposition).toBe("reopened");

    const acknowledged = await service.acknowledgeIncident(
      first.incidents[0].id,
      admin,
    );
    expect(acknowledged).toMatchObject({
      status: "acknowledged",
      acknowledgedBy: admin.id,
    });

    const overview = await service.overview(admin);
    expect(overview.summary).toMatchObject({
      openIncidents: 1,
      criticalIncidents: 1,
      breachingSamples: 3,
      pendingDeliveries: 4,
    });
    expect(overview.occurrences.map((entry) => entry.disposition)).toEqual([
      "reopened",
      "auto-resolved",
      "updated",
      "opened",
    ]);
    expect(overview.series).toHaveLength(2);
    expect(
      overview.series.map((entry) => entry.granularity).sort(),
    ).toEqual(["day", "hour"]);
    for (const bucket of overview.series) {
      expect(bucket).toMatchObject({
        count: 4,
        minimum: 0.2,
        maximum: 4.2,
        average: 2.5,
        latest: 2.5,
      });
    }
  });

  it("enforces a configurable raw-sample retention boundary", async () => {
    service = new OperationalIntelligenceService(repository, {
      now: () => now,
      id: () => `retention-${++sequence}`,
      transport,
      rawRetentionDays: 30,
    });
    await service.recordSample(
      {
        source: "model",
        metric: "retention-sample",
        value: 1,
        unit: "count",
        observedAt: "2026-06-17T07:59:59.000Z",
      },
      admin,
    );
    await service.recordSample(
      {
        source: "model",
        metric: "retention-sample",
        value: 2,
        unit: "count",
        observedAt: "2026-06-18T08:00:00.000Z",
      },
      admin,
    );

    const result = await service.enforceRetention(admin);
    const overview = await service.overview(admin);

    expect(result).toEqual({
      cutoff: "2026-06-18T08:00:00.000Z",
      deletedSamples: 1,
    });
    expect(overview.retention).toEqual({
      rawDays: 30,
      cutoff: "2026-06-18T08:00:00.000Z",
    });
    expect(
      overview.samples.filter((sample) => sample.metric === "retention-sample"),
    ).toHaveLength(1);
  });

  it("delivers signed-webhook jobs and retains retries as dead letters", async () => {
    await configureErrorRateRule();
    const opened = await service.recordSample(
      {
        source: "deployment",
        metric: "error-rate-percent",
        value: 4,
        unit: "percent",
        status: "breaching",
        dimensions: { environment: "staging" },
      },
      admin,
    );
    transport.results = [
      { delivered: false, responseStatus: 503, error: "unavailable" },
      { delivered: false, responseStatus: 503, error: "unavailable" },
      { delivered: false, responseStatus: 503, error: "unavailable" },
      { delivered: false, responseStatus: 503, error: "unavailable" },
      { delivered: false, responseStatus: 503, error: "unavailable" },
    ];

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await service.processDueDeliveries(admin);
      expect(result).toHaveLength(1);
      expect(result[0].attemptCount).toBe(attempt);
      if (attempt < 5) {
        expect(result[0].status).toBe("retrying");
        now = new Date(Date.parse(result[0].nextAttemptAt) + 1);
      } else {
        expect(result[0]).toMatchObject({
          status: "dead-letter",
          responseStatus: 503,
          lastError: "unavailable",
          incidentId: opened.incidents[0].id,
        });
      }
    }
    const overview = await service.overview(admin);
    expect(overview.summary).toMatchObject({
      pendingDeliveries: 0,
      deadLetters: 1,
    });
    expect(transport.deliveries).toHaveLength(5);
  });

  it("enforces operational least privilege", async () => {
    const viewer: ExperimentActor = {
      ...admin,
      id: "operations-viewer",
      role: "viewer",
    };
    await expect(
      service.recordSample(
        {
          source: "worker",
          metric: "lease-age",
          value: 8,
          unit: "milliseconds",
        },
        viewer,
      ),
    ).rejects.toThrow("operations:write");
    await expect(
      service.createRule(
        {
          code: "worker.lease",
          name: "Worker lease",
          source: "worker",
          metric: "lease-age",
          comparison: "greater-than",
          threshold: 5_000,
          severity: "warning",
        },
        viewer,
      ),
    ).rejects.toThrow("alerts:manage");
    await expect(service.overview(viewer)).resolves.toMatchObject({
      summary: {
        openIncidents: 0,
      },
    });
    await expect(
      service.createChannel(
        {
          name: "Metadata endpoint",
          endpointUrl: "http://169.254.169.254/latest/meta-data",
          secretEnvName: "NEXUS_METADATA_TEST_SECRET",
        },
        admin,
      ),
    ).rejects.toThrow("local or private networks");
  });

  it("suppresses alerts during maintenance and after the occurrence budget is exhausted", async () => {
    const rule = await service.createRule(
      {
        code: "maintenance-budget",
        name: "Maintenance and budget test",
        source: "worker",
        metric: "maintenance-budget-value",
        comparison: "greater-than",
        threshold: 0,
        severity: "warning",
        groupBy: ["environment", "worker"],
        occurrenceBudget: {
          maximum: 1,
          windowMinutes: 60,
        },
      },
      admin,
    );
    const maintenance = await service.createMaintenanceWindow(
      {
        name: "Planned worker maintenance",
        startsAt: "2026-07-18T07:55:00.000Z",
        endsAt: "2026-07-18T08:05:00.000Z",
        ruleIds: [rule.id],
        environments: ["production"],
        reason: "Worker replacement",
      },
      admin,
    );

    const duringMaintenance = await service.recordSample(
      {
        source: "worker",
        metric: rule.metric,
        value: 1,
        unit: "count",
        status: "breaching",
        dimensions: {
          environment: "production",
          worker: "clock",
        },
      },
      admin,
    );
    expect(duringMaintenance.incidents).toEqual([]);
    expect(duringMaintenance.occurrences[0]).toMatchObject({
      disposition: "suppressed",
      suppressionReason:
        "Maintenance window Planned worker maintenance: Worker replacement",
    });

    await service.cancelMaintenanceWindow(
      maintenance.id,
      maintenance.revision,
      admin,
    );
    now = new Date("2026-07-18T08:01:00.000Z");
    const opened = await service.recordSample(
      {
        source: "worker",
        metric: rule.metric,
        value: 2,
        unit: "count",
        status: "breaching",
        dimensions: {
          environment: "production",
          worker: "clock",
        },
      },
      admin,
    );
    expect(opened.incidents[0]).toMatchObject({
      status: "open",
      occurrenceCount: 1,
    });

    now = new Date("2026-07-18T08:02:00.000Z");
    const storm = await service.recordSample(
      {
        source: "worker",
        metric: rule.metric,
        value: 3,
        unit: "count",
        status: "breaching",
        dimensions: {
          environment: "production",
          worker: "clock",
        },
      },
      admin,
    );
    expect(storm.incidents).toEqual([]);
    expect(storm.occurrences[0]).toMatchObject({
      disposition: "suppressed",
      incidentId: opened.incidents[0].id,
      suppressionReason:
        "Occurrence budget exhausted: 1 in 60 minutes",
    });
    expect((await service.overview(admin)).summary).toMatchObject({
      activeSuppressions: 0,
      scheduledMaintenance: 0,
    });
  });

  it("escalates through dry-run channels, cancels after acknowledgement, and records receipts", async () => {
    const firstChannel = await service.createChannel(
      {
        name: "Primary dry-run",
        endpointUrl: "https://operations.example.test/primary",
        secretEnvName: "NEXUS_PRIMARY_TEST_SECRET",
        dryRun: true,
        severities: ["critical"],
        environments: ["production"],
      },
      admin,
    );
    const secondChannel = await service.createChannel(
      {
        name: "Escalated dry-run",
        endpointUrl: "https://operations.example.test/escalated",
        secretEnvName: "NEXUS_ESCALATED_TEST_SECRET",
        dryRun: true,
      },
      admin,
    );
    const policy = await service.createEscalationPolicy(
      {
        name: "Critical production escalation",
        minimumSeverity: "critical",
        steps: [
          { afterMinutes: 0, channelIds: [firstChannel.id] },
          { afterMinutes: 10, channelIds: [secondChannel.id] },
        ],
      },
      admin,
    );
    const rule = await service.createRule(
      {
        code: "escalation-test",
        name: "Escalation test",
        source: "deployment",
        metric: "escalation-test-value",
        comparison: "greater-than",
        threshold: 0,
        severity: "critical",
        groupBy: ["environment"],
        escalationPolicyId: policy.id,
      },
      admin,
    );
    const opened = await service.recordSample(
      {
        source: "deployment",
        metric: rule.metric,
        value: 1,
        unit: "count",
        status: "breaching",
        dimensions: { environment: "production" },
      },
      admin,
    );
    let overview = await service.overview(admin);
    const deliveries = overview.deliveries.filter(
      (delivery) => delivery.incidentId === opened.incidents[0].id,
    );
    expect(deliveries).toHaveLength(2);
    expect(
      deliveries.map((delivery) => delivery.escalationStep).sort(),
    ).toEqual([1, 2]);

    const firstAttempt = await service.processDueDeliveries(admin);
    expect(firstAttempt).toHaveLength(1);
    expect(firstAttempt[0]).toMatchObject({
      status: "delivered",
      responseStatus: 204,
      dryRun: true,
    });
    expect(transport.deliveries).toEqual([]);
    const receipt = await service.recordDeliveryReceipt(
      {
        deliveryId: firstAttempt[0].id,
        status: "accepted",
        externalId: "pager-event-1",
      },
      admin,
    );
    expect(receipt).toMatchObject({
      status: "accepted",
      externalId: "pager-event-1",
    });

    await service.acknowledgeIncident(opened.incidents[0].id, admin);
    now = new Date("2026-07-18T08:11:00.000Z");
    const cancelled = await service.processDueDeliveries(admin);
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]).toMatchObject({
      status: "cancelled",
      escalationStep: 2,
    });
    overview = await service.overview(admin);
    expect(overview.receipts).toHaveLength(1);
  });

  it("collects source evidence idempotently into operational time series", async () => {
    const collector = new OperationalTelemetryCollector(service, () => now);
    const snapshot = {
      model: {
        generatedAt: "2026-07-18T07:55:00.000Z",
        providerId: "deterministic-mock",
        model: "nexus-mock-1",
        promptVersion: "prompt-12.0",
        summary: {
          fallbackCases: 0,
          errorCases: 0,
          p95LatencyMs: 29,
          totalCostUsd: 0,
        },
        gate: { passed: true },
      },
      recovery: {
        drillId: "recovery-current",
        completedAt: "2026-07-18T07:50:00.000Z",
        observedRecoveryPointMs: 50,
        observedRecoveryTimeMs: 150_000,
        recoveryPointObjectiveMs: 60_000,
        recoveryTimeObjectiveMs: 120_000,
        passed: false,
      },
      deployment: null,
      evidence: {
        records: [],
        freshness: [
          {
            kind: "ci-evidence" as const,
            status: "missing" as const,
            maximumAgeHours: 30,
            message: "missing",
          },
        ],
        alerts: [],
      },
      releasePolicies: [],
      workerLease: null,
    };

    const first = await collector.collect(snapshot, admin);
    expect(first).toEqual({
      samples: 8,
      occurrences: 3,
      incidents: 3,
    });
    const repeated = await collector.collect(snapshot, admin);
    expect(repeated).toEqual({
      samples: 8,
      occurrences: 0,
      incidents: 0,
    });

    const overview = await service.overview(admin);
    expect(overview.samples).toHaveLength(8);
    expect(
      overview.incidents.map((incident) => incident.code).sort(),
    ).toEqual([
      "evidence.freshness",
      "policy.expiry",
      "recovery.rto",
    ]);
  });
});
