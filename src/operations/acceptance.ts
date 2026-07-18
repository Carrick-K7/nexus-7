import { createHash } from "node:crypto";
import {
  actorPermissions,
  ExperimentService,
  InMemoryExperimentRepository,
  type ExperimentActor,
} from "@/experiments";
import { GovernanceService } from "@/governance";
import {
  runDeploymentControllerConformance,
  type DeploymentControllerConformanceReport,
} from "@/deployment";
import { stableStringify } from "@/simulation";
import { OperationalIntelligenceService } from "./intelligence-service";
import type {
  NotificationAttemptResult,
  NotificationTransport,
} from "./signed-webhook";

export const OPERATIONAL_ACCEPTANCE_SCHEMA_VERSION =
  "nexus.operational-acceptance.v1" as const;

export interface OperationalAcceptanceReport {
  schemaVersion: typeof OPERATIONAL_ACCEPTANCE_SCHEMA_VERSION;
  generatedAt: string;
  window: {
    startsAt: string;
    endsAt: string;
    days: number;
    rawSamples: number;
    hourlyBuckets: number;
    dailyBuckets: number;
  };
  checks: {
    thirtyOneDayCoverage: boolean;
    hourlyAggregation: boolean;
    dailyAggregation: boolean;
    rawSampleTraceability: boolean;
    incidentDeduplication: boolean;
    notificationDeadLetterVisible: boolean;
    breakGlassDualApproval: boolean;
    breakGlassAutomaticRevocation: boolean;
    controllerChaosConformance: boolean;
  };
  controllerConformance: Pick<
    DeploymentControllerConformanceReport,
    "contractVersion" | "fingerprint" | "passed"
  >;
  failures: string[];
  passed: boolean;
  fingerprint: string;
}

class AlwaysFailTransport implements NotificationTransport {
  async send(): Promise<NotificationAttemptResult> {
    return {
      delivered: false,
      responseStatus: 503,
      error: "Injected notification transport failure",
    };
  }
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

export async function runOperationalAcceptance(): Promise<
  OperationalAcceptanceReport
> {
  const repository = new InMemoryExperimentRepository();
  const windowStart = new Date("2026-06-17T00:00:00.000Z");
  let now = new Date("2026-07-18T00:00:00.000Z");
  let sequence = 0;
  const nextId = () => `operational-acceptance-${++sequence}`;
  const admin: ExperimentActor = {
    id: "acceptance-admin-1",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
    authSource: "oidc",
    issuer: "https://identity.acceptance.example",
  };
  const secondAdmin: ExperimentActor = {
    ...admin,
    id: "acceptance-admin-2",
  };
  const systemActor: ExperimentActor = {
    id: "system:operational-acceptance",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "system",
    authSource: "system",
  };

  const experiments = new ExperimentService(repository, {
    now: () => now,
    id: nextId,
  });
  await experiments.initialize();
  const governance = new GovernanceService(repository, {
    now: () => now,
    id: nextId,
  });
  await governance.initialize();
  const operations = new OperationalIntelligenceService(repository, {
    now: () => now,
    id: nextId,
    transport: new AlwaysFailTransport(),
  });

  const expectedRawSamples = 31 * 24;
  for (let hour = 0; hour < expectedRawSamples; hour += 1) {
    const observedAt = new Date(
      windowStart.getTime() + hour * 60 * 60_000,
    ).toISOString();
    await operations.recordSample(
      {
        source: "deployment",
        metric: "acceptance-latency-ms",
        value: 100 + (hour % 24),
        unit: "milliseconds",
        status: "healthy",
        dimensions: {
          environment: "synthetic",
          artifact: "nexus-7@v1.4.0",
          policy: "operational-acceptance-v1",
          trace: `trace-${hour}`,
        },
        observedAt,
      },
      admin,
    );
  }

  const channel = await operations.createChannel(
    {
      name: "Injected failure channel",
      endpointUrl: "https://notifications.acceptance.example/incidents",
      secretEnvName: "NEXUS_ACCEPTANCE_WEBHOOK_SECRET",
      events: ["incident.opened"],
    },
    admin,
  );
  await operations.createRule(
    {
      code: "acceptance.notification-failure",
      name: "Acceptance notification failure",
      source: "deployment",
      metric: "acceptance-error-rate-percent",
      comparison: "greater-than",
      threshold: 1,
      severity: "critical",
      groupBy: ["environment", "artifact"],
      notificationChannelIds: [channel.id],
    },
    admin,
  );
  const firstIncident = await operations.recordSample(
    {
      source: "deployment",
      metric: "acceptance-error-rate-percent",
      value: 5,
      unit: "percent",
      status: "breaching",
      dimensions: {
        environment: "synthetic",
        artifact: "nexus-7@v1.4.0",
      },
    },
    admin,
  );
  now = new Date(now.getTime() + 1_000);
  const repeatedIncident = await operations.recordSample(
    {
      source: "deployment",
      metric: "acceptance-error-rate-percent",
      value: 4,
      unit: "percent",
      status: "breaching",
      dimensions: {
        environment: "synthetic",
        artifact: "nexus-7@v1.4.0",
      },
    },
    admin,
  );
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await operations.processDueDeliveries(systemActor);
    now = new Date(now.getTime() + 2 * 60 * 60_000);
  }

  await governance.upsertMembership(
    {
      issuer: admin.issuer!,
      subject: "acceptance-operator",
      role: "operator",
    },
    admin,
  );
  const requester = await governance.resolveActor({
    id: "acceptance-operator",
    role: "viewer",
    workspaceId: admin.workspaceId,
    principalType: "human",
    authSource: "oidc",
    issuer: admin.issuer,
  });
  const request = await governance.requestBreakGlass(
    {
      purpose: "Validate automatic emergency access recovery",
      permissionGrants: ["deployment:control"],
      ttlMinutes: 5,
    },
    requester,
  );
  const firstApproval = await governance.approveBreakGlass(
    request.id,
    request.revision,
    admin,
  );
  const activeRequest = await governance.approveBreakGlass(
    request.id,
    firstApproval.revision,
    secondAdmin,
  );
  const permissionWhileActive = actorPermissions(
    await governance.resolveActor(requester),
  ).includes("deployment:control");
  now = new Date(now.getTime() + 6 * 60_000);
  const enforcement = await governance.enforceAccessGovernance(systemActor);
  const permissionAfterExpiry = actorPermissions(
    await governance.resolveActor(requester),
  ).includes("deployment:control");

  const overview = await operations.overview(admin);
  const rawSamples = overview.samples.filter(
    (sample) => sample.metric === "acceptance-latency-ms",
  );
  const hourlyBuckets = overview.series.filter(
    (bucket) =>
      bucket.metric === "acceptance-latency-ms" &&
      bucket.granularity === "hour",
  );
  const dailyBuckets = overview.series.filter(
    (bucket) =>
      bucket.metric === "acceptance-latency-ms" &&
      bucket.granularity === "day",
  );
  const bucketReferences = new Map<string, number>();
  for (const bucket of [...hourlyBuckets, ...dailyBuckets]) {
    for (const sampleId of bucket.sampleIds) {
      bucketReferences.set(
        sampleId,
        (bucketReferences.get(sampleId) ?? 0) + 1,
      );
    }
  }
  const rawSampleTraceability =
    rawSamples.every(
      (sample) => bucketReferences.get(sample.id) === 2,
    ) &&
    (
      await Promise.all(
        rawSamples.map((sample) => repository.getSloSample(sample.id)),
      )
    ).every(Boolean);
  const incidentDeduplication =
    firstIncident.incidents.length === 1 &&
    repeatedIncident.incidents.length === 1 &&
    firstIncident.incidents[0]?.id === repeatedIncident.incidents[0]?.id &&
    repeatedIncident.incidents[0]?.occurrenceCount === 2;
  const deadLetters = overview.deliveries.filter(
    (delivery) => delivery.status === "dead-letter",
  );
  const controllerConformance = await runDeploymentControllerConformance(
    () => now,
  );
  const checks: OperationalAcceptanceReport["checks"] = {
    thirtyOneDayCoverage:
      rawSamples.length === expectedRawSamples &&
      Date.parse(rawSamples.at(-1)?.observedAt ?? "") ===
        windowStart.getTime(),
    hourlyAggregation:
      hourlyBuckets.length === expectedRawSamples &&
      hourlyBuckets.every(
        (bucket) => bucket.count === 1 && bucket.sampleIds.length === 1,
      ),
    dailyAggregation:
      dailyBuckets.length === 31 &&
      dailyBuckets.every(
        (bucket) => bucket.count === 24 && bucket.sampleIds.length === 24,
      ),
    rawSampleTraceability,
    incidentDeduplication,
    notificationDeadLetterVisible:
      deadLetters.length === 1 &&
      deadLetters[0]?.attemptCount === deadLetters[0]?.maximumAttempts,
    breakGlassDualApproval:
      activeRequest.status === "active" &&
      activeRequest.approvals.length === 2 &&
      permissionWhileActive,
    breakGlassAutomaticRevocation:
      enforcement.expiredBreakGlass.includes(request.id) &&
      !permissionAfterExpiry,
    controllerChaosConformance: controllerConformance.passed,
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => `${check} failed`);
  const reportWithoutFingerprint = {
    schemaVersion: OPERATIONAL_ACCEPTANCE_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    window: {
      startsAt: windowStart.toISOString(),
      endsAt: new Date(
        windowStart.getTime() + expectedRawSamples * 60 * 60_000,
      ).toISOString(),
      days: 31,
      rawSamples: rawSamples.length,
      hourlyBuckets: hourlyBuckets.length,
      dailyBuckets: dailyBuckets.length,
    },
    checks,
    controllerConformance: {
      contractVersion: controllerConformance.contractVersion,
      fingerprint: controllerConformance.fingerprint,
      passed: controllerConformance.passed,
    },
    failures,
    passed: failures.length === 0,
  };
  return {
    ...reportWithoutFingerprint,
    fingerprint: sha256(reportWithoutFingerprint),
  };
}
