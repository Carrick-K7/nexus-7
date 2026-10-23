// @vitest-environment node
import { describe, expect, it } from "vitest";
import { InMemoryExperimentRepository } from "@/experiments/memory-repository";
import { ExperimentService } from "@/experiments/service";
import { GovernanceService } from "@/governance/service";
import type { ExperimentActor } from "@/experiments/types";
import type { ResearchSubject } from "@/research/contracts";
import { ResearchService } from "@/research/service";
import { ResearchWorker } from "./research";

const human: ExperimentActor = { id: "reference-human", role: "admin", principalType: "human", workspaceId: "workspace-neo-angeles" };
const workerActor: ExperimentActor = { ...human, id: "reference-worker", role: "operator", principalType: "system" };

async function fixture(beforeObserve?: () => Promise<void>) {
  const repository = new InMemoryExperimentRepository();
  await new ExperimentService(repository).initialize();
  await new GovernanceService(repository).initialize();
  let calls = 0;
  const subject: ResearchSubject = {
    id: "worker-fixture", version: "1", family: "fixture", origin: "generated-challenge", interpretation: "declared-contract",
    title: { en: "Fixture", zh: "夹具" }, claim: { en: "Healthy", zh: "健康" },
    generate: () => 1, valid: (input) => input === 1,
    measure: async () => { calls++; return { holds: true, code: "healthy", facts: { value: 1 } }; },
  };
  const service = new ResearchService(repository, [subject], async (_station, _question, _episode, meter) => {
    await beforeObserve?.();
    return { verdict: "no-change", observations: [await meter.observe(subject, 1, "discovery")], lessons: [], questions: [] };
  });
  return { service, calls: () => calls };
}

describe("research worker lifecycle", () => {
  it("refuses a standalone memory backend and human impersonation", async () => {
    const { service } = await fixture();
    expect(() => new ResearchWorker(service, workerActor, { owner: "worker" })).toThrow(/PostgreSQL/);
    expect(() => new ResearchWorker(service, human, { owner: "worker", requirePersistent: false })).toThrow(/impersonate/);
  });

  it("does not start or authorize research on an empty or paused station", async () => {
    const { service, calls } = await fixture();
    const worker = new ResearchWorker(service, workerActor, { owner: "worker", requirePersistent: false });
    expect(await worker.runCycle()).toBeNull();
    await service.start(human, { seed: "worker", subjectIds: ["worker-fixture"] });
    await service.pause(human);
    expect((await worker.runCycle())?.status).toBe("paused");
    expect(calls()).toBe(0);
  });

  it("runs authorized work, exits on cancellation and retains durable results", async () => {
    const { service, calls } = await fixture();
    await service.start(human, { seed: "worker", subjectIds: ["worker-fixture"] });
    const abort = new AbortController();
    const worker = new ResearchWorker(service, workerActor, { owner: "worker", requirePersistent: false, onCycle: () => abort.abort() });
    await worker.run(abort.signal);
    expect(calls()).toBe(1);
    expect((await service.get(human))?.episodes).toHaveLength(1);
    await worker.runCycle(abort.signal);
    expect(calls()).toBe(1);
  });

  it("survives an in-flight human pause and continues after resume without a new worker", async () => {
    let entered!: () => void;
    let release!: () => void;
    let paused!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const sawPause = new Promise<void>((resolve) => { paused = resolve; });
    let first = true;
    const { service, calls } = await fixture(async () => {
      if (first) { first = false; entered(); await blocked; }
    });
    await service.start(human, { seed: "pause-resume", subjectIds: ["worker-fixture"] });
    const controller = new AbortController();
    const worker = new ResearchWorker(service, workerActor, {
      owner: "surviving-worker", requirePersistent: false, intervalMs: 1_000,
      onCycle(station) {
        if (station?.status === "paused") paused();
        if (station?.episodes.some((episode) => episode.verdict === "no-change")) controller.abort();
      },
    });
    const running = worker.run(controller.signal);
    await started;
    await service.pause(human);
    release();
    await sawPause;
    await service.resume(human);
    await running;
    expect(calls()).toBe(1);
    expect((await service.get(human))?.episodes.map((episode) => episode.verdict)).toEqual(["inconclusive", "no-change"]);
  });

  it("rejects invalid cadence instead of spinning", async () => {
    const { service } = await fixture();
    for (const intervalMs of [0, -1, NaN, Infinity, 0.5, 999, 3_600_001]) {
      expect(() => new ResearchWorker(service, workerActor, { owner: "worker", requirePersistent: false, intervalMs })).toThrow();
    }
  });
});
