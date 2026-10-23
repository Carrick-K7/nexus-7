// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryExperimentRepository } from "@/experiments/memory-repository";
import { ExperimentConflictError } from "@/experiments/errors";
import type { ExperimentActor } from "@/experiments/types";
import type {
  EpisodeResult, EpisodeRunner, HypothesisEvaluation, Json, Observation, OracleMeter,
  ResearchQuestion, ResearchStation, ResearchSubject,
} from "./contracts";
import type { Hypothesis } from "./induction";
import {
  buildTrainingSnapshot, evaluateHypothesis, proposeHypothesis, HYPOTHESIS_EVALUATOR_VERSION, HYPOTHESIS_SAMPLING_PROTOCOL,
} from "./hypotheses";
import { researchSubject } from "./catalog";
import { researchDigest } from "./integrity";
import { ResearchService } from "./service";
import { formatHypothesisLesson, formatResearchLimitLesson } from "./hypothesis-lessons";

const human: ExperimentActor = {
  id: "hypothesis-human", role: "operator", principalType: "human", authSource: "development",
  workspaceId: "hypothesis-fixture", organizationId: "hypothesis-fixture-org",
};
const worker: ExperimentActor = {
  ...human, id: "hypothesis-worker", principalType: "system", authSource: "system", issuer: "nexus-research-worker",
};
const training = [-4, -3, -2, -1, 1, 2, 3, 4];
const program = (threshold = 0): Hypothesis => ({
  schemaVersion: "nexus.conditional-hypothesis.v1", when: { op: "gt", feature: "n:", threshold }, expectedHolds: true,
});
// Audit-lock fixtures need a training-valid negative-side proposal. A real F
// sample can be zero, so retain it when choosing the adjacent observed cut.
function auditLockRevisionProgram(values: readonly number[]): Hypothesis {
  const threshold = Math.max(...values.filter((value) => value <= 0)) / 2 + Math.min(...values.filter((value) => value > 0)) / 2;
  return { ...program(), when: { op: "lte", feature: "n:", threshold }, expectedHolds: false };
}
const empty = (verdict: EpisodeResult["verdict"] = "no-change"): EpisodeResult => ({ verdict, observations: [], lessons: [], questions: [] });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function numeric(id = "numeric-hypothesis", refutes = false): ResearchSubject {
  return {
    id, version: "numeric-hypothesis.v1", title: { en: "Numeric test", zh: "数值测试" },
    claim: { en: "Positive values satisfy the test relation", zh: "正值满足测试关系" },
    family: "numeric-fixture", origin: "generated-challenge", interpretation: "exploratory-hypothesis",
    generate: (seed) => (Number.parseInt(researchDigest(seed).slice(0, 6), 16) % 12_001 - 6_000) / 100,
    valid: (input) => typeof input === "number" && Number.isFinite(input) && Math.abs(input) <= 64,
    measure: vi.fn(async (input: Json) => ({ holds: typeof input === "number" && input > 0 &&
      (!refutes || (Number.isInteger(input) && input <= 4)), facts: { input }, code: "numeric-hypothesis-fixture" })),
  };
}
function nextQuestion(station: ResearchStation, question: ResearchQuestion, episodeId: string,
  kind: ResearchQuestion["kind"], hypothesisId?: string): ResearchQuestion {
  return { ...question, id: `${episodeId}:next:${kind}`, kind, status: "pending", attempts: 0,
    parentEpisodeId: episodeId, createdAtRound: station.episodes.length + 1, reasonCode: "isolated-hypothesis-followup",
    ...(hypothesisId ? { hypothesisId } : {}), priority: 200 };
}
async function fixture(target = numeric(), extra: ResearchSubject[] = [], options: { autoInduction?: boolean } = { autoInduction: false }) {
  const subjects = [target, ...extra, researchSubject("integer-sum-control")];
  const repository = new InMemoryExperimentRepository();
  let time = Date.parse("2026-10-20T12:00:00.000Z");
  let sequence = 0;
  const now = () => new Date(time);
  const timestamp = now().toISOString();
  await repository.initialize();
  await repository.ensureWorkspace({ id: human.workspaceId!, name: "Hypothesis tests", createdAt: timestamp });
  await repository.ensureOrganization({ id: human.organizationId!, name: "Hypothesis tests", createdAt: timestamp, updatedAt: timestamp });
  await repository.ensureGovernedWorkspace({ organizationId: human.organizationId!, workspaceId: human.workspaceId!, createdAt: timestamp, updatedAt: timestamp });
  const runner = vi.fn<EpisodeRunner>(async () => empty());
  const service = new ResearchService(repository, subjects, (...args) => runner(...args), { now, id: () => `claim-${++sequence}`, ...options });
  const f = { target, subjects, repository, runner, service, now, advance: (ms: number) => { time += ms; } };
  return f;
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function mutate(f: Fixture, change: (station: ResearchStation) => void) {
  const record = (await f.repository.getLifecycleRecord(`research-station:${human.workspaceId}`))!;
  const station = structuredClone(record.data) as unknown as ResearchStation;
  const event = (await f.repository.listLifecycleEvents(human.workspaceId!)).at(-1)!;
  change(station);
  station.revision++;
  await f.repository.commitLifecycleRecord({ record: { ...record, revision: station.revision, status: station.status, data: { ...station } },
    expectedRevision: record.revision, event: { ...event, id: `fixture:${station.revision}`, type: "test.hypothesis-fixture" } });
}
// Explicit parser-fixture construction only; production code must never rehash old episodes.
function rehashLastEpisode(station: ResearchStation): void {
  const episode = station.episodes.at(-1)!;
  const { digest, ...content } = episode;
  void digest;
  episode.digest = researchDigest(content);
}
async function start(f: Fixture, ids = [f.target.id], policy = {}) {
  await f.service.start(human, { seed: "fixture-only", subjectIds: ids,
    policy: { maxOracleCalls: 1_024, maxCallsPerEpisode: 32, maxEpisodes: 64, maxAttemptsPerQuestion: 2, leaseMs: 1_000, ...policy } });
  await mutate(f, (station) => { station.questions.forEach((question) => { question.kind = "induce"; }); });
}
async function train(target: ResearchSubject, meter: OracleMeter, inputs = training) {
  const observations: Observation[] = [];
  for (const input of inputs) observations.push(await meter.observe(target, input, "hypothesis-training"));
  return observations;
}
function proposalRunner(target: ResearchSubject, phase: "falsification" | "audit" = "falsification"): EpisodeRunner {
  return async (station, question, episodeId, meter) => {
    const observations = await train(target, meter);
    const snapshot = buildTrainingSnapshot([...station.episodes.flatMap((episode) => episode.observations), ...observations], target);
    const hypothesis = proposeHypothesis(target, snapshot, program(), episodeId);
    return { ...empty("hypothesis-proposed"), observations, hypothesis,
      lessons: [formatHypothesisLesson(episodeId, target, hypothesis)],
      questions: [nextQuestion(station, question, episodeId, phase === "audit" ? "audit-hypothesis" : "falsify", hypothesis.id)] };
  };
}
function evaluationResult(receipt: HypothesisEvaluation): EpisodeResult {
  return { ...empty(receipt.status === "refuted" ? "hypothesis-refuted" : receipt.status === "survived-budget" ? "hypothesis-survived" : "inconclusive"),
    hypothesisEvaluation: receipt };
}
async function proposed(f: Fixture, phase: "falsification" | "audit" = "falsification") {
  await start(f);
  f.runner.mockImplementation(proposalRunner(f.target, phase));
  const station = (await f.service.step(worker, "worker"))!;
  expect(station.hypotheses).toHaveLength(1);
  f.runner.mockImplementation(async (_station, question, _episodeId, meter) => evaluationResult(
    await meter.evaluateHypothesis!(question.hypothesisId!, phase)));
  return station;
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("service-owned frozen hypothesis boundary", () => {
  it("persists an actual proposal, complete training and a private replayable evaluation", async () => {
    const f = await fixture();
    const before = await proposed(f);
    const hypothesis = before.hypotheses![0];
    expect(before.episodes[0].hypothesis).toEqual(hypothesis);
    expect(hypothesis.trainingObservationIds).toEqual(buildTrainingSnapshot(before.episodes[0].observations, f.target).observationIds);
    const done = (await f.service.step(worker, "worker"))!;
    const episode = done.episodes[1];
    const receipt = done.hypothesisEvaluations![0];
    expect(receipt).toBeDefined();
    expect(episode.hypothesisEvaluations).toEqual([receipt]);
    expect(episode.hypothesisEvaluationAttempt).toEqual({ hypothesisId: hypothesis.id, phase: "falsification", seed: receipt.seed, allowance: 24,
      samplingProtocol: HYPOTHESIS_SAMPLING_PROTOCOL, evaluatorVersion: HYPOTHESIS_EVALUATOR_VERSION });
    expect(receipt.samplingProtocol).toBe(HYPOTHESIS_SAMPLING_PROTOCOL);
    expect(receipt.evaluatorVersion).toBe(HYPOTHESIS_EVALUATOR_VERSION);
    expect(receipt.seed).not.toBe(before.seed);
    expect(episode.calls).toBe(receipt.calls);
    expect(receipt.observationIds).toEqual(episode.observations.map((observation) => observation.id));
    expect(done.budget.spentCalls).toBe(8 + receipt.calls);
    expect(done.hypotheses![0]).toEqual(hypothesis);
    expect(done.episodes[0]).toEqual(before.episodes[0]);
    expect(await new ResearchService(f.repository, f.subjects, f.runner, { now: f.now }).get(human)).toEqual(done);
    let used = 0;
    const replay: OracleMeter = {
      get used() { return used; }, limit: receipt.allowance,
      async observe(subject, input, partition) {
        const original = episode.observations[used++];
        expect(input).toEqual(original.input);
        expect(partition).toBe(original.partition);
        const measurement = await subject.measure(input);
        expect(measurement).toEqual(original.measurement);
        return { ...original, measurement };
      },
    };
    expect(await evaluateHypothesis(hypothesis, f.target, before.episodes.flatMap((item) => item.observations), replay, "falsification", receipt.seed)).toEqual(receipt);
  });

  it("reads old local v1 missing arrays, then appends without rewriting its old hash chain", async () => {
    const f = await fixture();
    await start(f);
    f.runner.mockImplementation(async (station, question, episodeId, meter) => ({ ...empty(), observations: await train(f.target, meter),
      questions: [nextQuestion(station, question, episodeId, "induce")] }));
    const old = (await f.service.step(worker, "worker"))!;
    await mutate(f, (station) => { delete station.hypotheses; delete station.hypothesisEvaluations; });
    const legacy = (await f.service.get(human))!;
    expect(Object.hasOwn(legacy, "hypotheses")).toBe(false);
    f.runner.mockImplementation(async (station, _question, episodeId) => ({ ...empty("hypothesis-proposed"), hypothesis:
      proposeHypothesis(f.target, buildTrainingSnapshot(station.episodes.flatMap((episode) => episode.observations), f.target), program(), episodeId) }));
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.hypotheses).toHaveLength(1);
    expect(done.hypothesisEvaluations).toEqual([]);
    expect(done.episodes[0]).toEqual(old.episodes[0]);
    expect(done.episodes[1].previousDigest).toBe(old.episodes[0].digest);
    expect(done.episodes[1].calls).toBe(0);
  });

  it.each(["current", "prior"] as const)("rejects omitting an actual %s training counterexample from a self-consistent snapshot", async (where) => {
    const f = await fixture(numeric("contradiction", true));
    await start(f);
    if (where === "prior") {
      f.runner.mockImplementation(async (station, question, episodeId, meter) => ({ ...empty(), observations: await train(f.target, meter, [...training, 0.5]),
        questions: [nextQuestion(station, question, episodeId, "induce")] }));
      await f.service.step(worker, "worker");
    }
    f.runner.mockImplementation(async (station, _question, episodeId, meter) => {
      const observations = where === "current" ? await train(f.target, meter, [...training, 0.5]) : station.episodes[0].observations;
      const filtered = observations.filter((observation) => observation.input !== 0.5);
      return { ...empty("hypothesis-proposed"), hypothesis: proposeHypothesis(f.target, buildTrainingSnapshot(filtered, f.target), program(), episodeId) };
    });
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.hypotheses).toEqual([]);
    expect(done.episodes.at(-1)!.verdict).toBe("inconclusive");
    expect(done.episodes.flatMap((episode) => episode.observations).some((observation) => observation.input === 0.5 && !observation.measurement.holds)).toBe(true);
    expect(done.budget.spentCalls).toBe(9);
  });

  it.each(["id", "episode", "subject", "version", "program", "programDigest", "trainingDigest", "trainingIds", "vacuous", "kind"] as const)(
    "rejects a forged proposal %s while retaining actual training calls", async (mutation) => {
      const f = await fixture();
      await start(f);
      if (mutation === "kind") await mutate(f, (station) => { station.questions[0].kind = "survey"; });
      f.runner.mockImplementation(async (station, question, episodeId, meter) => {
        const result = await proposalRunner(f.target)(station, question, episodeId, meter);
        const hypothesis = result.hypothesis!;
        if (mutation === "id") hypothesis.id = "fake";
        if (mutation === "episode") hypothesis.createdByEpisodeId = "other-episode";
        if (mutation === "subject") hypothesis.subjectId = "integer-sum-control";
        if (mutation === "version") hypothesis.subjectVersion = "other-version";
        if (mutation === "program") hypothesis.program.expectedHolds = false;
        if (mutation === "programDigest") hypothesis.programDigest = "0".repeat(64);
        if (mutation === "trainingDigest") hypothesis.trainingDigest = "0".repeat(64);
        if (mutation === "trainingIds") hypothesis.trainingObservationIds.pop();
        if (mutation === "vacuous") { hypothesis.program = program(-100); hypothesis.programDigest = researchDigest(hypothesis.program); }
        return result;
      });
      const done = (await f.service.step(worker, "worker"))!;
      expect(done.hypotheses).toEqual([]);
      expect(done.episodes[0]).toMatchObject({ verdict: "inconclusive", calls: 8 });
    });

  it.each(["hypothesis-falsification", "hypothesis-audit"] as const)("refuses ordinary runner observations labeled %s", async (partition) => {
    const f = await fixture();
    await start(f);
    let denied = false;
    f.runner.mockImplementation(async (_station, _question, _episodeId, meter) => {
      try { await meter.observe(f.target, 1, partition); } catch { denied = true; }
      return empty();
    });
    const done = (await f.service.step(worker, "worker"))!;
    expect(denied).toBe(true);
    expect(f.target.measure).not.toHaveBeenCalled();
    expect(done.episodes[0]).toMatchObject({ verdict: "inconclusive", observations: [] });
  });

  it("cannot evaluate an unpersisted candidate or change private state through the runner snapshot", async () => {
    const f = await fixture();
    await start(f);
    let denied = false;
    f.runner.mockImplementation(async (station, question, episodeId, meter) => {
      const result = await proposalRunner(f.target)(station, question, episodeId, meter);
      station.hypotheses!.push(result.hypothesis!);
      question.kind = "falsify";
      question.hypothesisId = result.hypothesis!.id;
      try { await meter.evaluateHypothesis!(result.hypothesis!.id, "falsification"); } catch { denied = true; }
      return result;
    });
    const done = (await f.service.step(worker, "worker"))!;
    expect(denied).toBe(true);
    expect(done.hypotheses).toEqual([]);
    expect(done.hypothesisEvaluations).toEqual([]);
    expect(done.budget.spentCalls).toBe(8);
  });

  it.each(["id", "phase", "seed-argument", "input-argument", "object"] as const)("rejects unauthorized evaluation request %s before instrumentation", async (mutation) => {
    const f = await fixture();
    const before = await proposed(f);
    let denied = false;
    f.runner.mockImplementation(async (_station, question, _episodeId, meter) => {
      const invoke = meter.evaluateHypothesis! as (...args: unknown[]) => Promise<HypothesisEvaluation>;
      const args: unknown[] = [question.hypothesisId!, "falsification"];
      if (mutation === "id") args[0] = "unknown";
      if (mutation === "phase") args[1] = "audit";
      if (mutation === "seed-argument") args.push("chosen-seed");
      if (mutation === "input-argument") args.push({ input: 1, pass: true });
      if (mutation === "object") args[0] = before.hypotheses![0];
      try { await invoke(...args); } catch { denied = true; }
      return empty("hypothesis-survived");
    });
    const done = (await f.service.step(worker, "worker"))!;
    expect(denied).toBe(true);
    expect(done.budget.spentCalls).toBe(8);
    expect(done.episodes[1]).toMatchObject({ verdict: "inconclusive", calls: 0, hypothesisEvaluations: [] });
    expect(done.questions.at(-1)!.status).toBe("stopped");
  });

  it("rejects a structurally plausible fabricated receipt without any private issuance", async () => {
    const f = await fixture();
    const before = await proposed(f);
    const hypothesis = before.hypotheses![0];
    f.runner.mockImplementation(async () => evaluationResult({ evaluatorVersion: "conditional-falsifier-v1",
      hypothesisId: hypothesis.id, programDigest: hypothesis.programDigest, trainingDigest: hypothesis.trainingDigest,
      subjectId: hypothesis.subjectId, subjectVersion: hypothesis.subjectVersion, phase: "falsification", seed: "fabricated",
      status: "inconclusive", reason: "no-fresh-valid-inputs", observationIds: [], counterexampleIds: [], inScope: 0,
      outOfScope: 0, attemptedCandidates: 256, samplingProtocol: "bounded-perturbation-v1", sampleKinds: [],
      excludedInputDigests: [], calls: 0, allowance: 24 }));
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.episodes[1]).toMatchObject({ verdict: "inconclusive", selectionReason: "invalid-runner-result", hypothesisEvaluations: [], calls: 0 });
    expect(done.hypothesisEvaluations).toEqual([]);
    expect(f.target.measure).toHaveBeenCalledTimes(8);
  });

  it.each(["seed", "phase", "samplingProtocol", "evaluatorVersion", "subjectId", "subjectVersion", "hypothesisId", "programDigest", "trainingDigest", "allowance", "observationIds", "status", "unknown-verdict", "missing-receipt"] as const)(
    "rejects altered or unsupported evaluation result %s but keeps the private receipt", async (mutation) => {
      const f = await fixture(numeric("refutable", true));
      await proposed(f);
      let issued!: HypothesisEvaluation;
      f.runner.mockImplementation(async (_station, question, _episodeId, meter) => {
        expect("hypothesisEvaluations" in meter).toBe(false);
        expect(Object.isFrozen(meter)).toBe(true);
        const receipt = await meter.evaluateHypothesis!(question.hypothesisId!, "falsification");
        issued = structuredClone(receipt);
        if (mutation === "seed") receipt.seed = "runner-seed";
        if (mutation === "phase") receipt.phase = "audit";
        if (mutation === "samplingProtocol") receipt.samplingProtocol = receipt.samplingProtocol === "bounded-perturbation-v1"
          ? "bounded-perturbation-v2" : "bounded-perturbation-v1";
        if (mutation === "evaluatorVersion") (receipt as { evaluatorVersion: string }).evaluatorVersion = "retired-evaluator";
        if (mutation === "subjectId") receipt.subjectId = "integer-sum-control";
        if (mutation === "subjectVersion") receipt.subjectVersion = "v2";
        if (mutation === "hypothesisId") receipt.hypothesisId = "other";
        if (mutation === "programDigest") receipt.programDigest = "0".repeat(64);
        if (mutation === "trainingDigest") receipt.trainingDigest = "0".repeat(64);
        if (mutation === "allowance") receipt.allowance++;
        if (mutation === "observationIds") receipt.observationIds = [];
        if (mutation === "status") receipt.status = "survived-budget";
        const result = evaluationResult(receipt);
        if (mutation === "unknown-verdict") (result as { verdict: string }).verdict = "proved-globally";
        if (mutation === "missing-receipt") { delete result.hypothesisEvaluation; result.verdict = "hypothesis-survived"; }
        return result;
      });
      const done = (await f.service.step(worker, "worker"))!;
      expect(issued.status).toBe("refuted");
      expect(done.episodes[1].verdict).toBe("inconclusive");
      expect(done.episodes[1].hypothesisEvaluations).toEqual([issued]);
      expect(done.hypothesisEvaluations).toEqual([issued]);
      expect(done.budget.spentCalls).toBe(8 + issued.calls);
    });

  it("freezes the stored program despite runner mutations and allows only the CAS-winning evaluator", async () => {
    const f = await fixture(numeric("fenced", true));
    const before = await proposed(f);
    f.runner.mockClear();
    f.runner.mockImplementation(async (station, question, _episodeId, meter) => {
      station.hypotheses![0].program.expectedHolds = false;
      station.hypotheses![0].trainingDigest = "forged";
      return evaluationResult(await meter.evaluateHypothesis!(question.hypothesisId!, "falsification"));
    });
    const results = await Promise.allSettled([f.service.step(worker, "one"), f.service.step(worker, "two")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(f.runner).toHaveBeenCalledTimes(1);
    const done = (await f.service.get(human))!;
    expect(done.hypothesisEvaluations).toHaveLength(1);
    expect(done.hypothesisEvaluations![0].programDigest).toBe(before.hypotheses![0].programDigest);
    expect(done.hypothesisEvaluations![0].trainingDigest).toBe(before.hypotheses![0].trainingDigest);
  });

  it("rejects concurrent and later duplicate phase calls, retaining the charged one-shot attempt", async () => {
    const f = await fixture();
    await proposed(f);
    let rejected = 0;
    f.runner.mockImplementation(async (_station, question, _episodeId, meter) => {
      const results = await Promise.allSettled([
        meter.evaluateHypothesis!(question.hypothesisId!, "falsification"),
        meter.evaluateHypothesis!(question.hypothesisId!, "falsification"),
      ]);
      rejected = results.filter((result) => result.status === "rejected").length;
      await expect(meter.evaluateHypothesis!(question.hypothesisId!, "falsification")).rejects.toThrow();
      return empty("inconclusive");
    });
    const done = (await f.service.step(worker, "worker"))!;
    expect(rejected).toBe(2);
    expect(done.episodes[1].calls).toBeGreaterThan(0);
    expect(done.episodes[1].calls).toBeLessThanOrEqual(24);
    expect(done.questions.at(-1)!.status).toBe("stopped");
    const calls = vi.mocked(f.target.measure).mock.calls.length;
    expect(await f.service.step(worker, "again")).toEqual(done);
    expect(f.target.measure).toHaveBeenCalledTimes(calls);
  });

  it.each(["falsification", "audit"] as const)("forbids direct sample selection and reducer bypass during %s", async (phase) => {
    const f = await fixture();
    await proposed(f, phase);
    let denied = 0;
    f.runner.mockImplementation(async (_station, _question, _episodeId, meter) => {
      try { await meter.observe(f.target, 5, "discovery"); } catch { denied++; }
      try { await meter.evaluateReducer!({ schemaVersion: "nexus.counterexample-reducer.v1", operators: ["halve-number"], maxPasses: 1 }, f.target, 5); }
      catch { denied++; }
      return empty("inconclusive");
    });
    const done = (await f.service.step(worker, "worker"))!;
    expect(denied).toBe(2);
    expect(done.episodes[1]).toMatchObject({ verdict: "inconclusive", calls: 0, hypothesisEvaluations: [], evaluations: [] });
    expect(f.target.measure).toHaveBeenCalledTimes(8);
  });

  it("uses the original smaller reservation rather than granting a separate evaluator allowance", async () => {
    const f = await fixture();
    await start(f, [f.target.id], { maxCallsPerEpisode: 10 });
    f.runner.mockImplementation(proposalRunner(f.target));
    await f.service.step(worker, "worker");
    f.runner.mockImplementation(async (_station, question, _episodeId, meter) =>
      evaluationResult(await meter.evaluateHypothesis!(question.hypothesisId!, "falsification")));
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.episodes[1].calls).toBe(10);
    expect(done.episodes[1].hypothesisEvaluationAttempt!.allowance).toBe(10);
    expect(done.hypothesisEvaluations![0].allowance).toBe(10);
    expect(done.budget.spentCalls).toBe(18);
    expect(f.target.measure).toHaveBeenCalledTimes(18);
  });

  it("drains unawaited evaluation without allowing its late callback to replace a snapshotted result", async () => {
    const entered = deferred(), release = deferred();
    const target = numeric("unawaited", true);
    const measure = target.measure;
    let block = false;
    target.measure = async (input) => { if (block) { entered.resolve(); await release.promise; } return measure(input); };
    const f = await fixture(target);
    await proposed(f);
    block = true;
    f.runner.mockImplementation(async (_station, question, _episodeId, meter) => {
      const result = empty("hypothesis-survived");
      void meter.evaluateHypothesis!(question.hypothesisId!, "falsification").then((receipt) => {
        Object.assign(result, evaluationResult(receipt));
      }, () => undefined);
      return result;
    });
    const work = f.service.step(worker, "worker");
    await entered.promise;
    expect((await f.service.get(human))!.episodes).toHaveLength(1);
    release.resolve();
    const done = (await work)!;
    expect(done.episodes[1].verdict).toBe("inconclusive");
    expect(done.episodes[1].hypothesisEvaluations).toHaveLength(1);
    expect(done.hypothesisEvaluations![0].status).toBe("refuted");
    expect(done.budget.spentCalls).toBe(8 + done.hypothesisEvaluations![0].calls);
  });

  it.each(["pause", "cancel", "expire", "timeout"] as const)("fences %s in flight and never redraws a lost audit seed", async (mode) => {
    if (mode === "timeout") vi.useFakeTimers();
    const entered = deferred(), release = deferred(), finished = deferred();
    const target = numeric("interrupted", true);
    const measure = target.measure;
    let block = false;
    target.measure = async (input) => { if (block) { entered.resolve(); await release.promise; } return measure(input); };
    const f = await fixture(target);
    await proposed(f, "audit");
    block = true;
    let oldEvaluate!: NonNullable<OracleMeter["evaluateHypothesis"]>;
    f.runner.mockImplementation(async (_station, question, _episodeId, meter) => {
      oldEvaluate = meter.evaluateHypothesis!;
      try { return evaluationResult(await oldEvaluate(question.hypothesisId!, "audit")); }
      finally { finished.resolve(); }
    });
    const abort = new AbortController();
    const work = f.service.step(worker, "old", abort.signal);
    const stale = mode === "pause" || mode === "expire" ? expect(work).rejects.toBeInstanceOf(ExperimentConflictError) : undefined;
    await entered.promise;
    const claimed = (await f.service.get(human))!;
    const attempt = claimed.lease!.hypothesisEvaluationAttempt;
    let done: ResearchStation;
    if (mode === "pause") done = await f.service.pause(human);
    else if (mode === "expire") { f.advance(1_001); done = (await f.service.step(worker, "new"))!; }
    else {
      if (mode === "cancel") abort.abort();
      else { f.advance(1_001); await vi.advanceTimersByTimeAsync(1_001); }
      done = (await work)!;
    }
    expect(done.episodes[1].hypothesisEvaluationAttempt).toEqual(attempt);
    expect(done.episodes[1].hypothesisEvaluations).toEqual([]);
    expect(done.hypothesisEvaluations).toEqual([]);
    expect(done.questions.at(-1)!.status).toBe("stopped");
    expect(done.budget.spentCalls).toBe(mode === "cancel" ? 9 : 40);
    release.resolve(); await finished.promise;
    if (stale) await stale;
    await expect(oldEvaluate(attempt!.hypothesisId, "audit")).rejects.toThrow();
    if (mode === "pause") done = await f.service.resume(human);
    expect(await f.service.step(worker, "retry")).toEqual(done);
    expect(done.status).toBe("idle");
  });

  it("persists a genuine zero-call inconclusive audit receipt and consumes its phase slot", async () => {
    const target = numeric("no-fresh-valid-samples");
    target.generate = () => "invalid-for-numeric-domain";
    const f = await fixture(target);
    await proposed(f, "audit");
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.hypothesisEvaluations).toHaveLength(1);
    expect(done.hypothesisEvaluations![0]).toMatchObject({ phase: "audit", status: "inconclusive", calls: 0, observationIds: [] });
    expect(done.episodes[1].selectionReason).not.toBe("invalid-runner-result");
    expect(done.questions.at(-1)!.status).toBe("stopped");
    expect(await f.service.step(worker, "retry")).toEqual(done);
    expect(f.target.measure).toHaveBeenCalledTimes(8);
  });

  it("reads pre-versioned v1 receipts semantically without upgrading their attempt or old episode hash", async () => {
    const target = numeric("legacy-protocol");
    target.generate = () => "invalid-for-numeric-domain";
    const f = await fixture(target);
    await proposed(f, "audit");
    await f.service.step(worker, "worker");
    // A zero-sample receipt has protocol-independent measured semantics. This explicitly
    // constructs the old wire shape; it is not a claim of replaying v1 with the v2 sampler.
    await mutate(f, (station) => {
      const episode = station.episodes.at(-1)!;
      delete episode.hypothesisEvaluationAttempt!.samplingProtocol;
      delete episode.hypothesisEvaluationAttempt!.evaluatorVersion;
      episode.hypothesisEvaluations![0].samplingProtocol = "bounded-perturbation-v1";
      station.hypothesisEvaluations![0].samplingProtocol = "bounded-perturbation-v1";
      rehashLastEpisode(station);
    });
    const legacy = (await f.service.get(human))!;
    const episode = legacy.episodes.at(-1)!;
    expect(episode.hypothesisEvaluationAttempt!.samplingProtocol).toBeUndefined();
    expect(episode.hypothesisEvaluationAttempt!.evaluatorVersion).toBeUndefined();
    await f.service.pause(human);
    const resumed = await f.service.resume(human);
    expect(resumed.episodes).toEqual(legacy.episodes);
    expect(await f.service.step(worker, "no-reissue")).toEqual(resumed);
    expect(f.target.measure).toHaveBeenCalledTimes(8);
  });

  it.each(["protocol-only", "evaluator-only", "unknown-protocol", "unknown-evaluator", "v2-unversioned", "receipt-mismatch"] as const)(
    "rejects a rehashed historical version-binding forgery: %s", async (mutation) => {
      const target = numeric("bad-version-binding");
      target.generate = () => "invalid-for-numeric-domain";
      const f = await fixture(target);
      await proposed(f, "audit");
      await f.service.step(worker, "worker");
      await mutate(f, (station) => {
        const episode = station.episodes.at(-1)!;
        const attempt = episode.hypothesisEvaluationAttempt!;
        if (mutation === "protocol-only") delete attempt.evaluatorVersion;
        if (mutation === "evaluator-only") delete attempt.samplingProtocol;
        if (mutation === "unknown-protocol") (attempt as { samplingProtocol: string }).samplingProtocol = "unknown-sampler";
        if (mutation === "unknown-evaluator") attempt.evaluatorVersion = "unknown-evaluator";
        if (mutation === "v2-unversioned" || mutation === "receipt-mismatch") {
          episode.hypothesisEvaluations![0].samplingProtocol = "bounded-perturbation-v2";
          station.hypothesisEvaluations![0].samplingProtocol = "bounded-perturbation-v2";
          if (mutation === "v2-unversioned") { delete attempt.samplingProtocol; delete attempt.evaluatorVersion; }
          else attempt.samplingProtocol = "bounded-perturbation-v1";
        }
        rehashLastEpisode(station);
      });
      await expect(f.service.get(human)).rejects.toBeInstanceOf(ExperimentConflictError);
      expect(f.target.measure).toHaveBeenCalledTimes(8);
    });

  it("validates version fields on attempt-only records even when no receipt exists", async () => {
    const f = await fixture();
    await proposed(f, "audit");
    f.runner.mockImplementation(async () => empty("inconclusive"));
    await f.service.step(worker, "worker");
    await mutate(f, (station) => {
      delete station.episodes.at(-1)!.hypothesisEvaluationAttempt!.evaluatorVersion;
      rehashLastEpisode(station);
    });
    await expect(f.service.get(human)).rejects.toBeInstanceOf(ExperimentConflictError);
  });

  it("never resumes a pre-versioned live lease under a new sampler and preserves it on abandonment", async () => {
    const entered = deferred(), release = deferred();
    const f = await fixture();
    await proposed(f, "audit");
    f.runner.mockImplementation(async () => { entered.resolve(); await release.promise; return empty("inconclusive"); });
    const old = f.service.step(worker, "old");
    const stale = expect(old).rejects.toBeInstanceOf(ExperimentConflictError);
    await entered.promise;
    const current = (await f.service.get(human))!;
    expect(current.lease!.hypothesisEvaluationAttempt).toMatchObject({
      samplingProtocol: HYPOTHESIS_SAMPLING_PROTOCOL, evaluatorVersion: HYPOTHESIS_EVALUATOR_VERSION,
    });
    await mutate(f, (station) => {
      delete station.lease!.hypothesisEvaluationAttempt!.samplingProtocol;
      delete station.lease!.hypothesisEvaluationAttempt!.evaluatorVersion;
    });
    const legacy = (await f.service.get(human))!;
    const attempt = structuredClone(legacy.lease!.hypothesisEvaluationAttempt);
    expect(await f.service.step(worker, "new")).toEqual(legacy);
    expect(f.runner).toHaveBeenCalledTimes(2); // induction plus the one original, never a resumed evaluation
    f.advance(1_001);
    const abandoned = (await f.service.step(worker, "new"))!;
    expect(abandoned.episodes.at(-1)!).toMatchObject({ hypothesisEvaluationAttempt: attempt, hypothesisEvaluations: [], calls: 32 });
    expect(abandoned.hypothesisEvaluations).toEqual([]);
    release.resolve(); await stale;
    expect(f.target.measure).toHaveBeenCalledTimes(8);
  });

  it("retains the audit attempt when completion CAS fails and recovers without another draw", async () => {
    const f = await fixture();
    await proposed(f, "audit");
    const commit = f.repository.commitLifecycleRecord.bind(f.repository);
    let fail = true;
    vi.spyOn(f.repository, "commitLifecycleRecord").mockImplementation(async (input) => {
      if (fail && input.event.type === "research.episode-completed") { fail = false; throw new ExperimentConflictError("injected completion conflict"); }
      return commit(input);
    });
    await expect(f.service.step(worker, "old")).rejects.toThrow("injected completion conflict");
    const claimed = (await f.service.get(human))!;
    const calls = vi.mocked(f.target.measure).mock.calls.length;
    expect(claimed.episodes).toHaveLength(1);
    expect(claimed.lease!.hypothesisEvaluationAttempt!.seed).toBeTruthy();
    f.advance(1_001);
    const done = (await f.service.step(worker, "recovered"))!;
    expect(done.episodes[1].hypothesisEvaluationAttempt).toEqual(claimed.lease!.hypothesisEvaluationAttempt);
    expect(done.budget.spentCalls).toBe(40);
    expect(done.hypothesisEvaluations).toEqual([]);
    expect(done.status).toBe("idle");
    await f.service.step(worker, "no-retry");
    expect(f.target.measure).toHaveBeenCalledTimes(calls);
  });

  it("retains real F refutations through three revisions and rejects a fifth member of the lineage", async () => {
    const target = numeric("revision-ladder");
    const examples = [-40, -30, -20, -10, 10, 20, 30, 40];
    // Controlled in-memory lineage fixture, not a sampler coverage or pure-replay claim.
    // The registered instrument advances from actual measured contradictions, independent
    // of sampler seed syntax/order; the candidate still cannot supply F inputs or receipts.
    let greatestMeasuredCounterexample = 0;
    target.generate = () => greatestMeasuredCounterexample + (10 - greatestMeasuredCounterexample) * 0.75;
    target.valid = (input) => typeof input === "number" && input >= -64 && (input < 10 || examples.includes(input));
    target.measure = vi.fn(async (input) => {
      const holds = typeof input === "number" && input >= 10;
      if (typeof input === "number" && !holds) greatestMeasuredCounterexample = Math.max(greatestMeasuredCounterexample, input);
      return { holds, facts: { input }, code: "controlled-revision-ladder" };
    });
    const f = await fixture(target);
    await start(f);
    f.runner.mockImplementation(async (station, question, episodeId, meter) => {
      if (question.kind === "falsify") {
        const receipt = await meter.evaluateHypothesis!(question.hypothesisId!, "falsification");
        return { ...evaluationResult(receipt), questions: [nextQuestion(station, question, episodeId, "induce", question.hypothesisId)] };
      }
      const observations = station.hypotheses!.length ? [] : await train(target, meter, examples);
      const snapshot = buildTrainingSnapshot([...station.episodes.flatMap((episode) => episode.observations), ...observations], target);
      const maximumFalse = Math.max(...snapshot.examples.filter((example) => !example.holds).map((example) => example.input as number));
      const hypothesis = proposeHypothesis(target, snapshot, program(maximumFalse / 2 + 5), episodeId, question.hypothesisId);
      return { ...empty("hypothesis-proposed"), observations, hypothesis,
        questions: [nextQuestion(station, question, episodeId, "falsify", hypothesis.id)] };
    });
    let station = (await f.service.get(human))!;
    for (let index = 0; index < 8; index++) station = (await f.service.step(worker, "worker"))!;
    expect(station.hypotheses).toHaveLength(4);
    expect(station.hypothesisEvaluations).toHaveLength(4);
    expect(station.hypothesisEvaluations!.every((receipt) => receipt.phase === "falsification" && receipt.status === "refuted")).toBe(true);
    const frozen = structuredClone(station.episodes);
    const measured = vi.mocked(target.measure).mock.calls.length;
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.hypotheses).toHaveLength(4);
    expect(done.questions.at(-1)).toMatchObject({ kind: "induce", status: "stopped", attempts: 0, reasonCode: "hypothesis-lineage-closed" });
    expect(done.episodes).toEqual(frozen);
    expect(done).toEqual(station);
    expect(f.runner).toHaveBeenCalledTimes(8);
    expect(target.measure).toHaveBeenCalledTimes(measured);
    expect(done.hypotheses!.slice(1).map((hypothesis) => hypothesis.parentHypothesisId)).toEqual(done.hypotheses!.slice(0, 3).map((hypothesis) => hypothesis.id));
  });

  it.each(["duplicate", "new-root", "unrefuted-parent"] as const)("refuses lineage laundering by %s", async (mode) => {
    const f = await fixture();
    const before = await proposed(f);
    // Append an explicit induction fixture without rewriting the creation episode or its question.
    await mutate(f, (station) => {
      station.questions.at(-1)!.status = "stopped";
      station.questions.push({ ...station.questions[0], id: "lineage-attempt", kind: "induce", status: "pending", attempts: 0,
        ...(mode === "unrefuted-parent" ? { hypothesisId: before.hypotheses![0].id } : {}) });
    });
    f.runner.mockImplementation(async (station, _question, episodeId) => {
      const snapshot = buildTrainingSnapshot(station.episodes.flatMap((episode) => episode.observations), f.target);
      const instructions = mode === "duplicate" ? program() : { ...program(), when: { op: "lte" as const, feature: "n:", threshold: 0 }, expectedHolds: false };
      return { ...empty("hypothesis-proposed"), hypothesis: proposeHypothesis(f.target, snapshot, instructions, episodeId,
        mode === "unrefuted-parent" ? before.hypotheses![0].id : undefined) };
    });
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.hypotheses).toEqual(before.hypotheses);
    expect(done.episodes[1].verdict).toBe("inconclusive");
  });

  it.each(["failed", "unrequested"] as const)("consumes an %s audit slot and forbids using its failure to revise", async (mode) => {
    const target = numeric("audit-no-reroll", true);
    const measure = target.measure;
    let fail = false;
    target.measure = vi.fn(async (input) => { if (fail) throw new Error("private failure"); return measure(input); });
    const f = await fixture(target);
    const before = await proposed(f, "audit");
    if (mode === "failed") fail = true;
    else f.runner.mockImplementation(async () => empty("inconclusive"));
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.episodes[1].hypothesisEvaluationAttempt!.phase).toBe("audit");
    expect(done.episodes[1].hypothesisEvaluations).toEqual([]);
    expect(done.episodes[1].calls).toBe(mode === "failed" ? 1 : 0);
    expect(done.questions.at(-1)!.status).toBe("stopped");
    fail = false;
    await mutate(f, (station) => {
      station.status = "running";
      station.questions.push({ ...station.questions[1], id: "audit-retry", status: "pending", attempts: 0 });
      station.questions.push({ ...station.questions[0], id: "audit-revision", kind: "induce", status: "pending", attempts: 0,
        hypothesisId: before.hypotheses![0].id });
    });
    f.runner.mockImplementation(async (station, _question, episodeId) => ({ ...empty("hypothesis-proposed"), hypothesis: proposeHypothesis(target,
      buildTrainingSnapshot(station.episodes.flatMap((episode) => episode.observations), target), program(), episodeId, before.hypotheses![0].id) }));
    const attempted = (await f.service.step(worker, "worker"))!;
    expect(attempted.questions.find((question) => question.id === "audit-retry")!.status).toBe("stopped");
    expect(attempted.episodes.at(-1)!.verdict).toBe("inconclusive");
    expect(attempted.hypotheses).toEqual(before.hypotheses);
    expect(attempted.episodes.filter((episode) => episode.kind === "audit-hypothesis")).toHaveLength(1);
  });

  it("constructs the audit-lock fixture cut from adjacent measured values even when zero is present", async () => {
    const f = await fixture(numeric("audit-lock-zero", true));
    await start(f);
    f.runner.mockImplementation(async (_station, _question, episodeId, meter) => {
      const observations = await train(f.target, meter, [...training, 0]);
      const snapshot = buildTrainingSnapshot(observations, f.target);
      const instructions = auditLockRevisionProgram(snapshot.examples.map((example) => example.input as number));
      expect(instructions.when).toEqual({ op: "lte", feature: "n:", threshold: 0.5 });
      // Reproduce the old fixture's invalid skipped-zero cut; the core must still reject it.
      expect(() => proposeHypothesis(f.target, snapshot, { ...instructions, when: { op: "lte", feature: "n:", threshold: 0 } }, episodeId))
        .toThrow("threshold-not-from-adjacent-training-values");
      const hypothesis = proposeHypothesis(f.target, snapshot, instructions, episodeId);
      return { ...empty("hypothesis-proposed"), observations, hypothesis };
    });
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.hypotheses).toHaveLength(1);
    expect(done.episodes[0].observations.some((observation) => observation.input === 0 && !observation.measurement.holds)).toBe(true);
    expect(done.budget.spentCalls).toBe(9);
  });

  it("locks even an otherwise F-authorized revision after any audit attempt in the lineage", async () => {
    const f = await fixture(numeric("audit-lock", true));
    const before = await proposed(f);
    const refuted = (await f.service.step(worker, "worker"))!;
    expect(refuted.hypothesisEvaluations![0].status).toBe("refuted");
    await mutate(f, (station) => {
      station.status = "running";
      station.questions.push({ ...station.questions[1], id: "audit-lock-attempt", kind: "audit-hypothesis", status: "pending", attempts: 0 });
    });
    f.runner.mockImplementation(async (station, question, episodeId) => ({ ...empty("inconclusive"),
      questions: [nextQuestion(station, question, episodeId, "induce", question.hypothesisId)] }));
    const audited = (await f.service.step(worker, "worker"))!;
    expect(audited.episodes.at(-1)!.hypothesisEvaluationAttempt!.phase).toBe("audit");
    const snapshot = buildTrainingSnapshot(audited.episodes.flatMap((episode) => episode.observations), f.target);
    const instructions = auditLockRevisionProgram(snapshot.examples.map((example) => example.input as number));
    // The proposal is training-valid, but the kernel now rejects its stale agenda slot
    // before dispatch, rather than spending another episode to rediscover the audit lock.
    const candidate = proposeHypothesis(f.target, snapshot, instructions, "never-dispatched", before.hypotheses![0].id);
    expect(candidate.parentHypothesisId).toBe(before.hypotheses![0].id);
    f.runner.mockClear();
    f.runner.mockImplementation(async () => { throw new Error("closed lineage must not dispatch"); });
    const done = (await f.service.step(worker, "worker"))!;
    expect(f.runner).not.toHaveBeenCalled();
    expect(done).toEqual(audited);
    expect(done.questions.at(-1)).toMatchObject({ kind: "induce", status: "stopped", attempts: 0, reasonCode: "hypothesis-lineage-closed" });
    expect(done.hypotheses).toEqual(before.hypotheses);
  });

  it("blocks a new question from repeating a completed phase or replaying its receipt in another phase", async () => {
    const f = await fixture(numeric("receipt-replay", true));
    await proposed(f);
    const evaluated = (await f.service.step(worker, "worker"))!;
    await mutate(f, (station) => {
      station.status = "running";
      station.questions.push({ ...station.questions[1], id: "repeat-F", status: "pending", attempts: 0 });
      station.questions.push({ ...station.questions[1], id: "replay-F-in-T", kind: "audit-hypothesis", status: "pending", attempts: 0 });
    });
    f.runner.mockClear();
    f.runner.mockImplementation(async () => evaluationResult(evaluated.hypothesisEvaluations![0]));
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.questions.find((question) => question.id === "repeat-F")!.status).toBe("stopped");
    expect(f.runner).toHaveBeenCalledTimes(1);
    expect(done.episodes.at(-1)!).toMatchObject({ kind: "audit-hypothesis", verdict: "inconclusive", hypothesisEvaluations: [], calls: 0 });
    expect(done.hypothesisEvaluations).toEqual(evaluated.hypothesisEvaluations);
  });

  it("caps the whole station at sixteen genuinely persisted source lineages", async () => {
    const subjects = Array.from({ length: 17 }, (_, index) => numeric(`source-${String(index).padStart(2, "0")}`));
    const f = await fixture(subjects[0], subjects.slice(1));
    await start(f, subjects.map((subject) => subject.id));
    f.runner.mockImplementation(async (station, question, episodeId, meter) => {
      const target = subjects.find((subject) => subject.id === question.subjectId)!;
      const result = await proposalRunner(target)(station, question, episodeId, meter);
      result.questions = [];
      return result;
    });
    let done = (await f.service.get(human))!;
    for (let index = 0; index < 17; index++) done = (await f.service.step(worker, "worker"))!;
    expect(done.hypotheses).toHaveLength(16);
    expect(done.episodes.filter((episode) => episode.verdict === "hypothesis-proposed")).toHaveLength(16);
    expect(done.episodes.at(-1)!).toMatchObject({ verdict: "inconclusive", calls: 8 });
    expect(done.budget.spentCalls).toBe(17 * 8);
  });

  it.each(["program", "training", "source", "aggregate"] as const)("rejects persisted hypothesis tampering: %s", async (mutation) => {
    const f = await fixture();
    await proposed(f);
    await mutate(f, (station) => {
      if (mutation === "program") station.hypotheses![0].program.expectedHolds = false;
      if (mutation === "training") station.hypotheses![0].trainingObservationIds.pop();
      if (mutation === "source") station.hypotheses![0].subjectVersion = "other";
      if (mutation === "aggregate") station.hypotheses = [];
    });
    await expect(f.service.step(worker, "worker")).rejects.toBeInstanceOf(ExperimentConflictError);
    expect(f.target.measure).toHaveBeenCalledTimes(8);
  });
});

describe("post-state induction and canonical scientific lessons", () => {
  async function sevenSamples(f: Fixture, nextKind: ResearchQuestion["kind"] = "survey") {
    await start(f);
    await mutate(f, (station) => { station.questions[0].kind = "survey"; });
    f.runner.mockImplementation(async (station, question, episodeId, meter) => {
      const observations: Observation[] = [];
      for (const input of training.slice(0, 7)) observations.push(await meter.observe(f.target, input, "discovery"));
      return { ...empty("counterexample"), observations,
        questions: [nextQuestion(station, question, episodeId, nextKind)] };
    });
    const station = (await f.service.step(worker, "worker"))!;
    expect(station.episodes[0].observations).toHaveLength(7);
    expect(station.questions.some((question) => question.kind === "induce")).toBe(false);
    return station;
  }

  it("by default derives induction when the final survey supplies the eighth actual sample", async () => {
    const f = await fixture(numeric(), [], {}); // Stock constructor default, not an explicit enablement.
    const before = await sevenSamples(f);
    f.runner.mockImplementation(async (_station, _question, _episodeId, meter) => {
      await meter.observe(f.target, 4, "discovery");
      return empty(); // Deliberately report neither the observation nor a follow-up question.
    });
    const done = (await f.service.step(worker, "worker"))!;
    const generated = done.questions.filter((question) => question.kind === "induce");
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({ status: "pending", attempts: 0, createdAtRound: 2, parentEpisodeId: done.episodes[1].id });
    expect(done.episodes[1].generatedQuestionIds).toEqual([generated[0].id]);
    expect(done.episodes[1].observations).toHaveLength(1);
    expect(done.budget).toMatchObject({ spentCalls: 8, reservedCalls: 0 });
    expect(done.status).toBe("running");
    expect(done.episodes[0]).toEqual(before.episodes[0]);
    const { digest, ...content } = done.episodes[1];
    expect(digest).toBe(researchDigest(content));
    f.runner.mockImplementation(async (station, _question, episodeId) => ({ ...empty("hypothesis-proposed"), hypothesis:
      proposeHypothesis(f.target, buildTrainingSnapshot(station.episodes.flatMap((episode) => episode.observations), f.target), program(), episodeId) }));
    const inducted = (await f.service.step(worker, "worker"))!;
    expect(inducted.hypotheses).toHaveLength(1);
    expect(inducted.lessons.at(-1)).toEqual(formatHypothesisLesson(inducted.episodes[2].id, f.target, inducted.hypotheses![0]));
  });

  it("uses privately observed evaluator data rather than only runner-reported observations", async () => {
    const f = await fixture(numeric(), [], { autoInduction: true });
    await sevenSamples(f, "minimize");
    f.runner.mockImplementation(async (_station, _question, _episodeId, meter) => {
      await meter.evaluateReducer!({ schemaVersion: "nexus.counterexample-reducer.v1", operators: ["halve-number"], maxPasses: 1 }, f.target, 4);
      return empty("inconclusive");
    });
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.episodes[1].evaluations).toHaveLength(1);
    expect(done.episodes[1].observations[0]).toMatchObject({ input: 4, partition: "tool-validation" });
    const induction = done.questions.find((question) => question.kind === "induce")!;
    expect(induction).toBeDefined();
    expect(done.episodes[1].generatedQuestionIds).toContain(induction.id);
    expect(done.budget.spentCalls).toBe(8);
  });

  it("does not derive or execute a new induction when pause abandons the final survey", async () => {
    const f = await fixture(numeric(), [], { autoInduction: true });
    await sevenSamples(f);
    const entered = deferred(), release = deferred();
    f.runner.mockImplementation(async (_station, _question, _episodeId, meter) => {
      await meter.observe(f.target, 4, "discovery");
      entered.resolve(); await release.promise;
      return empty();
    });
    const work = f.service.step(worker, "worker");
    const stale = expect(work).rejects.toBeInstanceOf(ExperimentConflictError);
    await entered.promise;
    const paused = await f.service.pause(human);
    expect(paused.status).toBe("paused");
    expect(paused.questions.some((question) => question.kind === "induce")).toBe(false);
    expect(paused.episodes.at(-1)!.generatedQuestionIds).toEqual([]);
    expect(await f.service.step(worker, "paused-worker")).toEqual(paused);
    release.resolve(); await stale;
    expect(f.runner).toHaveBeenCalledTimes(2);
    expect(f.target.measure).toHaveBeenCalledTimes(8);
  });

  it("stops a kernel-derived revision when a higher-priority audit closes its lineage", async () => {
    const f = await fixture(numeric("stale-frontier", true), [], { autoInduction: true });
    await proposed(f);
    f.runner.mockImplementation(async (station, question, episodeId, meter) => {
      const phase = question.kind === "audit-hypothesis" ? "audit" : "falsification";
      const receipt = await meter.evaluateHypothesis!(question.hypothesisId!, phase);
      return { ...evaluationResult(receipt), questions: phase === "falsification"
        ? [nextQuestion(station, question, episodeId, "audit-hypothesis", question.hypothesisId)] : [] };
    });
    const refuted = (await f.service.step(worker, "worker"))!;
    expect(refuted.hypothesisEvaluations![0].status).toBe("refuted");
    const revision = refuted.questions.find((question) => question.kind === "induce" && question.status === "pending")!;
    const audit = refuted.questions.find((question) => question.kind === "audit-hypothesis")!;
    expect(revision).toBeDefined();
    expect(audit.priority).toBeGreaterThan(revision.priority);
    expect(refuted.episodes[1].generatedQuestionIds).toEqual([audit.id, revision.id]);
    const audited = (await f.service.step(worker, "worker"))!;
    expect(audited.episodes[2].kind).toBe("audit-hypothesis");
    expect(audited.questions.find((question) => question.id === revision.id)).toMatchObject({
      status: "stopped", attempts: 0, reasonCode: "hypothesis-lineage-closed",
    });
    expect(audited.episodes.slice(0, 2)).toEqual(refuted.episodes);
    expect(audited.hypotheses).toHaveLength(1);
    expect(audited.status).toBe("idle");
    const calls = vi.mocked(f.target.measure).mock.calls.length;
    const executions = f.runner.mock.calls.length;
    for (let index = 0; index < 3; index++) expect(await f.service.step(worker, "retry")).toEqual(audited);
    expect(f.target.measure).toHaveBeenCalledTimes(calls);
    expect(f.runner).toHaveBeenCalledTimes(executions);
    expect(await f.service.get(human)).toEqual(audited);
  });

  it.each(["full", "duplicate"] as const)("keeps the shared eight-question bound and deduplication: %s", async (mode) => {
    const f = await fixture(numeric(), [], { autoInduction: true });
    await start(f);
    await mutate(f, (station) => { station.questions[0].kind = "survey"; });
    f.runner.mockImplementation(async (station, question, episodeId, meter) => {
      const observations: Observation[] = [];
      for (const input of training) observations.push(await meter.observe(f.target, input, "discovery"));
      const questions = mode === "duplicate" ? [nextQuestion(station, question, episodeId, "induce")]
        : Array.from({ length: 8 }, (_, index) => ({ ...nextQuestion(station, question, episodeId, "survey"), id: `${episodeId}:queue:${index}` }));
      return { ...empty("counterexample"), observations, questions };
    });
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.episodes[0].generatedQuestionIds).toHaveLength(mode === "full" ? 8 : 1);
    expect(done.questions.filter((question) => question.kind === "induce")).toHaveLength(mode === "full" ? 0 : 1);
  });

  it.each(["confirmed", "universal-text", "other-kind", "wrong-refutation", "wrong-evidence", "unknown-id"] as const)(
    "rejects candidate-authored scientific lesson authority: %s", async (mutation) => {
      const f = await fixture();
      await start(f);
      f.runner.mockImplementation(async (station, question, episodeId, meter) => {
        const result = await proposalRunner(f.target)(station, question, episodeId, meter);
        const lesson = result.lessons[0];
        if (mutation === "confirmed") lesson.status = "confirmed";
        if (mutation === "universal-text") lesson.statement = { en: "This is a confirmed universal law.", zh: "这是已确认的普遍定律。" };
        if (mutation === "other-kind") lesson.kind = "confirmation";
        if (mutation === "wrong-refutation") lesson.status = "refuted";
        if (mutation === "wrong-evidence") lesson.evidenceIds = [result.observations[0].id];
        if (mutation === "unknown-id") lesson.id += ":candidate";
        return result;
      });
      const done = (await f.service.step(worker, "worker"))!;
      expect(done.hypotheses).toEqual([]);
      expect(done.episodes[0]).toMatchObject({ verdict: "inconclusive", selectionReason: "invalid-runner-result", calls: 8 });
      expect(done.lessons).toEqual([formatResearchLimitLesson(done.episodes[0].id, f.target.id, "invalid-runner-result")]);
    });

  it.each(["hypothesis-id", "creation-episode"] as const)(
    "rejects ordinary-survey confirmation laundering through a persisted %s reference", async (reference) => {
      const f = await fixture();
      await start(f);
      f.runner.mockImplementation(async (station, question, episodeId, meter) => {
        const result = await proposalRunner(f.target)(station, question, episodeId, meter);
        result.questions = [nextQuestion(station, question, episodeId, "survey")];
        return result;
      });
      const proposedStation = (await f.service.step(worker, "worker"))!;
      const hypothesis = proposedStation.hypotheses![0];
      expect(hypothesis).toBeDefined();
      f.runner.mockImplementation(async (_station, question, episodeId, meter) => {
        const observed = await meter.observe(f.target, 5, "discovery");
        return { ...empty("no-change"), observations: [observed], lessons: [{
          id: `${episodeId}:forged-confirmation`, subjectId: question.subjectId, kind: "confirmation", status: "confirmed",
          episodeId, applicability: "candidate claims universal confirmation",
          statement: { en: "This hypothesis is a confirmed universal law.", zh: "这个命题是已确认的普遍定律。" },
          evidenceIds: [reference === "hypothesis-id" ? hypothesis.id : hypothesis.createdByEpisodeId],
        }] };
      });
      const done = (await f.service.step(worker, "worker"))!;
      const episode = done.episodes[1];
      expect(episode).toMatchObject({ kind: "survey", verdict: "inconclusive", selectionReason: "invalid-runner-result", calls: 1 });
      expect(episode.observations[0]).toMatchObject({ input: 5, measurement: { holds: true }, partition: "discovery" });
      expect(done.lessons.filter((lesson) => lesson.episodeId === episode.id)).toEqual([
        formatResearchLimitLesson(episode.id, f.target.id, "invalid-runner-result"),
      ]);
      expect(done.lessons.some((lesson) => lesson.status === "confirmed")).toBe(false);
      expect(JSON.stringify(done.lessons)).not.toContain("universal law");
      expect(done.hypotheses).toEqual(proposedStation.hypotheses);
      expect(done.hypothesisEvaluations).toEqual([]);
      expect(done.episodes[0]).toEqual(proposedStation.episodes[0]);
      expect(done.budget.spentCalls).toBe(9);
      expect(await f.service.get(human)).toEqual(done);
    });

  it("derives a true refutation lesson even when a candidate's wrong-kind lesson invalidates its result", async () => {
    const f = await fixture(numeric("canonical-refutation", true));
    const before = await proposed(f);
    f.runner.mockImplementation(async (_station, question, episodeId, meter) => {
      const receipt = await meter.evaluateHypothesis!(question.hypothesisId!, "falsification");
      const forged = formatHypothesisLesson(episodeId, f.target, before.hypotheses![0], receipt);
      forged.kind = "confirmation";
      forged.status = "confirmed";
      return { ...evaluationResult(receipt), lessons: [forged] };
    });
    const done = (await f.service.step(worker, "worker"))!;
    const episode = done.episodes[1], receipt = done.hypothesisEvaluations![0];
    expect(episode.verdict).toBe("inconclusive");
    expect(receipt.status).toBe("refuted");
    expect(done.lessons.filter((lesson) => lesson.episodeId === episode.id)).toEqual([
      formatResearchLimitLesson(episode.id, f.target.id, "invalid-runner-result"),
      formatHypothesisLesson(episode.id, f.target, before.hypotheses![0], receipt),
    ]);
    expect(await f.service.get(human)).toEqual(done);
  });

  it("never converts an unrefuted private receipt into a refuted or confirmed lesson", async () => {
    const f = await fixture();
    const before = await proposed(f);
    f.runner.mockImplementation(async (_station, question, episodeId, meter) => {
      const receipt = await meter.evaluateHypothesis!(question.hypothesisId!, "falsification");
      return { ...evaluationResult(receipt), lessons: [formatHypothesisLesson(episodeId, f.target, before.hypotheses![0], { ...receipt, status: "refuted" })] };
    });
    const done = (await f.service.step(worker, "worker"))!;
    const episode = done.episodes[1], receipt = done.hypothesisEvaluations![0];
    expect(receipt.status).not.toBe("refuted");
    expect(episode.verdict).toBe("inconclusive");
    const facts = done.lessons.filter((lesson) => lesson.episodeId === episode.id && lesson.kind === "hypothesis");
    expect(facts).toEqual([formatHypothesisLesson(episode.id, f.target, before.hypotheses![0], receipt)]);
    expect(facts[0].status).toBe("provisional");
  });

  it.each(["kind", "parent", "lesson-status", "missing-lesson"] as const)("rejects persisted creation or lesson tampering: %s", async (mutation) => {
    const f = await fixture();
    await proposed(f);
    await mutate(f, (station) => {
      if (mutation === "kind") station.questions[0].kind = "survey";
      if (mutation === "parent") station.questions[0].hypothesisId = station.hypotheses![0].id;
      if (mutation === "lesson-status") station.lessons[0].status = "confirmed";
      if (mutation === "missing-lesson") { station.lessons = []; station.episodes[0].lessonIds = []; rehashLastEpisode(station); }
    });
    await expect(f.service.get(human)).rejects.toBeInstanceOf(ExperimentConflictError);
  });

  it("reconstructs the historical reservation instead of trusting a rehashed one-call audit allowance", async () => {
    const target = numeric("forged-allowance");
    target.generate = () => "no-valid-samples";
    const f = await fixture(target);
    await proposed(f, "audit");
    await f.service.step(worker, "worker");
    await mutate(f, (station) => {
      const episode = station.episodes[1];
      episode.hypothesisEvaluationAttempt!.allowance = 1;
      episode.hypothesisEvaluations![0].allowance = 1;
      station.hypothesisEvaluations![0].allowance = 1;
      rehashLastEpisode(station);
    });
    await expect(f.service.get(human)).rejects.toBeInstanceOf(ExperimentConflictError);
  });
});

describe("canonical wire values before instrumentation", () => {
  it("normalizes negative zero before valid and measure, normalizes facts, and strips undeclared fields", async () => {
    const target = numeric("wire-json");
    target.valid = vi.fn((input: Json) => Array.isArray(input) && input.length === 2 && Object.is(input[1], 0));
    target.measure = vi.fn(async (input: Json) => ({ holds: Array.isArray(input) && Object.is(input[1], 0),
      facts: { signed: -0, nested: [-0] }, code: "wire-value", privateNote: "must-not-persist" }));
    const f = await fixture(target);
    await start(f);
    f.runner.mockImplementation(async (_station, _question, _episodeId, meter) => ({ ...empty(), observations: [await meter.observe(target, [-1, -0], "discovery")] }));
    const done = (await f.service.step(worker, "worker"))!;
    expect(target.measure).toHaveBeenCalledWith([-1, 0]);
    expect(vi.mocked(target.valid).mock.calls.every(([input]) => Array.isArray(input) && Object.is(input[1], 0))).toBe(true);
    expect(done.episodes[0].observations[0]).toMatchObject({ input: [-1, 0], measurement: { holds: true, code: "wire-value", facts: { signed: 0, nested: [0] } } });
    expect(done.episodes[0].observations[0].measurement).not.toHaveProperty("privateNote");
    expect(done).toEqual(JSON.parse(JSON.stringify(done)));
    expect((await f.repository.getLifecycleRecord(done.id))!.data).toEqual(done);
    expect(await f.service.get(human)).toEqual(done);
  });

  it("uses the same canonical numeric representation for artifacts and zero-quota policy", async () => {
    const f = await fixture();
    await start(f);
    f.runner.mockImplementation(async (station, question, episodeId, meter) => {
      const result = await proposalRunner(f.target)(station, question, episodeId, meter);
      result.hypothesis!.program.when = { op: "gt", feature: "n:", threshold: -0 };
      return result;
    });
    const done = (await f.service.step(worker, "worker"))!;
    expect(done.hypotheses).toHaveLength(1);
    expect(Object.is((done.hypotheses![0].program.when as { threshold: number }).threshold, 0)).toBe(true);
    expect(done).toEqual(JSON.parse(JSON.stringify(done)));
    expect(await f.service.get(human)).toEqual(done);
    const zero = await fixture();
    const station = await zero.service.start(human, { seed: "zero-policy", subjectIds: [zero.target.id], policy: { maxOracleCalls: -0 } });
    expect(Object.is(station.policy.maxOracleCalls, 0)).toBe(true);
    expect((await zero.repository.getLifecycleRecord(station.id))!.data).toEqual(station);
  });
});
