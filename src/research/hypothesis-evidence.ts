import type { HypothesisEvaluation, HypothesisEvaluationAttempt, Observation, ResearchHypothesis, ResearchQuestion, ResearchSubject, ResearchLesson } from "./contracts";
import { formatHypothesisLesson, formatResearchLimitLesson } from "./hypothesis-lessons";
import { predict, validateHypothesis } from "./induction";
import { canonical, researchDigest } from "./integrity";
import { buildTrainingSnapshot, proposeHypothesis, HYPOTHESIS_EVALUATOR_VERSION, HYPOTHESIS_PHASE_ALLOWANCE } from "./hypotheses";

export interface HypothesisEvidenceInput {
  episodeId?: string;
  subjectId: string;
  kind: string;
  verdict: string;
  question: ResearchQuestion;
  subject?: ResearchSubject;
  observations: readonly Observation[];
  priorObservations: readonly Observation[];
  hypothesis?: ResearchHypothesis;
  hypotheses?: readonly ResearchHypothesis[];
  hypothesisEvaluation?: HypothesisEvaluation;
  hypothesisEvaluations?: readonly HypothesisEvaluation[];
  attempt?: HypothesisEvaluationAttempt;
  lessons?: readonly ResearchLesson[];
  selectionReason?: string;
  requireKernelLessons?: boolean;
}

export function hypothesisReceiptErrors(receipt: HypothesisEvaluation, hypothesis: ResearchHypothesis,
  observations: readonly Observation[], prior: readonly Observation[], attempt?: HypothesisEvaluationAttempt): string[] {
  const errors: string[] = [];
  try {
    validateHypothesis(hypothesis.program);
    const maximum = HYPOTHESIS_PHASE_ALLOWANCE[receipt.phase];
    if (receipt.evaluatorVersion !== HYPOTHESIS_EVALUATOR_VERSION || !["bounded-perturbation-v1", "bounded-perturbation-v2"].includes(receipt.samplingProtocol) ||
      !["falsification", "audit"].includes(receipt.phase) || !["refuted", "survived-budget", "inconclusive"].includes(receipt.status) ||
      receipt.hypothesisId !== hypothesis.id || receipt.programDigest !== hypothesis.programDigest || receipt.programDigest !== researchDigest(hypothesis.program) ||
      receipt.trainingDigest !== hypothesis.trainingDigest || receipt.subjectId !== hypothesis.subjectId || receipt.subjectVersion !== hypothesis.subjectVersion ||
      !Number.isSafeInteger(receipt.calls) || receipt.calls < 0 || !Number.isSafeInteger(receipt.allowance) || receipt.allowance < 0 || receipt.allowance > maximum || receipt.calls > receipt.allowance ||
      !Number.isSafeInteger(receipt.attemptedCandidates) || receipt.attemptedCandidates < receipt.calls || receipt.attemptedCandidates > 256 ||
      !Array.isArray(receipt.observationIds) || receipt.observationIds.length !== receipt.calls || new Set(receipt.observationIds).size !== receipt.calls ||
      !Array.isArray(receipt.sampleKinds) || receipt.sampleKinds.length !== receipt.calls) return ["invalid-hypothesis-receipt-envelope"];
    if (!attempt || attempt.hypothesisId !== receipt.hypothesisId || attempt.phase !== receipt.phase || attempt.seed !== receipt.seed || attempt.allowance !== receipt.allowance ||
      (attempt.samplingProtocol !== undefined && attempt.samplingProtocol !== receipt.samplingProtocol) ||
      (attempt.evaluatorVersion !== undefined && attempt.evaluatorVersion !== receipt.evaluatorVersion) ||
      (receipt.samplingProtocol === "bounded-perturbation-v2" && (attempt.samplingProtocol !== receipt.samplingProtocol || attempt.evaluatorVersion !== receipt.evaluatorVersion))) errors.push("hypothesis-attempt-binding");
    const byId = new Map(observations.map((observation) => [observation.id, observation]));
    const excluded = [...new Set(prior.filter((observation) => observation.subjectId === hypothesis.subjectId && observation.subjectVersion === hypothesis.subjectVersion).map((observation) => observation.inputDigest))].sort();
    if (canonical(excluded) !== canonical([...receipt.excludedInputDigests].sort())) errors.push("hypothesis-exclusion-history-mismatch");
    const seen = new Set(excluded);
    const conflicts: string[] = [];
    let inScope = 0, exploration = 0, boundary = 0;
    for (const [index, id] of receipt.observationIds.entries()) {
      const observation = byId.get(id);
      if (!observation || observation.subjectId !== hypothesis.subjectId || observation.subjectVersion !== hypothesis.subjectVersion ||
        observation.partition !== (receipt.phase === "falsification" ? "hypothesis-falsification" : "hypothesis-audit") ||
        observation.inputDigest !== researchDigest(observation.input) || seen.has(observation.inputDigest)) { errors.push("hypothesis-sample-binding"); continue; }
      seen.add(observation.inputDigest);
      const kind = receipt.sampleKinds[index];
      if (kind === "exploration") exploration++; else if (kind === "boundary") boundary++; else errors.push("unknown-hypothesis-sample-kind");
      if (boundary > exploration) errors.push("targeted-sampling-dominates-exploration");
      const prediction = predict(hypothesis.program, observation.input);
      if (prediction !== null) {
        inScope++;
        if (prediction !== observation.measurement.holds) conflicts.push(id);
      }
    }
    if (inScope !== receipt.inScope || receipt.calls - inScope !== receipt.outOfScope || canonical(conflicts) !== canonical(receipt.counterexampleIds)) errors.push("hypothesis-derived-count-mismatch");
    const status = conflicts.length ? "refuted" : receipt.calls >= 8 && inScope >= 4 && receipt.calls - inScope >= 4 ? "survived-budget" : "inconclusive";
    if (receipt.status !== status) errors.push("unsupported-hypothesis-status");
  } catch { errors.push("invalid-hypothesis-evidence-data"); }
  return errors;
}

export function hypothesisLessonErrors(input: HypothesisEvidenceInput): string[] {
  const phase = ["induce", "falsify", "audit-hypothesis"].includes(input.kind);
  const supplied = input.lessons ?? [];
  if (!phase) {
    const protectedIds = new Set((input.hypotheses ?? []).flatMap((hypothesis) => [hypothesis.id, hypothesis.createdByEpisodeId]));
    return supplied.some((item) => item.kind === "hypothesis" || item.evidenceIds.some((id) => protectedIds.has(id)) ||
      (item.supersedes !== undefined && protectedIds.has(item.supersedes))) ? ["hypothesis-lesson-outside-phase"] : [];
  }
  if (!input.episodeId || !input.subject) return supplied.length ? ["hypothesis-lesson-context-missing"] : [];
  const expected: ResearchLesson[] = [];
  if (input.hypothesis) expected.push(formatHypothesisLesson(input.episodeId, input.subject, input.hypothesis));
  for (const receipt of input.hypothesisEvaluations ?? []) {
    const hypothesis = (input.hypotheses ?? []).find((item) => item.id === receipt.hypothesisId);
    if (hypothesis) expected.push(formatHypothesisLesson(input.episodeId, input.subject, hypothesis, receipt));
  }
  const allowed = [...expected];
  if (input.requireKernelLessons && input.verdict === "inconclusive" && input.selectionReason) {
    allowed.push(formatResearchLimitLesson(input.episodeId, input.subjectId, input.selectionReason));
  }
  const errors = supplied.some((item) => !allowed.some((candidate) => canonical(candidate) === canonical(item))) ? ["candidate-scientific-lesson-is-not-kernel-derived"] : [];
  if (input.requireKernelLessons && expected.some((candidate) => !supplied.some((item) => canonical(item) === canonical(candidate)))) errors.push("kernel-scientific-lesson-missing");
  return errors;
}

export function hypothesisVerdictErrors(input: HypothesisEvidenceInput): string[] {
  const hypotheses = input.hypotheses ?? [];
  const evaluations = input.hypothesisEvaluations ?? [];
  const errors: string[] = hypothesisLessonErrors(input);
  for (const receipt of evaluations) {
    const hypothesis = hypotheses.find((candidate) => candidate.id === receipt.hypothesisId);
    if (!hypothesis) errors.push("evaluation-hypothesis-not-persisted");
    else errors.push(...hypothesisReceiptErrors(receipt, hypothesis, input.observations, input.priorObservations, input.attempt));
  }
  if (input.hypothesis) {
    try {
      const hypothesis = input.hypothesis;
      if (input.kind !== "induce" || input.verdict !== "hypothesis-proposed" || !input.subject || !input.episodeId ||
        hypothesis.createdByEpisodeId !== input.episodeId || hypothesis.subjectId !== input.subjectId ||
        hypothesis.parentHypothesisId !== (input.question.hypothesisId ?? null)) errors.push("hypothesis-proposal-context-mismatch");
      else {
        const snapshot = buildTrainingSnapshot([...input.priorObservations, ...input.observations], input.subject);
        const expected = proposeHypothesis(input.subject, snapshot, hypothesis.program, input.episodeId, hypothesis.parentHypothesisId);
        if (canonical(expected) !== canonical(hypothesis)) errors.push("hypothesis-training-or-program-binding");
      }
    } catch { errors.push("invalid-hypothesis-proposal"); }
  }
  if (input.verdict === "inconclusive") return errors; // factual private receipts remain visible even if the surrounding task fails
  if (input.kind === "induce") {
    if (input.verdict === "hypothesis-proposed" ? !input.hypothesis : input.verdict !== "no-change" || !!input.hypothesis) errors.push("unsupported-induction-verdict");
  } else if (input.kind === "falsify" || input.kind === "audit-hypothesis") {
    const phase = input.kind === "falsify" ? "falsification" : "audit";
    const receipt = input.hypothesisEvaluation ?? evaluations.find((candidate) => candidate.hypothesisId === input.question.hypothesisId && candidate.phase === phase);
    if (!receipt || receipt.hypothesisId !== input.question.hypothesisId || receipt.subjectId !== input.subjectId || receipt.phase !== phase ||
      !evaluations.some((candidate) => canonical(candidate) === canonical(receipt))) errors.push("hypothesis-verdict-without-issued-receipt");
    else if ((input.verdict === "hypothesis-refuted" && receipt.status !== "refuted") ||
      (input.verdict === "hypothesis-survived" && receipt.status !== "survived-budget") ||
      !["hypothesis-refuted", "hypothesis-survived"].includes(input.verdict)) errors.push("unsupported-hypothesis-verdict");
  } else if (input.hypothesis || evaluations.length > 0 || input.hypothesisEvaluation || input.attempt) errors.push("hypothesis-authority-outside-protocol-phase");
  return errors;
}
