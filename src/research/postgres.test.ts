// @vitest-environment node

import { afterAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { PostgresExperimentRepository } from "@/experiments/postgres-repository";
import { ExperimentService } from "@/experiments/service";
import { ExperimentConflictError } from "@/experiments/errors";
import type { ExperimentActor } from "@/experiments/types";
import { GovernanceService } from "@/governance/service";
import { PostgresWorldRepository } from "@/symbiosis/postgres-repository";
import { createPostgresBackup, restorePostgresBackup, verifyPostgresBackup } from "@/operations/postgres-backup";
import type { EpisodeRunner, ResearchPolicy, ResearchStation, ResearchSubject } from "./contracts";
import { ResearchService } from "./service";

// Only explicit test URLs are accepted. There is no DATABASE_URL/POSTGRES_URL fallback.
const databaseUrl = process.env.TEST_DATABASE_URL;
const restoreUrl = process.env.TEST_RESTORE_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;
const sourcePool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const restorePool = restoreUrl && restoreUrl !== databaseUrl ? new Pool({ connectionString: restoreUrl }) : null;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function instrumentation(): ResearchSubject {
  return {
    id: "postgres-reference", version: "test.v1", title: { en: "PG reference", zh: "PG参考仪器" },
    claim: { en: "The reference returns a negative result", zh: "参考仪器返回负性结果" },
    origin: "generated-challenge", interpretation: "exploratory-hypothesis", family: "persistence-test",
    generate: () => [1, 2], valid: Array.isArray,
    measure: vi.fn(async () => ({ holds: true, code: "negative-result", facts: { synthetic: true } })),
  };
}

function runnerFor(subject: ResearchSubject): EpisodeRunner {
  return async (_station, question, episodeId, meter) => {
    const observation = await meter.observe(subject, [1, 2], "discovery");
    return {
      verdict: "no-change", observations: [observation], questions: [],
      lessons: [{ id: `${episodeId}:lesson`, episodeId, subjectId: question.subjectId, kind: "limit", status: "provisional",
        statement: { en: "A negative result remains in the denominator.", zh: "负性结果保留在分母中。" },
        evidenceIds: [observation.id], applicability: "isolated PostgreSQL test only" }],
    };
  };
}

integrationDescribe("PostgreSQL research lifecycle integration", () => {
  afterAll(async () => {
    await Promise.all([sourcePool?.end(), restorePool?.end()]);
    vi.restoreAllMocks();
  });

  async function setup(runner?: EpisodeRunner) {
    const repository = new PostgresExperimentRepository(sourcePool!);
    const subject = instrumentation();
    const subjects = [subject];
    let time = Date.parse("2026-10-20T13:00:00.000Z");
    const now = () => new Date(time);
    await new ExperimentService(repository, { now }).initialize();
    await new GovernanceService(repository, {
      now, organizationId: "organization-nexus-7", organizationName: "NEXUS-7 Autonomy Lab",
    }).initialize();
    const workspaceId = `research-pg-${crypto.randomUUID()}`;
    await repository.ensureWorkspace({ id: workspaceId, name: "Isolated research integration", createdAt: now().toISOString() });
    const governance = (await repository.getGovernedWorkspace("workspace-neo-angeles"))!;
    await repository.ensureGovernedWorkspace({
      organizationId: governance.organizationId, workspaceId,
      createdAt: now().toISOString(), updatedAt: now().toISOString(),
    });
    const actor: ExperimentActor = {
      id: "research-pg-human", role: "operator", principalType: "human", authSource: "development",
      workspaceId, organizationId: governance.organizationId,
    };
    const worker: ExperimentActor = { ...actor, id: "research-pg-worker", principalType: "system", authSource: "system" };
    const execute = runner ?? runnerFor(subject);
    const service = new ResearchService(repository, subjects, execute, { now });
    const start = (policy: Partial<ResearchPolicy> = {}) => service.start(actor, {
      seed: "postgres-reference-seed", subjectIds: [subject.id],
      policy: { maxOracleCalls: 20, maxCallsPerEpisode: 5, maxEpisodes: 5, maxAttemptsPerQuestion: 2, leaseMs: 1_000, ...policy },
    });
    return { repository, subjects, subject, actor, worker, service, start, execute, now, advance: (ms: number) => { time += ms; } };
  }

  it("reopens a persisted station, negative episode, budget and audit in a fresh repository", async () => {
    const f = await setup();
    const initial = await f.start();
    const result = (await f.service.step(f.worker, "owner-one"))!;
    const second = new PostgresExperimentRepository(databaseUrl!);
    try {
      await second.initialize();
      const reopened = new ResearchService(second, f.subjects, f.execute, { now: f.now });
      expect(await reopened.get(f.actor)).toEqual(result);
      expect(await reopened.step(f.worker, "owner-two")).toEqual(result);
      expect(result.episodes[0].verdict).toBe("no-change");
      expect(result.budget).toMatchObject({ spentCalls: 1, reservedCalls: 0, externalModelCalls: 0, actualModelCostUsd: 0 });
      expect(await second.getLifecycleRecord(initial.id)).toMatchObject({ kind: "research-station", status: "idle", revision: 3 });
      expect(await second.listLifecycleEvents(f.actor.workspaceId!, { aggregateId: initial.id })).toHaveLength(3);
      expect(f.subject.measure).toHaveBeenCalledTimes(1);
    } finally { await second.close(); }
  });

  it("executes only one runner when independent repositories race the same CAS revision", async () => {
    const f = await setup();
    await f.start();
    const second = new PostgresExperimentRepository(databaseUrl!);
    const barrier = deferred();
    let readers = 0;
    const waitForBoth = async (load: () => ReturnType<PostgresExperimentRepository["getLifecycleRecord"]>) => {
      const record = await load();
      if (record?.revision === 1) {
        readers += 1;
        if (readers === 2) barrier.resolve();
        await barrier.promise;
      }
      return record;
    };
    const getFirst = f.repository.getLifecycleRecord.bind(f.repository);
    const getSecond = second.getLifecycleRecord.bind(second);
    const firstSpy = vi.spyOn(f.repository, "getLifecycleRecord").mockImplementation((id) => waitForBoth(() => getFirst(id)));
    const secondSpy = vi.spyOn(second, "getLifecycleRecord").mockImplementation((id) => waitForBoth(() => getSecond(id)));
    try {
      const challenger = new ResearchService(second, f.subjects, f.execute, { now: f.now });
      const outcomes = await Promise.allSettled([
        f.service.step(f.worker, "owner-one"), challenger.step(f.worker, "owner-two"),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const rejection = outcomes.find((outcome) => outcome.status === "rejected");
      expect(rejection?.status === "rejected" && rejection.reason).toBeInstanceOf(ExperimentConflictError);
      expect(f.subject.measure).toHaveBeenCalledTimes(1);
      expect((await challenger.get(f.actor))!.episodes).toHaveLength(1);
    } finally {
      firstSpy.mockRestore(); secondSpy.mockRestore();
      await second.close();
    }
  });

  it("rolls back the record update when the atomic event insert conflicts", async () => {
    const f = await setup();
    const initial = await f.start();
    const record = (await f.repository.getLifecycleRecord(initial.id))!;
    const event = (await f.repository.listLifecycleEvents(f.actor.workspaceId!))[0];
    const changed: ResearchStation = { ...initial, revision: 2, status: "paused", stopReason: "test-conflict" };
    await expect(f.repository.commitLifecycleRecord({
      record: { ...record, revision: 2, status: "paused", data: { ...changed } },
      expectedRevision: 1, event,
    })).rejects.toThrow();
    expect(await f.service.get(f.actor)).toEqual(initial);
    expect(await f.repository.listLifecycleEvents(f.actor.workspaceId!)).toHaveLength(1);
  });

  it("recovers an expired claim through a second connection and fences the old result", async () => {
    const entered = deferred();
    const release = deferred();
    const f = await setup(async () => {
      entered.resolve(); await release.promise;
      return { verdict: "no-change", observations: [], lessons: [], questions: [] };
    });
    await f.start();
    const first = f.service.step(f.worker, "owner-old");
    const stale = expect(first).rejects.toBeInstanceOf(ExperimentConflictError);
    await entered.promise;
    const second = new PostgresExperimentRepository(databaseUrl!);
    try {
      f.advance(1_001);
      const recovery = new ResearchService(second, f.subjects, f.execute, { now: f.now });
      const recovered = (await recovery.step(f.worker, "owner-new"))!;
      expect(recovered.budget).toMatchObject({ spentCalls: 5, reservedCalls: 0, abandonedReservations: 1 });
      expect(recovered.episodes[0]).toMatchObject({ verdict: "inconclusive", calls: 5 });
      expect(recovered.questions[0]).toMatchObject({ attempts: 1, status: "pending" });
      release.resolve();
      await stale;
    } finally { release.resolve(); await second.close(); }
  });

  it.skipIf(!restorePool)("restores a checksum snapshot with a reservation and resumes without free work", async () => {
    const entered = deferred();
    const release = deferred();
    const f = await setup(async () => {
      entered.resolve(); await release.promise;
      return { verdict: "no-change", observations: [], lessons: [], questions: [] };
    });
    await new PostgresWorldRepository(sourcePool!).initialize();
    await f.start({ leaseMs: 600_000 });
    const sourceWork = f.service.step(f.worker, "source-owner");
    await entered.promise;
    const claimed = (await f.service.get(f.actor))!;
    const leaseName = `research-backup-${crypto.randomUUID()}`;
    await f.repository.acquireWorkerLease(leaseName, "ephemeral-owner", 10_000);
    try {
      const backup = await createPostgresBackup(sourcePool!, f.now());
      expect(verifyPostgresBackup(backup)).toBe(true);
      const beforeCursors = await f.repository.listLifecycleEvents(f.actor.workspaceId!);
      await restorePostgresBackup(restorePool!, backup, { force: true });
      const restoredRepository = new PostgresExperimentRepository(restorePool!);
      const restored = new ResearchService(restoredRepository, f.subjects, f.execute, {
        now: () => new Date(f.now().getTime() + 600_001),
      });
      expect(await restored.get(f.actor)).toEqual(claimed);
      expect(await restoredRepository.getWorkerLease(leaseName)).toBeNull();
      const recovered = (await restored.step(f.worker, "restored-owner"))!;
      expect(recovered.budget).toMatchObject({ spentCalls: 5, reservedCalls: 0, abandonedReservations: 1 });
      expect(recovered.episodes).toHaveLength(1);
      expect(recovered.episodes[0].verdict).toBe("inconclusive");
      const afterCursors = await restoredRepository.listLifecycleEvents(f.actor.workspaceId!);
      expect(afterCursors.at(-1)!.cursor).toBeGreaterThan(beforeCursors.at(-1)!.cursor);
      expect((await f.service.get(f.actor))!.budget).toMatchObject({ spentCalls: 0, reservedCalls: 5 });
      const tampered = structuredClone(backup);
      const row = tampered.tables.nexus_lifecycle_records.find((candidate) => candidate.id === claimed.id)!;
      row.status = "tampered";
      expect(verifyPostgresBackup(tampered)).toBe(false);
      await expect(restorePostgresBackup(restorePool!, tampered, { force: true })).rejects.toThrow("checksum");
    } finally {
      release.resolve();
      await sourceWork;
      await f.repository.releaseWorkerLease(leaseName, "ephemeral-owner");
    }
  }, 30_000);
});
