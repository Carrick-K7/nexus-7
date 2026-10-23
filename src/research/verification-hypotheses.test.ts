// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { InMemoryExperimentRepository } from "@/experiments/memory-repository";
import type { ExperimentActor } from "@/experiments/types";
import type {
  EpisodeResult, HypothesisEvaluation, Observation, ResearchEpisode, ResearchHypothesis,
  ResearchQuestion, ResearchStation, ResearchSubject, ResearchLesson,
} from "./contracts";
import type { Hypothesis } from "./induction";
import { buildTrainingSnapshot, HYPOTHESIS_EVALUATOR_VERSION, HYPOTHESIS_PHASE_ALLOWANCE, HYPOTHESIS_SAMPLING_PROTOCOL, proposeHypothesis } from "./hypotheses";
import { hypothesisReceiptErrors } from "./hypothesis-evidence";
import { formatHypothesisLesson, formatResearchLimitLesson } from "./hypothesis-lessons";
import { canonical, researchDigest } from "./integrity";
import { ResearchService } from "./service";
import { verifyResearchStation } from "./verification";

// Explicitly synthetic, tiny in-memory instruments. F/T receipts below are issued by
// the real private service kernel, not fabricated candidate statistics or pass flags.
const training = [-5, -4, -3, -2, -1, 1, 2, 3, 4];
const human: ExperimentActor = { id: "verifier-authorizer", role: "operator", principalType: "human",
  workspaceId: "hypothesis-verification", organizationId: "hypothesis-verification-org" };
const worker: ExperimentActor = { ...human, id: "verifier-worker", principalType: "system" };
const program = (threshold = 0): Hypothesis => ({ schemaVersion: "nexus.conditional-hypothesis.v1",
  when: { op: "gt", feature: "n:", threshold }, expectedHolds: true });
const negativeProgram = (threshold = 0): Hypothesis => ({ ...program(), when: { op: "lte", feature: "n:", threshold }, expectedHolds: false });
const empty = (verdict: EpisodeResult["verdict"]): EpisodeResult => ({ verdict, observations: [], lessons: [], questions: [] });
function numeric(refutes = false, id = refutes ? "refutable-numeric" : "numeric"): ResearchSubject {
  return { id, version: `${id}.v1`, family: "synthetic-numeric", origin: "generated-challenge", interpretation: "exploratory-hypothesis",
    title: { en: "Numeric fixture", zh: "数值测试" }, claim: { en: "Synthetic relation only", zh: "仅合成关系" },
    generate: (seed) => (Number(seed.split(":").at(-1)) % 2 ? 1 : -1) * (10 + Number.parseInt(researchDigest(seed).slice(0, 6), 16) % 10_001 / 1_000),
    valid: (input) => typeof input === "number" && Number.isFinite(input) && Math.abs(input) <= 64,
    measure: async (input) => ({ holds: typeof input === "number" && input > 0 && (!refutes || Number.isInteger(input) && input <= 4),
      code: "synthetic-numeric", facts: { input } }),
  };
}
function next(station: ResearchStation, question: ResearchQuestion, episodeId: string,
  kind: ResearchQuestion["kind"], hypothesisId?: string): ResearchQuestion {
  return { id: `${episodeId}:next:${kind}`, kind, subjectId: question.subjectId, title: question.title,
    status: "pending", createdAtRound: station.episodes.length + 1, parentEpisodeId: episodeId,
    priority: 200, attempts: 0, reasonCode: "synthetic-followup", ...(hypothesisId ? { hypothesisId } : {}) };
}
/** Pick the largest still-pure interval from ALL current labels, rather than relying
 * on the sampler to reveal progressively closer floating-point endpoints in v1 order. */
function intervalProgram(snapshot: ReturnType<typeof buildTrainingSnapshot>): Hypothesis {
  const rows = [...snapshot.examples].sort((a, b) => (a.input as number) - (b.input as number));
  let start = 0, length = 0, bestStart = 0, bestLength = 0;
  for (const [index, row] of rows.entries()) {
    if (!row.holds) { length = 0; continue; }
    if (!length) start = index;
    length++;
    if (length > bestLength) { bestStart = start; bestLength = length; }
  }
  if (bestLength < 4 || bestStart === 0) throw new Error("Synthetic interval lacks contrast/support");
  const midpoint = (low: number, high: number) => {
    const result = low / 2 + high / 2;
    return result >= low && result < high ? result : low;
  };
  const lower = midpoint(rows[bestStart - 1].input as number, rows[bestStart].input as number);
  const end = bestStart + bestLength;
  return end === rows.length ? program(lower) : { ...program(), when: { op: "and",
    left: { op: "gt", feature: "n:", threshold: lower },
    right: { op: "lte", feature: "n:", threshold: midpoint(rows[end - 1].input as number, rows[end].input as number) } } };
}

type Mode = "complete" | "attempt-only" | "inconclusive-result";
async function fixture(options: { target?: ResearchSubject; phases?: HypothesisEvaluation["phase"][]; mode?: Mode; ladder?: boolean } = {}) {
  const target = options.target ?? numeric();
  const phases = options.phases ?? ["falsification"];
  const repository = new InMemoryExperimentRepository();
  const timestamp = "2026-10-20T12:00:00.000Z";
  await repository.initialize();
  await repository.ensureWorkspace({ id: human.workspaceId!, name: "Verifier tests", createdAt: timestamp });
  await repository.ensureOrganization({ id: human.organizationId!, name: "Verifier tests", createdAt: timestamp, updatedAt: timestamp });
  await repository.ensureGovernedWorkspace({ organizationId: human.organizationId!, workspaceId: human.workspaceId!, createdAt: timestamp, updatedAt: timestamp });
  let sequence = 0;
  const service = new ResearchService(repository, [target], async (station, question, episodeId, meter) => {
    if (question.kind === "survey") {
      const observations: Observation[] = [];
      for (const input of options.ladder ? [-4, -3, -2, -1, ...Array.from({ length: 64 }, (_, index) => index + 1)] : training) {
        observations.push(await meter.observe(target, input, "discovery"));
      }
      return { ...empty("counterexample"), observations, questions: [next(station, question, episodeId, "induce")] };
    }
    if (question.kind === "induce") {
      const snapshot = buildTrainingSnapshot(station.episodes.flatMap((episode) => episode.observations), target);
      const hypothesis = proposeHypothesis(target, snapshot, options.ladder ? intervalProgram(snapshot) : program(), episodeId, question.hypothesisId);
      return { ...empty("hypothesis-proposed"), hypothesis,
        questions: [next(station, question, episodeId, phases[0] === "audit" ? "audit-hypothesis" : "falsify", hypothesis.id)] };
    }
    if (options.mode === "attempt-only") return empty("inconclusive");
    const phase = question.kind === "falsify" ? "falsification" : "audit";
    const receipt = await meter.evaluateHypothesis!(question.hypothesisId!, phase);
    if (options.mode === "inconclusive-result") return empty("inconclusive");
    const followup = options.ladder ? "induce" : phases[phases.indexOf(phase) + 1] === "audit" ? "audit-hypothesis" : null;
    return { ...empty(receipt.status === "refuted" ? "hypothesis-refuted" : receipt.status === "survived-budget" ? "hypothesis-survived" : "inconclusive"),
      hypothesisEvaluation: receipt, questions: followup ? [next(station, question, episodeId, followup, question.hypothesisId)] : [] };
  }, { now: () => new Date(timestamp), id: () => `fixture-${++sequence}` });
  await service.start(human, { seed: "offline-hypothesis-fixture", subjectIds: [target.id],
    policy: { maxOracleCalls: 2_048, maxCallsPerEpisode: options.ladder ? 96 : 32, maxEpisodes: 64, maxAttemptsPerQuestion: 2, leaseMs: 1_000 } });
  for (let index = 0; index < (options.ladder ? 9 : 2 + phases.length); index++) await service.step(worker, "fixture-worker");
  return { station: (await service.get(human))!, subjects: [target], target };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function copy(f: Fixture): Fixture { return { ...f, subjects: [...f.subjects], station: structuredClone(f.station) }; }
function rehash(station: ResearchStation): void {
  let previous = researchDigest({ schemaVersion: station.schemaVersion, id: station.id, seed: station.seed,
    subjectIds: station.subjectIds, subjectVersions: station.subjectVersions, policy: station.policy });
  for (const episode of station.episodes) {
    episode.previousDigest = previous;
    const { digest: _digest, ...content } = episode;
    void _digest;
    episode.digest = researchDigest(content);
    previous = episode.digest;
  }
  station.budget.spentCalls = station.episodes.reduce((calls, episode) => calls + episode.calls, 0);
}
function setLessons(station: ResearchStation, episode: ResearchEpisode, lessons: ResearchLesson[]): void {
  station.lessons = station.lessons.filter((lesson) => lesson.episodeId !== episode.id);
  station.lessons.push(...structuredClone(lessons));
  episode.lessonIds = lessons.map((lesson) => lesson.id);
}
function fixtureSubject(station: ResearchStation, subjectId: string): ResearchSubject {
  return { ...numeric(false, subjectId), version: station.subjectVersions[subjectId] };
}
function proposalOnly(f: Fixture): Fixture {
  const result = copy(f);
  result.station.episodes = result.station.episodes.slice(0, 2);
  result.station.questions = result.station.questions.slice(0, 3);
  result.station.questions[2].status = "pending";
  result.station.hypothesisEvaluations = [];
  result.station.lessons = result.station.lessons.filter((lesson) => result.station.episodes.some((episode) => episode.id === lesson.episodeId));
  rehash(result.station);
  return result;
}
function replaceHypothesis(station: ResearchStation, hypothesis: ResearchHypothesis): void {
  const original = station.hypotheses![0].id;
  station.hypotheses = [structuredClone(hypothesis)];
  station.episodes[1].hypothesis = structuredClone(hypothesis);
  setLessons(station, station.episodes[1], [formatHypothesisLesson(station.episodes[1].id, fixtureSubject(station, hypothesis.subjectId), hypothesis)]);
  for (const question of station.questions) if (question.hypothesisId === original) question.hypothesisId = hypothesis.id;
}
function editReceipt(station: ResearchStation, change: (receipt: HypothesisEvaluation, episode: ResearchEpisode) => void): void {
  const episode = station.episodes.find((item) => item.hypothesisEvaluations?.length)!;
  change(episode.hypothesisEvaluations![0], episode);
  const receipt = episode.hypothesisEvaluations![0];
  const hypothesis = station.hypotheses!.find((item) => item.id === receipt.hypothesisId);
  if (hypothesis) setLessons(station, episode, [formatHypothesisLesson(episode.id, fixtureSubject(station, episode.subjectId), hypothesis, receipt)]);
  station.hypothesisEvaluations = structuredClone(station.episodes.flatMap((item) => item.hypothesisEvaluations ?? []));
  rehash(station);
}
function append(station: ResearchStation, content: Pick<ResearchEpisode, "kind" | "verdict"> & Partial<ResearchEpisode>, hypothesisId?: string): ResearchEpisode {
  const id = content.id ?? `synthetic-append-${station.episodes.length}`;
  const previous = station.episodes.at(-1)!;
  const question: ResearchQuestion = { ...station.questions[0], id: `${id}:question`, kind: content.kind,
    subjectId: content.subjectId ?? station.subjectIds[0], status: "answered", attempts: 1,
    parentEpisodeId: previous.id, createdAtRound: station.episodes.length, ...(hypothesisId ? { hypothesisId } : {}) };
  station.questions.push(question);
  previous.generatedQuestionIds.push(question.id);
  const episode: ResearchEpisode = { id, questionId: question.id, subjectId: question.subjectId,
    selectionReason: "synthetic-mutation", observations: [], evaluations: [], lessonIds: [], generatedQuestionIds: [], calls: 0,
    startedAt: previous.completedAt, completedAt: previous.completedAt, inputStateDigest: researchDigest(station), previousDigest: "", digest: "", ...content };
  station.episodes.push(episode);
  if (episode.hypothesis) station.hypotheses!.push(structuredClone(episode.hypothesis));
  station.hypothesisEvaluations!.push(...structuredClone(episode.hypothesisEvaluations ?? []));
  const subject = fixtureSubject(station, episode.subjectId);
  const lessons = episode.hypothesis ? [formatHypothesisLesson(episode.id, subject, episode.hypothesis)] : [];
  for (const receipt of episode.hypothesisEvaluations ?? []) {
    const hypothesis = station.hypotheses!.find((item) => item.id === receipt.hypothesisId)!;
    lessons.push(formatHypothesisLesson(episode.id, subject, hypothesis, receipt));
  }
  if (episode.verdict === "inconclusive") lessons.push(formatResearchLimitLesson(episode.id, episode.subjectId, episode.selectionReason));
  setLessons(station, episode, lessons);
  rehash(station);
  return episode;
}
async function verify(f: Fixture, requireHypotheses = false) {
  return verifyResearchStation(f.station, f.subjects, { minimumEpisodes: 3, requireHypotheses });
}

let survived: Fixture, refuted: Fixture, audited: Fixture;
beforeAll(async () => {
  survived = await fixture();
  refuted = await fixture({ target: numeric(true) });
  audited = await fixture({ phases: ["falsification", "audit"] });
});

describe("independent conditional-hypothesis offline verification", () => {
  it("reconstructs a zero-oracle proposal and truly reexecutes the private F receipt without weakening old gates", async () => {
    expect(survived.station.episodes[1]).toMatchObject({ kind: "induce", calls: 0, verdict: "hypothesis-proposed" });
    const result = await verify(survived, true);
    expect(result.gates).toMatchObject({ hypothesisEvidenceIntegrity: true, rawMeasurementsReexecuted: true, outcomeSemantics: true,
      observationWindow: true, conditionalHypothesesTested: true, problemDiversity: false, toolArtifactsValid: false, crossFamilyToolReuse: false });
    expect(result.counters).toMatchObject({ episodes: 3, distinctQuestions: 3, newlyProposedHypotheses: 1,
      hypothesisRefuted: 0, hypothesisSurvivedBudget: 1, hypothesisAudited: 0, initialHypotheses: 1, naturalNewDefects: 0 });
    expect(result.counters.reexecutedObservations).toBeGreaterThan(result.counters.checkedObservationReceipts);
    expect(result.passed).toBe(false); // Conditional evidence never substitutes for the old baseline.
    expect((await verifyResearchStation(survived.station, survived.subjects)).gates.observationWindow).toBe(false);
  });

  it("counts a genuine refutation as completed science without requiring a pretty positive outcome", async () => {
    const result = await verify(refuted, true);
    expect(result.gates).toMatchObject({ hypothesisEvidenceIntegrity: true, outcomeSemantics: true, conditionalHypothesesTested: true });
    expect(result.counters).toMatchObject({ hypothesisRefuted: 1, hypothesisSurvivedBudget: 0, naturalNewDefects: 0 });
  });

  it("replays an audit against all prior F data and reports bounded survival, not independent roots", async () => {
    const result = await verify(audited, true);
    expect(result.gates.hypothesisEvidenceIntegrity).toBe(true);
    expect(result.counters.hypothesisAudited).toBe(1);
    const [f, t] = audited.station.hypothesisEvaluations!;
    expect(t.seed).not.toBe(f.seed);
    expect(t.excludedInputDigests.length).toBe(f.excludedInputDigests.length + f.calls);
  });

  it("reads legacy missing arrays as empty without mutating old v1 objects or hashes", async () => {
    const f = copy(survived);
    f.station.episodes = f.station.episodes.slice(0, 1);
    f.station.questions = f.station.questions.slice(0, 2);
    delete f.station.hypotheses;
    delete f.station.hypothesisEvaluations;
    f.station.lessons = [];
    const episode = f.station.episodes[0];
    setLessons(f.station, episode, [{ id: "legacy-observation-lesson", episodeId: episode.id, subjectId: f.target.id,
      kind: "counterexample", status: "confirmed", evidenceIds: [episode.observations[0].id], applicability: "old local v1",
      statement: { en: "An observed synthetic counterexample was recorded.", zh: "已记录一个合成反例。" } }]);
    rehash(f.station);
    const before = canonical(f.station);
    const result = await verify(f);
    expect(result.gates).toMatchObject({ hypothesisEvidenceIntegrity: true, outcomeSemantics: true });
    expect(result.counters.newlyProposedHypotheses).toBe(0);
    expect(canonical(f.station)).toBe(before);
    expect(Object.hasOwn(f.station, "hypotheses")).toBe(false);
    expect((await verify(f, true)).gates.conditionalHypothesesTested).toBe(false);
  });

  it("does not inflate the ten-operation window with renamed empty induction retries", async () => {
    const f = proposalOnly(survived);
    f.station.hypotheses = [];
    f.station.questions = f.station.questions.slice(0, 2);
    delete f.station.episodes[1].hypothesis;
    f.station.episodes[1].verdict = "no-change";
    f.station.episodes[1].generatedQuestionIds = [];
    setLessons(f.station, f.station.episodes[1], []);
    for (let index = 0; index < 10; index++) append(f.station, { kind: "induce", verdict: "no-change" });
    const result = await verify(f);
    expect(result.gates).toMatchObject({ outcomeSemantics: true, hypothesisEvidenceIntegrity: true, observationWindow: false });
    expect(result.counters).toMatchObject({ episodes: 1, distinctQuestions: 1, newlyProposedHypotheses: 0 });
  });

  it("rejects a valid-looking training subset even after rebuilding its artifact and every trace hash", async () => {
    const f = proposalOnly(survived);
    const snapshot = buildTrainingSnapshot(f.station.episodes[0].observations.filter((observation) => observation.input !== -5), f.target);
    const hypothesis = proposeHypothesis(f.target, snapshot, program(), f.station.episodes[1].id);
    replaceHypothesis(f.station, hypothesis);
    rehash(f.station);
    const result = await verify(f);
    expect(result.gates).toMatchObject({ traceIntegrity: true, rawMeasurementsReexecuted: true, hypothesisEvidenceIntegrity: false });
    expect(result.counters.newlyProposedHypotheses).toBe(0);
  });

  it.each(["prior", "current"] as const)("rejects hiding an actually measured %s training contradiction", async (where) => {
    const f = proposalOnly(refuted);
    const episode = f.station.episodes[where === "prior" ? 0 : 1];
    episode.observations.push({ id: "omitted-contradiction", subjectId: f.target.id, subjectVersion: f.target.version,
      input: 0.5, inputDigest: researchDigest(0.5), measurement: await f.target.measure(0.5), partition: "hypothesis-training" });
    episode.calls++;
    rehash(f.station);
    const result = await verify(f);
    expect(result.gates).toMatchObject({ traceIntegrity: true, rawMeasurementsReexecuted: true, hypothesisEvidenceIntegrity: false });
  });

  it.each(["H", "schema", "pass-flag", "createdBy", "training", "kind"] as const)("rejects a consistently retained forged hypothesis %s", async (mutation) => {
    const f = proposalOnly(survived);
    const hypothesis = structuredClone(f.station.hypotheses![0]);
    if (mutation === "H") hypothesis.program.expectedHolds = false;
    if (mutation === "schema") (hypothesis.program as { schemaVersion: string }).schemaVersion = "nexus.conditional-hypothesis.v999";
    if (mutation === "pass-flag") Object.assign(hypothesis.program, { passed: true });
    if (mutation === "createdBy") hypothesis.createdByEpisodeId = "different-episode";
    if (mutation === "training") hypothesis.trainingObservationIds.pop();
    if (mutation === "kind") {
      (f.station.episodes[1] as { kind: string }).kind = "derived-proof";
      (f.station.questions[1] as { kind: string }).kind = "derived-proof";
    }
    hypothesis.programDigest = researchDigest(hypothesis.program);
    replaceHypothesis(f.station, hypothesis);
    rehash(f.station);
    const result = await verify(f);
    expect(result.gates.traceIntegrity).toBe(true);
    expect(result.gates.hypothesisEvidenceIntegrity).toBe(false);
    expect(result.passed).toBe(false);
  });

  const receiptMutations: Array<[string, (receipt: HypothesisEvaluation) => void]> = [
    ["status", (r) => { r.status = "refuted"; }],
    ["scope", (r) => { r.inScope++; r.outOfScope--; }],
    ["counterexample", (r) => { r.counterexampleIds = [r.observationIds[0]]; }],
    ["seed", (r) => { r.seed = "forged-seed"; }],
    ["phase", (r) => { r.phase = "audit"; }],
    ["exclusions", (r) => { r.excludedInputDigests.pop(); }],
    ["candidates", (r) => { r.attemptedCandidates--; }],
    ["protocol", (r) => { (r as { samplingProtocol: string }).samplingProtocol = "candidate-chosen-v1"; }],
    ["targeted-majority", (r) => { r.sampleKinds[0] = "boundary"; }],
    ["sample-kind", (r) => { (r.sampleKinds as string[])[0] = "self-certified"; }],
    ["allowance", (r) => { r.allowance--; }],
    ["calls", (r) => { r.calls--; }],
    ["reason", (r) => { r.reason = "proved-globally"; }],
    ["version", (r) => { r.evaluatorVersion = "other" as HypothesisEvaluation["evaluatorVersion"]; }],
  ];
  it.each(receiptMutations)("rejects altered receipt %s even when aggregate and episode hashes agree", async (_name, change) => {
    const f = copy(survived);
    editReceipt(f.station, change);
    const result = await verify(f);
    expect(result.gates).toMatchObject({ traceIntegrity: true, rawMeasurementsReexecuted: true, hypothesisEvidenceIntegrity: false });
    expect(result.passed).toBe(false);
  });

  it.each(["seed-and-attempt", "sample-order"] as const)("independently rejects %s even when shared raw-derived receipt checks pass", async (mutation) => {
    const f = copy(survived);
    editReceipt(f.station, (receipt, episode) => {
      if (mutation === "seed-and-attempt") episode.hypothesisEvaluationAttempt!.seed = receipt.seed = "changed-frozen-seed";
      else {
        const [a, b] = receipt.sampleKinds.flatMap((kind, index) => kind === "exploration" ? [index] : []).slice(0, 2);
        [receipt.observationIds[a], receipt.observationIds[b]] = [receipt.observationIds[b], receipt.observationIds[a]];
        [episode.observations[a], episode.observations[b]] = [episode.observations[b], episode.observations[a]];
      }
    });
    const episode = f.station.episodes[2];
    expect(hypothesisReceiptErrors(episode.hypothesisEvaluations![0], f.station.hypotheses![0], episode.observations,
      f.station.episodes.slice(0, 2).flatMap((item) => item.observations), episode.hypothesisEvaluationAttempt)).toEqual([]);
    const result = await verify(f);
    expect(result.gates).toMatchObject({ traceIntegrity: true, rawMeasurementsReexecuted: true, outcomeSemantics: true, hypothesisEvidenceIntegrity: false });
  });

  it("rejects replacing a sampled input with a real old training sample, not just fake outcomes", async () => {
    const f = copy(survived);
    editReceipt(f.station, (_receipt, episode) => {
      const observation = episode.observations[0];
      const old = f.station.episodes[0].observations.find((item) => item.measurement.holds === observation.measurement.holds)!;
      Object.assign(observation, { input: old.input, inputDigest: old.inputDigest, measurement: old.measurement });
    });
    expect((await verify(f)).gates).toMatchObject({ rawMeasurementsReexecuted: true, hypothesisEvidenceIntegrity: false });
  });

  it("reexecutes raw outcomes rather than accepting fabricated derived success", async () => {
    const f = copy(refuted);
    editReceipt(f.station, (receipt, episode) => {
      for (const id of receipt.counterexampleIds) episode.observations.find((item) => item.id === id)!.measurement.holds = true;
      receipt.counterexampleIds = [];
      receipt.status = "survived-budget";
      receipt.inScope = 4;
      receipt.outOfScope = 4;
      episode.verdict = "hypothesis-survived";
    });
    const result = await verify(f);
    expect(result.gates).toMatchObject({ traceIntegrity: true, rawMeasurementsReexecuted: false, hypothesisEvidenceIntegrity: false });
    expect(result.counters.hypothesisSurvivedBudget).toBe(0);
  });

  it.each(["falsification", "audit"] as const)("consumes an attempt-only %s slot without granting success or a redraw", async (phase) => {
    const f = await fixture({ phases: [phase], mode: "attempt-only" });
    const original = await verify(f, true);
    expect(original.gates).toMatchObject({ hypothesisEvidenceIntegrity: true, outcomeSemantics: true, conditionalHypothesesTested: false });
    expect(original.counters).toMatchObject({ episodes: 2, hypothesisAudited: 0, hypothesisSurvivedBudget: 0, hypothesisRefuted: 0 });
    append(f.station, { kind: phase === "audit" ? "audit-hypothesis" : "falsify", verdict: "inconclusive", hypothesisEvaluations: [],
      hypothesisEvaluationAttempt: { ...f.station.episodes[2].hypothesisEvaluationAttempt!, seed: "new-draw-after-empty-attempt" } }, f.station.hypotheses![0].id);
    expect((await verify(f)).gates.hypothesisEvidenceIntegrity).toBe(false);
  });

  it("keeps real private receipts on an inconclusive episode without counting completion", async () => {
    const f = await fixture({ mode: "inconclusive-result" });
    expect(f.station.hypothesisEvaluations![0].status).toBe("survived-budget");
    const result = await verify(f, true);
    expect(result.gates).toMatchObject({ hypothesisEvidenceIntegrity: true, outcomeSemantics: true, conditionalHypothesesTested: false });
    expect(result.counters).toMatchObject({ episodes: 2, hypothesisSurvivedBudget: 0 });
  });

  it("does not promote a genuine zero-call inconclusive private receipt into completed testing", async () => {
    const target = numeric();
    target.generate = () => "outside-numeric-domain";
    const f = await fixture({ target });
    expect(f.station.hypothesisEvaluations![0]).toMatchObject({ status: "inconclusive", calls: 0 });
    expect((await verify(f, true)).gates).toMatchObject({ hypothesisEvidenceIntegrity: true, outcomeSemantics: true, conditionalHypothesesTested: false });
  });

  it.each(["missing-attempt", "smaller-frozen-allowance", "attempt-only-success", "attempt-sampler", "attempt-evaluator"] as const)("rejects %s", async (mutation) => {
    const f = copy(survived);
    const episode = f.station.episodes[2];
    if (mutation === "missing-attempt") delete episode.hypothesisEvaluationAttempt;
    else {
      episode.observations = [];
      episode.calls = 0;
      episode.hypothesisEvaluations = [];
      f.station.hypothesisEvaluations = [];
      if (mutation === "smaller-frozen-allowance") episode.hypothesisEvaluationAttempt!.allowance = 1;
      if (mutation === "attempt-sampler") (episode.hypothesisEvaluationAttempt as { samplingProtocol: string }).samplingProtocol = "unknown-sampler";
      if (mutation === "attempt-evaluator") episode.hypothesisEvaluationAttempt!.evaluatorVersion = "unknown-evaluator";
      if (mutation !== "attempt-only-success") episode.verdict = "inconclusive";
    }
    rehash(f.station);
    expect((await verify(f)).gates.hypothesisEvidenceIntegrity).toBe(false);
  });

  it("locks the entire revision lineage after an audit claim even with no audit receipt", async () => {
    const f = copy(refuted);
    const parent = f.station.hypotheses![0];
    append(f.station, { kind: "audit-hypothesis", verdict: "inconclusive", hypothesisEvaluations: [],
      hypothesisEvaluationAttempt: { hypothesisId: parent.id, phase: "audit", seed: "claimed-but-abandoned", allowance: 32,
        samplingProtocol: HYPOTHESIS_SAMPLING_PROTOCOL, evaluatorVersion: HYPOTHESIS_EVALUATOR_VERSION } }, parent.id);
    expect((await verify(f)).gates.hypothesisEvidenceIntegrity).toBe(true);
    const id = "revision-after-abandoned-audit";
    const snapshot = buildTrainingSnapshot(f.station.episodes.flatMap((episode) => episode.observations), f.target);
    const values = snapshot.examples.map((example) => example.input as number);
    const threshold = Math.max(...values.filter((value) => value <= 0)) / 2 + Math.min(...values.filter((value) => value > 0)) / 2;
    const hypothesis = proposeHypothesis(f.target, snapshot, negativeProgram(threshold), id, parent.id);
    append(f.station, { id, kind: "induce", verdict: "hypothesis-proposed", hypothesis }, parent.id);
    expect((await verify(f)).gates.hypothesisEvidenceIntegrity).toBe(false);
  });

  it.each(["new-root", "unrefuted-parent"] as const)("rejects lineage laundering by %s", async (mutation) => {
    const f = proposalOnly(survived);
    const parent = f.station.hypotheses![0];
    const id = "illegal-revision";
    const hypothesis = proposeHypothesis(f.target, buildTrainingSnapshot(f.station.episodes.flatMap((episode) => episode.observations), f.target),
      negativeProgram(), id, mutation === "new-root" ? null : parent.id);
    append(f.station, { id, kind: "induce", verdict: "hypothesis-proposed", hypothesis }, mutation === "new-root" ? undefined : parent.id);
    expect((await verify(f)).gates.hypothesisEvidenceIntegrity).toBe(false);
  });

  it.each(["retained-program", "missing-artifact", "missing-receipt", "extra-receipt", "creation-receipt"] as const)("rejects aggregate/episode misalignment: %s", async (mutation) => {
    const f = copy(survived);
    if (mutation === "retained-program") f.station.hypotheses![0].program.expectedHolds = false;
    if (mutation === "missing-artifact") f.station.hypotheses = [];
    if (mutation === "missing-receipt") f.station.hypothesisEvaluations = [];
    if (mutation === "extra-receipt") f.station.hypothesisEvaluations!.push(structuredClone(f.station.hypothesisEvaluations![0]));
    if (mutation === "creation-receipt") f.station.episodes[1].hypothesisEvaluations = structuredClone(f.station.hypothesisEvaluations);
    rehash(f.station);
    expect((await verify(f)).gates.hypothesisEvidenceIntegrity).toBe(false);
  });

  it("does not authorize generated questions with a future, not-yet-persisted hypothesis", async () => {
    const f = copy(survived);
    const question = f.station.questions[2];
    question.parentEpisodeId = f.station.episodes[0].id;
    f.station.episodes[0].generatedQuestionIds.push(question.id);
    f.station.episodes[1].generatedQuestionIds = [];
    rehash(f.station);
    expect((await verify(f)).gates).toMatchObject({ traceIntegrity: true, hypothesisEvidenceIntegrity: false });
  });

  it("charges hypothesis kernel replay to the same hard verifier cap as raw measurements", async () => {
    const cap = survived.station.episodes.flatMap((episode) => episode.observations).length;
    const result = await verifyResearchStation(survived.station, survived.subjects, { maxReexecutions: cap });
    expect(result.counters.reexecutedObservations).toBe(cap);
    expect(result.gates.hypothesisEvidenceIntegrity).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("accepts three real F-driven revisions but rejects a fifth lineage node", async () => {
    const target = numeric(false, "revision-ladder");
    target.generate = (seed) => 4 * Number(seed.split(":").at(-1)) + 0.5;
    target.valid = (input) => typeof input === "number" && Number.isFinite(input) && Math.abs(input) <= 128;
    target.measure = async (input) => ({ holds: typeof input === "number" && Number.isInteger(input) && input > 0 && input <= 64,
      code: "integer-interval-ladder", facts: { input } });
    const f = await fixture({ target, ladder: true });
    expect(f.station.hypotheses).toHaveLength(4);
    expect(f.station.hypothesisEvaluations!.every((receipt) => receipt.status === "refuted")).toBe(true);
    expect((await verify(f)).gates.hypothesisEvidenceIntegrity).toBe(true);
    const snapshot = buildTrainingSnapshot(f.station.episodes.flatMap((episode) => episode.observations), target);
    const parent = f.station.hypotheses!.at(-1)!;
    const id = "fifth-node";
    const hypothesis = proposeHypothesis(target, snapshot, intervalProgram(snapshot), id, parent.id);
    append(f.station, { id, kind: "induce", verdict: "hypothesis-proposed", hypothesis }, parent.id);
    expect((await verify(f)).gates.hypothesisEvidenceIntegrity).toBe(false);
  });

  it("enforces sixteen total proposals and counts actual distinct program/version pairs", async () => {
    const f = proposalOnly(survived);
    for (let index = 1; index <= 16; index++) {
      const target = numeric(false, `additional-${index}`);
      f.subjects.push(target);
      f.station.subjectIds.push(target.id);
      f.station.subjectVersions[target.id] = target.version;
      const observations: Observation[] = [];
      for (const input of training) observations.push({ id: `${target.id}:${input}`, subjectId: target.id, subjectVersion: target.version,
        input, inputDigest: researchDigest(input), measurement: await target.measure(input), partition: "hypothesis-training" });
      const id = `proposal-${index}`;
      const hypothesis = proposeHypothesis(target, buildTrainingSnapshot(observations, target), program(), id);
      append(f.station, { id, kind: "induce", subjectId: target.id, verdict: "hypothesis-proposed", observations, calls: observations.length, hypothesis });
      if (index === 15) {
        const result = await verify(f);
        expect(result.gates.hypothesisEvidenceIntegrity).toBe(true);
        expect(result.counters.newlyProposedHypotheses).toBe(16);
      }
    }
    const result = await verify(f);
    expect(result.gates.hypothesisEvidenceIntegrity).toBe(false);
    expect(result.counters.newlyProposedHypotheses).toBe(16);
  });

  it("deduplicates new proposals by actual programDigest and subjectVersion, not renamed IDs", async () => {
    const f = proposalOnly(survived);
    const target = { ...f.target, id: "second-name-same-version" };
    f.subjects.push(target);
    f.station.subjectIds.push(target.id);
    f.station.subjectVersions[target.id] = target.version;
    const observations = f.station.episodes[0].observations.map((observation) => ({ ...observation,
      id: `renamed:${observation.id}`, subjectId: target.id }));
    const id = "renamed-proposal";
    const hypothesis = proposeHypothesis(target, buildTrainingSnapshot(observations, target), program(), id);
    append(f.station, { id, kind: "induce", verdict: "hypothesis-proposed", subjectId: target.id,
      observations, calls: observations.length, hypothesis });
    const result = await verify(f);
    expect(result.gates.hypothesisEvidenceIntegrity).toBe(true);
    expect(result.counters.newlyProposedHypotheses).toBe(1);
  });

  it("reads a retired protocol without silently rerunning it as the current sampler", async () => {
    const f = copy(survived);
    expect(f.station.hypothesisEvaluations![0].samplingProtocol).toBe(HYPOTHESIS_SAMPLING_PROTOCOL);
    const retired = HYPOTHESIS_SAMPLING_PROTOCOL.replace(/\d+$/, (version) => String(Number(version) - 1));
    editReceipt(f.station, (receipt, episode) => {
      (receipt as { samplingProtocol: string }).samplingProtocol = retired;
      delete episode.hypothesisEvaluationAttempt!.samplingProtocol;
      delete episode.hypothesisEvaluationAttempt!.evaluatorVersion;
    });
    const before = canonical(f.station);
    const result = await verify(f);
    expect(result.gates).toMatchObject({ traceIntegrity: true, rawMeasurementsReexecuted: true, hypothesisEvidenceIntegrity: false });
    expect(result.counters.reexecutedObservations).toBe(f.station.episodes.flatMap((episode) => episode.observations).length);
    expect(canonical(f.station)).toBe(before);
  });

  it("derives a provisional proposal lesson before any F/T rather than allowing a self-certified law", async () => {
    const f = proposalOnly(survived);
    const episode = f.station.episodes[1];
    expect(f.station.hypothesisEvaluations).toEqual([]);
    expect(f.station.lessons.filter((lesson) => lesson.episodeId === episode.id)).toEqual([
      formatHypothesisLesson(episode.id, f.target, episode.hypothesis!),
    ]);
    expect((await verify(f)).gates).toMatchObject({ outcomeSemantics: true, hypothesisEvidenceIntegrity: true });
  });

  it.each(["confirmed-law", "provisional-law", "other-kind", "status", "zh-text", "evidence", "applicability", "missing", "extra-other-kind"] as const)(
    "rejects an untested true proposal's lesson laundering: %s, even with consistent trace hashes", async (mutation) => {
      const f = proposalOnly(survived);
      const episode = f.station.episodes[1];
      const lesson = f.station.lessons.find((item) => item.episodeId === episode.id)!;
      if (mutation === "confirmed-law" || mutation === "provisional-law" || mutation === "other-kind") {
        lesson.statement = { en: "Confirmed universal law, valid on every input.", zh: "已证实适用于所有输入的普适定律。" };
        if (mutation !== "provisional-law") lesson.status = "confirmed";
        if (mutation === "other-kind") lesson.kind = "confirmation";
      }
      if (mutation === "status") lesson.status = "refuted";
      if (mutation === "zh-text") lesson.statement.zh = "已全局证明。";
      if (mutation === "evidence") lesson.evidenceIds = [f.station.episodes[0].observations[0].id];
      if (mutation === "applicability") lesson.applicability = "all subjects and all inputs";
      if (mutation === "missing") setLessons(f.station, episode, []);
      if (mutation === "extra-other-kind") {
        const extra: ResearchLesson = { ...structuredClone(lesson), id: "disguised-free-claim", kind: "confirmation", status: "confirmed",
          statement: { en: "A universal law has been proved.", zh: "已证明普适定律。" } };
        f.station.lessons.push(extra);
        episode.lessonIds.push(extra.id);
      }
      rehash(f.station);
      const result = await verify(f);
      expect(result.gates).toMatchObject({ traceIntegrity: true, rawMeasurementsReexecuted: true, outcomeSemantics: false, hypothesisEvidenceIntegrity: false });
      expect(result.counters.newlyProposedHypotheses).toBe(0);
    });

  it.each(["hypothesis-id", "creation-episode", "supersedes-hypothesis", "supersedes-creation"] as const)(
    "rejects confirmed lesson laundering through a later healthy survey's %s reference", async (reference) => {
      const f = proposalOnly(survived);
      const hypothesis = f.station.hypotheses![0];
      const observation: Observation = { id: "ordinary-healthy-survey-observation", subjectId: f.target.id, subjectVersion: f.target.version,
        input: 5, inputDigest: researchDigest(5), measurement: await f.target.measure(5), partition: "discovery" };
      const episode = append(f.station, { kind: "survey", verdict: "no-change", observations: [observation], calls: 1 });
      const lesson: ResearchLesson = { id: "ordinary-confirmed-survey-lesson", kind: "confirmation", status: "confirmed",
        subjectId: f.target.id, episodeId: episode.id, evidenceIds: [observation.id], applicability: "this measured synthetic input only",
        statement: { en: "The observed input satisfied this local instrument.", zh: "该观测输入满足本地仪器关系。" } };
      setLessons(f.station, episode, [lesson]);
      rehash(f.station);
      // Even after a hypothesis exists, an ordinary observation-only legacy lesson is
      // not a hypothesis certificate and remains compatible with the old verifier lane.
      expect((await verify(f)).gates).toMatchObject({ traceIntegrity: true, rawMeasurementsReexecuted: true,
        outcomeSemantics: true, hypothesisEvidenceIntegrity: true });
      const retained = f.station.lessons.find((item) => item.id === lesson.id)!;
      retained.statement = { en: "This confirms the hypothesis as a universal law.", zh: "这证实了该命题是普适定律。" };
      if (reference === "hypothesis-id") retained.evidenceIds = [hypothesis.id];
      if (reference === "creation-episode") retained.evidenceIds = [hypothesis.createdByEpisodeId];
      if (reference === "supersedes-hypothesis") retained.supersedes = hypothesis.id;
      if (reference === "supersedes-creation") retained.supersedes = hypothesis.createdByEpisodeId;
      rehash(f.station);
      expect((await verify(f)).gates).toMatchObject({ traceIntegrity: true, rawMeasurementsReexecuted: true,
        outcomeSemantics: false, hypothesisEvidenceIntegrity: false });
    });

  it.each(["falsify", "audit-hypothesis"] as const)("does not promote bounded %s receipts through altered lesson text/status/evidence", async (kind) => {
    const f = copy(kind === "falsify" ? survived : audited);
    const episode = f.station.episodes.find((item) => item.kind === kind)!;
    const receipt = episode.hypothesisEvaluations![0];
    const lesson = f.station.lessons.find((item) => item.episodeId === episode.id)!;
    expect(lesson).toEqual(formatHypothesisLesson(episode.id, f.target, f.station.hypotheses![0], receipt));
    expect(lesson.status).toBe("provisional");
    lesson.status = "confirmed";
    lesson.statement.en = "Universal correctness has been proved.";
    lesson.evidenceIds = [f.station.hypotheses![0].id];
    rehash(f.station);
    expect((await verify(f)).gates).toMatchObject({ traceIntegrity: true, rawMeasurementsReexecuted: true,
      outcomeSemantics: false, hypothesisEvidenceIntegrity: false });
  });

  it("retains fixed receipt and limit lessons on inconclusive work without authorizing success", async () => {
    const f = await fixture({ mode: "inconclusive-result" });
    const episode = f.station.episodes[2];
    const receiptLesson = formatHypothesisLesson(episode.id, f.target, f.station.hypotheses![0], episode.hypothesisEvaluations![0]);
    const limitLesson = formatResearchLimitLesson(episode.id, episode.subjectId, episode.selectionReason);
    setLessons(f.station, episode, [receiptLesson, limitLesson]);
    rehash(f.station);
    const result = await verify(f, true);
    expect(result.gates).toMatchObject({ outcomeSemantics: true, hypothesisEvidenceIntegrity: true, conditionalHypothesesTested: false });
    expect(result.counters.hypothesisSurvivedBudget).toBe(0);
    f.station.lessons.find((lesson) => lesson.id === limitLesson.id)!.statement.en = "The limit proves success.";
    rehash(f.station);
    expect((await verify(f)).gates).toMatchObject({ outcomeSemantics: false, hypothesisEvidenceIntegrity: false });
  });

  it("normalizes JSON inputs before raw and private-kernel replay without rewriting the recorded object", async () => {
    const target = numeric(false, "canonical-zero");
    target.generate = () => -0.25;
    target.measure = async (input) => {
      if (Object.is(input, -0)) throw new Error("Instrument received non-wire negative zero");
      return { holds: typeof input === "number" && input > 0, code: "canonical-zero", facts: { input, zero: -0 } };
    };
    const f = await fixture({ target });
    const observation = f.station.episodes[2].observations.find((item) => item.input === 0)!;
    expect(observation).toBeDefined();
    expect(Object.is(observation.measurement.facts.zero, -0)).toBe(false);
    observation.input = -0;
    rehash(f.station); // Canonical digest is unchanged; only the local JS representation differs.
    const result = await verify(f);
    expect(result.gates).toMatchObject({ rawMeasurementsReexecuted: true, outcomeSemantics: true, hypothesisEvidenceIntegrity: true });
    expect(Object.is(observation.input, -0)).toBe(true);
  });

  it("validates the live claim too, without counting an uncompleted lease as a receipt", async () => {
    const f = proposalOnly(survived);
    const question = f.station.questions[2];
    const hypothesis = f.station.hypotheses![0];
    f.station.status = "running";
    question.status = "running";
    f.station.lease = { questionId: question.id, episodeId: "live-claim", token: "claim-token", owner: "worker", reservedCalls: 32,
      acquiredAt: "2026-10-20T12:00:00.000Z", expiresAt: "2026-10-20T12:01:00.000Z", inputStateDigest: researchDigest(f.station),
      hypothesisEvaluationAttempt: { hypothesisId: hypothesis.id, phase: "falsification", seed: "live-seed", allowance: HYPOTHESIS_PHASE_ALLOWANCE.falsification,
        samplingProtocol: HYPOTHESIS_SAMPLING_PROTOCOL, evaluatorVersion: HYPOTHESIS_EVALUATOR_VERSION } };
    f.station.budget.reservedCalls = 32;
    expect((await verify(f, true)).gates).toMatchObject({ hypothesisEvidenceIntegrity: true, conditionalHypothesesTested: false });
    f.station.lease.hypothesisEvaluationAttempt!.allowance = 1;
    expect((await verify(f)).gates.hypothesisEvidenceIntegrity).toBe(false);
  });
});
