// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  ExperimentConflictError,
  InMemoryExperimentRepository,
} from "@/experiments";
import {
  LIFECYCLE_EVENT_SCHEMA_VERSION,
  type LifecycleRecord,
  type NewLifecycleEvent,
} from "./types";

function fixture() {
  const timestamp = "2026-07-18T12:00:00.000Z";
  const record: LifecycleRecord = {
    id: "lifecycle-fixture",
    organizationId: "organization-nexus-7",
    workspaceId: "workspace-neo-angeles",
    kind: "fixture",
    status: "open",
    revision: 1,
    data: { value: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const event: NewLifecycleEvent = {
    id: "lifecycle-fixture-created",
    organizationId: record.organizationId,
    workspaceId: record.workspaceId,
    aggregateId: record.id,
    aggregateKind: record.kind,
    type: "fixture.created",
    actorId: "fixture-actor",
    correlationId: "corr-fixture",
    occurredAt: timestamp,
    schemaVersion: LIFECYCLE_EVENT_SCHEMA_VERSION,
    payload: { value: 1 },
  };
  return { record, event };
}

describe("generic lifecycle repository contract", () => {
  it("atomically creates, commits, filters, and orders append-only events", async () => {
    const repository = new InMemoryExperimentRepository();
    const { record, event } = fixture();
    await repository.createLifecycleRecord({ record, event });
    const updated: LifecycleRecord = {
      ...record,
      status: "closed",
      revision: 2,
      data: { value: 2 },
      updatedAt: "2026-07-18T12:01:00.000Z",
    };
    await repository.commitLifecycleRecord({
      record: updated,
      expectedRevision: 1,
      event: {
        ...event,
        id: "lifecycle-fixture-closed",
        type: "fixture.closed",
        occurredAt: updated.updatedAt,
        payload: { value: 2 },
      },
    });

    expect(await repository.getLifecycleRecord(record.id)).toEqual(updated);
    expect(
      await repository.listLifecycleRecords(record.workspaceId, {
        kind: "fixture",
        status: "closed",
      }),
    ).toEqual([updated]);
    expect(
      (
        await repository.listLifecycleEvents(record.workspaceId, {
          aggregateId: record.id,
        })
      ).map((entry) => [entry.cursor, entry.type]),
    ).toEqual([
      [1, "fixture.created"],
      [2, "fixture.closed"],
    ]);
  });

  it("rejects stale or mismatched envelopes without partial events", async () => {
    const repository = new InMemoryExperimentRepository();
    const { record, event } = fixture();
    await repository.createLifecycleRecord({ record, event });

    await expect(
      repository.commitLifecycleRecord({
        record: {
          ...record,
          revision: 2,
          status: "closed",
        },
        expectedRevision: 0,
        event: {
          ...event,
          id: "stale-event",
          type: "fixture.closed",
        },
      }),
    ).rejects.toBeInstanceOf(ExperimentConflictError);
    await expect(
      repository.appendLifecycleEvent(event),
    ).rejects.toBeInstanceOf(ExperimentConflictError);
    expect(await repository.getLifecycleRecord(record.id)).toEqual(record);
    expect(
      await repository.listLifecycleEvents(record.workspaceId),
    ).toHaveLength(1);
  });
});
