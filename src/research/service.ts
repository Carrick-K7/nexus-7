import { randomUUID } from "node:crypto";
import {
  actorWorkspaceId,
  assertActorPermission,
} from "@/experiments/authorization";
import {
  ExperimentConflictError,
  ExperimentNotFoundError,
  ExperimentPermissionError,
  ExperimentValidationError,
} from "@/experiments/errors";
import type { ExperimentRepository } from "@/experiments/repository";
import { selectResearchQuestion } from "./agenda";
import { derivePostEpisodeInduction } from "./engine";
import type { ExperimentActor } from "@/experiments/types";
import {
  LIFECYCLE_EVENT_SCHEMA_VERSION,
  type LifecycleRecord,
  type NewLifecycleEvent,
} from "@/lifecycle";
import {
  RESEARCH_RECORD_KIND,
  RESEARCH_SCHEMA,
  type EpisodeResult,
  type EpisodeRunner,
  type HypothesisEvaluation,
  type HypothesisEvaluationAttempt,
  type Json,
  type Localized,
  type Observation,
  type OracleMeter,
  type ReducerProgram,
  type ToolEvaluation,
  type ResearchEpisode,
  type ResearchHypothesis,
  type ResearchQuestion,
  type ResearchLease,
  type ResearchLesson,
  type ResearchOverview,
  type ResearchPolicy,
  type ResearchStation,
  type ResearchSubject,
  type ResearchTool,
} from "./contracts";
import {
  assertResearchJson,
  canonical,
  normalizeResearchJson,
  DEFAULT_RESEARCH_POLICY,
  researchDigest,
  researchSize,
  validateResearchPolicy,
} from "./integrity";
import { renderReducerSource, validateReducerProgram } from "./reducer";
import { evaluateReducer as evaluateTrustedReducer, RESEARCH_EVALUATOR_VERSION } from "./evaluator";
import { verdictEvidenceErrors } from "./evidence";
import { hypothesisReceiptErrors } from "./hypothesis-evidence";
import { formatHypothesisLesson, formatResearchLimitLesson } from "./hypothesis-lessons";
import {
  requireOperatorAuthorization,
  validateOperatorAuthorizationProvenance,
  type VerifiedOperatorAuthorization,
} from "./operator-authorization";
import {
  buildTrainingSnapshot, validateProposal, proposeHypothesis, HYPOTHESIS_PHASE_ALLOWANCE,
  HYPOTHESIS_EVALUATOR_VERSION, HYPOTHESIS_SAMPLING_PROTOCOL, evaluateHypothesis as evaluateTrustedHypothesis,
} from "./hypotheses";

export interface ResearchServiceOptions {
  now?: () => Date;
  id?: () => string;
  /** Enabled by default; isolated controller fixtures may explicitly opt out. */
  autoInduction?: boolean;
}

export interface StartResearchInput {
  seed: string;
  subjectIds: string[];
  policy?: Partial<ResearchPolicy>;
}

const QUESTION_KINDS = new Set(["survey", "replicate", "minimize", "transfer", "induce", "falsify", "audit-hypothesis"]);
const HYPOTHESIS_QUESTION_KINDS = new Set(["induce", "falsify", "audit-hypothesis"]);
const VERDICTS = new Set([
  "counterexample", "not-reproduced", "confirmed", "tool-certified",
  "tool-rejected", "transferred", "no-change", "inconclusive",
  "hypothesis-proposed", "hypothesis-refuted", "hypothesis-survived",
]);
const PARTITIONS = new Set([
  "discovery", "confirmation", "tool-training", "tool-validation", "transfer", "hypothesis-training",
  "hypothesis-falsification", "hypothesis-audit",
]);
const PRIVATE_PARTITIONS = new Set(["hypothesis-falsification", "hypothesis-audit"]);
const MAX_SUBJECTS = 32;
const MAX_GENERATED_PER_EPISODE = 8;
const MAX_HYPOTHESES = 16;
const MAX_LINEAGE_HYPOTHESES = 4;

function hypothesisPhase(question: ResearchQuestion): HypothesisEvaluation["phase"] | null {
  return question.kind === "falsify" ? "falsification" : question.kind === "audit-hypothesis" ? "audit" : null;
}

function hypothesisAllowance(phase: HypothesisEvaluation["phase"], reserved: number): number {
  return Math.min(reserved, HYPOTHESIS_PHASE_ALLOWANCE[phase]);
}

function phaseConsumed(station: ResearchStation, hypothesisId: string, phase: HypothesisEvaluation["phase"]): boolean {
  return (station.hypothesisEvaluations ?? []).some((receipt) => receipt.hypothesisId === hypothesisId && receipt.phase === phase) ||
    station.episodes.some((episode) => episode.hypothesisEvaluationAttempt?.hypothesisId === hypothesisId &&
      episode.hypothesisEvaluationAttempt.phase === phase);
}

function text(value: unknown, field: string, maximum = 240): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new ExperimentValidationError(`Invalid research ${field}`);
  }
  return value;
}

function localized(value: Localized, field: string): void {
  if (!value || typeof value !== "object") {
    throw new ExperimentValidationError(`Invalid research ${field}`);
  }
  text(value.en, `${field}.en`, 4_096);
  text(value.zh, `${field}.zh`, 4_096);
}

function count(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

/** Aggregates exceed the bounded single-input validator, but still use the identical JSON wire values. */
function wireClone<T>(value: T): T { return JSON.parse(canonical(value)) as T; }

function configuration(station: Pick<ResearchStation, "seed" | "subjectIds" | "subjectVersions" | "policy">) {
  return {
    seed: station.seed,
    subjectIds: station.subjectIds,
    subjectVersions: station.subjectVersions,
    policy: station.policy,
  };
}

function genesis(station: ResearchStation): string {
  return researchDigest({ schemaVersion: RESEARCH_SCHEMA, id: station.id, ...configuration(station) });
}

function episodeDigest(episode: ResearchEpisode): string {
  const { digest: _digest, ...content } = episode;
  void _digest;
  return researchDigest(content);
}

function readScope(actor: ExperimentActor): string {
  assertActorPermission(actor, "workspace:read");
  // Unlike assertWorkspaceAccess, system principals receive no cross-workspace exemption.
  const workspaceId = text(actor.workspaceId, "actor workspace", 120);
  if (workspaceId !== actorWorkspaceId(actor)) {
    throw new ExperimentPermissionError("Research identity has an invalid workspace scope");
  }
  return workspaceId;
}

function writeScope(actor: ExperimentActor, human = false): string {
  const workspaceId = readScope(actor);
  assertActorPermission(actor, "runs:write");
  if (human && actor.principalType !== "human") {
    throw new ExperimentPermissionError("Research authorization and control require an explicit human principal");
  }
  return workspaceId;
}

function assertProposal(hypothesis: ResearchHypothesis, subject: ResearchSubject, observations: Observation[], episodeId: string): void {
  if (!hypothesis || hypothesis.subjectId !== subject.id || hypothesis.subjectVersion !== subject.version ||
    hypothesis.createdByEpisodeId !== episodeId) throw new ExperimentValidationError("Invalid research hypothesis source");
  const snapshot = buildTrainingSnapshot(observations, subject);
  const validation = validateProposal(hypothesis.program, snapshot);
  if (!validation.valid) throw new ExperimentValidationError("Research hypothesis has insufficient or contradictory training support");
  const expected = proposeHypothesis(subject, snapshot, hypothesis.program, episodeId, hypothesis.parentHypothesisId ?? undefined);
  if (researchDigest(expected) !== researchDigest(hypothesis)) {
    throw new ExperimentValidationError("Research hypothesis does not match its complete frozen training snapshot");
  }
}

function assertHypothesisLineage(hypothesis: ResearchHypothesis, hypotheses: readonly ResearchHypothesis[],
  evaluations: readonly HypothesisEvaluation[], episodes: readonly ResearchEpisode[]): void {
  const source = hypotheses.filter((prior) => prior.subjectId === hypothesis.subjectId && prior.subjectVersion === hypothesis.subjectVersion);
  if (hypotheses.length >= MAX_HYPOTHESES || source.length >= MAX_LINEAGE_HYPOTHESES ||
    hypotheses.some((prior) => prior.id === hypothesis.id) || source.some((prior) =>
      prior.programDigest === hypothesis.programDigest && prior.trainingDigest === hypothesis.trainingDigest)) {
    throw new ExperimentValidationError("Research hypothesis capacity or duplicate-content limit reached");
  }
  if (hypothesis.parentHypothesisId === null) {
    if (source.length > 0) throw new ExperimentValidationError("Only one hypothesis root is allowed per source version");
  } else {
    const parent = source.find((prior) => prior.id === hypothesis.parentHypothesisId);
    const audited = new Set(source.map((prior) => prior.id));
    if (!parent || !evaluations.some((receipt) => receipt.hypothesisId === parent.id &&
      receipt.phase === "falsification" && receipt.status === "refuted") ||
      evaluations.some((receipt) => receipt.phase === "audit" && audited.has(receipt.hypothesisId)) ||
      episodes.some((episode) => episode.hypothesisEvaluationAttempt?.phase === "audit" &&
        audited.has(episode.hypothesisEvaluationAttempt.hypothesisId))) {
      throw new ExperimentValidationError("Hypothesis revision requires a refuted F parent and an unaudited lineage");
    }
  }
}

/** Resolve only committed artifacts; neither a runner's station clone nor candidate object is authority. */
function frozenHypothesis(station: ResearchStation, subjects: ReadonlyMap<string, ResearchSubject>, id: string): ResearchHypothesis {
  const hypothesis = (station.hypotheses ?? []).find((item) => item.id === id);
  const index = station.episodes.findIndex((episode) => episode.id === hypothesis?.createdByEpisodeId);
  const episode = station.episodes[index];
  const subject = hypothesis && subjects.get(hypothesis.subjectId);
  if (!hypothesis || !subject || index < 0 || episode.kind !== "induce" || episode.subjectId !== subject.id ||
    subject.version !== station.subjectVersions[subject.id] || researchDigest(episode.hypothesis) !== researchDigest(hypothesis)) {
    throw new ExperimentValidationError("Research hypothesis is not a persisted frozen artifact");
  }
  assertProposal(hypothesis, subject, station.episodes.slice(0, index + 1).flatMap((item) => item.observations), episode.id);
  return structuredClone(hypothesis);
}

/** A meter is authority over calls; the runner cannot provide its own accounting. */
class ServiceOracleMeter implements OracleMeter {
  private consumed = 0;
  private open = true;
  private acceptingRunnerRequests = true;
  private requestedEvaluations = 0;
  private readonly pending = new Set<Promise<unknown>>();
  private readonly observed = new Map<number, Observation>();
  private readonly issuedEvaluations: ToolEvaluation[] = [];
  private readonly issuedHypothesisEvaluations: HypothesisEvaluation[] = [];
  private readonly pendingHypothesisEvaluations = new Set<string>();
  private readonly requestedHypothesisPhases = new Set<string>();
  failure: string | null = null;

  constructor(
    readonly limit: number,
    private readonly episodeId: string,
    private readonly subjects: ReadonlyMap<string, ResearchSubject>,
    private readonly allowedSubjects: ReadonlySet<string>,
    private readonly authorized: () => Promise<boolean>,
    private readonly hypothesisContext: { station: ResearchStation; question: ResearchQuestion },
  ) {}

  get used(): number { return this.consumed; }

  get observations(): Observation[] {
    return [...this.observed.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, observation]) => structuredClone(observation));
  }

  // These clone-only getters are for ResearchService; the runner facade never exposes them.
  get evaluations(): ToolEvaluation[] { return structuredClone(this.issuedEvaluations); }
  get hypothesisEvaluations(): HypothesisEvaluation[] { return structuredClone(this.issuedHypothesisEvaluations); }
  get evaluationRequests(): number { return this.requestedEvaluations; }

  private track<T>(task: Promise<T>): Promise<T> {
    this.pending.add(task);
    void task.then(() => this.pending.delete(task), () => this.pending.delete(task));
    return task;
  }

  observeForRunner(subject: ResearchSubject, input: Json, partition: Observation["partition"]): Promise<Observation> {
    if (!this.acceptingRunnerRequests) {
      return this.track(Promise.reject(new ExperimentConflictError("Research runner oracle admission is closed")));
    }
    // Once an F/T slot is claimed, even discovery-labeled caller-selected inputs are
    // forbidden: only the frozen evaluator chooses samples and spends that allowance.
    if (hypothesisPhase(this.hypothesisContext.question)) {
      this.failure ??= "hypothesis-phase-private-oracle";
      return this.track(Promise.reject(new ExperimentValidationError("Hypothesis phases require kernel-selected oracle inputs")));
    }
    // Only the private fixed evaluator may label observations as F/T. A runner cannot
    // hide training counterexamples or manufacture audit evidence by choosing a partition.
    if (PRIVATE_PARTITIONS.has(partition)) {
      this.failure ??= "reserved-hypothesis-partition";
      return this.track(Promise.reject(new ExperimentValidationError("Hypothesis evaluation partitions are kernel-private")));
    }
    return this.observe(subject, input, partition);
  }

  observe(subject: ResearchSubject, input: Json, partition: Observation["partition"]): Promise<Observation> {
    return this.track(this.perform(subject, input, partition));
  }

  evaluateReducer(program: ReducerProgram, subject: ResearchSubject, input: Json): Promise<ToolEvaluation> {
    if (!this.acceptingRunnerRequests) {
      return this.track(Promise.reject(new ExperimentConflictError("Research runner evaluation admission is closed")));
    }
    if (hypothesisPhase(this.hypothesisContext.question)) {
      this.failure ??= "hypothesis-phase-private-oracle";
      return this.track(Promise.reject(new ExperimentValidationError("Reducer evaluation is forbidden during a hypothesis phase")));
    }
    return this.track(this.certify(program, subject, input));
  }

  evaluateHypothesis(...args: [string, HypothesisEvaluation["phase"]]): Promise<HypothesisEvaluation> {
    if (!this.acceptingRunnerRequests) {
      return this.track(Promise.reject(new ExperimentConflictError("Research runner evaluation admission is closed")));
    }
    if (args.length !== 2) {
      this.failure ??= "hypothesis-evaluation-failed";
      return this.track(Promise.reject(new ExperimentValidationError("Hypothesis evaluation accepts only an id and phase")));
    }
    return this.track(this.testHypothesis(args[0], args[1]));
  }

  private trustedSubject(subject: ResearchSubject): ResearchSubject {
    const trusted = this.subjects.get(subject?.id);
    if (!trusted || subject.version !== trusted.version || !this.allowedSubjects.has(trusted.id)) {
      throw new ExperimentValidationError("Research oracle subject is not authorized");
    }
    return trusted;
  }

  private async certify(program: ReducerProgram, subject: ResearchSubject, input: Json): Promise<ToolEvaluation> {
    try {
      if (!this.open) throw new ExperimentConflictError("Research oracle meter is closed");
      // Even zero-call budget rejections cannot create an unbounded receipt collection.
      if (this.requestedEvaluations >= this.limit) throw new ExperimentConflictError("Research evaluation request cap reached");
      this.requestedEvaluations += 1;
      const trusted = this.trustedSubject(subject);
      validateReducerProgram(program);
      assertResearchJson(input);
      // Snapshot synchronously, before the first await and before invoking candidate instrumentation.
      const frozenProgram = structuredClone(program);
      const frozenInput = normalizeResearchJson(input);
      const programDigest = researchDigest(frozenProgram);
      const inputDigest = researchDigest(frozenInput);
      if (trusted.valid(structuredClone(frozenInput)) !== true) {
        throw new ExperimentValidationError("Research evaluation input does not satisfy the subject contract");
      }
      const allowed = await this.authorized();
      if (!this.open || !allowed) throw new ExperimentConflictError("Research evaluation lease is no longer active");
      let evaluationCalls = 0;
      const observationIds: string[] = [];
      const used = () => this.used;
      const observe = this.observe.bind(this);
      const allowance = Math.max(0, this.limit - this.used);
      // Keep evaluator fuel reproducible while every call still passes the shared hard cap.
      // Concurrent work that depletes that cap fails closed rather than silently changing fuel.
      const evaluatorMeter: OracleMeter = Object.freeze({
        get used() { return evaluationCalls; },
        get limit() { return allowance; },
        async observe(target: ResearchSubject, value: Json, partition: Observation["partition"]) {
          const before = used();
          const task = observe(target, value, partition);
          evaluationCalls += used() - before;
          const observation = await task;
          observationIds.push(observation.id);
          return observation;
        },
      });
      const evaluation = await evaluateTrustedReducer(frozenProgram, trusted, frozenInput, evaluatorMeter);
      const stillAuthorized = await this.authorized();
      if (!this.open || !stillAuthorized) throw new ExperimentConflictError("Research evaluation was revoked before certification");
      if (this.failure || evaluation.verifierVersion !== RESEARCH_EVALUATOR_VERSION ||
        evaluation.programDigest !== programDigest || evaluation.subjectId !== trusted.id ||
        evaluation.subjectVersion !== trusted.version || evaluation.inputDigest !== inputDigest ||
        evaluation.allowance !== allowance || evaluation.calls !== evaluationCalls ||
        researchDigest(evaluation.observationIds) !== researchDigest(observationIds)) {
        throw new ExperimentValidationError("Research evaluator receipt does not match kernel instrumentation");
      }
      this.issuedEvaluations.push(structuredClone(evaluation));
      return structuredClone(evaluation);
    } catch (error) {
      this.failure ??= "evaluation-failed";
      throw error;
    }
  }

  private async testHypothesis(hypothesisId: string, phase: HypothesisEvaluation["phase"]): Promise<HypothesisEvaluation> {
    let key: string | undefined;
    try {
      if (!this.open) throw new ExperimentConflictError("Research oracle meter is closed");
      if (this.requestedEvaluations >= this.limit) throw new ExperimentConflictError("Research evaluation request cap reached");
      this.requestedEvaluations += 1;
      text(hypothesisId, "hypothesis id");
      const { station, question } = this.hypothesisContext;
      const attempt = station.lease?.hypothesisEvaluationAttempt;
      if (!attempt || hypothesisPhase(question) !== phase || question.hypothesisId !== hypothesisId ||
        attempt.hypothesisId !== hypothesisId || attempt.phase !== phase ||
        attempt.samplingProtocol !== HYPOTHESIS_SAMPLING_PROTOCOL || attempt.evaluatorVersion !== HYPOTHESIS_EVALUATOR_VERSION ||
        phaseConsumed(station, hypothesisId, phase)) {
        throw new ExperimentValidationError("Hypothesis evaluation is outside the claimed question");
      }
      const attemptKey = `${hypothesisId}\0${phase}`;
      if (this.pendingHypothesisEvaluations.has(attemptKey) || this.requestedHypothesisPhases.has(attemptKey) || this.issuedHypothesisEvaluations.some((receipt) =>
        receipt.hypothesisId === hypothesisId && receipt.phase === phase)) {
        throw new ExperimentConflictError("Hypothesis phase was already requested");
      }
      // Claim this local capability synchronously, before the first await. The persisted
      // attempt above fences subsequent episodes even if no receipt is ever returned.
      key = attemptKey;
      this.pendingHypothesisEvaluations.add(key);
      this.requestedHypothesisPhases.add(key);
      const hypothesis = frozenHypothesis(station, this.subjects, hypothesisId);
      const trusted = this.trustedSubject(this.subjects.get(question.subjectId)!);
      if (hypothesis.subjectId !== trusted.id || hypothesis.subjectVersion !== trusted.version) {
        throw new ExperimentValidationError("Hypothesis source does not match the question");
      }
      const priorObservations = structuredClone(station.episodes.flatMap((episode) => episode.observations));
      const allowed = await this.authorized();
      if (!this.open || !allowed) throw new ExperimentConflictError("Research evaluation lease is no longer active");
      const allowance = attempt.allowance;
      const observationIds: string[] = [];
      let evaluationCalls = 0;
      const used = () => this.used;
      const observe = this.observe.bind(this);
      const partition = phase === "audit" ? "hypothesis-audit" : "hypothesis-falsification";
      const evaluatorMeter: OracleMeter = Object.freeze({
        get used() { return evaluationCalls; },
        get limit() { return allowance; },
        async observe(target: ResearchSubject, input: Json, requestedPartition: Observation["partition"]) {
          if (target.id !== trusted.id || target.version !== trusted.version || requestedPartition !== partition) {
            throw new ExperimentValidationError("Hypothesis evaluator exceeded its instrument scope");
          }
          const before = used();
          const task = observe(trusted, input, partition);
          evaluationCalls += used() - before;
          const observation = await task;
          observationIds.push(observation.id);
          return observation;
        },
      });
      const evaluation = await evaluateTrustedHypothesis(hypothesis, trusted, priorObservations, evaluatorMeter, phase, attempt.seed);
      const stillAuthorized = await this.authorized();
      if (!this.open || !stillAuthorized) throw new ExperimentConflictError("Research hypothesis evaluation was revoked");
      if (this.failure || evaluation.evaluatorVersion !== attempt.evaluatorVersion ||
        evaluation.samplingProtocol !== attempt.samplingProtocol ||
        evaluation.hypothesisId !== hypothesis.id || evaluation.programDigest !== hypothesis.programDigest ||
        evaluation.trainingDigest !== hypothesis.trainingDigest || evaluation.subjectId !== trusted.id ||
        evaluation.subjectVersion !== trusted.version || evaluation.phase !== phase || evaluation.seed !== attempt.seed ||
        evaluation.allowance !== allowance || evaluation.calls !== evaluationCalls ||
        !["refuted", "survived-budget", "inconclusive"].includes(evaluation.status) ||
        researchDigest(evaluation.observationIds) !== researchDigest(observationIds)) {
        throw new ExperimentValidationError("Hypothesis receipt does not match kernel instrumentation");
      }
      this.issuedHypothesisEvaluations.push(structuredClone(evaluation));
      return structuredClone(evaluation);
    } catch (error) {
      this.failure ??= "hypothesis-evaluation-failed";
      throw error;
    } finally {
      if (key) this.pendingHypothesisEvaluations.delete(key);
    }
  }

  private async perform(subject: ResearchSubject, input: Json, partition: Observation["partition"]): Promise<Observation> {
    if (!this.open) throw new ExperimentConflictError("Research oracle meter is closed");
    if (this.consumed >= this.limit) {
      this.failure = "oracle-call-cap";
      throw new ExperimentConflictError("Research oracle reservation is exhausted");
    }
    const sequence = ++this.consumed;
    try {
      const trusted = this.trustedSubject(subject);
      if (!PARTITIONS.has(partition)) throw new ExperimentValidationError("Invalid observation partition");
      const safeInput = normalizeResearchJson(input);
      if (trusted.valid(structuredClone(safeInput)) !== true) {
        throw new ExperimentValidationError("Research oracle input does not satisfy the subject contract");
      }
      const allowed = await this.authorized();
      if (!this.open || !allowed) {
        throw new ExperimentConflictError("Research oracle lease is no longer active");
      }
      const measurement = await trusted.measure(structuredClone(safeInput));
      if (!measurement || typeof measurement.holds !== "boolean" ||
        !measurement.facts || typeof measurement.facts !== "object" || Array.isArray(measurement.facts)) {
        throw new ExperimentValidationError("Invalid research measurement");
      }
      const code = text(measurement.code, "measurement code", 160);
      const facts = normalizeResearchJson(measurement.facts);
      if (!this.open) throw new ExperimentConflictError("Research oracle meter is closed");
      const observation: Observation = {
        id: `${this.episodeId}:observation:${sequence}`,
        subjectId: trusted.id,
        subjectVersion: trusted.version,
        input: safeInput,
        inputDigest: researchDigest(safeInput),
        measurement: { holds: measurement.holds, code, facts },
        partition,
      };
      this.observed.set(sequence, observation);
      return structuredClone(observation);
    } catch (error) {
      this.failure ??= "oracle-call-failed";
      throw error;
    }
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  sealRunner(): void { this.acceptingRunnerRequests = false; }

  close(): void { this.open = false; this.sealRunner(); }
}

export class ResearchService {
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly subjects: Map<string, ResearchSubject>;
  private readonly autoInduction: boolean;

  constructor(
    readonly repository: ExperimentRepository,
    subjects: readonly ResearchSubject[],
    private readonly runner: EpisodeRunner,
    options: ResearchServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
    this.autoInduction = options.autoInduction ?? true;
    this.subjects = new Map();
    if (subjects.length === 0 || subjects.length > MAX_SUBJECTS) {
      throw new ExperimentValidationError("Research catalog must be finite and nonempty");
    }
    for (const subject of subjects) {
      text(subject.id, "subject id", 120);
      text(subject.version, "subject version", 120);
      localized(subject.title, "subject title");
      localized(subject.claim, "subject claim");
      if (this.subjects.has(subject.id)) throw new ExperimentValidationError("Duplicate research subject");
      this.subjects.set(subject.id, Object.freeze({
        ...subject, title: structuredClone(subject.title), claim: structuredClone(subject.claim),
      }));
    }
  }

  private stationId(workspaceId: string): string { return `research-station:${workspaceId}`; }

  private timestamp(): string {
    const value = this.now();
    if (!Number.isFinite(value.getTime())) throw new ExperimentValidationError("Invalid research wall clock");
    return value.toISOString();
  }

  private validateStation(record: LifecycleRecord, actor: ExperimentActor): ResearchStation {
    const workspaceId = readScope(actor);
    if (record.id !== this.stationId(workspaceId) || record.workspaceId !== workspaceId ||
      record.kind !== RESEARCH_RECORD_KIND ||
      (actor.organizationId && actor.organizationId !== record.organizationId)) {
      throw new ExperimentPermissionError("Research record is outside the identity scope");
    }
    const station = record.data as unknown as ResearchStation;
    if (!station || station.schemaVersion !== RESEARCH_SCHEMA) {
      throw new ExperimentConflictError("Unsupported research station schema");
    }
    const invalid = () => { throw new ExperimentConflictError("Research station integrity is invalid"); };
    if (station.id !== record.id || station.workspaceId !== record.workspaceId ||
      station.organizationId !== record.organizationId || station.revision !== record.revision ||
      station.status !== record.status || station.createdAt !== record.createdAt ||
      station.updatedAt !== record.updatedAt || station.mode !== "bounded-symbolic-research" ||
      !["running", "paused", "idle", "budget-exhausted"].includes(station.status)) invalid();
    try {
      validateResearchPolicy(station.policy);
      if (station.authorization !== undefined) validateOperatorAuthorizationProvenance(station.authorization, station);
    } catch { invalid(); }
    if (!Array.isArray(station.subjectIds) || station.subjectIds.length === 0 ||
      station.subjectIds.length > MAX_SUBJECTS || new Set(station.subjectIds).size !== station.subjectIds.length ||
      !station.subjectVersions || station.subjectIds.some((id) =>
        !this.subjects.has(id) || station.subjectVersions[id] !== this.subjects.get(id)!.version)) invalid();
    if (!Array.isArray(station.questions) || !Array.isArray(station.episodes) ||
      !Array.isArray(station.lessons) || !Array.isArray(station.tools) ||
      station.episodes.length > station.policy.maxEpisodes ||
      station.questions.length > MAX_SUBJECTS + station.policy.maxEpisodes * MAX_GENERATED_PER_EPISODE ||
      station.lessons.length > station.policy.maxEpisodes * MAX_GENERATED_PER_EPISODE ||
      station.tools.length > station.policy.maxEpisodes) invalid();
    const budget = station.budget;
    if (!budget || !count(budget.spentCalls, station.policy.maxOracleCalls) ||
      !count(budget.reservedCalls, station.policy.maxCallsPerEpisode) ||
      budget.spentCalls + budget.reservedCalls > station.policy.maxOracleCalls ||
      !count(budget.abandonedReservations, station.policy.maxEpisodes) ||
      budget.externalModelCalls !== 0 || budget.actualModelCostUsd !== 0) invalid();
    const questionIds = new Set<string>();
    for (const question of station.questions) {
      if (!question || questionIds.has(question.id) || !station.subjectIds.includes(question.subjectId) ||
        !QUESTION_KINDS.has(question.kind) || !["pending", "running", "answered", "stopped"].includes(question.status) ||
        !count(question.attempts, station.policy.maxAttemptsPerQuestion) ||
        !count(question.createdAtRound, station.policy.maxEpisodes) || !Number.isFinite(question.priority)) invalid();
      questionIds.add(question.id);
    }
    let previousDigest = genesis(station);
    let spent = 0;
    const episodeIds = new Set<string>();
    for (const episode of station.episodes) {
      if (!episode || episodeIds.has(episode.id) || !questionIds.has(episode.questionId) ||
        !VERDICTS.has(episode.verdict) || !count(episode.calls, station.policy.maxCallsPerEpisode) ||
        episode.previousDigest !== previousDigest || episode.digest !== episodeDigest(episode)) invalid();
      episodeIds.add(episode.id);
      previousDigest = episode.digest;
      spent += episode.calls;
    }
    if (spent !== budget.spentCalls) invalid();
    try { this.validateHypothesisLedger(station); } catch { invalid(); }
    const running = station.questions.filter((question) => question.status === "running");
    if (station.lease) {
      const lease = station.lease;
      if (station.status !== "running" || running.length !== 1 || running[0].id !== lease.questionId ||
        lease.reservedCalls !== budget.reservedCalls || lease.reservedCalls <= 0 || episodeIds.has(lease.episodeId) ||
        typeof lease.token !== "string" || !lease.token ||
        !Number.isFinite(Date.parse(lease.acquiredAt)) || !Number.isFinite(Date.parse(lease.expiresAt)) ||
        Date.parse(lease.expiresAt) <= Date.parse(lease.acquiredAt)) invalid();
    } else if (budget.reservedCalls !== 0 || running.length !== 0) invalid();
    return wireClone(station);
  }

  private validateHypothesisLedger(station: ResearchStation): void {
    const invalid = () => { throw new ExperimentValidationError("Invalid research hypothesis ledger"); };
    if ((station.hypotheses !== undefined && !Array.isArray(station.hypotheses)) ||
      (station.hypothesisEvaluations !== undefined && !Array.isArray(station.hypothesisEvaluations))) invalid();
    const hypotheses = station.hypotheses ?? [];
    const evaluations = station.hypothesisEvaluations ?? [];
    if (hypotheses.length > MAX_HYPOTHESES || evaluations.length > MAX_HYPOTHESES * 2) invalid();
    const priorHypotheses: ResearchHypothesis[] = [];
    const priorEvaluations: HypothesisEvaluation[] = [];
    const priorEpisodes: ResearchEpisode[] = [];
    const observations: Observation[] = [];
    const consumed = new Set<string>();
    const seeds = new Set<string>();
    let historicalSpent = 0;
    const checkAttempt = (attempt: HypothesisEvaluationAttempt, question: ResearchQuestion, allowance: number) => {
      const hypothesis = priorHypotheses.find((item) => item.id === attempt.hypothesisId);
      const key = `${attempt.hypothesisId}\0${attempt.phase}`;
      // Pre-versioned v1 attempts are readable only as legacy history. New issuance
      // separately requires both exact current versions; partial/unknown bindings fail.
      const hasProtocol = attempt.samplingProtocol !== undefined;
      const hasEvaluator = attempt.evaluatorVersion !== undefined;
      if (hasProtocol !== hasEvaluator || (hasProtocol &&
        !["bounded-perturbation-v1", "bounded-perturbation-v2"].includes(attempt.samplingProtocol!)) ||
        (hasEvaluator && attempt.evaluatorVersion !== HYPOTHESIS_EVALUATOR_VERSION)) invalid();
      if (!hypothesis || hypothesis.subjectId !== question.subjectId || hypothesisPhase(question) !== attempt.phase ||
        question.hypothesisId !== attempt.hypothesisId || consumed.has(key) || seeds.has(attempt.seed) ||
        !count(attempt.allowance, station.policy.maxCallsPerEpisode) || attempt.allowance < 1 || attempt.allowance !== allowance) invalid();
      text(attempt.seed, "hypothesis evaluation seed", 240);
      consumed.add(key);
      seeds.add(attempt.seed);
      return hypothesis!;
    };
    for (const episode of station.episodes) {
      const reserved = Math.min(station.policy.maxCallsPerEpisode, station.policy.maxOracleCalls - historicalSpent);
      const question = station.questions.find((item) => item.id === episode.questionId)!;
      const hypothesisEpisode = HYPOTHESIS_QUESTION_KINDS.has(episode.kind) || HYPOTHESIS_QUESTION_KINDS.has(question.kind) ||
        !!episode.hypothesis || !!episode.hypothesisEvaluationAttempt || (episode.hypothesisEvaluations?.length ?? 0) > 0;
      if (hypothesisEpisode && (episode.kind !== question.kind || episode.subjectId !== question.subjectId ||
        episode.calls > reserved || (episode.hypothesis && episode.hypothesis.parentHypothesisId !== (question.hypothesisId ?? null)))) invalid();
      observations.push(...episode.observations);
      if (episode.hypothesis) {
        const hypothesis = episode.hypothesis;
        const subject = this.subjects.get(episode.subjectId);
        if (!subject || episode.kind !== "induce" || episode.verdict !== "hypothesis-proposed") invalid();
        assertProposal(hypothesis, subject!, observations, episode.id);
        assertHypothesisLineage(hypothesis, priorHypotheses, priorEvaluations, priorEpisodes);
        priorHypotheses.push(hypothesis);
      } else if (episode.verdict === "hypothesis-proposed") invalid();
      if (episode.hypothesisEvaluations !== undefined && !Array.isArray(episode.hypothesisEvaluations)) invalid();
      const receipts = episode.hypothesisEvaluations ?? [];
      const attempt = episode.hypothesisEvaluationAttempt;
      if (attempt) {
        if (episode.kind !== question.kind || episode.subjectId !== question.subjectId || receipts.length > 1) invalid();
        const hypothesis = checkAttempt(attempt, question, hypothesisAllowance(attempt.phase, reserved));
        for (const receipt of receipts) {
          if (receipt.hypothesisId !== hypothesis.id || receipt.programDigest !== hypothesis.programDigest ||
            receipt.trainingDigest !== hypothesis.trainingDigest || receipt.subjectId !== hypothesis.subjectId ||
            receipt.subjectVersion !== hypothesis.subjectVersion || receipt.phase !== attempt.phase || receipt.seed !== attempt.seed ||
            receipt.evaluatorVersion !== HYPOTHESIS_EVALUATOR_VERSION || receipt.allowance !== attempt.allowance ||
            !count(receipt.calls, episode.calls) || !Array.isArray(receipt.observationIds) ||
            receipt.observationIds.some((id) => !episode.observations.some((item) => item.id === id)) ||
            !["refuted", "survived-budget", "inconclusive"].includes(receipt.status) ||
            hypothesisReceiptErrors(receipt, hypothesis, episode.observations,
              priorEpisodes.flatMap((prior) => prior.observations), attempt).length > 0) invalid();
          priorEvaluations.push(receipt);
        }
        if (episode.verdict !== "inconclusive" && (receipts.length !== 1 || episode.verdict !==
          (receipts[0].status === "refuted" ? "hypothesis-refuted" : receipts[0].status === "survived-budget" ? "hypothesis-survived" : "inconclusive"))) invalid();
      } else if (receipts.length > 0 || hypothesisPhase(question) ||
        ["hypothesis-refuted", "hypothesis-survived"].includes(episode.verdict)) invalid();
      const actualLessons = station.lessons.filter((lesson) => lesson.episodeId === episode.id);
      if (hypothesisEpisode && researchDigest(actualLessons.map((lesson) => lesson.id)) !== researchDigest(episode.lessonIds)) invalid();
      if (hypothesisEpisode && verdictEvidenceErrors({
        kind: episode.kind, subjectId: episode.subjectId, verdict: episode.verdict, episodeId: episode.id,
        subject: this.subjects.get(episode.subjectId), question, observations: episode.observations,
        evaluations: episode.evaluations ?? [], priorObservations: priorEpisodes.flatMap((prior) => prior.observations),
        tools: station.tools, tool: episode.tool, hypotheses: priorHypotheses,
        hypothesis: episode.hypothesis, hypothesisEvaluations: receipts, attempt,
        lessons: actualLessons, selectionReason: episode.selectionReason, requireKernelLessons: true,
      }).length > 0) invalid();
      historicalSpent += episode.calls;
      priorEpisodes.push(episode);
    }
    if (researchDigest(priorHypotheses) !== researchDigest(hypotheses) ||
      researchDigest(priorEvaluations) !== researchDigest(evaluations)) invalid();
    for (const lesson of station.lessons) {
      if (lesson.kind === "hypothesis" && !station.episodes.some((episode) => episode.id === lesson.episodeId &&
        HYPOTHESIS_QUESTION_KINDS.has(episode.kind) && episode.lessonIds.includes(lesson.id))) invalid();
    }
    for (const question of station.questions) {
      const hypothesis = hypotheses.find((item) => item.id === question.hypothesisId);
      if ((hypothesisPhase(question) && !hypothesis) || (question.hypothesisId !== undefined &&
        (!hypothesis || hypothesis.subjectId !== question.subjectId || !["induce", "falsify", "audit-hypothesis"].includes(question.kind)))) invalid();
    }
    if (station.lease) {
      const question = station.questions.find((item) => item.id === station.lease!.questionId)!;
      if (station.lease.hypothesisEvaluationAttempt) {
        if (station.lease.reservedCalls !== Math.min(station.policy.maxCallsPerEpisode, station.policy.maxOracleCalls - historicalSpent)) invalid();
        checkAttempt(station.lease.hypothesisEvaluationAttempt, question,
          hypothesisAllowance(station.lease.hypothesisEvaluationAttempt.phase, station.lease.reservedCalls));
      } else if (hypothesisPhase(question)) invalid();
    }
  }

  private async load(actor: ExperimentActor): Promise<{ record: LifecycleRecord; station: ResearchStation } | null> {
    const workspaceId = readScope(actor);
    const record = await this.repository.getLifecycleRecord(this.stationId(workspaceId));
    return record ? { record, station: this.validateStation(record, actor) } : null;
  }

  async get(actor: ExperimentActor): Promise<ResearchStation | null> {
    return (await this.load(actor))?.station ?? null;
  }

  async overview(actor: ExperimentActor): Promise<ResearchOverview> {
    return {
      schemaVersion: RESEARCH_SCHEMA,
      generatedAt: this.timestamp(),
      backend: this.repository.backend,
      station: await this.get(actor),
      subjects: [...this.subjects.values()].map(({ id, version, title, claim, origin, interpretation, family }) =>
        structuredClone({ id, version, title, claim, origin, interpretation, family })),
      boundary: {
        productionWrites: false,
        arbitraryCodeExecution: false,
        liveModelCalls: false,
        knownSeedsAreNotDiscoveries: true,
        evaluatorIsolation: "separate-module-not-hostile-process-isolation",
      },
    };
  }

  async start(actor: ExperimentActor, input: StartResearchInput): Promise<ResearchStation> {
    // Public controls remain strictly human; the local operator never impersonates one.
    writeScope(actor, true);
    return this.#createStation(actor, input);
  }

  async startFromOperatorAuthorization(actor: ExperimentActor, capability: VerifiedOperatorAuthorization): Promise<ResearchStation> {
    const { permit } = requireOperatorAuthorization(capability, actor);
    return this.#createStation(actor, {
      seed: permit.seed, subjectIds: permit.subjectIds, policy: permit.policy,
    }, capability);
  }

  async #createStation(actor: ExperimentActor, input: StartResearchInput,
    capability?: VerifiedOperatorAuthorization): Promise<ResearchStation> {
    const workspaceId = writeScope(actor, capability === undefined);
    const authorization = capability === undefined ? undefined : requireOperatorAuthorization(capability, actor).authorization;
    const recheckAuthorization = () => {
      if (capability !== undefined) requireOperatorAuthorization(capability, actor);
    };
    const seed = text(input?.seed, "seed", 240);
    if (!Array.isArray(input.subjectIds) || input.subjectIds.length === 0 || input.subjectIds.length > MAX_SUBJECTS ||
      new Set(input.subjectIds).size !== input.subjectIds.length || input.subjectIds.some((id) => !this.subjects.has(id))) {
      throw new ExperimentValidationError("Invalid research subject selection");
    }
    const subjectIds = [...input.subjectIds].sort();
    const subjectVersions = Object.fromEntries(subjectIds.map((id) => [id, this.subjects.get(id)!.version]));
    let policy = { ...DEFAULT_RESEARCH_POLICY, ...input.policy };
    try { validateResearchPolicy(policy); } catch {
      throw new ExperimentValidationError("Invalid research policy");
    }
    policy = wireClone(policy);
    const sameConfiguration = (station: ResearchStation): ResearchStation => {
      recheckAuthorization();
      if (researchDigest(configuration(station)) !== researchDigest({ seed, subjectIds, subjectVersions, policy })) {
        throw new ExperimentConflictError("Research station already has a different frozen configuration");
      }
      if (authorization && (!station.authorization || researchDigest(station.authorization) !== researchDigest(authorization))) {
        throw new ExperimentConflictError("Research station has a different authorization source or nonce");
      }
      // A retry is a read, including paused/exhausted stations. It never clears budgets or resumes work.
      return station;
    };
    const workspace = await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) throw new ExperimentNotFoundError("Research workspace governance was not initialized");
    if (actor.organizationId && actor.organizationId !== workspace.organizationId) {
      throw new ExperimentPermissionError("Research organization does not match the identity scope");
    }
    if (authorization && !await this.repository.getOrganization(workspace.organizationId)) {
      throw new ExperimentNotFoundError("Research organization governance was not initialized");
    }
    const existing = await this.get(actor);
    if (existing) return sameConfiguration(existing);
    const timestamp = this.timestamp();
    const id = this.stationId(workspaceId);
    const station: ResearchStation = {
      schemaVersion: RESEARCH_SCHEMA,
      id,
      workspaceId,
      organizationId: workspace.organizationId,
      revision: 1,
      status: policy.maxOracleCalls === 0 ? "budget-exhausted" : "running",
      mode: "bounded-symbolic-research",
      seed,
      subjectIds,
      subjectVersions,
      policy,
      budget: { spentCalls: 0, reservedCalls: 0, abandonedReservations: 0, externalModelCalls: 0, actualModelCostUsd: 0 },
      questions: subjectIds.map((subjectId) => ({
        id: `${id}:survey:${subjectId}`,
        kind: "survey",
        subjectId,
        title: structuredClone(this.subjects.get(subjectId)!.title),
        status: "pending",
        createdAtRound: 0,
        priority: 100,
        attempts: 0,
        reasonCode: "initial-catalog-survey",
      })),
      episodes: [],
      lessons: [],
      tools: [],
      hypotheses: [],
      hypothesisEvaluations: [],
      lease: null,
      stopReason: policy.maxOracleCalls === 0 ? "oracle-call-cap" : null,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(authorization ? { authorization } : {}),
    };
    if (authorization) validateOperatorAuthorizationProvenance(authorization, station);
    const event = this.event(station, actor, "research.station-started", {
      configurationDigest: researchDigest(configuration(station)),
      ...(authorization ? { authorization: wireClone(authorization), executorPrincipalType: "system", executorAuthSource: "system" } : {}),
    });
    // Event IDs are globally unique in both lifecycle repositories. Reusing this nonce
    // in any other workspace/source rolls back the entire atomic station+event create.
    if (authorization) event.id = `research-operator-authorization:${authorization.nonceDigest}`;
    recheckAuthorization();
    try {
      await this.repository.createLifecycleRecord({ record: this.envelope(station), event });
      return wireClone(station);
    } catch (error) {
      if (!(error instanceof ExperimentConflictError)) throw error;
      const concurrent = await this.get(actor);
      if (!concurrent) throw error;
      return sameConfiguration(concurrent);
    }
  }

  private envelope(station: ResearchStation): LifecycleRecord {
    return {
      id: station.id,
      organizationId: station.organizationId,
      workspaceId: station.workspaceId,
      kind: RESEARCH_RECORD_KIND,
      status: station.status,
      revision: station.revision,
      data: { ...wireClone(station) },
      createdAt: station.createdAt,
      updatedAt: station.updatedAt,
    };
  }

  private event(station: ResearchStation, actor: ExperimentActor, type: string, payload: Record<string, unknown>): NewLifecycleEvent {
    return {
      id: `${station.id}:revision:${station.revision}`,
      organizationId: station.organizationId,
      workspaceId: station.workspaceId,
      aggregateId: station.id,
      aggregateKind: RESEARCH_RECORD_KIND,
      type,
      actorId: text(actor.id, "actor id"),
      correlationId: station.id,
      causationId: station.lease?.episodeId ?? station.episodes.at(-1)?.id,
      occurredAt: station.updatedAt,
      schemaVersion: LIFECYCLE_EVENT_SCHEMA_VERSION,
      payload: {
        schemaVersion: RESEARCH_SCHEMA,
        revision: station.revision,
        status: station.status,
        stateDigest: researchDigest(station),
        spentCalls: station.budget.spentCalls,
        reservedCalls: station.budget.reservedCalls,
        ...payload,
      },
    };
  }

  private async commit(record: LifecycleRecord, station: ResearchStation, actor: ExperimentActor, type: string,
    payload: Record<string, unknown> = {}): Promise<ResearchStation> {
    const next = wireClone({ ...station, revision: record.revision + 1, updatedAt: this.timestamp() });
    const envelope = this.envelope(next);
    this.validateStation(envelope, actor);
    await this.repository.commitLifecycleRecord({
      record: envelope,
      expectedRevision: record.revision,
      event: this.event(next, actor, type, payload),
    });
    return wireClone(next);
  }

  private refreshStatus(station: ResearchStation): void {
    if (station.status === "paused" || station.lease) return;
    const hypotheses = station.hypotheses ?? [];
    for (const question of station.questions) {
      if (question.status !== "pending") continue;
      const parent = question.kind === "induce" && question.hypothesisId
        ? hypotheses.find((hypothesis) => hypothesis.id === question.hypothesisId) : undefined;
      // One root per source/version makes this the entire lineage, including audited
      // ancestors and siblings. Keep stale questions visible, but never dispatch known-
      // illegal revisions after an intervening audit or an exhausted lineage/global cap.
      const lineage = parent ? hypotheses.filter((hypothesis) => hypothesis.subjectId === parent.subjectId &&
        hypothesis.subjectVersion === parent.subjectVersion) : [];
      const lineageIds = new Set(lineage.map((hypothesis) => hypothesis.id));
      const phase = hypothesisPhase(question);
      if (parent && (hypotheses.length >= MAX_HYPOTHESES || lineage.length >= MAX_LINEAGE_HYPOTHESES ||
        (station.hypothesisEvaluations ?? []).some((receipt) => receipt.phase === "audit" && lineageIds.has(receipt.hypothesisId)) ||
        station.episodes.some((episode) => episode.hypothesisEvaluationAttempt?.phase === "audit" &&
          lineageIds.has(episode.hypothesisEvaluationAttempt.hypothesisId)))) {
        question.status = "stopped";
        question.reasonCode = "hypothesis-lineage-closed";
      } else if (phase && question.hypothesisId && phaseConsumed(station, question.hypothesisId, phase)) {
        question.status = "stopped";
        question.reasonCode = "hypothesis-phase-already-consumed";
      } else if (question.attempts >= station.policy.maxAttemptsPerQuestion) {
        question.status = "stopped";
        question.reasonCode = "question-attempt-cap";
      }
    }
    if (station.budget.spentCalls >= station.policy.maxOracleCalls) {
      station.status = "budget-exhausted";
      station.stopReason = "oracle-call-cap";
    } else if (station.episodes.length >= station.policy.maxEpisodes) {
      station.status = "budget-exhausted";
      station.stopReason = "episode-cap";
    } else if (!station.questions.some((question) => question.status === "pending")) {
      station.status = "idle";
      station.stopReason = "agenda-empty";
    } else {
      station.status = "running";
      station.stopReason = null;
    }
  }

  private limitLesson(station: ResearchStation, lease: ResearchLease, code: string): ResearchLesson {
    const question = station.questions.find((item) => item.id === lease.questionId)!;
    return formatResearchLimitLesson(lease.episodeId, question.subjectId, code);
  }

  private hypothesisLessons(station: ResearchStation, subjectId: string, episodeId: string,
    hypothesis: ResearchHypothesis | undefined, evaluations: readonly HypothesisEvaluation[]): ResearchLesson[] {
    const subject = this.subjects.get(subjectId)!;
    const lessons = hypothesis ? [formatHypothesisLesson(episodeId, subject, hypothesis)] : [];
    for (const evaluation of evaluations) {
      const frozen = (station.hypotheses ?? []).find((item) => item.id === evaluation.hypothesisId);
      if (!frozen) throw new ExperimentValidationError("Hypothesis lesson lacks its frozen artifact");
      lessons.push(formatHypothesisLesson(episodeId, subject, frozen, evaluation));
    }
    return lessons;
  }

  private finish(station: ResearchStation, lease: ResearchLease, result: EpisodeResult,
    observations: Observation[], calls: number, reason: string, abandoned = false,
    evaluations: ToolEvaluation[] = [], hypothesisEvaluations: HypothesisEvaluation[] = []): void {
    const question = station.questions.find((item) => item.id === lease.questionId)!;
    question.status = result.verdict === "inconclusive"
      ? (hypothesisPhase(question) || question.attempts >= station.policy.maxAttemptsPerQuestion ? "stopped" : "pending")
      : "answered";
    if (result.verdict === "inconclusive") question.reasonCode = reason;
    let lessons = result.lessons;
    if (HYPOTHESIS_QUESTION_KINDS.has(question.kind)) {
      const limit = formatResearchLimitLesson(lease.episodeId, question.subjectId, reason);
      // Candidates may omit canonical facts; the kernel reconstructs them. Invalid result
      // fallbacks retain a fixed limit plus any already-issued factual F/T receipt lesson.
      lessons = [
        ...(result.lessons.some((lesson) => researchDigest(lesson) === researchDigest(limit)) ? [limit] : []),
        ...this.hypothesisLessons(station, question.subjectId, lease.episodeId, result.hypothesis, hypothesisEvaluations),
      ];
    }
    const episode: ResearchEpisode = {
      id: lease.episodeId,
      questionId: question.id,
      subjectId: question.subjectId,
      kind: question.kind,
      selectionReason: reason,
      verdict: result.verdict,
      observations: structuredClone(observations),
      evaluations: structuredClone(evaluations),
      ...(lease.hypothesisEvaluationAttempt ? {
        hypothesisEvaluationAttempt: structuredClone(lease.hypothesisEvaluationAttempt),
        hypothesisEvaluations: structuredClone(hypothesisEvaluations),
      } : {}),
      ...(result.hypothesis ? { hypothesis: structuredClone(result.hypothesis) } : {}),
      ...(result.tool ? { tool: structuredClone(result.tool) } : {}),
      lessonIds: lessons.map((lesson) => lesson.id),
      generatedQuestionIds: result.questions.map((item) => item.id),
      calls,
      startedAt: lease.acquiredAt,
      completedAt: this.timestamp(),
      inputStateDigest: lease.inputStateDigest,
      previousDigest: station.episodes.at(-1)?.digest ?? genesis(station),
      digest: "",
    };
    episode.digest = episodeDigest(episode);
    station.episodes.push(episode);
    station.lessons.push(...structuredClone(lessons));
    station.questions.push(...structuredClone(result.questions));
    if (result.tool) station.tools.push(structuredClone(result.tool));
    if (result.hypothesis || hypothesisEvaluations.length > 0) {
      station.hypotheses ??= [];
      station.hypothesisEvaluations ??= [];
      if (result.hypothesis) station.hypotheses.push(structuredClone(result.hypothesis));
      station.hypothesisEvaluations.push(...structuredClone(hypothesisEvaluations));
    }
    if (result.reusedTool) {
      const tool = station.tools.find((item) => item.id === result.reusedTool!.toolId)!;
      if (!tool.reusedOnSubjectIds.includes(result.reusedTool.subjectId)) {
        tool.reusedOnSubjectIds.push(result.reusedTool.subjectId);
      }
    }
    station.budget.spentCalls += calls;
    station.budget.reservedCalls = 0;
    if (abandoned) station.budget.abandonedReservations += 1;
    station.lease = null;
    if (this.autoInduction && !abandoned && station.status !== "paused") {
      const remaining = MAX_GENERATED_PER_EPISODE - episode.generatedQuestionIds.length;
      const derived = derivePostEpisodeInduction(structuredClone(station), [...this.subjects.values()], episode.id, remaining);
      for (const next of derived) {
        if (episode.generatedQuestionIds.length >= MAX_GENERATED_PER_EPISODE) break;
        if (station.questions.some((prior) => prior.id === next.id || (prior.kind === "induce" &&
          prior.subjectId === next.subjectId && prior.hypothesisId === next.hypothesisId &&
          ["pending", "running"].includes(prior.status)))) continue;
        if (next.kind !== "induce" || !station.subjectIds.includes(next.subjectId) || next.status !== "pending" ||
          next.attempts !== 0 || next.parentEpisodeId !== episode.id || next.createdAtRound !== station.episodes.length) {
          throw new ExperimentValidationError("Invalid kernel-derived induction question");
        }
        station.questions.push(structuredClone(next));
        episode.generatedQuestionIds.push(next.id);
      }
      episode.digest = episodeDigest(episode);
    }
    this.refreshStatus(station);
  }

  private async abandon(record: LifecycleRecord, station: ResearchStation, actor: ExperimentActor,
    reason: string, pause = false): Promise<ResearchStation> {
    const lease = station.lease!;
    if (pause) station.status = "paused";
    this.finish(station, lease, {
      verdict: "inconclusive", observations: [],
      lessons: [this.limitLesson(station, lease, reason)], questions: [],
    }, [], lease.reservedCalls, reason, true);
    if (pause) station.stopReason = "human-paused";
    return this.commit(record, station, actor, "research.reservation-abandoned", {
      episodeId: lease.episodeId, reason, chargedReservation: lease.reservedCalls,
    });
  }

  async pause(actor: ExperimentActor): Promise<ResearchStation> {
    writeScope(actor, true);
    const loaded = await this.load(actor);
    if (!loaded) throw new ExperimentNotFoundError("Research station was not started");
    const { record, station } = loaded;
    if (station.status === "paused") return station;
    if (station.lease) return this.abandon(record, station, actor, "human-paused-in-flight", true);
    station.status = "paused";
    station.stopReason = "human-paused";
    return this.commit(record, station, actor, "research.station-paused");
  }

  async resume(actor: ExperimentActor): Promise<ResearchStation> {
    writeScope(actor, true);
    const loaded = await this.load(actor);
    if (!loaded) throw new ExperimentNotFoundError("Research station was not started");
    const { record, station } = loaded;
    if (station.status !== "paused") return station;
    station.status = "running";
    this.refreshStatus(station);
    return this.commit(record, station, actor, "research.station-resumed");
  }

  private validateTool(tool: ResearchTool, station: ResearchStation, lease: ResearchLease): void {
    text(tool.id, "tool id");
    if (station.tools.some((item) => item.id === tool.id) || tool.createdByEpisodeId !== lease.episodeId ||
      !station.subjectIds.includes(tool.trainingSubjectId) || !["certified", "rejected"].includes(tool.status) ||
      !Array.isArray(tool.reusedOnSubjectIds) || tool.reusedOnSubjectIds.length !== 0) {
      throw new ExperimentValidationError("Invalid research tool lineage");
    }
    const program = tool.program;
    validateReducerProgram(program);
    if (tool.digest !== researchDigest(program) || tool.source !== renderReducerSource(program)) {
      throw new ExperimentValidationError("Invalid research tool program or rendered source");
    }
    text(tool.source, "tool source", 32_768);
    const evaluation = tool.evaluation;
    if (!evaluation || typeof evaluation.accepted !== "boolean" ||
      (tool.status === "certified") !== evaluation.accepted ||
      !count(evaluation.calls, station.policy.maxCallsPerEpisode) ||
      !count(evaluation.originalSize) || !count(evaluation.reducedSize) ||
      typeof evaluation.counterexamplePreserved !== "boolean" || typeof evaluation.controlRejected !== "boolean" ||
      (evaluation.accepted && (!evaluation.counterexamplePreserved || !evaluation.controlRejected ||
        evaluation.reducedSize >= evaluation.originalSize))) {
      throw new ExperimentValidationError("Invalid research tool evaluation");
    }
    text(evaluation.code, "tool evaluation code");
    assertResearchJson(evaluation.reduced);
    if (evaluation.reducedSize !== researchSize(evaluation.reduced)) {
      throw new ExperimentValidationError("Research tool size does not match its artifact");
    }
  }

  private validateResult(value: EpisodeResult, station: ResearchStation, lease: ResearchLease,
    observations: Observation[], evaluations: ToolEvaluation[], hypothesisEvaluations: HypothesisEvaluation[]): EpisodeResult {
    if (!value || !VERDICTS.has(value.verdict) || !Array.isArray(value.observations) ||
      !Array.isArray(value.lessons) || !Array.isArray(value.questions) ||
      value.observations.length > observations.length || value.lessons.length > MAX_GENERATED_PER_EPISODE ||
      value.questions.length > MAX_GENERATED_PER_EPISODE) {
      throw new ExperimentValidationError("Invalid research episode result");
    }
    const actual = new Map(observations.map((item) => [item.id, researchDigest(item)]));
    const reported = new Set<string>();
    for (const observation of value.observations) {
      if (!observation || reported.has(observation.id) || actual.get(observation.id) !== researchDigest(observation)) {
        throw new ExperimentValidationError("Research result contains unmetered or duplicate observations");
      }
      reported.add(observation.id);
    }
    if (!["inconclusive", "no-change", "hypothesis-proposed"].includes(value.verdict) && observations.length === 0) {
      throw new ExperimentValidationError("Research result lacks metered evidence");
    }
    const currentQuestion = station.questions.find((question) => question.id === lease.questionId)!;
    if (value.hypothesis !== undefined) {
      if (currentQuestion.kind !== "induce" || value.verdict !== "hypothesis-proposed" ||
        value.hypothesis?.subjectId !== currentQuestion.subjectId ||
        value.hypothesis.parentHypothesisId !== (currentQuestion.hypothesisId ?? null)) {
        throw new ExperimentValidationError("Research hypothesis proposal is outside the induction question");
      }
      const subject = this.subjects.get(currentQuestion.subjectId)!;
      assertProposal(value.hypothesis, subject, [...station.episodes.flatMap((episode) => episode.observations), ...observations], lease.episodeId);
      assertHypothesisLineage(value.hypothesis, station.hypotheses ?? [], station.hypothesisEvaluations ?? [], station.episodes);
    } else if (value.verdict === "hypothesis-proposed") {
      throw new ExperimentValidationError("Research proposal requires a frozen hypothesis artifact");
    }
    if (value.hypothesisEvaluation !== undefined) {
      const evaluation = value.hypothesisEvaluation;
      const receipt = hypothesisEvaluations.find((issued) => researchDigest(issued) === researchDigest(evaluation));
      if (!receipt || currentQuestion.hypothesisId !== receipt.hypothesisId ||
        currentQuestion.subjectId !== receipt.subjectId || hypothesisPhase(currentQuestion) !== receipt.phase ||
        value.verdict !== (receipt.status === "refuted" ? "hypothesis-refuted" : receipt.status === "survived-budget" ? "hypothesis-survived" : "inconclusive")) {
        throw new ExperimentValidationError("Research hypothesis verdict lacks an exact private evaluation receipt");
      }
    } else if (["hypothesis-refuted", "hypothesis-survived"].includes(value.verdict)) {
      throw new ExperimentValidationError("Research hypothesis success requires a kernel-issued receipt");
    }
    if (value.tool) {
      this.validateTool(value.tool, station, lease);
      const tool = value.tool;
      const receipt = evaluations.find((evaluation) =>
        evaluation.programDigest === tool.digest && evaluation.subjectId === tool.trainingSubjectId &&
        evaluation.subjectVersion === station.subjectVersions[tool.trainingSubjectId] &&
        researchDigest(evaluation) === researchDigest(tool.evaluation));
      if (!receipt || tool.trainingSubjectId !== currentQuestion.subjectId ||
        value.verdict !== (receipt.accepted ? "tool-certified" : "tool-rejected")) {
        throw new ExperimentValidationError("Research tool lacks an exact kernel-issued evaluation receipt");
      }
    } else if (value.verdict === "tool-certified") {
      throw new ExperimentValidationError("Research certification requires an evaluated artifact");
    }
    const observationIds = new Set([
      ...actual.keys(), ...station.episodes.flatMap((item) => item.observations.map((observation) => observation.id)),
    ]);
    const evidenceIds = new Set([
      lease.episodeId, ...station.episodes.map((item) => item.id), ...actual.keys(),
      ...station.episodes.flatMap((item) => item.observations.map((observation) => observation.id)),
      ...station.tools.map((tool) => tool.id), ...(value.tool ? [value.tool.id] : []),
      ...(station.hypotheses ?? []).map((hypothesis) => hypothesis.id), ...(value.hypothesis ? [value.hypothesis.id] : []),
    ]);
    const lessonIds = new Set(station.lessons.map((lesson) => lesson.id));
    for (const lesson of value.lessons) {
      text(lesson?.id, "lesson id");
      localized(lesson.statement, "lesson statement");
      text(lesson.applicability, "lesson applicability", 4_096);
      if (lessonIds.has(lesson.id) || lesson.episodeId !== lease.episodeId ||
        !station.subjectIds.includes(lesson.subjectId) ||
        !["counterexample", "confirmation", "refutation", "tool", "transfer", "limit", "hypothesis"].includes(lesson.kind) ||
        !["provisional", "confirmed", "refuted"].includes(lesson.status) ||
        !Array.isArray(lesson.evidenceIds) || lesson.evidenceIds.length === 0 || lesson.evidenceIds.length > 256 ||
        lesson.evidenceIds.some((id) => !evidenceIds.has(id)) ||
        (lesson.supersedes && !station.lessons.some((prior) => prior.id === lesson.supersedes && prior.subjectId === lesson.subjectId))) {
        throw new ExperimentValidationError("Invalid research lesson lineage");
      }
      lessonIds.add(lesson.id);
    }
    const questionIds = new Set(station.questions.map((question) => question.id));
    const hypotheses = [...(station.hypotheses ?? []), ...(value.hypothesis ? [value.hypothesis] : [])];
    for (const question of value.questions) {
      text(question?.id, "question id");
      localized(question.title, "question title");
      text(question.reasonCode, "question reason");
      if (questionIds.has(question.id) || !QUESTION_KINDS.has(question.kind) ||
        !station.subjectIds.includes(question.subjectId) || question.status !== "pending" || question.attempts !== 0 ||
        question.parentEpisodeId !== lease.episodeId || question.createdAtRound !== station.episodes.length + 1 ||
        !Number.isSafeInteger(question.priority) || Math.abs(question.priority) > 1_000_000 ||
        (question.observationId && !observationIds.has(question.observationId)) ||
        (hypothesisPhase(question) && !question.hypothesisId) ||
        (question.hypothesisId !== undefined && (!hypotheses.some((hypothesis) => hypothesis.id === question.hypothesisId &&
          hypothesis.subjectId === question.subjectId) || !["induce", "falsify", "audit-hypothesis"].includes(question.kind))) ||
        (question.toolId && !station.tools.some((tool) => tool.id === question.toolId && tool.status === "certified") &&
          !(value.tool?.id === question.toolId && value.tool.status === "certified"))) {
        throw new ExperimentValidationError("Invalid generated research question");
      }
      questionIds.add(question.id);
    }
    if (value.reusedTool) {
      const reuse = value.reusedTool;
      const tool = station.tools.find((candidate) => candidate.id === reuse.toolId && candidate.status === "certified");
      if (!tool || value.verdict !== "transferred" || !station.subjectIds.includes(reuse.subjectId) ||
        reuse.subjectId !== currentQuestion.subjectId || reuse.subjectId === tool.trainingSubjectId ||
        tool.digest !== researchDigest(tool.program) || tool.source !== renderReducerSource(tool.program) ||
        !evaluations.some((evaluation) => evaluation.accepted && evaluation.programDigest === tool.digest &&
          evaluation.subjectId === reuse.subjectId && evaluation.subjectVersion === station.subjectVersions[reuse.subjectId])) {
        throw new ExperimentValidationError("Research tool reuse lacks a fresh accepted kernel evaluation receipt");
      }
    } else if (value.verdict === "transferred") {
      throw new ExperimentValidationError("Research transfer requires an evaluated reuse link");
    }
    const evidenceErrors = verdictEvidenceErrors({
      kind: currentQuestion.kind, subjectId: currentQuestion.subjectId, verdict: value.verdict,
      episodeId: lease.episodeId, subject: this.subjects.get(currentQuestion.subjectId)!,
      question: currentQuestion, observations, evaluations,
      priorObservations: station.episodes.flatMap((episode) => episode.observations),
      tools: station.tools, tool: value.tool,
      hypotheses: station.hypotheses ?? [], hypothesis: value.hypothesis,
      hypothesisEvaluation: value.hypothesisEvaluation, hypothesisEvaluations,
      attempt: lease.hypothesisEvaluationAttempt, lessons: value.lessons,
    });
    if (evidenceErrors.length > 0) {
      throw new ExperimentValidationError("Research verdict is not supported by its measured evidence");
    }
    return structuredClone(value);
  }

  async step(actor: ExperimentActor, owner: string, signal?: AbortSignal): Promise<ResearchStation | null> {
    writeScope(actor);
    text(owner, "worker owner", 160);
    const loaded = await this.load(actor);
    if (!loaded || loaded.station.status !== "running" || signal?.aborted) return loaded?.station ?? null;
    const { record, station } = loaded;
    if (station.lease) {
      if (Date.parse(station.lease.expiresAt) > Date.parse(this.timestamp())) return station;
      return this.abandon(record, station, actor, "expired-lease");
    }
    this.refreshStatus(station);
    if (station.status !== "running") return this.commit(record, station, actor, "research.station-stopped");
    const question = selectResearchQuestion(station);
    if (!question) throw new ExperimentConflictError("Research agenda is unexpectedly empty");
    const acquiredAt = this.timestamp();
    const lease: ResearchLease = {
      token: `${station.id}:claim:${record.revision + 1}:${text(this.id(), "claim token", 120)}`,
      owner,
      questionId: question.id,
      episodeId: `${station.id}:episode:${record.revision + 1}`,
      reservedCalls: Math.min(station.policy.maxCallsPerEpisode, station.policy.maxOracleCalls - station.budget.spentCalls),
      acquiredAt,
      expiresAt: new Date(Date.parse(acquiredAt) + station.policy.leaseMs).toISOString(),
      inputStateDigest: researchDigest(station),
    };
    const phase = hypothesisPhase(question);
    if (phase) {
      const hypothesis = (station.hypotheses ?? []).find((item) => item.id === question.hypothesisId);
      if (!hypothesis || hypothesis.subjectId !== question.subjectId ||
        phaseConsumed(station, hypothesis.id, phase)) {
        throw new ExperimentConflictError("Research hypothesis phase is unavailable");
      }
      // Generate after the hypothesis was committed, not from runner input or a caller
      // selected seed. Claim+seed+slot+quota share one durable CAS before any callback.
      lease.hypothesisEvaluationAttempt = {
        hypothesisId: hypothesis.id, phase, seed: randomUUID(), allowance: hypothesisAllowance(phase, lease.reservedCalls),
        samplingProtocol: HYPOTHESIS_SAMPLING_PROTOCOL, evaluatorVersion: HYPOTHESIS_EVALUATOR_VERSION,
      };
    }
    question.status = "running";
    question.attempts += 1;
    station.lease = lease;
    station.budget.reservedCalls = lease.reservedCalls;
    const claimed = await this.commit(record, station, actor, "research.episode-claimed", {
      questionId: question.id, episodeId: lease.episodeId, reservation: lease.reservedCalls,
    });
    const meter = new ServiceOracleMeter(lease.reservedCalls, lease.episodeId, this.subjects,
      new Set(this.subjects.keys()), async () => {
        if (signal?.aborted) return false;
        const current = await this.repository.getLifecycleRecord(claimed.id);
        if (!current || current.workspaceId !== claimed.workspaceId || current.organizationId !== claimed.organizationId ||
          current.kind !== RESEARCH_RECORD_KIND || current.revision !== claimed.revision) return false;
        const data = current.data as unknown as ResearchStation;
        return !signal?.aborted && data.schemaVersion === RESEARCH_SCHEMA && data.status === "running" &&
          data.lease?.token === lease.token && Date.parse(this.timestamp()) < Date.parse(lease.expiresAt);
      }, { station: claimed, question: structuredClone(question) });
    // Expose only a frozen facade, never the mutable accounting implementation.
    const oracle: OracleMeter = Object.freeze({
      get used() { return meter.used; },
      get limit() { return meter.limit; },
      observe: meter.observeForRunner.bind(meter),
      evaluateReducer: meter.evaluateReducer.bind(meter),
      // Reject hidden third arguments (seed/input/pass) rather than silently accepting
      // a JavaScript caller's attempt to influence the private evaluation protocol.
      evaluateHypothesis: (...args: [string, HypothesisEvaluation["phase"]]) => meter.evaluateHypothesis(...args),
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    type Outcome = { result: EpisodeResult } | { failed: true } | { timedOut: true } | { cancelled: true };
    const execution = (async (): Promise<Outcome> => {
      try {
        if (signal?.aborted) return { cancelled: true };
        const result = structuredClone(await this.runner(structuredClone(claimed), structuredClone(question), lease.episodeId, oracle));
        meter.sealRunner();
        await meter.drain();
        return { result };
      } catch {
        meter.sealRunner();
        await meter.drain();
        return { failed: true };
      }
    })();
    let outcome: Outcome;
    try {
      outcome = await Promise.race([
        execution,
        new Promise<Outcome>((resolve) => {
          timer = setTimeout(() => resolve({ timedOut: true }), Math.max(0, Date.parse(lease.expiresAt) - Date.parse(this.timestamp())));
        }),
        new Promise<Outcome>((resolve) => {
          abortListener = () => resolve({ cancelled: true });
          signal?.addEventListener("abort", abortListener, { once: true });
          if (signal?.aborted) abortListener();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (abortListener) signal?.removeEventListener("abort", abortListener);
      meter.close();
    }
    const current = await this.load(actor);
    if (!current || current.station.status !== "running" || current.station.lease?.token !== lease.token) {
      throw new ExperimentConflictError("Research result belongs to a revoked or superseded lease");
    }
    if ("timedOut" in outcome || Date.parse(this.timestamp()) >= Date.parse(lease.expiresAt)) {
      return this.abandon(current.record, current.station, actor, "episode-timeout");
    }
    let result: EpisodeResult;
    let reason = question.reasonCode;
    const evaluations = meter.evaluations;
    const hypothesisEvaluations = meter.hypothesisEvaluations;
    try {
      if (!("result" in outcome) || meter.failure) throw new Error("Incomplete research execution");
      result = this.validateResult(outcome.result, current.station, lease, meter.observations, evaluations, hypothesisEvaluations);
    } catch {
      reason = "cancelled" in outcome ? "worker-interrupted"
        : meter.failure ?? ("failed" in outcome ? "runner-failed" : "invalid-runner-result");
      result = {
        verdict: "inconclusive", observations: meter.observations,
        lessons: [this.limitLesson(current.station, lease, reason)], questions: [],
      };
    }
    this.finish(current.station, lease, result, meter.observations, meter.used, reason, false, evaluations, hypothesisEvaluations);
    return this.commit(current.record, current.station, actor, "research.episode-completed", {
      episodeId: lease.episodeId, verdict: result.verdict, calls: meter.used, reason,
      evaluationRequests: meter.evaluationRequests, issuedEvaluations: evaluations.length,
      issuedHypothesisEvaluations: hypothesisEvaluations.length,
      episodeDigest: current.station.episodes.at(-1)!.digest,
    });
  }
}
