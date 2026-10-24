import { RESEARCH_SCHEMA, type HypothesisEvaluation, type Observation, type ResearchHypothesis, type ResearchOverview, type ResearchStation } from "./contracts";
import { researchSubject } from "./catalog";
import { buildTrainingSnapshot, proposeHypothesis } from "./hypotheses";
import { hypothesisReceiptErrors } from "./hypothesis-evidence";
import { validateHypothesis, type Atom } from "./induction";
import { canonical, researchDigest } from "./integrity";
import {
  HUMAN_OVERVIEW_SCHEMA, type HumanAtom, type HumanEvaluation, type HumanFeature,
  type HumanHypothesis, type HumanOverview, type HumanRule, type HumanStory, type HumanStoryReason,
} from "./human-contracts";

// This is a semantic adapter/version allowlist, not a sample or current-result fallback.
const SUBJECT = "sum-grouping-hypothesis";
const VERSION = "ieee754-instrument-v1";
const FEATURES: readonly HumanFeature[] = ["length", "nonIntegerCount", "min", "max", "maxAbs", "nonZeroOrderSpan"];
class Unavailable extends Error {
  constructor(readonly reason: HumanStoryReason) { super(reason); }
}
function requireFact(condition: unknown, reason: HumanStoryReason): asserts condition {
  if (!condition) throw new Unavailable(reason);
}
function same(a: unknown, b: unknown): boolean { return canonical(a) === canonical(b); }
function uniqueIds(items: readonly { id: string }[]): boolean {
  return items.every((item) => typeof item.id === "string" && item.id.length > 0) && new Set(items.map((item) => item.id)).size === items.length;
}

/** Only this exact known subject/version gives these root-array features their meaning. */
function rule(hypothesis: ResearchHypothesis): HumanRule {
  validateHypothesis(hypothesis.program);
  const atom = (value: Atom): HumanAtom => {
    const feature = FEATURES.find((name) => value.feature === `a:${name}:`);
    requireFact(feature, "unsupported-predicate");
    return { op: value.op, feature, threshold: value.threshold };
  };
  const when = hypothesis.program.when;
  return { expectedEqual: hypothesis.program.expectedHolds, condition: "left" in when
    ? { op: when.op, left: atom(when.left), right: atom(when.right) } : atom(when) };
}

/** Validate the persisted result envelope only. Never recompute the two sums or call an oracle. */
function measurement(observation: Observation): HumanStory["counterexample"] {
  const input = observation.input;
  const { holds, code, facts } = observation.measurement;
  requireFact(Array.isArray(input) && input.length >= 2 && input.length <= 12 &&
    input.every((value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000), "unreliable-measurement");
  requireFact(observation.inputDigest === researchDigest(input), "invalid-binding");
  requireFact(code === "finite-precision-hypothesis-not-a-production-bug" && typeof holds === "boolean" &&
    typeof facts.original === "number" && Number.isFinite(facts.original) &&
    typeof facts.reordered === "number" && Number.isFinite(facts.reordered) &&
    typeof facts.difference === "number" && Number.isFinite(facts.difference) &&
    facts.difference === Math.abs(facts.original - facts.reordered) && holds === (facts.original === facts.reordered), "unreliable-measurement");
  return { observationId: observation.id, input: [...input] as number[], original: facts.original, reordered: facts.reordered };
}

type Checked = { hypothesis: ResearchHypothesis; index: number; view: HumanHypothesis; receipts: Array<{ receipt: HypothesisEvaluation; index: number }> };
function storyFrom(overview: ResearchOverview): Pick<HumanOverview, "story" | "storyAvailability"> {
  const station = overview.station;
  const absent = (reason: HumanStoryReason, pending = false): Pick<HumanOverview, "story" | "storyAvailability"> => ({
    story: null, storyAvailability: { status: pending ? "pending" : "unavailable", reason },
  });
  if (!station) return absent("no-study", true);
  try {
    requireFact(overview.schemaVersion === RESEARCH_SCHEMA && station.schemaVersion === RESEARCH_SCHEMA, "unsupported-version");
    const hypotheses = station.hypotheses ?? [];
    if (!hypotheses.length) return absent("no-hypotheses", true);
    const sourceHypotheses = hypotheses.filter((item) => item.subjectId === SUBJECT);
    if (!sourceHypotheses.length) return absent("unsupported-source");
    requireFact(sourceHypotheses.every((item) => item.subjectVersion === VERSION) && station.subjectVersions[SUBJECT] === VERSION, "unsupported-version");
    const source = overview.subjects.filter((item) => item.id === SUBJECT);
    requireFact(source.length === 1 && station.subjectIds.includes(SUBJECT), "missing-reference");
    requireFact(source[0].version === VERSION, "unsupported-version");
    requireFact(source[0].origin === "generated-challenge" && source[0].interpretation === "exploratory-hypothesis" && source[0].family === "numeric-aggregation", "unsupported-source");
    const observations = station.episodes.flatMap((episode) => episode.observations);
    requireFact(uniqueIds(hypotheses) && uniqueIds(station.episodes) && uniqueIds(station.questions) && uniqueIds(observations), "invalid-binding");
    // The read service owns issuance authority. Recheck the complete frozen training and
    // receipt bindings here, not prose, lesson status, candidate stats, or episode verdict alone.
    const subject = researchSubject(SUBJECT);
    const checked: Checked[] = [];
    const ordered = [...sourceHypotheses].sort((a, b) => station.episodes.findIndex((episode) => episode.id === a.createdByEpisodeId)
      - station.episodes.findIndex((episode) => episode.id === b.createdByEpisodeId));
    for (const hypothesis of ordered) {
      const index = station.episodes.findIndex((episode) => episode.id === hypothesis.createdByEpisodeId);
      requireFact(index >= 0, "missing-reference");
      const creation = station.episodes[index];
      const question = station.questions.find((item) => item.id === creation.questionId);
      requireFact(question && creation.hypothesis, "missing-reference");
      requireFact(creation.subjectId === SUBJECT && creation.kind === "induce" && creation.verdict === "hypothesis-proposed" &&
        question.kind === "induce" && question.subjectId === SUBJECT && (question.hypothesisId ?? null) === hypothesis.parentHypothesisId &&
        same(creation.hypothesis, hypothesis), "invalid-binding");
      const humanRule = rule(hypothesis);
      const training = station.episodes.slice(0, index + 1).flatMap((episode) => episode.observations);
      training.filter((item) => item.subjectId === SUBJECT && item.subjectVersion === VERSION).forEach(measurement);
      try {
        requireFact(same(proposeHypothesis(subject, buildTrainingSnapshot(training, subject), hypothesis.program,
          creation.id, hypothesis.parentHypothesisId), hypothesis), "invalid-binding");
      } catch (error) { if (error instanceof Unavailable) throw error; throw new Unavailable("invalid-binding"); }
      const parent = checked.find((item) => item.hypothesis.id === hypothesis.parentHypothesisId);
      if (hypothesis.parentHypothesisId === null) requireFact(checked.length === 0, "invalid-binding");
      else {
        requireFact(parent, "missing-reference");
        requireFact(parent.index < index && parent.receipts.some((item) => item.index < index && item.receipt.phase === "falsification" && item.receipt.status === "refuted") &&
          !checked.some((item) => item.receipts.some((value) => value.index < index && value.receipt.phase === "audit")) &&
          !station.episodes.slice(0, index).some((episode) => episode.hypothesisEvaluationAttempt?.phase === "audit" &&
            checked.some((item) => item.hypothesis.id === episode.hypothesisEvaluationAttempt?.hypothesisId)), "invalid-binding");
      }
      const ledgerReceipts = (station.hypothesisEvaluations ?? []).filter((receipt) => receipt.hypothesisId === hypothesis.id);
      const issued = station.episodes.flatMap((episode, receiptIndex) => (episode.hypothesisEvaluations ?? [])
        .filter((receipt) => receipt.hypothesisId === hypothesis.id).map((receipt) => ({ receipt, index: receiptIndex })));
      requireFact(same(ledgerReceipts, issued.map((item) => item.receipt)), "missing-reference");
      requireFact(new Set(issued.map((item) => item.receipt.phase)).size === issued.length, "invalid-receipt");
      const evaluations: HumanEvaluation[] = [];
      for (const { receipt, index: receiptIndex } of issued) {
        const episode = station.episodes[receiptIndex];
        const evaluationQuestion = station.questions.find((item) => item.id === episode.questionId);
        requireFact(evaluationQuestion, "missing-reference");
        const kind = receipt.phase === "falsification" ? "falsify" : "audit-hypothesis";
        requireFact(receiptIndex > index && episode.subjectId === SUBJECT && episode.kind === kind && evaluationQuestion.kind === kind &&
          evaluationQuestion.subjectId === SUBJECT && evaluationQuestion.hypothesisId === hypothesis.id &&
          (episode.hypothesisEvaluations?.length ?? 0) === 1 && episode.calls >= receipt.calls, "invalid-binding");
        requireFact(hypothesisReceiptErrors(receipt, hypothesis, episode.observations,
          station.episodes.slice(0, receiptIndex).flatMap((item) => item.observations), episode.hypothesisEvaluationAttempt).length === 0, "invalid-receipt");
        for (const id of receipt.observationIds) {
          const observation = episode.observations.find((item) => item.id === id);
          requireFact(observation, "missing-reference");
          measurement(observation);
        }
        evaluations.push({ phase: receipt.phase, status: receipt.status, calls: receipt.calls, inScope: receipt.inScope,
          outOfScope: receipt.outOfScope, allowance: receipt.allowance, episodeId: episode.id,
          observationIds: [...receipt.observationIds], counterexampleIds: [...receipt.counterexampleIds] });
      }
      const status = evaluations.some((item) => item.status === "refuted") ? "refuted"
        : evaluations.some((item) => item.status === "inconclusive") ? "inconclusive"
        : evaluations.length ? "survived-budget" : "pending";
      checked.push({ hypothesis, index, receipts: issued, view: { id: hypothesis.id, rule: humanRule, status, evaluations,
        evidence: { creationEpisodeId: creation.id, programDigest: hypothesis.programDigest, trainingDigest: hypothesis.trainingDigest,
          trainingObservationIds: [...hypothesis.trainingObservationIds] } } });
    }
    // Earliest real refutation with its persisted direct child, never a fixed illustrative pair.
    const refuted = checked.filter((item) => item.view.status === "refuted");
    if (!refuted.length) return absent("no-refutation", true);
    for (const initial of refuted) {
      const revised = checked.find((item) => item.hypothesis.parentHypothesisId === initial.hypothesis.id);
      if (!revised) continue;
      const first = initial.receipts.find((item) => item.receipt.status === "refuted" && item.index < revised.index);
      requireFact(first, "invalid-binding");
      const counterexample = observations.find((item) => first.receipt.counterexampleIds.includes(item.id));
      requireFact(counterexample, "missing-reference");
      const facts = measurement(counterexample);
      requireFact(facts.original !== facts.reordered && initial.view.rule.expectedEqual, "unsupported-predicate");
      return { story: { kind: "floating-point-sum-order", subject: { id: SUBJECT, version: VERSION },
        initial: { ...initial.view, status: "refuted" }, counterexample: facts, revised: revised.view },
      storyAvailability: { status: "available", reason: null } };
    }
    return absent("no-revision", true);
  } catch (error) { return absent(error instanceof Unavailable ? error.reason : "invalid-data"); }
}

function count(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Invalid research count");
  return value;
}
function state(value: ResearchStation["status"]): NonNullable<HumanOverview["study"]>["state"] {
  return ["running", "paused", "idle", "budget-exhausted"].includes(value) ? value : "unknown";
}
function stopReason(value: string | null): NonNullable<HumanOverview["study"]>["stopReason"] {
  if (value === "oracle-call-cap") return "oracle-budget";
  if (value === null || value === "episode-cap" || value === "human-paused" || value === "agenda-empty") return value;
  return "unknown";
}

/** Pure projection of an authorized overview. No clock, filesystem, runner, oracle,
 * resource monitor, research mutation, or independently repeated experiment. */
export function projectHumanOverview(overview: ResearchOverview): HumanOverview {
  const station = overview.station;
  const release = overview.runtime?.releaseRevision;
  const releaseRevision = overview.runtime?.evidence === "deployment-env" && typeof release === "string" && /^[a-f0-9]{40}$/.test(release) ? release : null;
  if (station && (!Number.isFinite(station.budget.actualModelCostUsd) || station.budget.actualModelCostUsd < 0)) throw new TypeError("Invalid research cost");
  if (station && (station.episodes.length > count(station.policy.maxEpisodes) ||
    count(station.budget.spentCalls) + count(station.budget.reservedCalls) > count(station.policy.maxOracleCalls))) throw new TypeError("Invalid research limits");
  const last = station?.episodes.at(-1)?.completedAt;
  return {
    schemaVersion: HUMAN_OVERVIEW_SCHEMA, readAt: overview.generatedAt,
    source: { backend: overview.backend === "memory" || overview.backend === "postgres" ? overview.backend : "unknown",
      releaseRevision, releaseEvidence: releaseRevision ? "deployment-env" : "local-unbound", stationRevision: station ? count(station.revision) : null },
    study: station ? { state: state(station.status), stopReason: stopReason(station.stopReason),
      steps: station.episodes.length, stepLimit: count(station.policy.maxEpisodes),
      measurements: count(station.budget.spentCalls), reserved: count(station.budget.reservedCalls), measurementLimit: count(station.policy.maxOracleCalls),
      modelCalls: count(station.budget.externalModelCalls), modelCostUsd: station.budget.actualModelCostUsd,
      lastActivityAt: last && Number.isFinite(Date.parse(last)) ? last : null,
      pendingQuestions: station.questions.filter((item) => item.status === "pending").length,
      counts: { hypotheses: station.hypotheses?.length ?? 0, tools: station.tools.length, lessons: station.lessons.length },
    } : null,
    ...storyFrom(overview),
  };
}
