// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HypothesisEvaluation, Observation, ResearchEpisode, ResearchHypothesis, ResearchOverview, ResearchStation } from "./contracts";
import { RESEARCH_SCHEMA } from "./contracts";
import { researchSubject } from "./catalog";
import { buildTrainingSnapshot, proposeHypothesis } from "./hypotheses";
import { hypothesisReceiptErrors } from "./hypothesis-evidence";
import { predict, type Hypothesis } from "./induction";
import { researchDigest } from "./integrity";
import { parseHumanOverview } from "./human-contracts";
import { projectHumanOverview } from "./human-overview";

const target = researchSubject("sum-grouping-hypothesis");
const time = "2026-01-01T00:00:00.000Z";
function empty(): ResearchOverview {
  return { schemaVersion: RESEARCH_SCHEMA, generatedAt: "2026-01-02T00:00:00.000Z", backend: "memory", station: null,
    subjects: [{ id: target.id, version: target.version, title: target.title, claim: target.claim, origin: target.origin, interpretation: target.interpretation, family: target.family }],
    boundary: { productionWrites: false, arbitraryCodeExecution: false, liveModelCalls: false, knownSeedsAreNotDiscoveries: true, evaluatorIsolation: "separate-module-not-hostile-process-isolation" } };
}
function blank(): ResearchStation {
  return { schemaVersion: RESEARCH_SCHEMA, id: "reference-station", workspaceId: "reference-workspace", organizationId: "reference-org", revision: 1,
    status: "running", mode: "bounded-symbolic-research", seed: "reference-only", subjectIds: [target.id], subjectVersions: { [target.id]: target.version },
    policy: { maxEpisodes: 20, maxOracleCalls: 1000, maxCallsPerEpisode: 96, maxAttemptsPerQuestion: 2, leaseMs: 1000 },
    budget: { spentCalls: 0, reservedCalls: 0, abandonedReservations: 0, externalModelCalls: 0, actualModelCostUsd: 0 },
    questions: [], episodes: [], hypotheses: [], hypothesisEvaluations: [], lessons: [], tools: [], lease: null, stopReason: null, createdAt: time, updatedAt: time };
}
// Explicit reference fake, not a production result or independent issuance authority.
// Plain arithmetic constructs fixture observations. Projection must never call it.
function observation(id: string, input: number[], partition: Observation["partition"]): Observation {
  const original = input.reduce((a, b) => a + b, 0);
  const reordered = [...input].sort((a, b) => Math.abs(a) - Math.abs(b)).reduce((a, b) => a + b, 0);
  return { id, subjectId: target.id, subjectVersion: target.version, input, inputDigest: researchDigest(input), partition,
    measurement: { holds: original === reordered, code: "finite-precision-hypothesis-not-a-production-bug", facts: { original, reordered, difference: Math.abs(original - reordered) } } };
}
function addEpisode(station: ResearchStation, kind: ResearchEpisode["kind"], observations: Observation[], hypothesisId?: string): ResearchEpisode {
  const id = `reference-episode-${station.episodes.length}`;
  const questionId = `${id}-question`;
  station.questions.push({ id: questionId, kind, subjectId: target.id, title: { en: "Reference", zh: "测试" }, status: "answered", attempts: 1,
    createdAtRound: station.episodes.length, priority: 1, reasonCode: "reference", ...(hypothesisId ? { hypothesisId } : {}) });
  const episode: ResearchEpisode = { id, questionId, subjectId: target.id, kind, selectionReason: "reference", verdict: "no-change", observations,
    lessonIds: [], generatedQuestionIds: [], calls: observations.length, startedAt: time, completedAt: time, inputStateDigest: "reference", previousDigest: "reference", digest: "reference" };
  station.episodes.push(episode); station.budget.spentCalls += episode.calls;
  return episode;
}
function propose(station: ResearchStation, program: Hypothesis, observations: Observation[], parent?: ResearchHypothesis): ResearchHypothesis {
  const episode = addEpisode(station, "induce", observations, parent?.id);
  const proposal = proposeHypothesis(target, buildTrainingSnapshot(station.episodes.flatMap((item) => item.observations), target), program, episode.id, parent?.id ?? null);
  episode.hypothesis = proposal; episode.verdict = "hypothesis-proposed";
  station.hypotheses!.push(proposal);
  return proposal;
}
function receipt(station: ResearchStation, h: ResearchHypothesis, phase: HypothesisEvaluation["phase"], inputs: number[][]): void {
  const prior = station.episodes.flatMap((item) => item.observations);
  const observations = inputs.map((input, index) => observation(`ref-${station.episodes.length}-${index}`, input, phase === "audit" ? "hypothesis-audit" : "hypothesis-falsification"));
  const scoped = observations.filter((item) => predict(h.program, item.input) !== null);
  const conflicts = scoped.filter((item) => predict(h.program, item.input) !== item.measurement.holds);
  const status = conflicts.length ? "refuted" : observations.length >= 8 && scoped.length >= 4 && observations.length - scoped.length >= 4 ? "survived-budget" : "inconclusive";
  const issued: HypothesisEvaluation = { evaluatorVersion: "conditional-falsifier-v1", hypothesisId: h.id, programDigest: h.programDigest,
    trainingDigest: h.trainingDigest, subjectId: h.subjectId, subjectVersion: h.subjectVersion, phase, seed: `reference-seed-${station.episodes.length}`, status,
    reason: "reference-envelope-not-live-issuance", observationIds: observations.map((item) => item.id), counterexampleIds: conflicts.map((item) => item.id),
    inScope: scoped.length, outOfScope: observations.length - scoped.length, attemptedCandidates: observations.length, samplingProtocol: "bounded-perturbation-v2",
    sampleKinds: observations.map(() => "exploration"), excludedInputDigests: [...new Set(prior.map((item) => item.inputDigest))].sort(),
    calls: observations.length, allowance: phase === "audit" ? 32 : 24 };
  const episode = addEpisode(station, phase === "audit" ? "audit-hypothesis" : "falsify", observations, h.id);
  episode.hypothesisEvaluationAttempt = { hypothesisId: h.id, phase, seed: issued.seed, allowance: issued.allowance,
    samplingProtocol: issued.samplingProtocol, evaluatorVersion: issued.evaluatorVersion };
  episode.hypothesisEvaluations = [issued];
  episode.verdict = status === "refuted" ? "hypothesis-refuted" : status === "survived-budget" ? "hypothesis-survived" : "inconclusive";
  expect(hypothesisReceiptErrors(issued, h, observations, prior, episode.hypothesisEvaluationAttempt)).toEqual([]);
  station.hypothesisEvaluations!.push(issued);
}
function fixture(): ResearchOverview {
  const station = blank();
  const failing = (magnitude: number) => [magnitude, -magnitude, 1e-8, 2e-8, 3e-8];
  const training = [1, 2, 3, 4].map((i) => observation(`training-yes-${i}`, [i, -i], "hypothesis-training"))
    .concat([0, 1, 2, 3].map((i) => observation(`training-no-${i}`, failing(100_000_000 + i * 1000), "hypothesis-training")));
  const root = propose(station, { schemaVersion: "nexus.conditional-hypothesis.v1", expectedHolds: true,
    when: { op: "or", left: { op: "gt", feature: "a:min:", threshold: -50_000_002 }, right: { op: "lte", feature: "a:length:", threshold: 3.5 } } }, training);
  receipt(station, root, "falsification", [failing(10_000_000)]);
  const child = propose(station, { schemaVersion: "nexus.conditional-hypothesis.v1", expectedHolds: true,
    when: { op: "or", left: { op: "lte", feature: "a:length:", threshold: 3.5 }, right: { op: "lte", feature: "a:nonIntegerCount:", threshold: 1.5 } } }, [], root);
  receipt(station, child, "falsification", Array.from({ length: 24 }, (_, i) => i % 2 ? failing(200_000_000 + i * 100) : [100 + i, -100 - i]));
  receipt(station, child, "audit", Array.from({ length: 32 }, (_, i) => i % 2 ? failing(300_000_000 + i * 100) : [200 + i, -200 - i]));
  return { ...empty(), station };
}

afterEach(() => vi.restoreAllMocks());
describe("read-only human overview from complete reference-bound facts", () => {
  it("projects an actual training/proposal/F/counterexample/revision/F/T reference chain without remeasurement", () => {
    const overview = fixture();
    const before = structuredClone(overview);
    const measure = vi.spyOn(target, "measure"); const generate = vi.spyOn(target, "generate");
    const result = projectHumanOverview(overview);
    expect(result.storyAvailability).toEqual({ status: "available", reason: null });
    expect(result.story?.initial.status).toBe("refuted");
    expect(result.story?.revised.status).toBe("survived-budget");
    expect(result.story?.revised.evaluations.map((item) => [item.calls, item.inScope, item.outOfScope])).toEqual([[24, 12, 12], [32, 16, 16]]);
    expect(result.story?.counterexample).toEqual({ observationId: "ref-1-0", input: [10_000_000, -10_000_000, 1e-8, 2e-8, 3e-8],
      original: overview.station!.episodes[1].observations[0].measurement.facts.original, reordered: overview.station!.episodes[1].observations[0].measurement.facts.reordered });
    expect(result.story?.initial.rule.condition).toEqual({ op: "or", left: { op: "gt", feature: "min", threshold: -50_000_002 }, right: { op: "lte", feature: "length", threshold: 3.5 } });
    expect(result.study?.lastActivityAt).toBe(time); expect(result.readAt).not.toBe(time);
    expect(parseHumanOverview(result)).toEqual(result);
    expect(measure).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled(); expect(overview).toEqual(before);
  });
  it("never elevates lesson text or confirmed status into a fact", () => {
    const overview = fixture(); const baseline = projectHumanOverview(overview);
    overview.station!.lessons.push({ id: "untrusted", subjectId: target.id, kind: "hypothesis", statement: { en: "PROVEN ALL INPUTS", zh: "宇宙真理" },
      evidenceIds: [], episodeId: "none", applicability: "ANYWHERE", status: "confirmed" });
    const result = projectHumanOverview(overview);
    expect(result.story).toEqual(baseline.story); expect(JSON.stringify(result)).not.toMatch(/PROVEN|宇宙|ANYWHERE/);
    overview.station!.hypotheses = []; overview.station!.hypothesisEvaluations = [];
    expect(projectHumanOverview(overview).story).toBeNull();
  });
  it("retains a historical refutation after later healthy observations", () => {
    const overview = fixture();
    addEpisode(overview.station!, "survey", [observation("later-healthy", [12, -12], "discovery")]).verdict = "confirmed";
    expect(projectHumanOverview(overview).story?.initial.status).toBe("refuted");
  });
  it("never lets a later survived receipt overwrite an earlier factual refutation", () => {
    const overview = fixture(); const station = overview.station!;
    station.episodes.pop(); station.hypothesisEvaluations!.pop(); // Reference timeline: the child has F, no T yet.
    const root = station.hypotheses![0];
    receipt(station, root, "audit", Array.from({ length: 32 }, (_, i) => i % 2
      ? [400_000_000 + i * 100, -400_000_000 - i * 100, 1e-8, 2e-8, 3e-8] : [500 + i, -500 - i]));
    // Remove the old question identity superseded by this explicit fixture timeline.
    station.questions.splice(4, 1);
    const result = projectHumanOverview(overview);
    expect(result.story?.initial.evaluations.map((item) => item.status)).toEqual(["refuted", "survived-budget"]);
    expect(result.story?.initial.status).toBe("refuted");
  });
  it.each([
    ["creation ref", "missing-reference", (s: ResearchStation) => { s.hypotheses![0].createdByEpisodeId = "missing"; }],
    ["receipt ref", "missing-reference", (s: ResearchStation) => { s.hypothesisEvaluations = []; }],
    ["training", "invalid-binding", (s: ResearchStation) => { s.hypotheses![0].trainingDigest = "corrupt"; }],
    ["program", "invalid-binding", (s: ResearchStation) => { s.hypotheses![0].programDigest = "corrupt"; }],
    ["parent", "invalid-binding", (s: ResearchStation) => { s.hypotheses![1].parentHypothesisId = "missing"; s.questions[2].hypothesisId = "missing"; }],
    ["sample ref", "invalid-receipt", (s: ResearchStation) => { s.hypothesisEvaluations![0].observationIds = ["missing"]; }],
    ["evaluator", "invalid-receipt", (s: ResearchStation) => { s.hypothesisEvaluations![0].evaluatorVersion = "unknown" as "conditional-falsifier-v1"; }],
    ["phase binding", "invalid-receipt", (s: ResearchStation) => { s.episodes[1].hypothesisEvaluationAttempt!.seed = "other"; }],
    ["counts", "invalid-receipt", (s: ResearchStation) => { s.hypothesisEvaluations![0].inScope++; }],
    ["counterexample", "invalid-receipt", (s: ResearchStation) => { s.hypothesisEvaluations![0].counterexampleIds = []; }],
    ["measurement code", "unreliable-measurement", (s: ResearchStation) => { s.episodes[1].observations[0].measurement.code = "unknown"; }],
    ["measurement facts", "unreliable-measurement", (s: ResearchStation) => { delete s.episodes[1].observations[0].measurement.facts.original; }],
    ["measurement mismatch", "unreliable-measurement", (s: ResearchStation) => { s.episodes[1].observations[0].measurement.facts.difference = -1; }],
    ["schema version", "unsupported-version", (s: ResearchStation) => { s.schemaVersion = "unknown" as typeof RESEARCH_SCHEMA; }],
    ["version", "unsupported-version", (s: ResearchStation) => { s.subjectVersions[target.id] = "unknown-v2"; }],
    ["unknown predicate", "unsupported-predicate", (s: ResearchStation) => { s.hypotheses![0].program.when = { op: "gt", feature: "n:/0", threshold: 0 }; }],
  ] as const)("fails closed for %s", (_name, reason, change) => {
    const overview = fixture(); change(overview.station!);
    const result = projectHumanOverview(overview);
    expect(result.story).toBeNull(); expect(result.storyAvailability).toEqual({ status: "unavailable", reason });
  });
  it("does not translate unknown/generic source, predicate or version as the known floating story", () => {
    const overview = fixture(); overview.subjects[0].origin = "repository-observation";
    expect(projectHumanOverview(overview).storyAvailability.reason).toBe("unsupported-source");
    overview.station!.hypotheses!.forEach((item) => { item.subjectId = "generic-numeric-test"; });
    expect(projectHumanOverview(overview).storyAvailability.reason).toBe("unsupported-source");
  });
  it("distinguishes null study, empty study and pending evidence without illustrative fallback", () => {
    expect(projectHumanOverview(empty())).toMatchObject({ study: null, story: null, storyAvailability: { status: "pending", reason: "no-study" } });
    const overview = { ...empty(), station: blank() };
    expect(projectHumanOverview(overview)).toMatchObject({ study: { steps: 0, measurements: 0, lastActivityAt: null }, story: null, storyAvailability: { reason: "no-hypotheses" } });
    const partial = fixture(); partial.station!.hypotheses!.splice(1); partial.station!.hypothesisEvaluations!.splice(1); partial.station!.episodes.splice(2);
    expect(projectHumanOverview(partial).storyAvailability.reason).toBe("no-revision");
  });
  it.each([
    ["budget-exhausted", "episode-cap", "episode-cap"], ["budget-exhausted", "oracle-call-cap", "oracle-budget"],
    ["paused", "human-paused", "human-paused"], ["idle", "agenda-empty", "agenda-empty"], ["running", null, null], ["unexpected", "new-stop", "unknown"],
  ] as const)("preserves %s and %s without equating measurement limits with money", (status, reason, expected) => {
    const overview = fixture(); overview.station!.status = status as ResearchStation["status"]; overview.station!.stopReason = reason;
    overview.station!.updatedAt = overview.generatedAt;
    const result = projectHumanOverview(overview);
    expect(result.study).toMatchObject({ state: status === "unexpected" ? "unknown" : status, stopReason: expected, modelCalls: 0, modelCostUsd: 0, lastActivityAt: time });
    expect(parseHumanOverview(result)).not.toBeNull();
  });
  it("projects real ledger values and exact release evidence, not production constants or zero defaults", () => {
    const overview = fixture(); overview.station!.budget.externalModelCalls = 3 as 0; overview.station!.budget.actualModelCostUsd = 0.125 as 0;
    overview.station!.budget.reservedCalls = 9; overview.runtime = { releaseRevision: "a".repeat(40), evidence: "deployment-env", lastEpisodeAt: "ignored" };
    const result = projectHumanOverview(overview);
    expect(result.study).toMatchObject({ steps: 5, measurements: 65, reserved: 9, measurementLimit: 1000, modelCalls: 3, modelCostUsd: 0.125 });
    expect(result.source).toEqual({ backend: "memory", releaseRevision: "a".repeat(40), releaseEvidence: "deployment-env", stationRevision: 1 });
    overview.station!.budget.spentCalls = NaN;
    expect(() => projectHumanOverview(overview)).toThrow();
  });
});

describe("browser-safe human contract reference parser", () => {
  it.each([null, {}, { schemaVersion: "unknown" }, { study: null }, { error: "unavailable" }])("rejects malformed transport payload %j", (value) => {
    expect(parseHumanOverview(value)).toBeNull();
  });
  it("accepts a real zero measurement cap with zero spend/reservations and preserves its stop reason", () => {
    const station = blank(); station.policy.maxOracleCalls = 0; station.status = "budget-exhausted"; station.stopReason = "oracle-call-cap";
    const result = projectHumanOverview({ ...empty(), station });
    expect(parseHumanOverview(result)).toEqual(result);
    expect(result.study).toMatchObject({ state: "budget-exhausted", stopReason: "oracle-budget", measurements: 0, reserved: 0, measurementLimit: 0 });
  });
  it("accepts an explicit authorized null study and rejects lossy missing fields", () => {
    const result = projectHumanOverview(empty()); expect(parseHumanOverview(result)).toEqual(result);
    const missing = structuredClone(result) as unknown as Record<string, unknown>; delete missing.source;
    expect(parseHumanOverview(missing)).toBeNull();
  });
  it.each([
    (v: ReturnType<typeof projectHumanOverview>) => { v.study!.measurements = NaN; },
    (v: ReturnType<typeof projectHumanOverview>) => { v.study!.modelCostUsd = -1; },
    (v: ReturnType<typeof projectHumanOverview>) => { v.study!.stepLimit = 0; },
    (v: ReturnType<typeof projectHumanOverview>) => { v.study!.measurementLimit = v.study!.measurements - 1; },
    (v: ReturnType<typeof projectHumanOverview>) => { v.study!.reserved = v.study!.measurementLimit - v.study!.measurements + 1; },
    (v: ReturnType<typeof projectHumanOverview>) => { v.study!.state = "transporterror" as "running"; },
    (v: ReturnType<typeof projectHumanOverview>) => { v.story!.counterexample.input = [Infinity, 2]; },
    (v: ReturnType<typeof projectHumanOverview>) => { v.story!.counterexample.observationId = "unknown"; },
    (v: ReturnType<typeof projectHumanOverview>) => { v.story!.revised.evaluations[0].inScope = 24; },
    (v: ReturnType<typeof projectHumanOverview>) => { v.story!.initial.status = "confirmed" as "refuted"; },
    (v: ReturnType<typeof projectHumanOverview>) => { v.story!.initial.rule.condition = { op: "gt", feature: "nonsense" as "min", threshold: 0 }; },
    (v: ReturnType<typeof projectHumanOverview>) => { v.storyAvailability.status = "pending"; },
  ])("rejects inconsistent human payload %#", (change) => {
    const result = projectHumanOverview(fixture()); change(result); expect(parseHumanOverview(result)).toBeNull();
  });
});
