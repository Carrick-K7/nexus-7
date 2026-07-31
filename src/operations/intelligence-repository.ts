import type {
  AlertSuppression,
  AlertOccurrence,
  AlertRule,
  MaintenanceWindow,
  NotificationChannel,
  NotificationDelivery,
  NotificationEscalationPolicy,
  NotificationReceipt,
  OperationalIncident,
  OperationsListQuery,
  SloSample,
  SloSampleQuery,
} from "./intelligence-types";

export interface OperationalIntelligenceRepository {
  storeSloSample(sample: SloSample): Promise<{
    sample: SloSample;
    created: boolean;
  }>;
  getSloSample(sampleId: string): Promise<SloSample | null>;
  listSloSamples(
    workspaceId: string,
    query?: SloSampleQuery,
  ): Promise<SloSample[]>;
  deleteSloSamplesBefore(
    workspaceId: string,
    before: string,
  ): Promise<number>;
  createAlertRule(rule: AlertRule): Promise<AlertRule>;
  updateAlertRule(
    rule: AlertRule,
    expectedRevision: number,
  ): Promise<AlertRule>;
  listAlertRules(workspaceId: string): Promise<AlertRule[]>;
  getOperationalIncident(
    incidentId: string,
  ): Promise<OperationalIncident | null>;
  getOperationalIncidentByDedupeKey(
    workspaceId: string,
    dedupeKey: string,
  ): Promise<OperationalIncident | null>;
  createOperationalIncident(
    incident: OperationalIncident,
  ): Promise<OperationalIncident>;
  updateOperationalIncident(
    incident: OperationalIncident,
    expectedRevision: number,
  ): Promise<OperationalIncident>;
  listOperationalIncidents(
    workspaceId: string,
    query?: OperationsListQuery,
  ): Promise<OperationalIncident[]>;
  appendAlertOccurrence(
    occurrence: AlertOccurrence,
  ): Promise<AlertOccurrence>;
  listAlertOccurrences(
    workspaceId: string,
    query?: OperationsListQuery,
  ): Promise<AlertOccurrence[]>;
  createNotificationChannel(
    channel: NotificationChannel,
  ): Promise<NotificationChannel>;
  updateNotificationChannel(
    channel: NotificationChannel,
    expectedRevision: number,
  ): Promise<NotificationChannel>;
  getNotificationChannel(
    channelId: string,
  ): Promise<NotificationChannel | null>;
  listNotificationChannels(
    workspaceId: string,
  ): Promise<NotificationChannel[]>;
  enqueueNotificationDelivery(
    delivery: NotificationDelivery,
  ): Promise<NotificationDelivery>;
  updateNotificationDelivery(
    delivery: NotificationDelivery,
  ): Promise<NotificationDelivery>;
  listNotificationDeliveries(
    workspaceId: string,
    query?: OperationsListQuery,
  ): Promise<NotificationDelivery[]>;
  listDueNotificationDeliveries(
    now: string,
    limit: number,
  ): Promise<NotificationDelivery[]>;
  createMaintenanceWindow(
    window: MaintenanceWindow,
  ): Promise<MaintenanceWindow>;
  updateMaintenanceWindow(
    window: MaintenanceWindow,
    expectedRevision: number,
  ): Promise<MaintenanceWindow>;
  listMaintenanceWindows(
    workspaceId: string,
  ): Promise<MaintenanceWindow[]>;
  createAlertSuppression(
    suppression: AlertSuppression,
  ): Promise<AlertSuppression>;
  updateAlertSuppression(
    suppression: AlertSuppression,
    expectedRevision: number,
  ): Promise<AlertSuppression>;
  listAlertSuppressions(
    workspaceId: string,
  ): Promise<AlertSuppression[]>;
  createNotificationEscalationPolicy(
    policy: NotificationEscalationPolicy,
  ): Promise<NotificationEscalationPolicy>;
  updateNotificationEscalationPolicy(
    policy: NotificationEscalationPolicy,
    expectedRevision: number,
  ): Promise<NotificationEscalationPolicy>;
  listNotificationEscalationPolicies(
    workspaceId: string,
  ): Promise<NotificationEscalationPolicy[]>;
  appendNotificationReceipt(
    receipt: NotificationReceipt,
  ): Promise<NotificationReceipt>;
  listNotificationReceipts(
    workspaceId: string,
    query?: OperationsListQuery,
  ): Promise<NotificationReceipt[]>;
}
