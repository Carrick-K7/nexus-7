import {
  RESEARCH_EVALUATOR_VERSION, type EpisodeVerdict, type Observation, type QuestionKind,
  type ResearchQuestion, type ResearchTool, type ToolEvaluation, type ResearchHypothesis,
  type HypothesisEvaluation, type HypothesisEvaluationAttempt, type ResearchSubject, type ResearchLesson,
} from "./contracts";
import { assertResearchJson, canonical, researchDigest, researchSize } from "./integrity";
import { hypothesisVerdictErrors } from "./hypothesis-evidence";

/** Pure evidence semantics, shared by the committing kernel and offline verifier. */
export function evaluationEvidenceErrors(evaluation: ToolEvaluation, observations: readonly Observation[]): string[] {
  const errors: string[] = [];
  try {
    if (evaluation.verifierVersion !== RESEARCH_EVALUATOR_VERSION || typeof evaluation.accepted !== "boolean" ||
      typeof evaluation.counterexamplePreserved !== "boolean" || typeof evaluation.controlRejected !== "boolean" || !Number.isSafeInteger(evaluation.allowance) || evaluation.allowance < 0 || evaluation.allowance > 256 ||
      !Number.isSafeInteger(evaluation.calls) || evaluation.calls < 0 || evaluation.calls > evaluation.allowance ||
      !Array.isArray(evaluation.observationIds) || new Set(evaluation.observationIds).size !== evaluation.observationIds.length ||
      evaluation.calls !== evaluation.observationIds.length) return ["invalid-evaluation-envelope"];
    assertResearchJson(evaluation.reduced);
    const byId = new Map(observations.map((observation) => [observation.id, observation]));
    const receipts = evaluation.observationIds.map((id) => byId.get(id));
    if (receipts.some((observation) => !observation || observation.partition !== "tool-validation")) errors.push("evaluation-observation-missing");
    const initial = evaluation.initialObservationId ? byId.get(evaluation.initialObservationId) : undefined;
    const final = evaluation.finalObservationId ? byId.get(evaluation.finalObservationId) : undefined;
    const control = evaluation.controlObservationId ? byId.get(evaluation.controlObservationId) : undefined;
    for (const id of [evaluation.initialObservationId, evaluation.finalObservationId, evaluation.controlObservationId]) {
      if (id !== null && !evaluation.observationIds.includes(id)) errors.push("evaluation-role-outside-receipt");
    }
    if (initial && (initial.subjectId !== evaluation.subjectId || initial.subjectVersion !== evaluation.subjectVersion ||
      initial.inputDigest !== evaluation.inputDigest || researchSize(initial.input) !== evaluation.originalSize)) errors.push("evaluation-initial-binding");
    if (researchSize(evaluation.reduced) !== evaluation.reducedSize) errors.push("evaluation-output-size");
    if (final && (final.subjectId !== evaluation.subjectId || final.subjectVersion !== evaluation.subjectVersion ||
      canonical(final.input) !== canonical(evaluation.reduced) || final.inputDigest !== researchDigest(evaluation.reduced) ||
      evaluation.counterexamplePreserved !== !final.measurement.holds)) errors.push("evaluation-final-binding");
    if (control && (control.subjectId !== "integer-sum-control" || evaluation.controlRejected !== control.measurement.holds)) errors.push("evaluation-control-binding");
    if (evaluation.accepted && (!initial || initial.measurement.holds || !final || final.measurement.holds || !control || !control.measurement.holds ||
      !evaluation.counterexamplePreserved || !evaluation.controlRejected || evaluation.reducedSize >= evaluation.originalSize ||
      evaluation.code !== "fresh-witness-reduced-and-rechecked")) errors.push("unsupported-tool-certification");
  } catch { errors.push("invalid-evaluation-data"); }
  return errors;
}

export interface VerdictEvidenceInput {
  episodeId?: string;
  subject?: ResearchSubject;
  hypothesis?: ResearchHypothesis;
  hypotheses?: readonly ResearchHypothesis[];
  hypothesisEvaluation?: HypothesisEvaluation;
  hypothesisEvaluations?: readonly HypothesisEvaluation[];
  attempt?: HypothesisEvaluationAttempt;
  lessons?: readonly ResearchLesson[];
  selectionReason?: string;
  requireKernelLessons?: boolean;
  kind: QuestionKind;
  subjectId: string;
  verdict: EpisodeVerdict;
  question: ResearchQuestion;
  observations: readonly Observation[];
  evaluations: readonly ToolEvaluation[];
  priorObservations: readonly Observation[];
  tools: readonly ResearchTool[];
  tool?: ResearchTool;
}

export function verdictEvidenceErrors(input: VerdictEvidenceInput): string[] {
  if (!["survey", "replicate", "minimize", "transfer", "induce", "falsify", "audit-hypothesis"].includes(input.kind) ||
    !["counterexample", "not-reproduced", "confirmed", "tool-certified", "tool-rejected", "transferred", "no-change", "inconclusive", "hypothesis-proposed", "hypothesis-refuted", "hypothesis-survived"].includes(input.verdict) ||
    input.question.kind !== input.kind || input.question.subjectId !== input.subjectId) return ["unsupported-evidence-operation"];
  const errors = [
    ...input.evaluations.flatMap((evaluation) => evaluationEvidenceErrors(evaluation, input.observations)),
    ...hypothesisVerdictErrors(input),
  ];
  const own = input.observations.filter((observation) => observation.subjectId === input.subjectId);
  const { kind, verdict, tool } = input;
  if (tool) {
    if (kind !== "minimize" || !["certified", "rejected"].includes(tool.status) || !["tool-certified", "tool-rejected"].includes(verdict) ||
      (verdict === "tool-certified") !== (tool.status === "certified") ||
      (tool.status === "certified") !== tool.evaluation.accepted ||
      tool.evaluation.programDigest !== tool.digest || tool.evaluation.subjectId !== tool.trainingSubjectId ||
      !input.evaluations.some((receipt) => canonical(receipt) === canonical(tool.evaluation))) errors.push("tool-verdict-receipt-mismatch");
  }
  if (verdict === "inconclusive") return errors;
  if (kind === "survey") {
    const observations = own.filter((observation) => observation.partition === "discovery");
    if (verdict === "counterexample") {
      if (!observations.some((observation) => !observation.measurement.holds)) errors.push("counterexample-without-contradiction");
    } else if (verdict !== "no-change" || observations.some((observation) => !observation.measurement.holds)) errors.push("unsupported-survey-verdict");
  } else if (kind === "replicate") {
    const prior = input.priorObservations.find((observation) => observation.id === input.question.observationId);
    const exact = prior && own.find((observation) => observation.partition === "confirmation" && observation.inputDigest === prior.inputDigest);
    if (!prior || prior.measurement.holds || !exact || !["confirmed", "not-reproduced"].includes(verdict) ||
      (verdict === "confirmed") !== !exact.measurement.holds) errors.push("unsupported-replication-verdict");
  } else if (kind === "minimize") {
    if (["tool-certified", "tool-rejected"].includes(verdict) ? !tool : verdict !== "no-change") errors.push("unsupported-synthesis-verdict");
  } else if (kind === "transfer") {
    const sourceTool = input.tools.find((candidate) => candidate.id === input.question.toolId && candidate.status === "certified");
    const evaluation = sourceTool && input.evaluations.find((receipt) => receipt.programDigest === sourceTool.digest && receipt.subjectId === input.subjectId);
    if (verdict === "transferred") {
      if (!sourceTool || !evaluation?.accepted) errors.push("transfer-without-certification");
    } else if (verdict === "tool-rejected") {
      if (!sourceTool || !evaluation || evaluation.accepted) errors.push("rejection-without-evaluation");
    } else if (verdict !== "no-change" || own.filter((observation) => observation.partition === "transfer").some((observation) => !observation.measurement.holds)) {
      errors.push("unsupported-transfer-verdict");
    }
  }
  return errors;
}
