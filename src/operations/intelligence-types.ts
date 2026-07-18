export type OperationalSource =
  | "model"
  | "deployment"
  | "recovery"
  | "worker"
  | "evidence"
  | "policy";

export type SloSampleStatus =
  | "healthy"
  | "warning"
  | "breaching"
  | "missing";

export type SloMetricUnit =
  | "milliseconds"
  | "percent"
  | "count"
  | "hours"
  | "usd"
  | "boolean";

export interface SloSample {
  id: string;
  organizationId: string;
  workspaceId: string;
  source: OperationalSource;
  metric: string;
  value: number;
  unit: SloMetricUnit;
  status: SloSampleStatus;
  dimensions: Record<string, string>;
  evidenceId?: string;
  observedAt: string;
  ingestedAt: string;
  ingestedBy: string;
}

export type AlertComparison =
  | "greater-than"
  | "greater-than-or-equal"
  | "less-than"
  | "less-than-or-equal"
  | "equal";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertRuleStatus = "active" | "disabled";

export interface AlertRule {
  id: string;
  organizationId: string;
  workspaceId: string;
  code: string;
  name: string;
  source: OperationalSource;
  metric: string;
  comparison: AlertComparison;
  threshold: number;
  severity: AlertSeverity;
  status: AlertRuleStatus;
  groupBy: string[];
  autoResolve: boolean;
  occurrenceBudget: {
    maximum: number;
    windowMinutes: number;
  };
  escalationPolicyId?: string;
  notificationChannelIds: string[];
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type IncidentStatus = "open" | "acknowledged" | "resolved";

export interface OperationalIncident {
  id: string;
  organizationId: string;
  workspaceId: string;
  ruleId: string;
  code: string;
  severity: AlertSeverity;
  status: IncidentStatus;
  summary: string;
  source: OperationalSource;
  metric: string;
  dedupeKey: string;
  dimensions: Record<string, string>;
  occurrenceCount: number;
  latestSampleId: string;
  latestValue: number;
  threshold: number;
  firstObservedAt: string;
  lastObservedAt: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type AlertOccurrenceDisposition =
  | "opened"
  | "updated"
  | "reopened"
  | "auto-resolved"
  | "suppressed";

export interface AlertOccurrence {
  id: string;
  organizationId: string;
  workspaceId: string;
  ruleId: string;
  incidentId?: string;
  sampleId: string;
  disposition: AlertOccurrenceDisposition;
  value: number;
  threshold: number;
  observedAt: string;
  createdAt: string;
  suppressionReason?: string;
}

export type NotificationChannelStatus = "active" | "disabled";
export type NotificationEvent =
  | "incident.opened"
  | "incident.reopened"
  | "incident.acknowledged"
  | "incident.resolved";

export interface NotificationChannel {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  kind: "signed-webhook";
  endpointUrl: string;
  secretEnvName: string;
  events: NotificationEvent[];
  severities: AlertSeverity[];
  environments: string[];
  dryRun: boolean;
  status: NotificationChannelStatus;
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationDeliveryStatus =
  | "pending"
  | "retrying"
  | "delivered"
  | "cancelled"
  | "dead-letter";

export interface NotificationDelivery {
  id: string;
  organizationId: string;
  workspaceId: string;
  channelId: string;
  incidentId: string;
  event: NotificationEvent;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  payloadSha256: string;
  status: NotificationDeliveryStatus;
  attemptCount: number;
  maximumAttempts: number;
  nextAttemptAt: string;
  lastAttemptAt?: string;
  deliveredAt?: string;
  responseStatus?: number;
  lastError?: string;
  dryRun: boolean;
  escalationStep: number;
  receiptStatus?: "accepted" | "rejected";
  receiptAt?: string;
  receiptExternalId?: string;
  createdAt: string;
  updatedAt: string;
}

export type MaintenanceWindowStatus = "scheduled" | "cancelled";

export interface MaintenanceWindow {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  ruleIds: string[];
  environments: string[];
  reason: string;
  status: MaintenanceWindowStatus;
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type AlertSuppressionStatus = "active" | "cancelled" | "expired";

export interface AlertSuppression {
  id: string;
  organizationId: string;
  workspaceId: string;
  ruleId?: string;
  dedupeKey?: string;
  dimensions: Record<string, string>;
  reason: string;
  startsAt: string;
  endsAt: string;
  status: AlertSuppressionStatus;
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EscalationStep {
  afterMinutes: number;
  channelIds: string[];
}

export interface NotificationEscalationPolicy {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  minimumSeverity: AlertSeverity;
  steps: EscalationStep[];
  status: "active" | "disabled";
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationReceipt {
  id: string;
  organizationId: string;
  workspaceId: string;
  deliveryId: string;
  channelId: string;
  status: "accepted" | "rejected";
  externalId?: string;
  detail?: string;
  receivedAt: string;
  receivedBy: string;
}

export interface SloTimeBucket {
  granularity: "hour" | "day";
  source: OperationalSource;
  metric: string;
  bucketStart: string;
  sampleIds: string[];
  count: number;
  minimum: number;
  maximum: number;
  average: number;
  latest: number;
  latestStatus: SloSampleStatus;
}

export interface OperationsOverview {
  generatedAt: string;
  retention: {
    rawDays: number;
    cutoff: string;
  };
  samples: SloSample[];
  series: SloTimeBucket[];
  rules: AlertRule[];
  incidents: OperationalIncident[];
  occurrences: AlertOccurrence[];
  channels: NotificationChannel[];
  deliveries: NotificationDelivery[];
  maintenanceWindows: MaintenanceWindow[];
  suppressions: AlertSuppression[];
  escalationPolicies: NotificationEscalationPolicy[];
  receipts: NotificationReceipt[];
  summary: {
    openIncidents: number;
    criticalIncidents: number;
    breachingSamples: number;
    pendingDeliveries: number;
    deadLetters: number;
    activeSuppressions: number;
    scheduledMaintenance: number;
  };
}

export interface SloSampleQuery {
  source?: OperationalSource;
  metric?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface OperationsListQuery {
  limit?: number;
}
