export const LIFECYCLE_EVENT_SCHEMA_VERSION =
  "nexus.lifecycle-event.v1" as const;

export interface LifecycleRecord<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  organizationId: string;
  workspaceId: string;
  kind: string;
  status: string;
  revision: number;
  data: T;
  createdAt: string;
  updatedAt: string;
}

export interface LifecycleEvent {
  cursor: number;
  id: string;
  organizationId: string;
  workspaceId: string;
  aggregateId: string;
  aggregateKind: string;
  type: string;
  actorId: string;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
  schemaVersion: typeof LIFECYCLE_EVENT_SCHEMA_VERSION;
  payload: Record<string, unknown>;
}

export type NewLifecycleEvent = Omit<LifecycleEvent, "cursor">;

export interface LifecycleRecordQuery {
  kind?: string;
  status?: string;
  limit?: number;
}

export interface LifecycleEventQuery {
  aggregateId?: string;
  aggregateKind?: string;
  afterCursor?: number;
  limit?: number;
}

export interface CreateLifecycleRecordInput {
  record: LifecycleRecord;
  event: NewLifecycleEvent;
}

export interface CommitLifecycleRecordInput {
  record: LifecycleRecord;
  expectedRevision: number;
  event: NewLifecycleEvent;
}
