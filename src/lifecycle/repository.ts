import type {
  CommitLifecycleRecordInput,
  CreateLifecycleRecordInput,
  LifecycleEvent,
  LifecycleEventQuery,
  LifecycleRecord,
  LifecycleRecordQuery,
  NewLifecycleEvent,
} from "./types";

export interface LifecycleRepository {
  createLifecycleRecord(
    input: CreateLifecycleRecordInput,
  ): Promise<LifecycleRecord>;
  commitLifecycleRecord(
    input: CommitLifecycleRecordInput,
  ): Promise<LifecycleRecord>;
  getLifecycleRecord(recordId: string): Promise<LifecycleRecord | null>;
  listLifecycleRecords(
    workspaceId: string,
    query?: LifecycleRecordQuery,
  ): Promise<LifecycleRecord[]>;
  appendLifecycleEvent(event: NewLifecycleEvent): Promise<LifecycleEvent>;
  listLifecycleEvents(
    workspaceId: string,
    query?: LifecycleEventQuery,
  ): Promise<LifecycleEvent[]>;
}
