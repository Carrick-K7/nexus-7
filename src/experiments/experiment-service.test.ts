// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import {
  ExperimentConflictError,
  ExperimentPermissionError,
  ExperimentService,
  InMemoryExperimentRepository,
} from "@/experiments";
import type {
  ExperimentActor,
} from "@/experiments";

const operator: ExperimentActor = {
  id: "test-operator",
  role: "operator",
};

describe("persistent experiment service", () => {
  let repository: InMemoryExperimentRepository;
  let service: ExperimentService;
  let sequence: number;

  beforeEach(async () => {
    repository = new InMemoryExperimentRepository();
    sequence = 0;
    service = new ExperimentService(repository, {
      now: () => new Date("2026-07-16T12:00:00.000Z"),
      id: () => `test-${++sequence}`,
    });
    await service.initialize();
  });

  it("creates a server-owned paused run with an initial snapshot and audit", async () => {
    const run = await service.createRun(
      { name: "Causal baseline", seed: "experiment-seed" },
      operator,
    );

    expect(run.status).toBe("paused");
    expect(run.version).toBe(1);
    expect(run.run.world.tick).toBe(0);
    expect(run.run.seed).toBe("experiment-seed");
    expect(await repository.listSnapshots(run.id)).toHaveLength(1);
    expect((await repository.listAudit(run.id))[0].action).toBe("run.created");
  });

  it("steps authoritatively and exposes append-only cursor events", async () => {
    const run = await service.createRun({ name: "Step test" }, operator);
    const stepped = await service.mutateRun(
      run.id,
      run.version,
      { type: "step" },
      operator,
    );
    const events = await repository.listEvents(run.id);

    expect(stepped.run.world.tick).toBe(1);
    expect(stepped.version).toBe(2);
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((record) => record.cursor)).toEqual(
      [...events.map((record) => record.cursor)].sort((a, b) => a - b),
    );
    const afterFirst = await repository.listEvents(run.id, events[0].cursor);
    expect(afterFirst).toHaveLength(events.length - 1);
  });

  it("uses optimistic versions to reject stale concurrent mutations", async () => {
    const run = await service.createRun({ name: "Concurrency test" }, operator);
    await service.mutateRun(run.id, 1, { type: "step" }, operator);

    await expect(
      service.mutateRun(run.id, 1, { type: "step" }, operator),
    ).rejects.toBeInstanceOf(ExperimentConflictError);
  });

  it("advances only resumed runs through the server tick driver", async () => {
    const paused = await service.createRun({ name: "Paused" }, operator);
    const resumable = await service.createRun({ name: "Running" }, operator);
    await service.mutateRun(
      resumable.id,
      resumable.version,
      { type: "resume" },
      operator,
    );

    const result = await service.tickRunningRuns();
    expect(result.advanced).toEqual([resumable.id]);
    expect((await service.getRun(paused.id)).run.world.tick).toBe(0);
    expect((await service.getRun(resumable.id)).run.world.tick).toBe(1);
  });

  it("enforces viewer read-only permissions", async () => {
    await expect(
      service.createRun(
        { name: "Forbidden run" },
        { id: "observer", role: "viewer" },
      ),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
  });

  it("writes periodic snapshots and a mutation audit trail", async () => {
    let run = await service.createRun({ name: "Snapshot test" }, operator);
    for (let index = 0; index < 5; index += 1) {
      run = await service.mutateRun(
        run.id,
        run.version,
        { type: "step" },
        operator,
      );
    }

    const snapshots = await repository.listSnapshots(run.id);
    const audit = await repository.listAudit(run.id);
    expect(snapshots.map((snapshot) => snapshot.tick)).toEqual([0, 5]);
    expect(audit).toHaveLength(6);
    expect(audit.at(-1)?.action).toBe("run.stepped");
  });

  it("forks a historical tick into a replay-equivalent child run", async () => {
    let source = await service.createRun({ name: "Parent" }, operator);
    for (let index = 0; index < 8; index += 1) {
      source = await service.mutateRun(
        source.id,
        source.version,
        { type: "step" },
        operator,
      );
    }
    const child = await service.mutateRun(
      source.id,
      source.version,
      { type: "fork", tick: 5, name: "Branch at five" },
      operator,
    );

    expect(child.parentRunId).toBe(source.id);
    expect(child.forkedFromTick).toBe(5);
    expect(child.run.world.tick).toBe(5);
    expect(child.status).toBe("paused");
    expect((await service.report(child.id)).verification.deterministicReplay).toBe(
      true,
    );
  });

  it("exports a verified report bundle with storage evidence", async () => {
    let run = await service.createRun({ name: "Report test" }, operator);
    for (let index = 0; index < 6; index += 1) {
      run = await service.mutateRun(
        run.id,
        run.version,
        { type: "step" },
        operator,
      );
    }
    const report = await service.report(run.id);

    expect(report.verification.deterministicReplay).toBe(true);
    expect(report.storage.eventCount).toBe(run.run.events.length);
    expect(report.storage.snapshotCount).toBe(2);
    expect(report.storage.auditCount).toBe(7);
    expect(report.artifacts.run.world.tick).toBe(6);
  });

  it("isolates runs and reports by trusted workspace scope", async () => {
    const alpha = {
      id: "alpha-operator",
      role: "operator" as const,
      workspaceId: "workspace-alpha",
      principalType: "human" as const,
    };
    const beta = {
      id: "beta-operator",
      role: "operator" as const,
      workspaceId: "workspace-beta",
      principalType: "human" as const,
    };
    const alphaRun = await service.createRun({ name: "Alpha" }, alpha);
    const betaRun = await service.createRun({ name: "Beta" }, beta);

    expect((await service.overview(alpha)).runs.map((run) => run.id)).toEqual([
      alphaRun.id,
    ]);
    expect((await service.overview(beta)).runs.map((run) => run.id)).toEqual([
      betaRun.id,
    ]);
    await expect(service.getRun(betaRun.id, alpha)).rejects.toBeInstanceOf(
      ExperimentPermissionError,
    );
    await expect(service.report(alphaRun.id, beta)).rejects.toBeInstanceOf(
      ExperimentPermissionError,
    );
  });
});
