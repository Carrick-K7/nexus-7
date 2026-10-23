// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryExperimentRepository } from "@/experiments/memory-repository";
import { ExperimentConflictError, ExperimentPermissionError, ExperimentValidationError } from "@/experiments/errors";
import type { ExperimentActor } from "@/experiments/types";
import type { CommitLifecycleRecordInput } from "@/lifecycle";
import type { EpisodeResult, EpisodeRunner, Json, OracleMeter, ReducerProgram, ResearchStation, ResearchSubject, ResearchTool, ToolEvaluation } from "./contracts";
import { REDUCER_SCHEMA, RESEARCH_SCHEMA } from "./contracts";
import { researchDigest, researchSize } from "./integrity";
import { renderReducerSource } from "./reducer";
import { researchSubject } from "./catalog";
import { RESEARCH_EVALUATOR_VERSION } from "./evaluator";
import { ResearchService } from "./service";

const human: ExperimentActor = {
  id: "research-human", role: "operator", principalType: "human", authSource: "development",
  workspaceId: "workspace-research-test", organizationId: "organization-research-test",
};
const worker: ExperimentActor = {
  ...human, id: "research-worker", principalType: "system", authSource: "system", issuer: "nexus-research-worker",
};

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function subject(id = "contract-a", holds = false): ResearchSubject {
  return {
    id, version: "test.v1", title: { en: id, zh: `测试${id}` },
    claim: { en: "A bounded test claim", zh: "有限测试命题" }, origin: "generated-challenge",
    interpretation: "declared-contract", family: "test", generate: () => ({ value: 4 }),
    valid: (input: Json) => typeof input === "object" && input !== null && !Array.isArray(input) &&
      typeof input.value === "number" && input.value >= 0,
    measure: vi.fn(async () => ({ holds, facts: { checked: true }, code: holds ? "holds" : "counterexample" })),
  };
}

function ordinaryRunner(target: ResearchSubject): EpisodeRunner {
  return async (_station, question, episodeId, meter) => {
    const observation = await meter.observe(target, { value: 4 }, "discovery");
    return {
      verdict: observation.measurement.holds ? "no-change" : "counterexample",
      observations: [observation],
      lessons: [{
        id: `${episodeId}:lesson`, subjectId: question.subjectId, kind: observation.measurement.holds ? "limit" : "counterexample",
        statement: { en: "The measured result is retained.", zh: "保留实际测量结果。" },
        evidenceIds: [observation.id], episodeId, applicability: "test fixture only", status: "provisional",
      }],
      questions: [],
    };
  };
}

async function fixture(options: { subjects?: ResearchSubject[]; runner?: EpisodeRunner } = {}) {
  const subjects = options.subjects ?? [subject()];
  const repository = new InMemoryExperimentRepository();
  let time = Date.parse("2026-10-20T12:00:00.000Z");
  let sequence = 0;
  const now = () => new Date(time);
  const timestamp = now().toISOString();
  await repository.initialize();
  await repository.ensureWorkspace({ id: human.workspaceId!, name: "Research test", createdAt: timestamp });
  await repository.ensureOrganization({
    id: human.organizationId!, name: "Research test", createdAt: timestamp, updatedAt: timestamp,
  });
  await repository.ensureGovernedWorkspace({
    organizationId: human.organizationId!, workspaceId: human.workspaceId!, createdAt: timestamp, updatedAt: timestamp,
  });
  const runner = options.runner ?? ordinaryRunner(subjects[0]);
  const service = new ResearchService(repository, subjects, runner, { now, id: () => `test-${++sequence}`, autoInduction: false });
  const start = (policy: Parameters<ResearchService["start"]>[1]["policy"] = {}, subjectIds = subjects.map((item) => item.id)) =>
    service.start(human, {
      seed: "research-service-seed", subjectIds,
      policy: { maxOracleCalls: 20, maxCallsPerEpisode: 5, maxEpisodes: 5, maxAttemptsPerQuestion: 2, leaseMs: 1_000, ...policy },
    });
  return { service, repository, subjects, runner, start, now, advance: (ms: number) => { time += ms; } };
}

async function corrupt(f: Awaited<ReturnType<typeof fixture>>, mutate: (station: ResearchStation) => void) {
  const station = (await f.service.get(human))!;
  const record = (await f.repository.getLifecycleRecord(station.id))!;
  const event = (await f.repository.listLifecycleEvents(station.workspaceId)).at(-1)!;
  station.revision += 1;
  mutate(station);
  await f.repository.commitLifecycleRecord({
    record: { ...record, revision: station.revision, status: station.status, data: { ...station } },
    expectedRevision: record.revision,
    event: { ...event, id: `corrupt-${station.revision}`, type: "test.corruption" },
  });
}

async function startMinimizing(f: Awaited<ReturnType<typeof fixture>>,
  policy: Parameters<ResearchService["start"]>[1]["policy"] = {}, subjectIds = f.subjects.map((item) => item.id)) {
  await f.start(policy, subjectIds);
  // Explicit unit-test phase fixture: artifact tests are not survey-phase self-certification.
  await corrupt(f, (station) => {
    for (const question of station.questions) {
      question.kind = "minimize";
      question.reasonCode = "isolated-synthesis-phase-fixture";
    }
  });
}

const certifiedProgram = (): ReducerProgram => ({
  schemaVersion: REDUCER_SCHEMA, operators: ["halve-number"], maxPasses: 8,
});

function numericSubject(id = "numeric-a", healthy = false): ResearchSubject {
  return {
    ...subject(id, healthy), family: id, generate: () => 8,
    valid: (input) => typeof input === "number" && input >= 0 && input <= 64,
    measure: vi.fn(async (input: Json) => ({ holds: healthy || input === 0, code: "numeric-fixture", facts: { input } })),
  };
}

function fabricatedEvaluation(program: ReducerProgram, target: ResearchSubject, input: Json,
  overrides: Partial<ToolEvaluation> = {}): ToolEvaluation {
  return {
    verifierVersion: RESEARCH_EVALUATOR_VERSION,
    programDigest: researchDigest(program), subjectId: target.id, subjectVersion: target.version,
    inputDigest: researchDigest(input), observationIds: [], initialObservationId: null,
    finalObservationId: null, controlObservationId: null, allowance: 32,
    accepted: false, code: "fabricated-not-kernel-issued", calls: 1,
    originalSize: researchSize(input), reducedSize: researchSize(input), reduced: structuredClone(input),
    counterexamplePreserved: false, controlRejected: false, ...overrides,
  };
}

function toolResult(episodeId: string, target: ResearchSubject, program: ReducerProgram,
  evaluation: ToolEvaluation): EpisodeResult {
  return {
    verdict: evaluation.accepted ? "tool-certified" : "tool-rejected", observations: [], lessons: [], questions: [],
    tool: { id: `${episodeId}:tool`, program: structuredClone(program), digest: researchDigest(program),
      source: renderReducerSource(program), createdByEpisodeId: episodeId, trainingSubjectId: target.id,
      status: evaluation.accepted ? "certified" : "rejected", reusedOnSubjectIds: [], evaluation },
  };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("durable bounded research station", () => {
  it("GET and overview are projections and never initialize research", async () => {
    const f = await fixture();
    expect(await f.service.get(human)).toBeNull();
    expect(await f.service.step(worker, "worker-a")).toBeNull();
    expect(await f.service.overview(human)).toMatchObject({
      schemaVersion: RESEARCH_SCHEMA, backend: "memory", station: null,
      boundary: { productionWrites: false, arbitraryCodeExecution: false, liveModelCalls: false },
    });
    expect(await f.repository.listLifecycleRecords(human.workspaceId!)).toEqual([]);
  });

  it("requires explicit human authorization and denies privileged-principal impersonation", async () => {
    const f = await fixture();
    for (const actor of [worker, { ...human, principalType: "service-account" as const },
      { ...human, principalType: undefined }, { ...human, role: "viewer" as const }]) {
      await expect(f.service.start(actor, { seed: "seed", subjectIds: [f.subjects[0].id] }))
        .rejects.toBeInstanceOf(ExperimentPermissionError);
    }
    await f.start();
    await expect(f.service.pause(worker)).rejects.toBeInstanceOf(ExperimentPermissionError);
    await expect(f.service.resume({ ...human, principalType: "service-account" })).rejects.toBeInstanceOf(ExperimentPermissionError);
    await expect(f.service.step({ ...human, role: "viewer" }, "viewer")).rejects.toBeInstanceOf(ExperimentPermissionError);
  });

  it("checks exact workspace and organization even for system actors", async () => {
    const f = await fixture();
    const station = await f.start();
    expect(await f.service.get({ ...worker, workspaceId: "other-workspace" })).toBeNull();
    await expect(f.service.get({ ...worker, organizationId: "other-organization" }))
      .rejects.toBeInstanceOf(ExperimentPermissionError);
    const record = (await f.repository.getLifecycleRecord(station.id))!;
    vi.spyOn(f.repository, "getLifecycleRecord").mockResolvedValue({ ...record, workspaceId: "other-workspace" });
    await expect(f.service.get(worker)).rejects.toBeInstanceOf(ExperimentPermissionError);
    await expect(f.service.step(worker, "worker-a")).rejects.toBeInstanceOf(ExperimentPermissionError);
  });

  it("initializes idempotently under concurrency and rejects a different frozen configuration", async () => {
    const f = await fixture({ subjects: [subject("b"), subject("a")] });
    const [left, right] = await Promise.all([f.start({}, ["a", "b"]), f.start({}, ["b", "a"])]);
    expect(left).toEqual(right);
    expect(left.subjectIds).toEqual(["a", "b"]);
    expect(await f.repository.listLifecycleEvents(human.workspaceId!)).toHaveLength(1);
    await expect(f.service.start(human, { seed: "another-seed", subjectIds: ["a", "b"] }))
      .rejects.toBeInstanceOf(ExperimentConflictError);
    await expect(f.start({ maxOracleCalls: 21 })).rejects.toBeInstanceOf(ExperimentConflictError);
  });

  it("rejects invalid policy, duplicate subjects, unknown subjects, and nonfinite limits", async () => {
    const f = await fixture();
    for (const policy of [{ maxOracleCalls: -1 }, { maxOracleCalls: Number.NaN }, { maxOracleCalls: Infinity },
      { maxAttemptsPerQuestion: 100 }, { leaseMs: 0 }]) {
      await expect(f.start(policy)).rejects.toBeInstanceOf(ExperimentValidationError);
    }
    await expect(f.start({}, ["unknown"])).rejects.toBeInstanceOf(ExperimentValidationError);
    await expect(f.start({}, [f.subjects[0].id, f.subjects[0].id])).rejects.toBeInstanceOf(ExperimentValidationError);
  });

  it("enforces zero quota before any oracle or runner invocation", async () => {
    const runner = vi.fn<EpisodeRunner>();
    const f = await fixture({ runner });
    const station = await f.start({ maxOracleCalls: 0 });
    expect(station.status).toBe("budget-exhausted");
    expect((await f.service.step(worker, "worker-a"))!.budget.spentCalls).toBe(0);
    expect(station.questions[0].status).toBe("pending");
    expect(runner).not.toHaveBeenCalled();
    expect(f.subjects[0].measure).not.toHaveBeenCalled();
  });

  it("atomically persists actual calls, negative evidence, lesson links, and an episode hash", async () => {
    const target = subject("negative-result", true);
    const f = await fixture({ subjects: [target] });
    const initial = await f.start();
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.status).toBe("idle");
    expect(result.budget).toEqual({ spentCalls: 1, reservedCalls: 0, abandonedReservations: 0, externalModelCalls: 0, actualModelCostUsd: 0 });
    expect(result.episodes[0].verdict).toBe("no-change");
    expect(result.episodes[0].lessonIds).toEqual([result.lessons[0].id]);
    expect(result.episodes[0].inputStateDigest).toBe(researchDigest(initial));
    const { digest, ...content } = result.episodes[0];
    expect(digest).toBe(researchDigest(content));
    expect(result.episodes[0].observations[0].inputDigest).toBe(researchDigest({ value: 4 }));
    const events = await f.repository.listLifecycleEvents(human.workspaceId!);
    expect(events.map((event) => event.type)).toEqual([
      "research.station-started", "research.episode-claimed", "research.episode-completed",
    ]);
    const second = new ResearchService(f.repository, f.subjects, f.runner, { now: f.now });
    expect(await second.get(human)).toEqual(result);
    expect(await second.step(worker, "worker-b")).toEqual(result);
    expect(target.measure).toHaveBeenCalledTimes(1);
  });

  it("allows only the winning CAS worker to invoke the runner", async () => {
    const target = subject();
    const runner = vi.fn(ordinaryRunner(target));
    const f = await fixture({ subjects: [target], runner });
    await f.start();
    const outcomes = await Promise.allSettled([f.service.step(worker, "worker-a"), f.service.step(worker, "worker-b")]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(runner).toHaveBeenCalledTimes(1);
    expect((await f.service.get(human))!.episodes).toHaveLength(1);
    expect((await f.repository.listLifecycleEvents(human.workspaceId!))).toHaveLength(3);
  });

  it("retains an active lease and never reruns it even for the same owner", async () => {
    const entered = deferred();
    const release = deferred();
    const f = await fixture({ runner: async () => {
      entered.resolve(); await release.promise;
      return { verdict: "no-change", observations: [], lessons: [], questions: [] };
    } });
    await f.start();
    const first = f.service.step(worker, "worker-a");
    await entered.promise;
    const second = (await f.service.step(worker, "worker-a"))!;
    expect(second.lease?.owner).toBe("worker-a");
    expect(second.budget).toMatchObject({ spentCalls: 0, reservedCalls: 5 });
    release.resolve();
    expect((await first)!.episodes).toHaveLength(1);
  });

  it("invalidates an in-flight result on pause and refuses the next oracle call", async () => {
    const entered = deferred();
    const release = deferred();
    const target = subject();
    let secondDenied = false;
    const f = await fixture({ subjects: [target], runner: async (_station, _question, _id, meter) => {
      await meter.observe(target, { value: 4 }, "discovery");
      entered.resolve(); await release.promise;
      try { await meter.observe(target, { value: 3 }, "confirmation"); } catch { secondDenied = true; }
      return { verdict: "no-change", observations: [], lessons: [], questions: [] };
    } });
    await f.start();
    const first = f.service.step(worker, "worker-a");
    const stale = expect(first).rejects.toBeInstanceOf(ExperimentConflictError);
    await entered.promise;
    const paused = await f.service.pause(human);
    expect(paused.status).toBe("paused");
    expect(paused.lease).toBeNull();
    expect(paused.budget).toMatchObject({ spentCalls: 5, reservedCalls: 0, abandonedReservations: 1 });
    expect(paused.episodes[0].verdict).toBe("inconclusive");
    release.resolve();
    await stale;
    expect(secondDenied).toBe(true);
    expect(target.measure).toHaveBeenCalledTimes(1);
    expect((await f.service.resume(human)).status).toBe("running");
  });

  it("charges a full expired reservation on takeover and rejects the old result", async () => {
    const entered = deferred();
    const release = deferred();
    const f = await fixture({ runner: async () => {
      entered.resolve(); await release.promise;
      return { verdict: "no-change", observations: [], lessons: [], questions: [] };
    } });
    await f.start();
    const old = f.service.step(worker, "worker-old");
    const stale = expect(old).rejects.toBeInstanceOf(ExperimentConflictError);
    await entered.promise;
    f.advance(1_001);
    const recovered = (await f.service.step(worker, "worker-new"))!;
    expect(recovered.budget).toMatchObject({ spentCalls: 5, reservedCalls: 0, abandonedReservations: 1 });
    expect(recovered.episodes[0]).toMatchObject({ verdict: "inconclusive", calls: 5, selectionReason: "expired-lease" });
    expect(recovered.questions[0]).toMatchObject({ status: "pending", attempts: 1 });
    release.resolve();
    await stale;
    expect((await f.service.get(human))!.episodes).toHaveLength(1);
  });

  it("bounds a never-finishing runner with a local lease timeout", async () => {
    vi.useFakeTimers();
    const entered = deferred();
    const release = deferred();
    const f = await fixture({ runner: async () => {
      entered.resolve(); await release.promise;
      return { verdict: "no-change", observations: [], lessons: [], questions: [] };
    } });
    await f.start();
    const task = f.service.step(worker, "worker-a");
    await entered.promise;
    f.advance(1_001);
    await vi.advanceTimersByTimeAsync(1_001);
    const result = (await task)!;
    expect(result.budget).toMatchObject({ spentCalls: 5, reservedCalls: 0, abandonedReservations: 1 });
    expect(result.episodes[0].selectionReason).toBe("episode-timeout");
    release.resolve();
  });

  it("recovers a crash before result persistence without free retries or lost reservations", async () => {
    const f = await fixture();
    await f.start();
    const original = f.repository.commitLifecycleRecord.bind(f.repository);
    let crash = true;
    vi.spyOn(f.repository, "commitLifecycleRecord").mockImplementation(async (input) => {
      if (input.event.type === "research.episode-completed" && crash) { crash = false; throw new Error("injected crash"); }
      return original(input);
    });
    await expect(f.service.step(worker, "worker-old")).rejects.toThrow("injected crash");
    expect((await f.service.get(human))!.budget).toMatchObject({ spentCalls: 0, reservedCalls: 5 });
    const restarted = new ResearchService(f.repository, f.subjects, f.runner, { now: f.now });
    f.advance(1_001);
    const recovered = (await restarted.step(worker, "worker-new"))!;
    expect(recovered.budget).toMatchObject({ spentCalls: 5, reservedCalls: 0, abandonedReservations: 1 });
    const completed = (await restarted.step(worker, "worker-new"))!;
    expect(completed.budget.spentCalls).toBe(6);
    expect(completed.episodes).toHaveLength(2);
    expect(completed.episodes[1].previousDigest).toBe(completed.episodes[0].digest);
  });

  it("does not duplicate a committed result after an acknowledgement is lost", async () => {
    const f = await fixture();
    await f.start();
    const original = f.repository.commitLifecycleRecord.bind(f.repository);
    let loseAcknowledgement = true;
    vi.spyOn(f.repository, "commitLifecycleRecord").mockImplementation(async (input) => {
      const result = await original(input);
      if (input.event.type === "research.episode-completed" && loseAcknowledgement) {
        loseAcknowledgement = false; throw new Error("lost acknowledgement");
      }
      return result;
    });
    await expect(f.service.step(worker, "worker-a")).rejects.toThrow("lost acknowledgement");
    const committed = (await f.service.get(human))!;
    expect(await f.start()).toEqual(committed);
    expect(await f.service.step(worker, "worker-a")).toEqual(committed);
    expect(committed.budget.spentCalls).toBe(1);
    expect(committed.episodes).toHaveLength(1);
    expect(f.subjects[0].measure).toHaveBeenCalledTimes(1);
  });

  it("counts failed oracle calls, redacts raw exceptions, and stops at the attempt cap", async () => {
    const target = subject();
    target.measure = vi.fn(async () => { throw new Error("SECRET-raw-provider-error"); });
    const f = await fixture({ subjects: [target] });
    await f.start();
    await f.service.step(worker, "worker-a");
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.status).toBe("idle");
    expect(result.questions[0]).toMatchObject({ status: "stopped", attempts: 2 });
    expect(result.budget.spentCalls).toBe(2);
    expect(result.episodes.every((episode) => episode.verdict === "inconclusive")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("SECRET-");
    expect(JSON.stringify(await f.repository.listLifecycleEvents(human.workspaceId!))).not.toContain("SECRET-");
    await f.service.step(worker, "worker-a");
    expect(target.measure).toHaveBeenCalledTimes(2);
  });

  it("charges malformed input attempts without calling the subject and ignores fabricated usage", async () => {
    const target = subject();
    const f = await fixture({ subjects: [target], runner: async (_station, _question, _id, meter) => {
      await expect(meter.observe(target, { value: -1 }, "discovery")).rejects.toBeInstanceOf(ExperimentValidationError);
      await expect(meter.observe(target, { value: Number.NaN }, "discovery")).rejects.toThrow();
      return { verdict: "no-change", observations: [], lessons: [], questions: [], calls: 0 } as EpisodeResult;
    } });
    await f.start();
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.budget.spentCalls).toBe(2);
    expect(result.episodes[0]).toMatchObject({ verdict: "inconclusive", calls: 2 });
    expect(target.measure).not.toHaveBeenCalled();
  });

  it("allows registered controls but invokes only registered implementations by id and version", async () => {
    const target = subject();
    const control = subject("registered-control", true);
    const maliciousMeasure = vi.fn(async () => ({ holds: false, facts: {}, code: "fabricated" }));
    const f = await fixture({ subjects: [target, control], runner: async (_station, _question, _id, meter) => {
      const observation = await meter.observe({ ...control, measure: maliciousMeasure, valid: () => true }, { value: 1 }, "tool-validation");
      return { verdict: "no-change", observations: [observation], lessons: [], questions: [] };
    } });
    await f.start({}, [target.id]);
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.episodes[0].observations[0].subjectId).toBe(control.id);
    expect(result.episodes[0].observations[0].measurement.holds).toBe(true);
    expect(control.measure).toHaveBeenCalledTimes(1);
    expect(maliciousMeasure).not.toHaveBeenCalled();
  });

  it("blocks unregistered subjects and version drift without executing their functions", async () => {
    const target = subject();
    const foreign = subject("foreign");
    const f = await fixture({ subjects: [target], runner: async (_station, _question, _id, meter) => {
      await expect(meter.observe(foreign, { value: 1 }, "discovery")).rejects.toThrow();
      await expect(meter.observe({ ...target, version: "wrong" }, { value: 1 }, "discovery")).rejects.toThrow();
      return { verdict: "no-change", observations: [], lessons: [], questions: [] };
    } });
    await f.start();
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.budget.spentCalls).toBe(2);
    expect(target.measure).not.toHaveBeenCalled();
    expect(foreign.measure).not.toHaveBeenCalled();
  });

  it("cannot exceed a reservation with concurrent or swallowed extra calls", async () => {
    const target = subject();
    const f = await fixture({ subjects: [target], runner: async (_station, _question, _id, meter) => {
      const outcomes = await Promise.allSettled(Array.from({ length: 6 }, () => meter.observe(target, { value: 1 }, "discovery")));
      return {
        verdict: "no-change", observations: outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []),
        lessons: [], questions: [],
      };
    } });
    await f.start({ maxOracleCalls: 3, maxCallsPerEpisode: 5 });
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(target.measure).toHaveBeenCalledTimes(3);
    expect(result.budget.spentCalls).toBe(3);
    expect(result.status).toBe("budget-exhausted");
    expect(result.episodes[0].verdict).toBe("inconclusive");
    expect(result.questions[0].status).toBe("pending");
  });

  it("retains pending questions in the denominator when the episode cap is reached", async () => {
    const f = await fixture({ runner: async (station, question, episodeId) => ({
      verdict: "no-change", observations: [], lessons: [],
      questions: [{ ...question, id: `${episodeId}:next`, status: "pending", attempts: 0,
        createdAtRound: station.episodes.length + 1, parentEpisodeId: episodeId, reasonCode: "next-question" }],
    }) });
    await f.start({ maxEpisodes: 1 });
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result).toMatchObject({ status: "budget-exhausted", stopReason: "episode-cap" });
    expect(result.questions.map((question) => question.status)).toEqual(["answered", "pending"]);
    expect(await f.service.step(worker, "worker-a")).toEqual(result);
  });

  it("preserves insertion order for semantically identical priority ties instead of sorting arbitrary hash ids", async () => {
    const selected: string[] = [];
    const f = await fixture({ runner: async (station, question, episodeId) => {
      selected.push(question.id);
      return {
        verdict: "no-change", observations: [], lessons: [],
        questions: station.episodes.length === 0 ? ["z", "a"].map((suffix) => ({
          ...question, id: `${episodeId}:${suffix}`, priority: 200, status: "pending", attempts: 0,
          createdAtRound: 1, parentEpisodeId: episodeId, reasonCode: "generated-follow-up",
        })) : [],
      };
    } });
    await f.start();
    await f.service.step(worker, "worker-a");
    await f.service.step(worker, "worker-a");
    await f.service.step(worker, "worker-a");
    expect(selected[1]).toMatch(/:z$/);
    expect(selected[2]).toMatch(/:a$/);
    const episodes = (await f.service.get(human))!.episodes;
    expect(episodes[1].previousDigest).toBe(episodes[0].digest);
    expect(episodes[2].previousDigest).toBe(episodes[1].digest);
  });

  it("rejects forged or duplicate reported observations and preserves actual metered facts", async () => {
    const target = subject();
    const f = await fixture({ subjects: [target], runner: async (_station, _question, _id, meter) => {
      const observation = await meter.observe(target, { value: 4 }, "discovery");
      observation.measurement.facts.checked = false;
      return { verdict: "counterexample", observations: [observation], lessons: [], questions: [] };
    } });
    await f.start();
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.episodes[0].verdict).toBe("inconclusive");
    expect(result.episodes[0].observations[0].measurement.facts.checked).toBe(true);
    expect(result.budget.spentCalls).toBe(1);
  });

  it("rejects replaying another episode's result and does not append duplicate lessons", async () => {
    const target = subject();
    let previous: EpisodeResult | undefined;
    const f = await fixture({ subjects: [target], runner: async (station, question, episodeId, meter) => {
      if (previous) return previous;
      const result = await ordinaryRunner(target)(station, question, episodeId, meter);
      result.questions = [{ ...question, id: `${episodeId}:retry`, status: "pending", attempts: 0,
        createdAtRound: 1, parentEpisodeId: episodeId, reasonCode: "test-follow-up" }];
      previous = result;
      return result;
    } });
    await f.start();
    await f.service.step(worker, "worker-a");
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.episodes.map((episode) => episode.verdict)).toEqual(["counterexample", "inconclusive"]);
    expect(new Set(result.lessons.map((lesson) => lesson.id)).size).toBe(result.lessons.length);
    expect(result.budget.spentCalls).toBe(1);
  });

  it("fails closed for unknown persisted schema, version changes, and tampered episode hashes", async () => {
    const f = await fixture();
    await f.start();
    await corrupt(f, (station) => { (station as { schemaVersion: string }).schemaVersion = "future.v9"; });
    await expect(f.service.get(human)).rejects.toBeInstanceOf(ExperimentConflictError);
    const g = await fixture();
    await g.start();
    await g.service.step(worker, "worker-a");
    await corrupt(g, (station) => { station.episodes[0].digest = "0".repeat(64); });
    await expect(g.service.step(worker, "worker-a")).rejects.toBeInstanceOf(ExperimentConflictError);
    const h = await fixture();
    await h.start();
    const changed = new ResearchService(h.repository, [{ ...h.subjects[0], version: "v2" }], h.runner);
    await expect(changed.get(human)).rejects.toBeInstanceOf(ExperimentConflictError);
  });

  it("rolls back no partial completion when the persistence boundary rejects the final CAS", async () => {
    const f = await fixture();
    await f.start();
    const original = f.repository.commitLifecycleRecord.bind(f.repository);
    vi.spyOn(f.repository, "commitLifecycleRecord").mockImplementation(async (input: CommitLifecycleRecordInput) => {
      if (input.event.type === "research.episode-completed") throw new ExperimentConflictError("injected conflict");
      return original(input);
    });
    await expect(f.service.step(worker, "worker-a")).rejects.toBeInstanceOf(ExperimentConflictError);
    const stored = (await f.service.get(human))!;
    expect(stored.episodes).toEqual([]);
    expect(stored.lessons).toEqual([]);
    expect(stored.budget).toMatchObject({ spentCalls: 0, reservedCalls: 5 });
    expect((await f.repository.listLifecycleEvents(human.workspaceId!))).toHaveLength(2);
  });

  it("settles a worker abort without impersonating a human or permitting another oracle call", async () => {
    const entered = deferred();
    const release = deferred();
    const attemptedAgain = deferred();
    const target = subject();
    let denied = false;
    const f = await fixture({ subjects: [target], runner: async (_station, _question, _id, meter) => {
      await meter.observe(target, { value: 4 }, "discovery");
      entered.resolve(); await release.promise;
      try { await meter.observe(target, { value: 3 }, "confirmation"); } catch { denied = true; }
      attemptedAgain.resolve();
      return { verdict: "no-change", observations: [], lessons: [], questions: [] };
    } });
    await f.start();
    const controller = new AbortController();
    const work = f.service.step(worker, "worker-a", controller.signal);
    await entered.promise;
    controller.abort();
    const stopped = (await work)!;
    expect(stopped.status).toBe("running");
    expect(stopped.lease).toBeNull();
    expect(stopped.episodes[0]).toMatchObject({ verdict: "inconclusive", calls: 1, selectionReason: "worker-interrupted" });
    expect(stopped.budget).toMatchObject({ spentCalls: 1, reservedCalls: 0, abandonedReservations: 0 });
    expect(stopped.questions[0]).toMatchObject({ status: "pending", attempts: 1 });
    release.resolve(); await attemptedAgain.promise;
    expect(denied).toBe(true);
    expect(target.measure).toHaveBeenCalledTimes(1);
    expect(await f.service.step(worker, "worker-a", controller.signal)).toEqual(stopped);
  });

  it("does not expose mutable accounting or permit runner copies to expand policy", async () => {
    const target = subject();
    const f = await fixture({ subjects: [target], runner: async (station, _question, _id, meter) => {
      station.policy.maxOracleCalls = 1_000_000;
      station.budget.spentCalls = -100;
      expect(Object.isFrozen(meter)).toBe(true);
      expect(() => Object.defineProperty(meter, "used", { value: 0 })).toThrow();
      expect(() => Object.defineProperty(meter, "limit", { value: 999 })).toThrow();
      const observation = await meter.observe(target, { value: 4 }, "discovery");
      return { verdict: "counterexample", observations: [observation], lessons: [], questions: [], calls: -99 } as EpisodeResult;
    } });
    await f.start({ maxOracleCalls: 1 });
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.policy.maxOracleCalls).toBe(1);
    expect(result.budget.spentCalls).toBe(1);
    expect(result.episodes[0].calls).toBe(1);
    expect(result.status).toBe("budget-exhausted");
    await f.service.pause(human);
    expect((await f.service.resume(human)).status).toBe("budget-exhausted");
    f.advance(35 * 24 * 60 * 60 * 1_000);
    expect((await f.service.step(worker, "worker-b"))!.budget.spentCalls).toBe(1);
  });

  it.each(["source", "digest", "operators", "calls", "size"] as const)("rejects a tool with forged %s while retaining actual oracle usage", async (mutation) => {
    const target = subject();
    const f = await fixture({ subjects: [target], runner: async (_station, _question, episodeId, meter) => {
      const observation = await meter.observe(target, { value: 4 }, "tool-validation");
      const program: ReducerProgram = { schemaVersion: REDUCER_SCHEMA, operators: ["halve-number"], maxPasses: 2 };
      const tool: ResearchTool = {
        id: `${episodeId}:tool`, program, digest: researchDigest(program), source: renderReducerSource(program),
        createdByEpisodeId: episodeId, trainingSubjectId: target.id, status: "rejected", reusedOnSubjectIds: [],
        evaluation: fabricatedEvaluation(program, target, { value: 4 }, {
          observationIds: [observation.id], initialObservationId: observation.id,
          counterexamplePreserved: true,
        }),
      };
      if (mutation === "source") tool.source += "process.exit(0);";
      if (mutation === "digest") tool.digest = "0".repeat(64);
      if (mutation === "operators") tool.program.operators.push("halve-number");
      if (mutation === "calls") tool.evaluation.calls = 0;
      if (mutation === "size") tool.evaluation.reducedSize = 0;
      return { verdict: "tool-rejected", observations: [observation], lessons: [], questions: [], tool };
    } });
    await startMinimizing(f);
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.tools).toEqual([]);
    expect(result.episodes[0].verdict).toBe("inconclusive");
    expect(result.episodes[0].selectionReason).toBe("invalid-runner-result");
    expect(result.budget.spentCalls).toBe(1);
  });

  it("persists a kernel-rejected tool as a negative result, not a certification", async () => {
    const target = numericSubject();
    const control = researchSubject("integer-sum-control");
    const program: ReducerProgram = { schemaVersion: REDUCER_SCHEMA, operators: ["shorten-string"], maxPasses: 2 };
    const f = await fixture({ subjects: [target, control], runner: async (_station, _question, episodeId, meter) => {
      const evaluation = await meter.evaluateReducer!(program, target, 8);
      return toolResult(episodeId, target, program, evaluation);
    } });
    await startMinimizing(f, { maxOracleCalls: 64, maxCallsPerEpisode: 32 }, [target.id]);
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.episodes[0].verdict).toBe("tool-rejected");
    expect(result.tools[0].status).toBe("rejected");
    expect(result.tools[0].source).toBe(renderReducerSource(result.tools[0].program));
    expect(result.episodes[0].evaluations).toEqual([result.tools[0].evaluation]);
    expect(result.budget.spentCalls).toBe(result.tools[0].evaluation.calls);
    expect(result.episodes[0].observations.map((observation) => observation.id)).toEqual(result.tools[0].evaluation.observationIds);
  });

  it("refuses fabricated certification supported only by an authentic healthy observation", async () => {
    const target = numericSubject("healthy-target", true);
    const program: ReducerProgram = { schemaVersion: REDUCER_SCHEMA, operators: ["shorten-string"], maxPasses: 1 };
    const f = await fixture({ subjects: [target], runner: async (_station, _question, episodeId, meter) => {
      const observation = await meter.observe(target, 8, "tool-validation");
      const evaluation = fabricatedEvaluation(program, target, 8, {
        accepted: true, reduced: 0, reducedSize: researchSize(0), counterexamplePreserved: true, controlRejected: true,
        observationIds: [observation.id], initialObservationId: observation.id,
        finalObservationId: observation.id, controlObservationId: observation.id,
      });
      const result = toolResult(episodeId, target, program, evaluation);
      result.observations = [observation];
      return result;
    } });
    await startMinimizing(f);
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.tools).toEqual([]);
    expect(result.episodes[0]).toMatchObject({ verdict: "inconclusive", evaluations: [], calls: 1 });
    expect(result.episodes[0].observations[0].measurement.holds).toBe(true);
  });

  it("does not treat fabricated rejected evaluations as kernel receipts either", async () => {
    const target = numericSubject();
    const program = certifiedProgram();
    const f = await fixture({ subjects: [target], runner: async (_station, _question, episodeId, meter) => {
      const observation = await meter.observe(target, 8, "tool-validation");
      return toolResult(episodeId, target, program, fabricatedEvaluation(program, target, 8, {
        observationIds: [observation.id], initialObservationId: observation.id,
      }));
    } });
    await startMinimizing(f);
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.tools).toEqual([]);
    expect(result.episodes[0]).toMatchObject({ verdict: "inconclusive", evaluations: [], calls: 1 });
  });

  it("persists only private independent receipts and meters all initial, final, and control observations", async () => {
    const target = numericSubject();
    const control = researchSubject("integer-sum-control");
    const program = certifiedProgram();
    const f = await fixture({ subjects: [target, control], runner: async (_station, _question, episodeId, meter) => {
      expect("evaluations" in meter).toBe(false);
      expect("evaluationRequests" in meter).toBe(false);
      expect(Object.isFrozen(meter)).toBe(true);
      const evaluation = await meter.evaluateReducer!(program, target, 8);
      expect(evaluation.accepted).toBe(true);
      const result = toolResult(episodeId, target, program, evaluation);
      // An extra candidate field must never become the station's receipt collection.
      return { ...result, evaluations: [fabricatedEvaluation(program, target, 0)] } as EpisodeResult;
    } });
    await startMinimizing(f, { maxOracleCalls: 64, maxCallsPerEpisode: 32 }, [target.id]);
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.episodes[0].verdict).toBe("tool-certified");
    expect(result.tools[0].evaluation).toMatchObject({ accepted: true, reduced: 1, allowance: 32 });
    expect(result.episodes[0].evaluations).toEqual([result.tools[0].evaluation]);
    const evaluation = result.tools[0].evaluation;
    expect(evaluation.calls).toBe(result.episodes[0].calls);
    expect(evaluation.observationIds).toEqual(result.episodes[0].observations.map((observation) => observation.id));
    const observations = new Map(result.episodes[0].observations.map((observation) => [observation.id, observation]));
    expect(observations.get(evaluation.initialObservationId!)!.input).toBe(8);
    expect(observations.get(evaluation.finalObservationId!)!.input).toBe(1);
    expect(observations.get(evaluation.controlObservationId!)!.measurement.holds).toBe(true);
  });

  it.each(["reduced", "accepted", "counterexamplePreserved", "controlRejected", "subjectId", "programDigest",
    "inputDigest", "allowance", "observationIds", "finalObservationId", "controlObservationId"] as const)(
    "rejects a caller-modified %s in an otherwise genuine kernel receipt", async (mutation) => {
      const target = numericSubject();
      const control = researchSubject("integer-sum-control");
      const program = certifiedProgram();
      let issued: ToolEvaluation | undefined;
      const f = await fixture({ subjects: [target, control], runner: async (_station, _question, episodeId, meter) => {
        const evaluation = await meter.evaluateReducer!(program, target, 8);
        issued = structuredClone(evaluation);
        if (mutation === "reduced") { evaluation.reduced = 0; evaluation.reducedSize = researchSize(0); }
        else if (mutation === "accepted") evaluation.accepted = false;
        else if (mutation === "counterexamplePreserved") { evaluation.counterexamplePreserved = false; evaluation.accepted = false; }
        else if (mutation === "controlRejected") { evaluation.controlRejected = false; evaluation.accepted = false; }
        else if (mutation === "subjectId") evaluation.subjectId = "forged-subject";
        else if (mutation === "programDigest") evaluation.programDigest = "0".repeat(64);
        else if (mutation === "inputDigest") evaluation.inputDigest = researchDigest(0);
        else if (mutation === "allowance") evaluation.allowance += 1;
        else if (mutation === "observationIds") evaluation.observationIds = evaluation.observationIds.slice(1);
        else if (mutation === "finalObservationId") evaluation.finalObservationId = evaluation.initialObservationId;
        else evaluation.controlObservationId = evaluation.initialObservationId;
        return toolResult(episodeId, target, program, evaluation);
      } });
      await startMinimizing(f, { maxOracleCalls: 64, maxCallsPerEpisode: 32 }, [target.id]);
      const result = (await f.service.step(worker, "worker-a"))!;
      expect(result.tools).toEqual([]);
      expect(result.episodes[0].verdict).toBe("inconclusive");
      expect(result.episodes[0].evaluations).toEqual([issued]);
      expect(result.episodes[0].evaluations![0]).toMatchObject({ accepted: true, reduced: 1 });
      expect(result.budget.spentCalls).toBe(issued!.calls);
    },
  );

  it("cannot flip a healthy kernel rejection into a positive certificate or replace the trusted subject", async () => {
    const target = numericSubject("healthy-target", true);
    const maliciousMeasure = vi.fn(async () => ({ holds: false, code: "forged", facts: {} }));
    const program = certifiedProgram();
    const f = await fixture({ subjects: [target], runner: async (_station, _question, episodeId, meter) => {
      const evaluation = await meter.evaluateReducer!(program, { ...target, measure: maliciousMeasure }, 8);
      expect(evaluation.accepted).toBe(false);
      evaluation.accepted = true;
      evaluation.counterexamplePreserved = true;
      evaluation.controlRejected = true;
      evaluation.reduced = 0;
      evaluation.reducedSize = researchSize(0);
      return toolResult(episodeId, target, program, evaluation);
    } });
    await startMinimizing(f, { maxOracleCalls: 32, maxCallsPerEpisode: 16 });
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.tools).toEqual([]);
    expect(result.episodes[0].evaluations![0]).toMatchObject({ accepted: false, reduced: 8 });
    expect(result.episodes[0].observations[0].measurement.holds).toBe(true);
    expect(maliciousMeasure).not.toHaveBeenCalled();
  });

  it.each(["subject", "program"] as const)("refuses to reuse a genuine receipt for the wrong %s", async (mismatch) => {
    const target = numericSubject("numeric-a");
    const other = numericSubject("numeric-b");
    const control = researchSubject("integer-sum-control");
    const program = certifiedProgram();
    const f = await fixture({ subjects: [target, other, control], runner: async (_station, _question, episodeId, meter) => {
      const evaluatedSubject = mismatch === "subject" ? other : target;
      const evaluation = await meter.evaluateReducer!(program, evaluatedSubject, 8);
      const claimedProgram = mismatch === "program" ? { ...program, maxPasses: 7 } : program;
      evaluation.subjectId = target.id;
      evaluation.subjectVersion = target.version;
      evaluation.programDigest = researchDigest(claimedProgram);
      return toolResult(episodeId, target, claimedProgram, evaluation);
    } });
    await startMinimizing(f, { maxOracleCalls: 64, maxCallsPerEpisode: 32 }, [target.id]);
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.tools).toEqual([]);
    expect(result.episodes[0].verdict).toBe("inconclusive");
    expect(result.episodes[0].evaluations).toHaveLength(1);
  });

  it("snapshots caller-owned input and AST before awaiting evaluator work", async () => {
    const target = subject("mutable-input");
    target.measure = vi.fn(async (input: Json) => ({
      holds: (input as { value: number }).value === 0, code: "numeric-object", facts: { input },
    }));
    const control = researchSubject("integer-sum-control");
    const originalProgram = certifiedProgram();
    const f = await fixture({ subjects: [target, control], runner: async (_station, _question, episodeId, meter) => {
      const input = { value: 8 };
      const mutableProgram = structuredClone(originalProgram);
      const pending = meter.evaluateReducer!(mutableProgram, target, input);
      mutableProgram.operators[0] = "shorten-string";
      input.value = 0;
      const evaluation = await pending;
      return toolResult(episodeId, target, originalProgram, evaluation);
    } });
    await startMinimizing(f, { maxOracleCalls: 64, maxCallsPerEpisode: 32 }, [target.id]);
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.tools[0].evaluation).toMatchObject({ accepted: true, reduced: { value: 1 }, inputDigest: researchDigest({ value: 8 }) });
    expect(result.tools[0].evaluation.programDigest).toBe(researchDigest(originalProgram));
    expect(result.episodes[0].observations[0].input).toEqual({ value: 8 });
  });

  it("drains unawaited evaluation but snapshots the returned result before a callback fills its half receipt", async () => {
    const entered = deferred();
    const release = deferred();
    const target = numericSubject();
    const originalMeasure = target.measure;
    let first = true;
    target.measure = async (input) => {
      if (first) { first = false; entered.resolve(); await release.promise; }
      return originalMeasure(input);
    };
    const control = researchSubject("integer-sum-control");
    const program = certifiedProgram();
    const f = await fixture({ subjects: [target, control], runner: async (_station, _question, episodeId, meter) => {
      const result = toolResult(episodeId, target, program, fabricatedEvaluation(program, target, 8, {
        accepted: true, reduced: 1, reducedSize: researchSize(1), counterexamplePreserved: true, controlRejected: true,
      }));
      void meter.evaluateReducer!(program, target, 8).then((evaluation) => {
        result.tool!.evaluation = evaluation;
      }, () => undefined);
      return result;
    } });
    await startMinimizing(f, { maxOracleCalls: 64, maxCallsPerEpisode: 32 }, [target.id]);
    const work = f.service.step(worker, "worker-a");
    await entered.promise;
    const before = (await f.service.get(human))!;
    expect(before.episodes).toEqual([]);
    expect(before.lease).not.toBeNull();
    release.resolve();
    const result = (await work)!;
    expect(result.tools).toEqual([]);
    expect(result.episodes[0].verdict).toBe("inconclusive");
    expect(result.episodes[0].evaluations![0]).toMatchObject({ accepted: true, reduced: 1 });
    expect(result.budget.spentCalls).toBe(result.episodes[0].evaluations![0].calls);
  });

  it("does not mint or persist a late receipt after cancellation and rejects the closed evaluator capability", async () => {
    const entered = deferred();
    const release = deferred();
    const finished = deferred();
    const target = numericSubject();
    const originalMeasure = target.measure;
    target.measure = async (input) => { entered.resolve(); await release.promise; return originalMeasure(input); };
    const control = researchSubject("integer-sum-control");
    const program = certifiedProgram();
    let oldEvaluate: NonNullable<OracleMeter["evaluateReducer"]> | undefined;
    const f = await fixture({ subjects: [target, control], runner: async (_station, _question, episodeId, meter) => {
      oldEvaluate = meter.evaluateReducer!.bind(meter);
      try { return toolResult(episodeId, target, program, await oldEvaluate(program, target, 8)); }
      finally { finished.resolve(); }
    } });
    await startMinimizing(f, { maxOracleCalls: 64, maxCallsPerEpisode: 32 }, [target.id]);
    const abort = new AbortController();
    const work = f.service.step(worker, "worker-a", abort.signal);
    await entered.promise;
    abort.abort();
    const interrupted = (await work)!;
    expect(interrupted.episodes[0]).toMatchObject({ verdict: "inconclusive", evaluations: [], calls: 1 });
    release.resolve(); await finished.promise;
    await expect(oldEvaluate!(program, target, 8)).rejects.toBeInstanceOf(ExperimentConflictError);
    expect(await f.service.get(human)).toEqual(interrupted);
  });

  it.each([
    { holds: true, verdict: "counterexample" },
    { holds: false, verdict: "no-change" },
  ] as const)("rejects a survey reporting $verdict when measured holds=$holds", async ({ holds, verdict }) => {
    const target = subject("survey-verdict", holds);
    const f = await fixture({ subjects: [target], runner: async (_station, _question, _episodeId, meter) => {
      await meter.observe(target, { value: 4 }, "discovery");
      // Omitting the receipt from candidate output must not hide it from the semantic checker.
      return { verdict, observations: [], lessons: [], questions: [] };
    } });
    await f.start();
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.episodes[0]).toMatchObject({ verdict: "inconclusive", selectionReason: "invalid-runner-result", calls: 1 });
    expect(result.episodes[0].observations[0].measurement.holds).toBe(holds);
  });

  it("does not promote a genuine tool certificate returned in an unauthorized survey phase", async () => {
    const target = numericSubject();
    const control = researchSubject("integer-sum-control");
    const program = certifiedProgram();
    const f = await fixture({ subjects: [target, control], runner: async (_station, _question, episodeId, meter) =>
      toolResult(episodeId, target, program, await meter.evaluateReducer!(program, target, 8)) });
    await f.start({ maxOracleCalls: 64, maxCallsPerEpisode: 32 }, [target.id]);
    const result = (await f.service.step(worker, "worker-a"))!;
    expect(result.tools).toEqual([]);
    expect(result.episodes[0]).toMatchObject({ kind: "survey", verdict: "inconclusive" });
    expect(result.episodes[0].evaluations![0].accepted).toBe(true);
  });

  it.each(["missing", "wrong-target", "wrong-program", "previous-episode", "valid"] as const)(
    "requires fresh exact accepted certification for tool transfer: %s", async (attempt) => {
      const source = numericSubject("a-source");
      const target = numericSubject("b-target");
      const control = researchSubject("integer-sum-control");
      const program = certifiedProgram();
      let oldReceipt: ToolEvaluation | undefined;
      const f = await fixture({ subjects: [source, target, control], runner: async (station, question, episodeId, meter) => {
        if (question.kind === "minimize") {
          const evaluation = await meter.evaluateReducer!(program, source, 8);
          oldReceipt = structuredClone(evaluation);
          const result = toolResult(episodeId, source, program, evaluation);
          result.questions = [{ id: `${episodeId}:transfer`, kind: "transfer", subjectId: target.id,
            title: target.title, status: "pending", createdAtRound: station.episodes.length + 1,
            parentEpisodeId: episodeId, toolId: result.tool!.id, priority: 999, attempts: 0, reasonCode: "fresh-transfer-test" }];
          return result;
        }
        if (attempt === "valid") await meter.evaluateReducer!(program, target, 8);
        else if (attempt === "wrong-target") await meter.evaluateReducer!(program, source, 8);
        else if (attempt === "wrong-program") await meter.evaluateReducer!({ ...program, maxPasses: 7 }, target, 8);
        else await meter.observe(target, 8, "transfer");
        return { verdict: "transferred", observations: [], lessons: [], questions: [],
          reusedTool: { toolId: question.toolId!, subjectId: target.id },
          ...(attempt === "previous-episode" ? { evaluations: [oldReceipt] } : {}) } as EpisodeResult;
      } });
      await startMinimizing(f, { maxOracleCalls: 128, maxCallsPerEpisode: 32 }, [source.id, target.id]);
      const trained = (await f.service.step(worker, "worker-a"))!;
      expect(trained.tools[0].status).toBe("certified");
      const result = (await f.service.step(worker, "worker-a"))!;
      expect(result.episodes[1].verdict).toBe(attempt === "valid" ? "transferred" : "inconclusive");
      expect(result.tools[0].reusedOnSubjectIds).toEqual(attempt === "valid" ? [target.id] : []);
      if (attempt === "missing" || attempt === "previous-episode") expect(result.episodes[1].evaluations).toEqual([]);
    },
  );
});
