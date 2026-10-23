// @vitest-environment node

import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { ExperimentConflictError } from "@/experiments/errors";
import { PostgresExperimentRepository } from "@/experiments/postgres-repository";
import type { ExperimentActor } from "@/experiments/types";
import { createPostgresBackup, restorePostgresBackup, verifyPostgresBackup } from "@/operations/postgres-backup";
import { PostgresWorldRepository } from "@/symbiosis/postgres-repository";
import type {
  EpisodeResult, EpisodeRunner, HypothesisEvaluation, Json, Observation, OracleMeter,
  ResearchEpisode, ResearchPolicy, ResearchQuestion, ResearchStation, ResearchSubject,
} from "./contracts";
import {
  buildTrainingSnapshot, evaluateHypothesis, proposeHypothesis,
  HYPOTHESIS_EVALUATOR_VERSION, HYPOTHESIS_PHASE_ALLOWANCE, HYPOTHESIS_SAMPLING_PROTOCOL,
} from "./hypotheses";
import { fitConditional, predict } from "./induction";
import { researchDigest } from "./integrity";
import { ResearchService } from "./service";

// Deliberately no production configuration/server factory or DATABASE_URL fallback.
// Pools are constructed INSIDE enabled tests, never during collection of a skipped file.
const databaseUrl = process.env.TEST_DATABASE_URL;
const restoreUrl = process.env.TEST_RESTORE_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;
const pools = new Set<Pool>();
const values = [-4, -3, -2, -1, 1, 2, 3, 4];
type Phase = HypothesisEvaluation["phase"];
const empty = (verdict: EpisodeResult["verdict"] = "no-change"): EpisodeResult => ({ verdict, observations: [], lessons: [], questions: [] });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function connection(url = databaseUrl!, max = 1) {
  if (!url) throw new Error("An explicit isolated TEST_DATABASE_URL is required");
  const applicationName = `hyp-pg-${randomUUID()}`;
  const pool = new Pool({ connectionString: url, application_name: applicationName, max, connectionTimeoutMillis: 5_000 });
  pools.add(pool);
  return { pool, applicationName, repository: new PostgresExperimentRepository(pool) };
}

async function close(pool: Pool) {
  await pool.end();
  pools.delete(pool);
}

function checkedRestoreUrl(): string {
  if (!databaseUrl || !restoreUrl) throw new Error("Both explicit isolated TEST database URLs are required");
  let source: URL, destination: URL;
  try { source = new URL(databaseUrl); destination = new URL(restoreUrl); }
  catch { throw new Error("TEST database URLs must be valid PostgreSQL URLs"); }
  if (![source.protocol, destination.protocol].every((protocol) => ["postgres:", "postgresql:"].includes(protocol))) {
    throw new Error("TEST database URLs must use PostgreSQL");
  }
  // Ignore credentials, query parameters and the optional default port when detecting aliases.
  if (databaseUrl === restoreUrl || (source.hostname === destination.hostname &&
    (source.port || "5432") === (destination.port || "5432") && source.pathname === destination.pathname)) {
    throw new Error("Source and restore TEST databases must be different; refusing destructive restore");
  }
  return restoreUrl;
}

function instrument(shape: "numeric" | "array" = "numeric", refutable = false) {
  let calls = 0;
  let beforeMeasure: (() => Promise<void>) | undefined;
  const inputs: Json[] = values.map((value) => shape === "numeric" ? value : [value, value / 2]);
  const target: ResearchSubject = {
    id: `pg-${shape}-${refutable ? "refutable" : "relation"}`, version: "isolated-hypothesis.v1",
    title: { en: "Isolated conditional relation", zh: "隔离的条件关系" },
    claim: { en: "A bounded conditional relation, not a population claim", zh: "有界条件关系，不代表总体结论" },
    origin: "generated-challenge", interpretation: "exploratory-hypothesis", family: "pg-hypothesis-fixture",
    generate(seed) {
      // The controlled refutation has several fresh positive non-integers in its pool.
      // Neither instrument parses sampler indices/seed suffixes or changes its semantics.
      const value = refutable ? 0.5 : (Number.parseInt(researchDigest(seed).slice(0, 6), 16) % 12_001 - 6_000) / 100;
      return shape === "numeric" ? value : [value, value / 2];
    },
    valid(input) {
      const bounded = (value: Json) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 64;
      return shape === "numeric" ? bounded(input)
        : Array.isArray(input) && input.length > 0 && input.length <= 4 && input.every(bounded);
    },
    async measure(input) {
      calls++;
      await beforeMeasure?.();
      const value = typeof input === "number" ? input : (input as number[]).reduce((sum, item) => sum + item, 0);
      const holds = value > 0 && (!refutable || (Number.isInteger(value) && value <= 4));
      return { holds, facts: { value }, code: "isolated-conditional-relation" };
    },
  };
  return { target, inputs, calls: () => calls, beforeMeasure: (hook?: () => Promise<void>) => { beforeMeasure = hook; } };
}

function followup(station: ResearchStation, question: ResearchQuestion, episodeId: string,
  kind: ResearchQuestion["kind"], hypothesisId?: string): ResearchQuestion {
  return { id: `${episodeId}:next:${kind}`, subjectId: question.subjectId, title: question.title, kind,
    status: "pending", attempts: 0, priority: 200, parentEpisodeId: episodeId,
    createdAtRound: station.episodes.length + 1, reasonCode: "isolated-pg-hypothesis-followup",
    ...(hypothesisId ? { hypothesisId } : {}) };
}

async function observe(target: ResearchSubject, meter: OracleMeter, inputs: Json[], partition: Observation["partition"]) {
  const observations: Observation[] = [];
  for (const input of inputs) observations.push(await meter.observe(target, input, partition));
  return observations;
}

function learnedProposal(target: ResearchSubject, observations: Observation[], episodeId: string) {
  const snapshot = buildTrainingSnapshot(observations, target);
  const fit = fitConditional(snapshot.examples);
  if (fit.status !== "proposed" || !fit.hypothesis) throw new Error(`Fixture induction abstained: ${fit.reason}`);
  return proposeHypothesis(target, snapshot, fit.hypothesis, episodeId);
}

function evaluationResult(receipt: HypothesisEvaluation): EpisodeResult {
  return { ...empty(receipt.status === "refuted" ? "hypothesis-refuted"
    : receipt.status === "survived-budget" ? "hypothesis-survived" : "inconclusive"), hypothesisEvaluation: receipt };
}

async function fixture(options: { shape?: "numeric" | "array"; refutable?: boolean; phase?: Phase; policy?: Partial<ResearchPolicy> } = {}) {
  const source = connection();
  await source.repository.initialize();
  const specimen = instrument(options.shape, options.refutable);
  const { target, inputs } = specimen;
  // No shared/default workspace, governance bootstrap, city execution or model configuration.
  const workspaceId = `hyp-pg-workspace-${randomUUID()}`, organizationId = `hyp-pg-org-${randomUUID()}`;
  let time = Date.parse("2026-10-20T13:00:00.000Z");
  const now = () => new Date(time);
  const timestamp = now().toISOString();
  await source.repository.ensureWorkspace({ id: workspaceId, name: "Isolated PG hypothesis test", createdAt: timestamp });
  await source.repository.ensureOrganization({ id: organizationId, name: "Isolated PG hypothesis test", createdAt: timestamp, updatedAt: timestamp });
  await source.repository.ensureGovernedWorkspace({ workspaceId, organizationId, createdAt: timestamp, updatedAt: timestamp });
  const human: ExperimentActor = { id: "hyp-pg-human", role: "operator", principalType: "human", authSource: "development", workspaceId, organizationId };
  const worker: ExperimentActor = { ...human, id: "hyp-pg-worker", principalType: "system", authSource: "system", issuer: "nexus-research-worker" };
  const defaultRunner: EpisodeRunner = async (station, question, episodeId, meter) => {
    if (question.kind === "survey") {
      const observations = await observe(target, meter, [inputs[0]], "discovery");
      return { ...empty("counterexample"), observations, questions: [followup(station, question, episodeId, "induce")] };
    }
    if (question.kind === "induce") {
      const observations = await observe(target, meter, inputs, "hypothesis-training");
      const hypothesis = learnedProposal(target, [...station.episodes.flatMap((episode) => episode.observations), ...observations], episodeId);
      return { ...empty("hypothesis-proposed"), observations, hypothesis,
        questions: [followup(station, question, episodeId, options.phase === "audit" ? "audit-hypothesis" : "falsify", hypothesis.id)] };
    }
    const phase = question.kind === "audit-hypothesis" ? "audit" : "falsification";
    const receipt = await meter.evaluateHypothesis!(question.hypothesisId!, phase);
    return { ...evaluationResult(receipt), questions: phase === "falsification"
      ? [followup(station, question, episodeId, "audit-hypothesis", question.hypothesisId)] : [] };
  };
  let runner = defaultRunner;
  const execute: EpisodeRunner = (...args) => runner(...args);
  // This persistence/controller contract owns its explicit survey -> induce -> F/T queue.
  // Automatic post-episode induction is covered separately; production retains its default.
  const openService = (repository: PostgresExperimentRepository, clock = now) => new ResearchService(repository, [target], execute,
    { now: clock, autoInduction: false });
  const service = openService(source.repository);
  const initial = await service.start(human, { seed: "isolated-pg-hypotheses", subjectIds: [target.id],
    policy: { maxOracleCalls: 512, maxCallsPerEpisode: 32, maxEpisodes: 12, maxAttemptsPerQuestion: 2, leaseMs: 60_000, ...options.policy } });
  return { ...source, ...specimen, human, worker, now, service, openService, initial, defaultRunner,
    setRunner: (next: EpisodeRunner) => { runner = next; }, advance: (ms: number) => { time += ms; } };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function proposed(f: Fixture) {
  await f.service.step(f.worker, "survey");
  const station = (await f.service.step(f.worker, "induction"))!;
  expect(station.hypotheses).toHaveLength(1);
  const observations = station.episodes.flatMap((episode) => episode.observations);
  const snapshot = buildTrainingSnapshot(observations, f.target);
  expect(new Set(snapshot.examples.map((example) => example.holds))).toEqual(new Set([false, true]));
  expect(snapshot.examples).toHaveLength(8);
  expect(observations.filter((observation) => observation.partition === "hypothesis-training")).toHaveLength(8);
  expect(station.hypotheses![0]).toMatchObject({ trainingDigest: snapshot.digest, trainingObservationIds: snapshot.observationIds });
  return station;
}

function expectChain(station: ResearchStation) {
  let previous = researchDigest({ schemaVersion: station.schemaVersion, id: station.id, seed: station.seed,
    subjectIds: station.subjectIds, subjectVersions: station.subjectVersions, policy: station.policy });
  for (const episode of station.episodes) {
    const { digest, ...content } = episode;
    expect(episode.previousDigest).toBe(previous);
    expect(digest).toBe(researchDigest(content));
    previous = digest;
  }
  expect(station.budget.spentCalls).toBe(station.episodes.reduce((sum, episode) => sum + episode.calls, 0));
  expect(station.budget).toMatchObject({ externalModelCalls: 0, actualModelCostUsd: 0 });
}

async function replay(f: Fixture, station: ResearchStation, episode: ResearchEpisode) {
  const receipt = episode.hypothesisEvaluations![0];
  const hypothesis = station.hypotheses!.find((item) => item.id === receipt.hypothesisId)!;
  const prior = station.episodes.slice(0, station.episodes.findIndex((item) => item.id === episode.id)).flatMap((item) => item.observations);
  const excluded = [...new Set(prior.filter((item) => item.subjectId === f.target.id && item.subjectVersion === f.target.version)
    .map((item) => item.inputDigest))].sort();
  expect(receipt.excludedInputDigests).toEqual(excluded);
  expect(receipt.observationIds).toEqual(episode.observations.map((item) => item.id));
  expect(new Set(episode.observations.map((item) => item.inputDigest)).size).toBe(receipt.calls);
  expect(receipt.calls).toBeGreaterThan(0);
  expect(receipt.calls).toBeLessThanOrEqual(receipt.allowance);
  expect(receipt.samplingProtocol).toBe(HYPOTHESIS_SAMPLING_PROTOCOL);
  expect(receipt.evaluatorVersion).toBe(HYPOTHESIS_EVALUATOR_VERSION);
  for (const observation of episode.observations) {
    expect(excluded).not.toContain(observation.inputDigest);
    expect(observation.inputDigest).toBe(researchDigest(observation.input));
    expect(observation.partition).toBe(receipt.phase === "audit" ? "hypothesis-audit" : "hypothesis-falsification");
  }
  let used = 0;
  const meter: OracleMeter = { get used() { return used; }, limit: receipt.allowance,
    async observe(subject, input, partition) {
      const original = episode.observations[used++];
      expect(original).toBeDefined();
      expect(input).toEqual(original.input);
      expect(partition).toBe(original.partition);
      const measurement = await subject.measure(input);
      expect(measurement).toEqual(original.measurement);
      return { ...original, measurement };
    } };
  // Replay is a comparison against an already service-issued receipt, never its issuer.
  expect(await evaluateHypothesis(hypothesis, f.target, prior, meter, receipt.phase, receipt.seed)).toEqual(receipt);
  expect(used).toBe(receipt.calls);
}

// Only adversarial/legacy fixture edits use this helper; it never creates/re-hashes an
// episode, observation, hypothesis, or evaluator receipt. Every write is real PG CAS.
async function changeFixture(f: Fixture, repository: PostgresExperimentRepository, change: (station: ResearchStation) => void) {
  const record = (await repository.getLifecycleRecord(f.initial.id))!;
  const station = structuredClone(record.data) as unknown as ResearchStation;
  const previousEvent = (await repository.listLifecycleEvents(f.human.workspaceId!)).at(-1)!;
  change(station);
  station.revision++;
  station.updatedAt = f.now().toISOString();
  await repository.commitLifecycleRecord({ expectedRevision: record.revision,
    record: { ...record, revision: station.revision, status: station.status, updatedAt: station.updatedAt, data: { ...station } },
    event: { ...previousEvent, id: `${station.id}:revision:${station.revision}`, type: "test.research-hypothesis-fixture",
      occurredAt: station.updatedAt, payload: { revision: station.revision, stateDigest: researchDigest(station) } } });
}

integrationDescribe("PostgreSQL conditional hypotheses and private F/T persistence", () => {
  afterEach(async () => {
    // No shared database cleanup/TRUNCATE: each test owns a UUID workspace and organization.
    await Promise.all([...pools].map(close));
  });

  it.each(["numeric", "array"] as const)("reopens exact %s training, hypothesis, F/T receipts and episode hashes", async (shape) => {
    const f = await fixture({ shape });
    const before = await proposed(f);
    const frozen = structuredClone(before.hypotheses![0]);
    const persistedBefore = structuredClone(before.episodes);
    const peer = connection();
    const reopened = f.openService(peer.repository);
    expect(await reopened.get(f.human)).toEqual(before);
    f.setRunner(async (station, question, episodeId, meter) => {
      // Mutating the candidate-facing snapshot must not alter the kernel's frozen source.
      station.hypotheses![0].program.expectedHolds = !station.hypotheses![0].program.expectedHolds;
      station.hypotheses![0].trainingDigest = "candidate-subset";
      station.hypotheses![0].trainingObservationIds.pop();
      return f.defaultRunner(station, question, episodeId, meter);
    });
    const falsified = (await reopened.step(f.worker, "second-repository-F"))!;
    const done = (await f.service.step(f.worker, "first-repository-T"))!;
    expect(done.hypotheses).toEqual([frozen]);
    expect(done.episodes.slice(0, before.episodes.length)).toEqual(persistedBefore);
    expect(done.hypothesisEvaluations).toHaveLength(2);
    expect(done.hypothesisEvaluations!.map((receipt) => receipt.phase)).toEqual(["falsification", "audit"]);
    expect(done.hypothesisEvaluations![0].seed).not.toBe(done.hypothesisEvaluations![1].seed);
    expect(done.episodes[2]).toEqual(falsified.episodes[2]);
    expectChain(done);
    await close(f.pool);
    await close(peer.pool);
    const cold = connection();
    const coldService = f.openService(cold.repository);
    expect(await coldService.get(f.human)).toEqual(done);
    const record = (await cold.repository.getLifecycleRecord(done.id))!;
    expect(record.data).toEqual(done);
    const events = await cold.repository.listLifecycleEvents(f.human.workspaceId!);
    expect(events.at(-1)!.payload.stateDigest).toBe(researchDigest(done));
    const calls = f.calls();
    expect(await coldService.step(f.worker, "no-redraw-after-reopen")).toEqual(done);
    expect(f.calls()).toBe(calls);
    for (const episode of done.episodes.filter((item) => item.hypothesisEvaluations?.length)) {
      expect(episode.hypothesisEvaluations).toEqual([done.hypothesisEvaluations!.find((receipt) => receipt.seed === episode.hypothesisEvaluationAttempt!.seed)]);
      await replay(f, done, episode);
    }
    // Status is whatever the actual bounded sample supports; survival is never assumed.
    expect(await coldService.get(f.human)).toEqual(done);
  }, 30_000);

  it.each(["current", "prior"] as const)("rejects a self-consistent subset hiding a real %s training counterexample", async (where) => {
    const f = await fixture({ refutable: true });
    f.setRunner(async (station, question, episodeId, meter) => {
      if (question.kind === "survey") {
        const inputs = where === "prior" ? [...f.inputs, 0.5] : [f.inputs[0]];
        return { ...empty("counterexample"), observations: await observe(f.target, meter, inputs, "discovery"),
          questions: [followup(station, question, episodeId, "induce")] };
      }
      const observations = where === "current" ? await observe(f.target, meter, [...f.inputs, 0.5], "hypothesis-training") : [];
      const actual = [...station.episodes.flatMap((episode) => episode.observations), ...observations];
      const candidate = learnedProposal(f.target, actual.filter((observation) => observation.input !== 0.5), episodeId);
      expect(predict(candidate.program, 0.5)).toBe(true);
      expect(actual.find((observation) => observation.input === 0.5)!.measurement.holds).toBe(false);
      return { ...empty("hypothesis-proposed"), observations, hypothesis: candidate };
    });
    const history = (await f.service.step(f.worker, "measure-training"))!;
    const rejected = (await f.service.step(f.worker, "subset-proposal"))!;
    expect(rejected.hypotheses).toEqual([]);
    expect(rejected.episodes.at(-1)).toMatchObject({ verdict: "inconclusive", selectionReason: "invalid-runner-result" });
    expect(rejected.episodes[0]).toEqual(history.episodes[0]);
    const actual = rejected.episodes.flatMap((episode) => episode.observations);
    expect(actual.find((observation) => observation.input === 0.5)).toMatchObject({ measurement: { holds: false } });
    expect(new Set(actual.map((observation) => observation.measurement.holds))).toEqual(new Set([false, true]));
    expect(rejected.budget.spentCalls).toBe(where === "current" ? 10 : 9);
    expect(rejected.budget.spentCalls).toBe(f.calls());
    expectChain(rejected);
    const peer = connection();
    expect(await f.openService(peer.repository).get(f.human)).toEqual(rejected);
  }, 30_000);

  it.each(["program", "training-ids"] as const)("fails closed on persisted frozen-hypothesis %s tampering", async (mutation) => {
    const f = await fixture();
    const before = await proposed(f);
    await changeFixture(f, f.repository, (station) => {
      if (mutation === "program") station.hypotheses![0].program.expectedHolds = !station.hypotheses![0].program.expectedHolds;
      else station.hypotheses![0].trainingObservationIds.pop();
    });
    const peer = connection();
    const reopened = f.openService(peer.repository);
    await expect(reopened.get(f.human)).rejects.toBeInstanceOf(ExperimentConflictError);
    await expect(reopened.step(f.worker, "must-not-evaluate-corruption")).rejects.toBeInstanceOf(ExperimentConflictError);
    const raw = (await peer.repository.getLifecycleRecord(before.id))!.data as unknown as ResearchStation;
    expect(raw.episodes).toEqual(before.episodes);
    expect(f.calls()).toBe(before.budget.spentCalls);
  }, 30_000);

  it.each(["falsification", "audit"] as const)("retains the genuine private %s receipt when a runner alters its returned copy", async (phase) => {
    const f = await fixture({ phase });
    const before = await proposed(f);
    let issued!: HypothesisEvaluation;
    f.setRunner(async (_station, question, _episodeId, meter) => {
      const receipt = await meter.evaluateHypothesis!(question.hypothesisId!, phase);
      issued = structuredClone(receipt);
      receipt.seed = "candidate-cannot-select-the-private-seed";
      return evaluationResult(receipt);
    });
    const done = (await f.service.step(f.worker, "tampered-return"))!;
    expect(done.episodes.at(-1)).toMatchObject({ verdict: "inconclusive", selectionReason: "invalid-runner-result", hypothesisEvaluations: [issued] });
    expect(done.hypothesisEvaluations).toEqual([issued]);
    expect(done.hypotheses).toEqual(before.hypotheses);
    expect(done.budget.spentCalls).toBe(before.budget.spentCalls + issued.calls);
    expectChain(done);
    const peer = connection();
    expect(await f.openService(peer.repository).get(f.human)).toEqual(done);
    await replay(f, done, done.episodes.at(-1)!);
  }, 30_000);

  it.each(["falsification", "audit"] as const)("durably claims %s seed/protocol/allowance with exactly one real two-connection CAS winner", async (phase) => {
    const f = await fixture({ phase, policy: { maxCallsPerEpisode: phase === "falsification" ? 10 : HYPOTHESIS_PHASE_ALLOWANCE.audit } });
    const before = await proposed(f);
    const peer = connection();
    const challenger = f.openService(peer.repository);
    const gate = connection(databaseUrl!, 2);
    const lock = await gate.pool.connect();
    const entered = deferred(), release = deferred();
    let executions = 0;
    f.setRunner(async (_station, question, _episodeId, meter) => {
      executions++;
      entered.resolve();
      await release.promise;
      return evaluationResult(await meter.evaluateHypothesis!(question.hypothesisId!, phase));
    });
    let locked = false;
    let work: Promise<PromiseSettledResult<ResearchStation | null>[]> | undefined;
    try {
      await lock.query("BEGIN");
      locked = true;
      await lock.query("SELECT id FROM nexus_lifecycle_records WHERE id = $1 AND workspace_id = $2 FOR UPDATE", [before.id, f.human.workspaceId]);
      work = Promise.allSettled([f.service.step(f.worker, "connection-one"), challenger.step(f.worker, "connection-two")]);
      // Both real UPDATEs must wait on the row lock after independently reading the SAME
      // revision. No repository spies, fake PG clients, sleeps or scheduler-luck assertions.
      await expect.poll(async () => {
        const result = await gate.pool.query<{ waiting: number }>(
          "SELECT count(*)::integer AS waiting FROM pg_stat_activity WHERE datname = current_database() AND application_name = ANY($1::text[]) AND state = 'active' AND wait_event_type = 'Lock'",
          [[f.applicationName, peer.applicationName]],
        );
        return result.rows[0].waiting;
      }, { timeout: 5_000, interval: 10 }).toBe(2);
      await lock.query("COMMIT");
      locked = false;
      await entered.promise;
      const claimed = (await f.openService(gate.repository).get(f.human))!;
      const attempt = claimed.lease!.hypothesisEvaluationAttempt!;
      expect(attempt).toEqual({ hypothesisId: before.hypotheses![0].id, phase, seed: expect.any(String),
        samplingProtocol: HYPOTHESIS_SAMPLING_PROTOCOL, evaluatorVersion: HYPOTHESIS_EVALUATOR_VERSION,
        allowance: Math.min(before.policy.maxCallsPerEpisode, HYPOTHESIS_PHASE_ALLOWANCE[phase]) });
      expect(attempt.seed).not.toBe(before.seed);
      expect(attempt.seed).not.toHaveLength(0);
      expect(claimed.revision).toBe(before.revision + 1);
      expect(claimed.episodes).toEqual(before.episodes);
      expect(claimed.budget.reservedCalls).toBe(before.policy.maxCallsPerEpisode);
      expect(executions).toBe(1);
      expect(f.calls()).toBe(before.budget.spentCalls);
      expect((await gate.repository.getLifecycleRecord(before.id))!.data).toEqual(claimed);
      const claimEvents = await gate.repository.listLifecycleEvents(f.human.workspaceId!);
      expect(claimEvents.at(-1)).toMatchObject({ type: "research.episode-claimed", payload: { stateDigest: researchDigest(claimed) } });
      release.resolve();
      const outcomes = await work;
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const loser = outcomes.find((outcome) => outcome.status === "rejected");
      expect(loser?.status === "rejected" && loser.reason).toBeInstanceOf(ExperimentConflictError);
      const done = (await challenger.get(f.human))!;
      expect(executions).toBe(1);
      expect(done.revision).toBe(before.revision + 2);
      expect(done.hypothesisEvaluations).toHaveLength(1);
      expect(done.episodes.at(-1)!.hypothesisEvaluationAttempt).toEqual(attempt);
      expect(done.hypothesisEvaluations![0]).toMatchObject({ seed: attempt.seed, allowance: attempt.allowance,
        samplingProtocol: attempt.samplingProtocol, evaluatorVersion: attempt.evaluatorVersion });
      expect(f.calls()).toBe(before.budget.spentCalls + done.hypothesisEvaluations![0].calls);
      expectChain(done);
      await replay(f, done, done.episodes.at(-1)!);
    } finally {
      if (locked) await lock.query("ROLLBACK");
      lock.release();
      release.resolve();
      if (work) await work;
    }
  }, 30_000);

  it.each(["pause", "lost-owner"] as const)("persists an attempt-only audit after %s and refuses a fresh question's redraw after reopening", async (mode) => {
    const f = await fixture({ phase: "audit" });
    const before = await proposed(f);
    const entered = deferred(), release = deferred();
    f.beforeMeasure(async () => { entered.resolve(); await release.promise; });
    let oldEvaluate!: NonNullable<OracleMeter["evaluateHypothesis"]>;
    f.setRunner(async (_station, question, _episodeId, meter) => {
      oldEvaluate = meter.evaluateHypothesis!;
      return evaluationResult(await oldEvaluate(question.hypothesisId!, "audit"));
    });
    const work = f.service.step(f.worker, "old-owner");
    const stale = expect(work).rejects.toBeInstanceOf(ExperimentConflictError);
    try {
      await entered.promise;
      const peer = connection();
      const recovery = f.openService(peer.repository);
      const claimed = (await recovery.get(f.human))!;
      const attempt = structuredClone(claimed.lease!.hypothesisEvaluationAttempt!);
      expect(attempt).toMatchObject({ samplingProtocol: HYPOTHESIS_SAMPLING_PROTOCOL, evaluatorVersion: HYPOTHESIS_EVALUATOR_VERSION, phase: "audit" });
      if (mode === "lost-owner") f.advance(claimed.policy.leaseMs + 1);
      let done = mode === "pause" ? await recovery.pause(f.human) : (await recovery.step(f.worker, "replacement-owner"))!;
      expect(done.episodes.at(-1)).toMatchObject({ verdict: "inconclusive", hypothesisEvaluationAttempt: attempt,
        hypothesisEvaluations: [], observations: [], calls: claimed.lease!.reservedCalls });
      expect(done.hypothesisEvaluations).toEqual([]);
      expect(done.hypotheses).toEqual(before.hypotheses);
      expect(done.episodes.slice(0, before.episodes.length)).toEqual(before.episodes);
      expect(done.questions.find((question) => question.id === claimed.lease!.questionId)!.status).toBe("stopped");
      expect(done.budget).toMatchObject({ spentCalls: before.budget.spentCalls + claimed.lease!.reservedCalls, reservedCalls: 0, abandonedReservations: 1 });
      release.resolve();
      await stale;
      f.beforeMeasure();
      await expect(oldEvaluate(attempt.hypothesisId, "audit")).rejects.toThrow();
      await close(f.pool);
      const reopened = f.openService(connection().repository);
      expect(await reopened.get(f.human)).toEqual(done);
      if (mode === "pause") done = await reopened.resume(f.human);
      const calls = f.calls();
      expect(done.status).toBe("idle");
      expect(await reopened.step(f.worker, "no-retry")).toEqual(done);
      const audit = done.questions.find((question) => question.kind === "audit-hypothesis")!;
      await changeFixture(f, peer.repository, (station) => {
        station.status = "running";
        station.stopReason = null;
        station.questions.push({ ...audit, id: `fresh-question-${randomUUID()}`, status: "pending", attempts: 0 });
      });
      const fenced = (await reopened.step(f.worker, "fresh-question-cannot-reroll"))!;
      expect(fenced.questions.at(-1)).toMatchObject({ status: "stopped", reasonCode: "hypothesis-phase-already-consumed" });
      expect(fenced.episodes).toEqual(done.episodes);
      expect(fenced.hypothesisEvaluations).toEqual([]);
      expect(f.calls()).toBe(calls);
      expectChain(fenced);
    } finally {
      release.resolve();
      await work.catch(() => undefined);
    }
  }, 30_000);

  it.skipIf(!restoreUrl)("checksum-restores real training, a fresh F counterexample and a live audit attempt, then advances durable cursors", async () => {
    const destinationUrl = checkedRestoreUrl(); // Fail closed before creating either pool if URLs alias.
    const f = await fixture({ refutable: true });
    const destination = connection(destinationUrl);
    // Also detect different URL spellings that resolve to the same actual database.
    const identityQuery = "SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port";
    const [sourceIdentity, destinationIdentity] = await Promise.all([f.pool.query(identityQuery), destination.pool.query(identityQuery)]);
    if (researchDigest(sourceIdentity.rows[0]) === researchDigest(destinationIdentity.rows[0])) {
      throw new Error("Source and restore resolve to the same TEST database; refusing destructive restore");
    }
    await new PostgresWorldRepository(f.pool).initialize(); // Schema only; no city/season execution.
    const proposedState = await proposed(f);
    const falsified = (await f.service.step(f.worker, "real-F"))!;
    const receipt = falsified.hypothesisEvaluations![0];
    expect(receipt.status).toBe("refuted");
    expect(receipt.counterexampleIds).not.toHaveLength(0);
    const witness = falsified.episodes.at(-1)!.observations.find((item) => receipt.counterexampleIds.includes(item.id))!;
    expect(predict(falsified.hypotheses![0].program, witness.input)).not.toBeNull();
    expect(predict(falsified.hypotheses![0].program, witness.input)).not.toBe(witness.measurement.holds);
    expect(proposedState.episodes.flatMap((episode) => episode.observations).map((item) => item.inputDigest)).not.toContain(witness.inputDigest);
    const entered = deferred(), release = deferred();
    f.setRunner(async () => { entered.resolve(); await release.promise; return empty("inconclusive"); });
    const sourceWork = f.service.step(f.worker, "source-audit-owner");
    const sourceSettled = sourceWork.then((station) => ({ station }), (error: unknown) => ({ error }));
    try {
      await entered.promise;
      const claimed = (await f.service.get(f.human))!;
      const attempt = structuredClone(claimed.lease!.hypothesisEvaluationAttempt!);
      const backup = await createPostgresBackup(f.pool, f.now());
      expect(verifyPostgresBackup(backup)).toBe(true);
      const sourceEvents = await f.repository.listLifecycleEvents(f.human.workspaceId!);
      const maximumCursor = Math.max(...backup.tables.nexus_lifecycle_events.map((row) => Number(row.event_cursor)));
      // The explicitly separate TEST_RESTORE_DATABASE_URL is disposable. Never truncate source.
      await restorePostgresBackup(destination.pool, backup, { force: true });
      const restored = f.openService(destination.repository, () => new Date(f.now().getTime() + claimed.policy.leaseMs + 1));
      expect(await restored.get(f.human)).toEqual(claimed);
      expect(await destination.repository.getLifecycleRecord(claimed.id)).toEqual(await f.repository.getLifecycleRecord(claimed.id));
      expect(await destination.repository.listLifecycleEvents(f.human.workspaceId!)).toEqual(sourceEvents);
      const calls = f.calls();
      const recovered = (await restored.step(f.worker, "restore-recovery"))!;
      expect(recovered.hypotheses).toEqual(proposedState.hypotheses);
      expect(recovered.hypothesisEvaluations).toEqual([receipt]);
      expect(recovered.episodes.slice(0, falsified.episodes.length)).toEqual(falsified.episodes);
      expect(recovered.episodes.at(-1)).toMatchObject({ hypothesisEvaluationAttempt: attempt, hypothesisEvaluations: [],
        verdict: "inconclusive", calls: claimed.lease!.reservedCalls });
      expect(recovered.budget).toMatchObject({ spentCalls: falsified.budget.spentCalls + claimed.lease!.reservedCalls, reservedCalls: 0, abandonedReservations: 1 });
      expectChain(recovered);
      expect(await restored.step(f.worker, "cannot-redraw-restored-audit")).toEqual(recovered);
      await restored.pause(f.human);
      const resumed = await restored.resume(f.human);
      expect(resumed.episodes).toEqual(recovered.episodes);
      expect(f.calls()).toBe(calls);
      const newEvents = await destination.repository.listLifecycleEvents(f.human.workspaceId!);
      expect(newEvents.slice(0, sourceEvents.length)).toEqual(sourceEvents);
      const appended = newEvents.slice(sourceEvents.length);
      expect(appended.map((event) => event.type)).toEqual(["research.reservation-abandoned", "research.station-paused", "research.station-resumed"]);
      expect(appended.every((event) => event.cursor > maximumCursor)).toBe(true);
      expect(new Set(appended.map((event) => event.cursor)).size).toBe(appended.length);
      expect(appended.at(-1)!.payload.stateDigest).toBe(researchDigest(resumed));
      expect(await f.service.get(f.human)).toEqual(claimed); // Restore/recovery never modifies source.
      const tampered = structuredClone(backup);
      const row = tampered.tables.nexus_lifecycle_records.find((item) => item.id === claimed.id)!;
      const envelope = row.record_json as { data: ResearchStation };
      envelope.data.episodes[1].observations[0].measurement.holds = !envelope.data.episodes[1].observations[0].measurement.holds;
      expect(verifyPostgresBackup(tampered)).toBe(false);
      await expect(restorePostgresBackup(destination.pool, tampered, { force: true })).rejects.toThrow("checksum");
      expect(await restored.get(f.human)).toEqual(resumed);
    } finally {
      release.resolve();
      const outcome = await sourceSettled;
      if ("error" in outcome) throw outcome.error;
    }
  }, 60_000);

  it("reads old local-v1 missing arrays through fresh repositories without rewriting hashes or adding read events", async () => {
    const f = await fixture();
    const original = (await f.service.step(f.worker, "legacy-survey"))!;
    await changeFixture(f, f.repository, (station) => { delete station.hypotheses; delete station.hypothesisEvaluations; });
    const raw = (await f.repository.getLifecycleRecord(original.id))!;
    const events = await f.repository.listLifecycleEvents(f.human.workspaceId!);
    await close(f.pool);
    const first = connection(), second = connection();
    for (const repository of [first.repository, second.repository]) {
      const reader = f.openService(repository);
      const legacy = (await reader.get(f.human))!;
      expect(Object.hasOwn(legacy, "hypotheses")).toBe(false);
      expect(Object.hasOwn(legacy, "hypothesisEvaluations")).toBe(false);
      expect(legacy.episodes).toEqual(original.episodes);
      expectChain(legacy);
      expect((await reader.overview(f.human)).station).toEqual(legacy);
      expect(await repository.getLifecycleRecord(original.id)).toEqual(raw);
      expect(await repository.listLifecycleEvents(f.human.workspaceId!)).toEqual(events);
    }
    expect(f.calls()).toBe(original.budget.spentCalls);
  }, 30_000);
});
