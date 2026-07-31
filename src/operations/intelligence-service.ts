import {
  createHash,
} from "node:crypto";
import {
  isIP,
} from "node:net";
import {
  actorPrincipalType,
  actorWorkspaceId,
  assertActorPermission,
} from "@/experiments/authorization";
import {
  ExperimentConflictError,
  ExperimentNotFoundError,
  ExperimentPermissionError,
  ExperimentValidationError,
} from "@/experiments/errors";
import type {
  ExperimentActor,
} from "@/experiments/types";
import type {
  ExperimentRepository,
} from "@/experiments/repository";
import {
  stableStringify,
} from "@/simulation";
import type {
  AlertSuppression,
  AlertComparison,
  AlertOccurrence,
  AlertRule,
  AlertSeverity,
  EscalationStep,
  MaintenanceWindow,
  NotificationChannel,
  NotificationDelivery,
  NotificationEscalationPolicy,
  NotificationEvent,
  NotificationReceipt,
  OperationalIncident,
  OperationalSource,
  OperationsOverview,
  SloMetricUnit,
  SloSample,
  SloSampleStatus,
  SloTimeBucket,
} from "./intelligence-types";
import {
  SignedWebhookTransport,
  type NotificationTransport,
} from "./signed-webhook";

export interface OperationalIntelligenceOptions {
  now?: () => Date;
  id?: () => string;
  transport?: NotificationTransport;
  rawRetentionDays?: number;
}

export interface RecordSloSampleInput {
  source: OperationalSource;
  metric: string;
  value: number;
  unit: SloMetricUnit;
  status?: SloSampleStatus;
  dimensions?: Record<string, string>;
  evidenceId?: string;
  observedAt?: string;
}

export interface CreateAlertRuleInput {
  code: string;
  name: string;
  source: OperationalSource;
  metric: string;
  comparison: AlertComparison;
  threshold: number;
  severity: AlertSeverity;
  groupBy?: string[];
  autoResolve?: boolean;
  occurrenceBudget?: {
    maximum: number;
    windowMinutes: number;
  };
  escalationPolicyId?: string;
  notificationChannelIds?: string[];
}

export interface CreateNotificationChannelInput {
  name: string;
  endpointUrl: string;
  secretEnvName: string;
  events?: NotificationEvent[];
  severities?: AlertSeverity[];
  environments?: string[];
  dryRun?: boolean;
}

export interface CreateMaintenanceWindowInput {
  name: string;
  startsAt: string;
  endsAt: string;
  ruleIds?: string[];
  environments?: string[];
  reason: string;
}

export interface CreateAlertSuppressionInput {
  ruleId?: string;
  dedupeKey?: string;
  dimensions?: Record<string, string>;
  reason: string;
  startsAt?: string;
  endsAt: string;
}

export interface CreateEscalationPolicyInput {
  name: string;
  minimumSeverity: AlertSeverity;
  steps: EscalationStep[];
}

export interface RecordNotificationReceiptInput {
  deliveryId: string;
  status: NotificationReceipt["status"];
  externalId?: string;
  detail?: string;
}

const DEFAULT_NOTIFICATION_EVENTS: NotificationEvent[] = [
  "incident.opened",
  "incident.reopened",
  "incident.resolved",
];

const ALL_ALERT_SEVERITIES: AlertSeverity[] = [
  "info",
  "warning",
  "critical",
];

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

const DEFAULT_ALERT_RULES: ReadonlyArray<
  Omit<
    CreateAlertRuleInput,
    "groupBy" | "notificationChannelIds"
  > & { groupBy: string[] }
> = [
  {
    code: "model.fallback",
    name: "Model fallback detected",
    source: "model",
    metric: "fallback-count",
    comparison: "greater-than",
    threshold: 0,
    severity: "critical",
    autoResolve: true,
    groupBy: ["model", "promptVersion"],
  },
  {
    code: "deployment.error-rate",
    name: "Deployment error rate exceeded",
    source: "deployment",
    metric: "error-rate-percent",
    comparison: "greater-than",
    threshold: 1,
    severity: "critical",
    autoResolve: true,
    groupBy: ["environment", "artifact"],
  },
  {
    code: "deployment.p95-latency",
    name: "Deployment P95 latency exceeded",
    source: "deployment",
    metric: "p95-latency-ms",
    comparison: "greater-than",
    threshold: 750,
    severity: "warning",
    autoResolve: true,
    groupBy: ["environment", "artifact"],
  },
  {
    code: "deployment.rollback-time",
    name: "Deployment rollback objective exceeded",
    source: "deployment",
    metric: "rollback-time-ms",
    comparison: "greater-than",
    threshold: 60_000,
    severity: "critical",
    autoResolve: true,
    groupBy: ["adapter"],
  },
  {
    code: "recovery.rto",
    name: "Recovery time objective exceeded",
    source: "recovery",
    metric: "recovery-time-ms",
    comparison: "greater-than",
    threshold: 120_000,
    severity: "critical",
    autoResolve: true,
    groupBy: ["database"],
  },
  {
    code: "worker.lease-age",
    name: "Worker lease heartbeat is stale",
    source: "worker",
    metric: "lease-age-ms",
    comparison: "greater-than",
    threshold: 5_000,
    severity: "warning",
    autoResolve: true,
    groupBy: ["worker", "lease"],
  },
  {
    code: "evidence.freshness",
    name: "Governance evidence is stale",
    source: "evidence",
    metric: "freshness-utilization-percent",
    comparison: "greater-than",
    threshold: 75,
    severity: "warning",
    autoResolve: true,
    groupBy: ["kind"],
  },
  {
    code: "policy.expiry",
    name: "Release policy is approaching expiry",
    source: "policy",
    metric: "expiry-remaining-hours",
    comparison: "less-than",
    threshold: 168,
    severity: "warning",
    autoResolve: true,
    groupBy: ["policyId", "version"],
  },
];

function normalizedText(
  value: string,
  field: string,
  maximumLength = 160,
): string {
  const normalized = value.trim().slice(0, maximumLength);
  if (!normalized) {
    throw new ExperimentValidationError(`${field} is required`);
  }
  return normalized;
}

function normalizedDimensions(
  value: Record<string, string> = {},
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [
        normalizedText(key, "dimension key", 80),
        normalizedText(entry, "dimension value", 160),
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

function ruleMatches(
  comparison: AlertComparison,
  value: number,
  threshold: number,
): boolean {
  switch (comparison) {
    case "greater-than":
      return value > threshold;
    case "greater-than-or-equal":
      return value >= threshold;
    case "less-than":
      return value < threshold;
    case "less-than-or-equal":
      return value <= threshold;
    case "equal":
      return value === threshold;
  }
}

function ensureFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new ExperimentValidationError(`${field} must be finite`);
  }
  return value;
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    octets[0] === 0
  );
}

function assertSafeWebhookEndpoint(endpoint: URL): void {
  if (!["http:", "https:"].includes(endpoint.protocol)) {
    throw new ExperimentValidationError(
      "Notification endpointUrl must use HTTP or HTTPS",
    );
  }
  if (endpoint.username || endpoint.password) {
    throw new ExperimentValidationError(
      "Notification endpointUrl cannot contain credentials",
    );
  }
  const hostname = endpoint.hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
  const blockedHostname =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal";
  const ipVersion = isIP(hostname);
  const blockedIp =
    (ipVersion === 4 && isPrivateIpv4(hostname)) ||
    (
      ipVersion === 6 &&
      (
        hostname === "::1" ||
        hostname.startsWith("fc") ||
        hostname.startsWith("fd") ||
        hostname.startsWith("fe8") ||
        hostname.startsWith("fe9") ||
        hostname.startsWith("fea") ||
        hostname.startsWith("feb")
      )
    );
  if (blockedHostname || blockedIp) {
    throw new ExperimentValidationError(
      "Notification endpointUrl cannot target local or private networks",
    );
  }
}

function inferStatus(
  explicit: SloSampleStatus | undefined,
): SloSampleStatus {
  return explicit ?? "healthy";
}

function bucketStart(
  isoTimestamp: string,
  granularity: "hour" | "day",
): string {
  const timestamp = new Date(isoTimestamp);
  timestamp.setUTCMinutes(0, 0, 0);
  if (granularity === "day") {
    timestamp.setUTCHours(0, 0, 0, 0);
  }
  return timestamp.toISOString();
}

function aggregateSamples(samples: SloSample[]): SloTimeBucket[] {
  const buckets = new Map<
    string,
    {
      source: OperationalSource;
      metric: string;
      bucketStart: string;
      granularity: "hour" | "day";
      values: number[];
      sampleIds: string[];
      latest: SloSample;
    }
  >();
  for (const granularity of ["hour", "day"] as const) {
    for (const sample of [...samples].sort((left, right) =>
      left.observedAt.localeCompare(right.observedAt),
    )) {
      const start = bucketStart(sample.observedAt, granularity);
      const key =
        `${granularity}:${sample.source}:${sample.metric}:${start}`;
      const current = buckets.get(key);
      if (current) {
        current.values.push(sample.value);
        current.sampleIds.push(sample.id);
        current.latest = sample;
      } else {
        buckets.set(key, {
          source: sample.source,
          metric: sample.metric,
          bucketStart: start,
          granularity,
          values: [sample.value],
          sampleIds: [sample.id],
          latest: sample,
        });
      }
    }
  }
  return [...buckets.values()]
    .map((bucket) => ({
      granularity: bucket.granularity,
      source: bucket.source,
      metric: bucket.metric,
      bucketStart: bucket.bucketStart,
      sampleIds: bucket.sampleIds.sort(),
      count: bucket.values.length,
      minimum: Math.min(...bucket.values),
      maximum: Math.max(...bucket.values),
      average:
        bucket.values.reduce((sum, value) => sum + value, 0) /
        bucket.values.length,
      latest: bucket.latest.value,
      latestStatus: bucket.latest.status,
    }))
    .sort((left, right) =>
      left.bucketStart.localeCompare(right.bucketStart),
    );
}

export class OperationalIntelligenceService {
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly transport: NotificationTransport;
  private readonly rawRetentionDays: number;

  constructor(
    private readonly repository: ExperimentRepository,
    options: OperationalIntelligenceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
    this.transport = options.transport ?? new SignedWebhookTransport();
    this.rawRetentionDays =
      Number.isInteger(options.rawRetentionDays) &&
      options.rawRetentionDays! >= 30 &&
      options.rawRetentionDays! <= 3_650
        ? options.rawRetentionDays!
        : 90;
  }

  async recordSample(
    input: RecordSloSampleInput,
    actor: ExperimentActor,
  ): Promise<{
    sample: SloSample;
    occurrences: AlertOccurrence[];
    incidents: OperationalIncident[];
  }> {
    assertActorPermission(actor, "operations:write");
    const workspaceId = actorWorkspaceId(actor);
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    await this.ensureDefaultRules(workspaceId, workspace.organizationId);
    const ingestedAt = this.now().toISOString();
    const observedAt = input.observedAt
      ? new Date(input.observedAt).toISOString()
      : ingestedAt;
    if (Date.parse(observedAt) > this.now().getTime() + 5 * 60_000) {
      throw new ExperimentValidationError(
        "SLO sample observedAt cannot be more than five minutes in the future",
      );
    }
    const dimensions = normalizedDimensions(input.dimensions);
    const sampleIdentity = {
      workspaceId,
      source: input.source,
      metric: input.metric,
      value: input.value,
      dimensions,
      evidenceId: input.evidenceId,
      observedAt,
    };
    const sampleId = `slo-sample-${hash(sampleIdentity).slice(0, 40)}`;
    const stored = await this.repository.storeSloSample({
      id: sampleId,
      organizationId: workspace.organizationId,
      workspaceId,
      source: input.source,
      metric: normalizedText(input.metric, "metric", 120),
      value: ensureFinite(input.value, "value"),
      unit: input.unit,
      status: inferStatus(input.status),
      dimensions,
      evidenceId: input.evidenceId
        ? normalizedText(input.evidenceId, "evidenceId")
        : undefined,
      observedAt,
      ingestedAt,
      ingestedBy: actor.id,
    });
    const sample = stored.sample;
    if (!stored.created) {
      return {
        sample,
        occurrences: [],
        incidents: [],
      };
    }
    const rules = (await this.repository.listAlertRules(workspaceId)).filter(
      (rule) =>
        rule.status === "active" &&
        rule.source === sample.source &&
        rule.metric === sample.metric,
    );
    const evaluations = await Promise.all(
      rules.map((rule) => this.evaluateRule(rule, sample, actor)),
    );
    const occurrences = evaluations.flatMap(
      (evaluation) => evaluation.occurrences,
    );
    const incidents = evaluations.flatMap(
      (evaluation) => evaluation.incidents,
    );
    return { sample, occurrences, incidents };
  }

  async createRule(
    input: CreateAlertRuleInput,
    actor: ExperimentActor,
  ): Promise<AlertRule> {
    assertActorPermission(actor, "alerts:manage");
    const workspaceId = actorWorkspaceId(actor);
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    const code = normalizedText(input.code, "code", 80)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-");
    const existing = await this.repository.listAlertRules(workspaceId);
    if (existing.some((rule) => rule.code === code)) {
      throw new ExperimentConflictError(`Alert rule ${code} already exists`);
    }
    const occurrenceBudget = input.occurrenceBudget ?? {
      maximum: 60,
      windowMinutes: 60,
    };
    if (
      !Number.isInteger(occurrenceBudget.maximum) ||
      occurrenceBudget.maximum < 1 ||
      occurrenceBudget.maximum > 10_000 ||
      !Number.isFinite(occurrenceBudget.windowMinutes) ||
      occurrenceBudget.windowMinutes <= 0 ||
      occurrenceBudget.windowMinutes > 30 * 24 * 60
    ) {
      throw new ExperimentValidationError(
        "occurrenceBudget must contain a maximum from 1 to 10000 and a positive windowMinutes",
      );
    }
    if (input.escalationPolicyId) {
      const escalationPolicy = (
        await this.repository.listNotificationEscalationPolicies(
          workspaceId,
        )
      ).find((policy) => policy.id === input.escalationPolicyId);
      if (!escalationPolicy) {
        throw new ExperimentNotFoundError(
          `Escalation policy ${input.escalationPolicyId} was not found`,
        );
      }
    }
    const notificationChannelIds = [
      ...new Set(input.notificationChannelIds ?? []),
    ];
    const channels = await this.repository.listNotificationChannels(
      workspaceId,
    );
    if (
      notificationChannelIds.some(
        (channelId) =>
          !channels.some((channel) => channel.id === channelId),
      )
    ) {
      throw new ExperimentValidationError(
        "notificationChannelIds contains a channel outside the workspace",
      );
    }
    const timestamp = this.now().toISOString();
    return this.repository.createAlertRule({
      id: `alert-rule-${this.id()}`,
      organizationId: workspace.organizationId,
      workspaceId,
      code,
      name: normalizedText(input.name, "name", 120),
      source: input.source,
      metric: normalizedText(input.metric, "metric", 120),
      comparison: input.comparison,
      threshold: ensureFinite(input.threshold, "threshold"),
      severity: input.severity,
      status: "active",
      groupBy: [...new Set(input.groupBy ?? ["environment"])].map((key) =>
        normalizedText(key, "groupBy", 80),
      ),
      autoResolve: input.autoResolve ?? true,
      occurrenceBudget,
      escalationPolicyId: input.escalationPolicyId,
      notificationChannelIds,
      revision: 1,
      createdBy: actor.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  async createChannel(
    input: CreateNotificationChannelInput,
    actor: ExperimentActor,
  ): Promise<NotificationChannel> {
    assertActorPermission(actor, "notifications:manage");
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        "Only a human administrator may configure notification channels",
      );
    }
    let endpoint: URL;
    try {
      endpoint = new URL(input.endpointUrl);
    } catch {
      throw new ExperimentValidationError(
        "Notification endpointUrl must be an absolute URL",
      );
    }
    assertSafeWebhookEndpoint(endpoint);
    if (
      endpoint.protocol !== "https:" &&
      process.env.NODE_ENV === "production"
    ) {
      throw new ExperimentValidationError(
        "Production notification webhooks require HTTPS",
      );
    }
    const workspaceId = actorWorkspaceId(actor);
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    const timestamp = this.now().toISOString();
    return this.repository.createNotificationChannel({
      id: `notification-channel-${this.id()}`,
      organizationId: workspace.organizationId,
      workspaceId,
      name: normalizedText(input.name, "name", 100),
      kind: "signed-webhook",
      endpointUrl: endpoint.toString(),
      secretEnvName: normalizedText(
        input.secretEnvName,
        "secretEnvName",
        120,
      ),
      events: [...new Set(input.events ?? DEFAULT_NOTIFICATION_EVENTS)],
      severities: [...new Set(input.severities ?? ALL_ALERT_SEVERITIES)],
      environments: [
        ...new Set(
          (input.environments ?? []).map((environment) =>
            normalizedText(environment, "environment", 80),
          ),
        ),
      ],
      dryRun: input.dryRun ?? false,
      status: "active",
      revision: 1,
      createdBy: actor.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  async createMaintenanceWindow(
    input: CreateMaintenanceWindowInput,
    actor: ExperimentActor,
  ): Promise<MaintenanceWindow> {
    assertActorPermission(actor, "alerts:manage");
    this.assertHumanOperator(actor, "schedule maintenance windows");
    const workspaceId = actorWorkspaceId(actor);
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    const startsAt = new Date(input.startsAt).toISOString();
    const endsAt = new Date(input.endsAt).toISOString();
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new ExperimentValidationError(
        "Maintenance window endsAt must be after startsAt",
      );
    }
    const ruleIds = [...new Set(input.ruleIds ?? [])];
    const rules = await this.repository.listAlertRules(workspaceId);
    if (
      ruleIds.some(
        (ruleId) => !rules.some((rule) => rule.id === ruleId),
      )
    ) {
      throw new ExperimentValidationError(
        "ruleIds contains an alert rule outside the workspace",
      );
    }
    const timestamp = this.now().toISOString();
    return this.repository.createMaintenanceWindow({
      id: `maintenance-window-${this.id()}`,
      organizationId: workspace.organizationId,
      workspaceId,
      name: normalizedText(input.name, "name", 120),
      startsAt,
      endsAt,
      ruleIds,
      environments: [
        ...new Set(
          (input.environments ?? []).map((environment) =>
            normalizedText(environment, "environment", 80),
          ),
        ),
      ],
      reason: normalizedText(input.reason, "reason", 500),
      status: "scheduled",
      revision: 1,
      createdBy: actor.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  async createSuppression(
    input: CreateAlertSuppressionInput,
    actor: ExperimentActor,
  ): Promise<AlertSuppression> {
    assertActorPermission(actor, "alerts:manage");
    this.assertHumanOperator(actor, "suppress alerts");
    const workspaceId = actorWorkspaceId(actor);
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    if (!input.ruleId && !input.dedupeKey) {
      throw new ExperimentValidationError(
        "A suppression requires ruleId or dedupeKey",
      );
    }
    if (input.ruleId) {
      const rule = (await this.repository.listAlertRules(workspaceId)).find(
        (candidate) => candidate.id === input.ruleId,
      );
      if (!rule) {
        throw new ExperimentNotFoundError(
          `Alert rule ${input.ruleId} was not found`,
        );
      }
    }
    const startsAt = input.startsAt
      ? new Date(input.startsAt).toISOString()
      : this.now().toISOString();
    const endsAt = new Date(input.endsAt).toISOString();
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new ExperimentValidationError(
        "Suppression endsAt must be after startsAt",
      );
    }
    const timestamp = this.now().toISOString();
    return this.repository.createAlertSuppression({
      id: `alert-suppression-${this.id()}`,
      organizationId: workspace.organizationId,
      workspaceId,
      ruleId: input.ruleId,
      dedupeKey: input.dedupeKey
        ? normalizedText(input.dedupeKey, "dedupeKey", 128)
        : undefined,
      dimensions: normalizedDimensions(input.dimensions),
      reason: normalizedText(input.reason, "reason", 500),
      startsAt,
      endsAt,
      status: "active",
      revision: 1,
      createdBy: actor.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  async createEscalationPolicy(
    input: CreateEscalationPolicyInput,
    actor: ExperimentActor,
  ): Promise<NotificationEscalationPolicy> {
    assertActorPermission(actor, "notifications:manage");
    this.assertHumanOperator(actor, "configure escalation policies");
    if (
      input.steps.length < 1 ||
      input.steps.length > 10 ||
      input.steps.some(
        (step) =>
          !Number.isFinite(step.afterMinutes) ||
          step.afterMinutes < 0 ||
          step.afterMinutes > 30 * 24 * 60 ||
          step.channelIds.length < 1,
      )
    ) {
      throw new ExperimentValidationError(
        "Escalation policies require 1 to 10 valid steps",
      );
    }
    const workspaceId = actorWorkspaceId(actor);
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    const channels = await this.repository.listNotificationChannels(
      workspaceId,
    );
    const steps = input.steps
      .map((step) => ({
        afterMinutes: step.afterMinutes,
        channelIds: [...new Set(step.channelIds)],
      }))
      .sort((left, right) => left.afterMinutes - right.afterMinutes);
    if (
      steps.some((step) =>
        step.channelIds.some(
          (channelId) =>
            !channels.some((channel) => channel.id === channelId),
        ),
      )
    ) {
      throw new ExperimentValidationError(
        "Escalation policy contains a channel outside the workspace",
      );
    }
    const timestamp = this.now().toISOString();
    return this.repository.createNotificationEscalationPolicy({
      id: `notification-escalation-${this.id()}`,
      organizationId: workspace.organizationId,
      workspaceId,
      name: normalizedText(input.name, "name", 120),
      minimumSeverity: input.minimumSeverity,
      steps,
      status: "active",
      revision: 1,
      createdBy: actor.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  async cancelMaintenanceWindow(
    windowId: string,
    expectedRevision: number,
    actor: ExperimentActor,
  ): Promise<MaintenanceWindow> {
    assertActorPermission(actor, "alerts:manage");
    this.assertHumanOperator(actor, "cancel maintenance windows");
    const current = (
      await this.repository.listMaintenanceWindows(actorWorkspaceId(actor))
    ).find((window) => window.id === windowId);
    if (!current) {
      throw new ExperimentNotFoundError(
        `Maintenance window ${windowId} was not found`,
      );
    }
    return this.repository.updateMaintenanceWindow(
      {
        ...current,
        status: "cancelled",
        revision: current.revision + 1,
        updatedAt: this.now().toISOString(),
      },
      expectedRevision,
    );
  }

  async cancelSuppression(
    suppressionId: string,
    expectedRevision: number,
    actor: ExperimentActor,
  ): Promise<AlertSuppression> {
    assertActorPermission(actor, "alerts:manage");
    this.assertHumanOperator(actor, "cancel alert suppressions");
    const current = (
      await this.repository.listAlertSuppressions(actorWorkspaceId(actor))
    ).find((suppression) => suppression.id === suppressionId);
    if (!current) {
      throw new ExperimentNotFoundError(
        `Alert suppression ${suppressionId} was not found`,
      );
    }
    return this.repository.updateAlertSuppression(
      {
        ...current,
        status: "cancelled",
        revision: current.revision + 1,
        updatedAt: this.now().toISOString(),
      },
      expectedRevision,
    );
  }

  async recordDeliveryReceipt(
    input: RecordNotificationReceiptInput,
    actor: ExperimentActor,
  ): Promise<NotificationReceipt> {
    assertActorPermission(actor, "operations:write");
    const workspaceId = actorWorkspaceId(actor);
    const delivery = (
      await this.repository.listNotificationDeliveries(workspaceId, {
        limit: 2_000,
      })
    ).find((candidate) => candidate.id === input.deliveryId);
    if (!delivery) {
      throw new ExperimentNotFoundError(
        `Notification delivery ${input.deliveryId} was not found`,
      );
    }
    const identity = hash({
      deliveryId: delivery.id,
      status: input.status,
      externalId: input.externalId,
    });
    const existing = (
      await this.repository.listNotificationReceipts(workspaceId, {
        limit: 2_000,
      })
    ).find(
      (receipt) =>
        receipt.id === `notification-receipt-${identity.slice(0, 40)}`,
    );
    if (existing) {
      return existing;
    }
    const receivedAt = this.now().toISOString();
    const receipt = await this.repository.appendNotificationReceipt({
      id: `notification-receipt-${identity.slice(0, 40)}`,
      organizationId: delivery.organizationId,
      workspaceId,
      deliveryId: delivery.id,
      channelId: delivery.channelId,
      status: input.status,
      externalId: input.externalId
        ? normalizedText(input.externalId, "externalId", 160)
        : undefined,
      detail: input.detail
        ? normalizedText(input.detail, "detail", 500)
        : undefined,
      receivedAt,
      receivedBy: actor.id,
    });
    await this.repository.updateNotificationDelivery({
      ...delivery,
      receiptStatus: receipt.status,
      receiptAt: receivedAt,
      receiptExternalId: receipt.externalId,
      updatedAt: receivedAt,
    });
    return receipt;
  }

  async setRuleStatus(
    ruleId: string,
    status: AlertRule["status"],
    expectedRevision: number,
    actor: ExperimentActor,
  ): Promise<AlertRule> {
    assertActorPermission(actor, "alerts:manage");
    const rule = (await this.repository.listAlertRules(
      actorWorkspaceId(actor),
    )).find((candidate) => candidate.id === ruleId);
    if (!rule) {
      throw new ExperimentNotFoundError(`Alert rule ${ruleId} was not found`);
    }
    return this.repository.updateAlertRule(
      {
        ...rule,
        status,
        revision: rule.revision + 1,
        updatedAt: this.now().toISOString(),
      },
      expectedRevision,
    );
  }

  async setChannelStatus(
    channelId: string,
    status: NotificationChannel["status"],
    expectedRevision: number,
    actor: ExperimentActor,
  ): Promise<NotificationChannel> {
    assertActorPermission(actor, "notifications:manage");
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        "Only a human administrator may configure notification channels",
      );
    }
    const channel = await this.repository.getNotificationChannel(channelId);
    if (
      !channel ||
      channel.workspaceId !== actorWorkspaceId(actor)
    ) {
      throw new ExperimentNotFoundError(
        `Notification channel ${channelId} was not found`,
      );
    }
    return this.repository.updateNotificationChannel(
      {
        ...channel,
        status,
        revision: channel.revision + 1,
        updatedAt: this.now().toISOString(),
      },
      expectedRevision,
    );
  }

  async acknowledgeIncident(
    incidentId: string,
    actor: ExperimentActor,
  ): Promise<OperationalIncident> {
    assertActorPermission(actor, "incidents:manage");
    const current = await this.requireIncident(incidentId, actor);
    if (current.status === "resolved") {
      throw new ExperimentConflictError(
        "Resolved incidents cannot be acknowledged",
      );
    }
    if (current.status === "acknowledged") {
      return current;
    }
    const timestamp = this.now().toISOString();
    const next = await this.repository.updateOperationalIncident(
      {
        ...current,
        status: "acknowledged",
        acknowledgedBy: actor.id,
        acknowledgedAt: timestamp,
        revision: current.revision + 1,
        updatedAt: timestamp,
      },
      current.revision,
    );
    await this.enqueueIncidentNotifications(
      next,
      "incident.acknowledged",
    );
    return next;
  }

  async resolveIncident(
    incidentId: string,
    resolution: string,
    actor: ExperimentActor,
  ): Promise<OperationalIncident> {
    assertActorPermission(actor, "incidents:manage");
    const current = await this.requireIncident(incidentId, actor);
    if (current.status === "resolved") {
      return current;
    }
    const timestamp = this.now().toISOString();
    const next = await this.repository.updateOperationalIncident(
      {
        ...current,
        status: "resolved",
        resolvedBy: actor.id,
        resolvedAt: timestamp,
        resolution: normalizedText(resolution, "resolution", 500),
        revision: current.revision + 1,
        updatedAt: timestamp,
      },
      current.revision,
    );
    await this.enqueueIncidentNotifications(next, "incident.resolved");
    return next;
  }

  async processDueDeliveries(
    actor: ExperimentActor,
    limit = 50,
  ): Promise<NotificationDelivery[]> {
    assertActorPermission(actor, "operations:write");
    const due = await this.repository.listDueNotificationDeliveries(
      this.now().toISOString(),
      Math.max(1, Math.min(limit, 200)),
    );
    const results: NotificationDelivery[] = [];
    for (const delivery of due) {
      const incident = await this.repository.getOperationalIncident(
        delivery.incidentId,
      );
      if (
        delivery.escalationStep > 0 &&
        (delivery.event === "incident.opened" ||
          delivery.event === "incident.reopened") &&
        incident?.status !== "open"
      ) {
        results.push(
          await this.repository.updateNotificationDelivery({
            ...delivery,
            status: "cancelled",
            lastError:
              "Escalation cancelled because the incident is no longer open",
            updatedAt: this.now().toISOString(),
          }),
        );
        continue;
      }
      const channel = await this.repository.getNotificationChannel(
        delivery.channelId,
      );
      if (
        !channel ||
        channel.status !== "active" ||
        channel.workspaceId !== delivery.workspaceId
      ) {
        results.push(
          await this.failDelivery(
            delivery,
            undefined,
            "Notification channel is unavailable",
          ),
        );
        continue;
      }
      if (delivery.dryRun || channel.dryRun) {
        const timestamp = this.now().toISOString();
        results.push(
          await this.repository.updateNotificationDelivery({
            ...delivery,
            status: "delivered",
            attemptCount: delivery.attemptCount + 1,
            lastAttemptAt: timestamp,
            deliveredAt: timestamp,
            responseStatus: 204,
            lastError: undefined,
            updatedAt: timestamp,
          }),
        );
        continue;
      }
      const attempt = await this.transport.send(channel, delivery);
      if (attempt.delivered) {
        const timestamp = this.now().toISOString();
        results.push(
          await this.repository.updateNotificationDelivery({
            ...delivery,
            status: "delivered",
            attemptCount: delivery.attemptCount + 1,
            lastAttemptAt: timestamp,
            deliveredAt: timestamp,
            responseStatus: attempt.responseStatus,
            lastError: undefined,
            updatedAt: timestamp,
          }),
        );
      } else {
        results.push(
          await this.failDelivery(
            delivery,
            attempt.responseStatus,
            attempt.error ?? "Notification delivery failed",
          ),
        );
      }
    }
    return results;
  }

  async enforceRetention(
    actor: ExperimentActor,
  ): Promise<{ cutoff: string; deletedSamples: number }> {
    assertActorPermission(actor, "operations:write");
    const workspaceId = actorWorkspaceId(actor);
    const cutoff = new Date(
      this.now().getTime() - this.rawRetentionDays * 24 * 60 * 60_000,
    ).toISOString();
    const deletedSamples = await this.repository.deleteSloSamplesBefore(
      workspaceId,
      cutoff,
    );
    return { cutoff, deletedSamples };
  }

  async overview(actor: ExperimentActor): Promise<OperationsOverview> {
    assertActorPermission(actor, "operations:read");
    const workspaceId = actorWorkspaceId(actor);
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    await this.ensureDefaultRules(workspaceId, workspace.organizationId);
    const [
      samples,
      rules,
      incidents,
      occurrences,
      channels,
      deliveries,
      maintenanceWindows,
      suppressions,
      escalationPolicies,
      receipts,
    ] =
      await Promise.all([
        this.repository.listSloSamples(workspaceId, { limit: 2_000 }),
        this.repository.listAlertRules(workspaceId),
        this.repository.listOperationalIncidents(workspaceId, { limit: 200 }),
        this.repository.listAlertOccurrences(workspaceId, { limit: 200 }),
        this.repository.listNotificationChannels(workspaceId),
        this.repository.listNotificationDeliveries(workspaceId, {
          limit: 200,
        }),
        this.repository.listMaintenanceWindows(workspaceId),
        this.repository.listAlertSuppressions(workspaceId),
        this.repository.listNotificationEscalationPolicies(workspaceId),
        this.repository.listNotificationReceipts(workspaceId, {
          limit: 200,
        }),
      ]);
    const now = this.now().getTime();
    const cutoff = new Date(
      now - this.rawRetentionDays * 24 * 60 * 60_000,
    ).toISOString();
    return {
      generatedAt: this.now().toISOString(),
      retention: {
        rawDays: this.rawRetentionDays,
        cutoff,
      },
      samples,
      series: aggregateSamples(samples),
      rules,
      incidents,
      occurrences,
      channels,
      deliveries,
      maintenanceWindows,
      suppressions,
      escalationPolicies,
      receipts,
      summary: {
        openIncidents: incidents.filter(
          (incident) => incident.status !== "resolved",
        ).length,
        criticalIncidents: incidents.filter(
          (incident) =>
            incident.status !== "resolved" &&
            incident.severity === "critical",
        ).length,
        breachingSamples: samples.filter(
          (sample) => sample.status === "breaching",
        ).length,
        pendingDeliveries: deliveries.filter(
          (delivery) =>
            delivery.status === "pending" ||
            delivery.status === "retrying",
        ).length,
        deadLetters: deliveries.filter(
          (delivery) => delivery.status === "dead-letter",
        ).length,
        activeSuppressions: suppressions.filter(
          (suppression) =>
            suppression.status === "active" &&
            Date.parse(suppression.startsAt) <= now &&
            Date.parse(suppression.endsAt) > now,
        ).length,
        scheduledMaintenance: maintenanceWindows.filter(
          (window) =>
            window.status === "scheduled" &&
            Date.parse(window.startsAt) <= now &&
            Date.parse(window.endsAt) > now,
        ).length,
      },
    };
  }

  private async evaluateRule(
    rule: AlertRule,
    sample: SloSample,
    actor: ExperimentActor,
  ): Promise<{
    occurrences: AlertOccurrence[];
    incidents: OperationalIncident[];
  }> {
    const matches = ruleMatches(rule.comparison, sample.value, rule.threshold);
    const groupedDimensions = Object.fromEntries(
      rule.groupBy
        .filter((key) => sample.dimensions[key] !== undefined)
        .map((key) => [key, sample.dimensions[key]]),
    );
    const dedupeKey = hash({
      workspaceId: sample.workspaceId,
      ruleId: rule.id,
      dimensions: groupedDimensions,
    });
    const current =
      await this.repository.getOperationalIncidentByDedupeKey(
        sample.workspaceId,
        dedupeKey,
      );
    if (!matches) {
      if (
        current &&
        current.status !== "resolved" &&
        rule.autoResolve
      ) {
        const timestamp = this.now().toISOString();
        const resolved = await this.repository.updateOperationalIncident(
          {
            ...current,
            status: "resolved",
            latestSampleId: sample.id,
            latestValue: sample.value,
            lastObservedAt: sample.observedAt,
            resolvedBy: "system:alert-auto-resolve",
            resolvedAt: timestamp,
            resolution: "Metric returned inside the configured threshold",
            revision: current.revision + 1,
            updatedAt: timestamp,
          },
          current.revision,
        );
        const occurrence = await this.appendOccurrence(
          rule,
          sample,
          "auto-resolved",
          resolved.id,
        );
        await this.enqueueIncidentNotifications(
          resolved,
          "incident.resolved",
        );
        return {
          occurrences: [occurrence],
          incidents: [resolved],
        };
      }
      return { occurrences: [], incidents: [] };
    }

    const suppressionReason = await this.alertSuppressionReason(
      rule,
      sample,
      dedupeKey,
      current,
    );
    if (suppressionReason) {
      const occurrence = await this.appendOccurrence(
        rule,
        sample,
        "suppressed",
        current?.id,
        suppressionReason,
      );
      return {
        occurrences: [occurrence],
        incidents: [],
      };
    }

    const timestamp = this.now().toISOString();
    let incident: OperationalIncident;
    let disposition: "opened" | "updated" | "reopened";
    if (!current) {
      disposition = "opened";
      incident = await this.repository.createOperationalIncident({
        id: `operations-incident-${this.id()}`,
        organizationId: sample.organizationId,
        workspaceId: sample.workspaceId,
        ruleId: rule.id,
        code: rule.code,
        severity: rule.severity,
        status: "open",
        summary: `${rule.name}: ${sample.value} ${sample.unit}`,
        source: sample.source,
        metric: sample.metric,
        dedupeKey,
        dimensions: groupedDimensions,
        occurrenceCount: 1,
        latestSampleId: sample.id,
        latestValue: sample.value,
        threshold: rule.threshold,
        firstObservedAt: sample.observedAt,
        lastObservedAt: sample.observedAt,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } else {
      disposition = current.status === "resolved" ? "reopened" : "updated";
      incident = await this.repository.updateOperationalIncident(
        {
          ...current,
          severity: rule.severity,
          status: disposition === "reopened" ? "open" : current.status,
          summary: `${rule.name}: ${sample.value} ${sample.unit}`,
          occurrenceCount: current.occurrenceCount + 1,
          latestSampleId: sample.id,
          latestValue: sample.value,
          lastObservedAt: sample.observedAt,
          acknowledgedBy:
            disposition === "reopened" ? undefined : current.acknowledgedBy,
          acknowledgedAt:
            disposition === "reopened" ? undefined : current.acknowledgedAt,
          resolvedBy: undefined,
          resolvedAt: undefined,
          resolution: undefined,
          revision: current.revision + 1,
          updatedAt: timestamp,
        },
        current.revision,
      );
    }
    const occurrence = await this.appendOccurrence(
      rule,
      sample,
      disposition,
      incident.id,
    );
    if (disposition !== "updated") {
      await this.enqueueIncidentNotifications(
        incident,
        disposition === "opened"
          ? "incident.opened"
          : "incident.reopened",
      );
    }
    void actor;
    return {
      occurrences: [occurrence],
      incidents: [incident],
    };
  }

  private async alertSuppressionReason(
    rule: AlertRule,
    sample: SloSample,
    dedupeKey: string,
    current: OperationalIncident | null,
  ): Promise<string | undefined> {
    const observedAt = Date.parse(sample.observedAt);
    const environment = sample.dimensions.environment;
    const maintenanceWindows =
      await this.repository.listMaintenanceWindows(sample.workspaceId);
    const maintenance = maintenanceWindows.find(
      (window) =>
        window.status === "scheduled" &&
        Date.parse(window.startsAt) <= observedAt &&
        Date.parse(window.endsAt) > observedAt &&
        (window.ruleIds.length === 0 ||
          window.ruleIds.includes(rule.id)) &&
        (window.environments.length === 0 ||
          (environment !== undefined &&
            window.environments.includes(environment))),
    );
    if (maintenance) {
      return `Maintenance window ${maintenance.name}: ${maintenance.reason}`;
    }

    const suppressions = await this.repository.listAlertSuppressions(
      sample.workspaceId,
    );
    const suppression = suppressions.find(
      (candidate) =>
        candidate.status === "active" &&
        Date.parse(candidate.startsAt) <= observedAt &&
        Date.parse(candidate.endsAt) > observedAt &&
        (!candidate.ruleId || candidate.ruleId === rule.id) &&
        (!candidate.dedupeKey || candidate.dedupeKey === dedupeKey) &&
        Object.entries(candidate.dimensions).every(
          ([key, value]) => sample.dimensions[key] === value,
        ),
    );
    if (suppression) {
      return `Explicit suppression: ${suppression.reason}`;
    }

    const budget = rule.occurrenceBudget ?? {
      maximum: 60,
      windowMinutes: 60,
    };
    const windowStart =
      observedAt - budget.windowMinutes * 60 * 1_000;
    const occurrences = await this.repository.listAlertOccurrences(
      sample.workspaceId,
      { limit: 10_000 },
    );
    const count = occurrences.filter(
      (occurrence) =>
        occurrence.ruleId === rule.id &&
        occurrence.disposition !== "suppressed" &&
        (!current || occurrence.incidentId === current.id) &&
        Date.parse(occurrence.observedAt) >= windowStart &&
        Date.parse(occurrence.observedAt) <= observedAt,
    ).length;
    if (count >= budget.maximum) {
      return (
        `Occurrence budget exhausted: ${budget.maximum} in ` +
        `${budget.windowMinutes} minutes`
      );
    }
    return undefined;
  }

  private async ensureDefaultRules(
    workspaceId: string,
    organizationId: string,
  ): Promise<void> {
    const existingCodes = new Set(
      (await this.repository.listAlertRules(workspaceId)).map(
        (rule) => rule.code,
      ),
    );
    const timestamp = this.now().toISOString();
    for (const input of DEFAULT_ALERT_RULES) {
      if (existingCodes.has(input.code)) {
        continue;
      }
      try {
        await this.repository.createAlertRule({
          id: `alert-rule-${this.id()}`,
          organizationId,
          workspaceId,
          code: input.code,
          name: input.name,
          source: input.source,
          metric: input.metric,
          comparison: input.comparison,
          threshold: input.threshold,
          severity: input.severity,
          status: "active",
          groupBy: input.groupBy,
          autoResolve: input.autoResolve ?? true,
          occurrenceBudget: {
            maximum: 60,
            windowMinutes: 60,
          },
          escalationPolicyId: undefined,
          notificationChannelIds: [],
          revision: 1,
          createdBy: "system:operational-defaults",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      } catch (error) {
        if (!(error instanceof ExperimentConflictError)) {
          throw error;
        }
      }
    }
  }

  private async appendOccurrence(
    rule: AlertRule,
    sample: SloSample,
    disposition: AlertOccurrence["disposition"],
    incidentId?: string,
    suppressionReason?: string,
  ): Promise<AlertOccurrence> {
    const timestamp = this.now().toISOString();
    return this.repository.appendAlertOccurrence({
      id: `alert-occurrence-${this.id()}`,
      organizationId: sample.organizationId,
      workspaceId: sample.workspaceId,
      ruleId: rule.id,
      incidentId,
      sampleId: sample.id,
      disposition,
      value: sample.value,
      threshold: rule.threshold,
      observedAt: sample.observedAt,
      createdAt: timestamp,
      suppressionReason,
    });
  }

  private async enqueueIncidentNotifications(
    incident: OperationalIncident,
    event: NotificationEvent,
  ): Promise<void> {
    const rules = await this.repository.listAlertRules(
      incident.workspaceId,
    );
    const rule = rules.find((candidate) => candidate.id === incident.ruleId);
    if (!rule) {
      return;
    }
    const channels = await this.repository.listNotificationChannels(
      incident.workspaceId,
    );
    const targets = new Map<
      string,
      { channelId: string; afterMinutes: number; escalationStep: number }
    >();
    for (const channelId of rule.notificationChannelIds) {
      targets.set(`${channelId}:0`, {
        channelId,
        afterMinutes: 0,
        escalationStep: 0,
      });
    }
    if (
      rule.escalationPolicyId &&
      (event === "incident.opened" || event === "incident.reopened")
    ) {
      const policy = (
        await this.repository.listNotificationEscalationPolicies(
          incident.workspaceId,
        )
      ).find(
        (candidate) =>
          candidate.id === rule.escalationPolicyId &&
          candidate.status === "active",
      );
      if (
        policy &&
        SEVERITY_RANK[incident.severity] >=
          SEVERITY_RANK[policy.minimumSeverity]
      ) {
        policy.steps.forEach((step, index) => {
          for (const channelId of step.channelIds) {
            const key = `${channelId}:${step.afterMinutes}`;
            if (!targets.has(key)) {
              targets.set(key, {
                channelId,
                afterMinutes: step.afterMinutes,
                escalationStep: index + 1,
              });
            }
          }
        });
      }
    }
    const timestamp = this.now().toISOString();
    for (const target of targets.values()) {
      const channel = channels.find(
        (candidate) => candidate.id === target.channelId,
      );
      const environment = incident.dimensions.environment;
      if (
        !channel ||
        channel.status !== "active" ||
        !channel.events.includes(event) ||
        !(channel.severities ?? ALL_ALERT_SEVERITIES).includes(
          incident.severity,
        ) ||
        (
          (channel.environments ?? []).length > 0 &&
          (
            environment === undefined ||
            !channel.environments.includes(environment)
          )
        )
      ) {
        continue;
      }
      const idempotencyKey = hash({
        channelId: channel.id,
        incidentId: incident.id,
        event,
        revision: incident.revision,
        escalationStep: target.escalationStep,
        afterMinutes: target.afterMinutes,
      });
      const payload = {
        schemaVersion: 1,
        event,
        escalation: {
          step: target.escalationStep,
          afterMinutes: target.afterMinutes,
        },
        incident: {
          id: incident.id,
          code: incident.code,
          severity: incident.severity,
          status: incident.status,
          summary: incident.summary,
          source: incident.source,
          metric: incident.metric,
          latestValue: incident.latestValue,
          threshold: incident.threshold,
          dimensions: incident.dimensions,
          firstObservedAt: incident.firstObservedAt,
          lastObservedAt: incident.lastObservedAt,
        },
        emittedAt: timestamp,
      };
      await this.repository.enqueueNotificationDelivery({
        id: `notification-delivery-${this.id()}`,
        organizationId: incident.organizationId,
        workspaceId: incident.workspaceId,
        channelId: channel.id,
        incidentId: incident.id,
        event,
        idempotencyKey,
        payload,
        payloadSha256: hash(payload),
        status: "pending",
        attemptCount: 0,
        maximumAttempts: 5,
        nextAttemptAt: new Date(
          Date.parse(timestamp) + target.afterMinutes * 60_000,
        ).toISOString(),
        dryRun: channel.dryRun ?? false,
        escalationStep: target.escalationStep,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  private async failDelivery(
    delivery: NotificationDelivery,
    responseStatus: number | undefined,
    error: string,
  ): Promise<NotificationDelivery> {
    const timestamp = this.now().toISOString();
    const attemptCount = delivery.attemptCount + 1;
    const exhausted = attemptCount >= delivery.maximumAttempts;
    const retryDelayMs = Math.min(
      60 * 60_000,
      60_000 * 2 ** Math.max(0, attemptCount - 1),
    );
    return this.repository.updateNotificationDelivery({
      ...delivery,
      status: exhausted ? "dead-letter" : "retrying",
      attemptCount,
      nextAttemptAt: exhausted
        ? timestamp
        : new Date(this.now().getTime() + retryDelayMs).toISOString(),
      lastAttemptAt: timestamp,
      responseStatus,
      lastError: error.slice(0, 500),
      updatedAt: timestamp,
    });
  }

  private async requireIncident(
    incidentId: string,
    actor: ExperimentActor,
  ): Promise<OperationalIncident> {
    const incident = await this.repository.getOperationalIncident(incidentId);
    if (
      !incident ||
      incident.workspaceId !== actorWorkspaceId(actor)
    ) {
      throw new ExperimentNotFoundError(
        `Operational incident ${incidentId} was not found`,
      );
    }
    return incident;
  }

  private assertHumanOperator(
    actor: ExperimentActor,
    action: string,
  ): void {
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        `Only a human administrator may ${action}`,
      );
    }
  }
}
