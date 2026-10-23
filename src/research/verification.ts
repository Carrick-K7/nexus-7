import {
  RESEARCH_SCHEMA, type HypothesisEvaluation, type HypothesisEvaluationAttempt,
  type Measurement, type Observation, type OracleMeter, type ResearchHypothesis,
  type ResearchQuestion, type ResearchStation, type ResearchSubject, type ToolEvaluation,
} from "./contracts";
import { evaluateReducer } from "./evaluator";
import { verdictEvidenceErrors } from "./evidence";
import { hypothesisReceiptErrors } from "./hypothesis-evidence";
import {
  buildTrainingSnapshot, evaluateHypothesis, HYPOTHESIS_EVALUATOR_VERSION,
  HYPOTHESIS_PHASE_ALLOWANCE, HYPOTHESIS_SAMPLING_PROTOCOL, proposeHypothesis,
} from "./hypotheses";
import { canonical, normalizeResearchJson, researchDigest, validateResearchPolicy } from "./integrity";
import { renderReducerSource, validateReducerProgram } from "./reducer";

export interface ResearchVerification {
  schemaVersion: "nexus.research-verification.v1";
  scope: "local-bounded-symbolic-kernel";
  gates: Record<string, boolean>;
  passed: boolean;
  counters: {
    episodes: number; distinctQuestions: number; targetFamilies: number; reexecutedObservations: number;
    checkedObservationReceipts: number; oracleCalls: number; knownAuditCounterexamples: number;
    generatedChallengeCounterexamples: number; naturalNewDefects: number; tools: number;
    toolEvaluationRecords: number; crossFamilyTransfers: number; initialHypotheses: number;
    protocolFollowups: number; newlyProposedHypotheses: number;
    hypothesisRefuted: number; hypothesisSurvivedBudget: number; hypothesisAudited: number;
  };
  limitations: string[];
  traceDigest: string;
}

function receiptResult(receipt: ToolEvaluation) {
  const {
    observationIds: _observations, initialObservationId: _initial,
    finalObservationId: _final, controlObservationId: _control, ...result
  } = receipt;
  void _observations; void _initial; void _final; void _control;
  return result;
}

function hypothesisPhase(kind: string): HypothesisEvaluation["phase"] | null {
  return kind === "falsify" ? "falsification" : kind === "audit-hypothesis" ? "audit" : null;
}

/** Only freshly minted observation IDs may differ on replay. Bind their order, full
 * inputs/outcomes and counterexample roles by content, not candidate-derived flags. */
function hypothesisReceiptResult(receipt: HypothesisEvaluation, observations: readonly Observation[]) {
  const { observationIds, counterexampleIds, ...result } = receipt;
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  return { ...result,
    observations: observationIds.map((id) => {
      const observation = byId.get(id);
      if (!observation) throw new Error("Missing hypothesis observation");
      const { id: _id, ...content } = observation;
      void _id;
      return content;
    }),
    counterexampleInputDigests: counterexampleIds.map((id) => {
      const observation = byId.get(id);
      if (!observation) throw new Error("Missing hypothesis counterexample");
      return observation.inputDigest;
    }),
  };
}

function assertStationEnvelope(station: ResearchStation): void {
  if (!station || typeof station !== "object" || station.schemaVersion !== RESEARCH_SCHEMA ||
    station.mode !== "bounded-symbolic-research" || !["running", "paused", "idle", "budget-exhausted"].includes(station.status) ||
    !Number.isSafeInteger(station.revision) || station.revision < 1 ||
    !Array.isArray(station.subjectIds) || station.subjectIds.length < 1 || station.subjectIds.length > 32 ||
    new Set(station.subjectIds).size !== station.subjectIds.length || !station.subjectVersions ||
    !Array.isArray(station.questions) || !Array.isArray(station.episodes) || !Array.isArray(station.tools) || !Array.isArray(station.lessons) ||
    (station.hypotheses !== undefined && !Array.isArray(station.hypotheses)) ||
    (station.hypothesisEvaluations !== undefined && !Array.isArray(station.hypothesisEvaluations))) {
    throw new Error("Unsupported or invalid research station envelope");
  }
  validateResearchPolicy(station.policy);
  if (station.episodes.length > station.policy.maxEpisodes || station.questions.length > 32 + station.policy.maxEpisodes * 8 ||
    station.tools.length > station.policy.maxEpisodes || station.lessons.length > station.policy.maxEpisodes * 8 ||
    !station.budget || !Number.isSafeInteger(station.budget.spentCalls) || station.budget.spentCalls < 0 ||
    !Number.isSafeInteger(station.budget.reservedCalls) || station.budget.reservedCalls < 0 ||
    station.budget.reservedCalls > station.policy.maxCallsPerEpisode ||
    station.budget.spentCalls + station.budget.reservedCalls > station.policy.maxOracleCalls) {
    throw new Error("Research station exceeds its frozen bounds");
  }
}

/** Fixed instruments re-execute observations and the exact frozen evaluator allowance.
 * A valid hash alone is neither semantic correctness nor an external attestation.
 */
export async function verifyResearchStation(
  station: ResearchStation,
  subjects: readonly ResearchSubject[],
  options: { minimumEpisodes?: number; maxReexecutions?: number; requireHypotheses?: boolean } = {},
): Promise<ResearchVerification> {
  assertStationEnvelope(station);
  const minimumEpisodes = options.minimumEpisodes ?? 10;
  const maxReexecutions = options.maxReexecutions ?? 1_000;
  if (!Number.isSafeInteger(minimumEpisodes) || minimumEpisodes < 1 || minimumEpisodes > 200 ||
    !Number.isSafeInteger(maxReexecutions) || maxReexecutions < 1 || maxReexecutions > 20_000 ||
    (options.requireHypotheses !== undefined && typeof options.requireHypotheses !== "boolean")) throw new Error("Verification budget outside bounds");
  const catalog = new Map(subjects.map((subject) => [subject.id, subject]));
  if (station.subjectIds.some((id) => catalog.get(id)?.version !== station.subjectVersions[id])) throw new Error("Research subject version is unavailable");
  const configuration = { seed: station.seed, subjectIds: station.subjectIds, subjectVersions: station.subjectVersions, policy: station.policy };
  let previous = researchDigest({ schemaVersion: station.schemaVersion, id: station.id, ...configuration });
  let chain = true;
  let evidence = true;
  let semantics = true;
  let toolsValid = true;
  // Undefined additive fields on old local v1 records mean [], without normalizing or
  // mutating any historical object (and therefore without changing its existing hash).
  const retainedHypotheses = station.hypotheses ?? [];
  const retainedHypothesisEvaluations = station.hypothesisEvaluations ?? [];
  let hypothesesValid = retainedHypotheses.length <= 16 && retainedHypothesisEvaluations.length <= 32;
  const priorHypotheses: ResearchHypothesis[] = [];
  const priorHypothesisEvaluations: HypothesisEvaluation[] = [];
  const verifiedHypothesisEvaluations: HypothesisEvaluation[] = [];
  const validHypotheses = new Set<string>();
  const hypothesisContent = new Map<string, string>();
  const proposedPrograms = new Set<string>();
  const refutedHypotheses = new Set<string>();
  const survivedHypotheses = new Set<string>();
  const auditedHypotheses = new Set<string>();
  const consumedPhases = new Set<string>();
  const attemptedAudits = new Set<string>();
  const seeds = new Set<string>();
  let completedHypothesisEvaluations = 0;
  let replayBudgetExhausted = false;
  let reexecuted = 0;
  let oracleCalls = 0;
  let known = 0;
  let generated = 0;
  let crossFamilyTransfers = 0;
  let executedEpisodes = 0;
  const families = new Set<string>();
  const semanticActions = new Set<string>();
  const checked = new Map<string, Observation>();
  const verifiedObservations = new Set<string>();
  const episodeIds = new Set<string>();
  const questions = new Map(station.questions.map((question) => [question.id, question]));
  const tools = new Map(station.tools.map((tool) => [tool.id, tool]));
  if (questions.size !== station.questions.length || tools.size !== station.tools.length ||
    new Set(station.lessons.map((lesson) => lesson.id)).size !== station.lessons.length) chain = false;
  const replayedInputs = new Map<string, Measurement>();
  const verificationMeter: OracleMeter = {
    get used() { return reexecuted; }, limit: maxReexecutions,
    async observe(subject, input, partition) {
      if (reexecuted >= maxReexecutions) {
        replayBudgetExhausted = true;
        throw new Error("Verification call budget exhausted");
      }
      reexecuted++;
      const trusted = catalog.get(subject.id);
      const actualInput = normalizeResearchJson(input);
      if (!trusted || trusted.version !== subject.version || !trusted.valid(structuredClone(actualInput))) throw new Error("Invalid verification instrument");
      const measurement = await trusted.measure(structuredClone(actualInput));
      return { id: `verification-${reexecuted}`, subjectId: trusted.id, subjectVersion: trusted.version,
        input: actualInput, inputDigest: researchDigest(actualInput),
        measurement: { ...measurement, facts: normalizeResearchJson(measurement.facts) }, partition };
    },
  };

  const checkAttempt = (attempt: HypothesisEvaluationAttempt, question: ResearchQuestion, reserved: number): boolean => {
    const hypothesis = priorHypotheses.find((item) => item.id === attempt.hypothesisId);
    const phase = hypothesisPhase(question.kind);
    const key = `${attempt.hypothesisId}\0${attempt.phase}`;
    const protocol = attempt.samplingProtocol ?? "bounded-perturbation-v1";
    const versionValid = protocol === "bounded-perturbation-v1"
      ? attempt.evaluatorVersion === undefined || attempt.evaluatorVersion === HYPOTHESIS_EVALUATOR_VERSION
      : protocol === HYPOTHESIS_SAMPLING_PROTOCOL && attempt.evaluatorVersion === HYPOTHESIS_EVALUATOR_VERSION;
    const valid = versionValid && !!hypothesis && validHypotheses.has(hypothesis.id) && hypothesis.subjectId === question.subjectId &&
      question.hypothesisId === attempt.hypothesisId && phase !== null && attempt.phase === phase &&
      !consumedPhases.has(key) && typeof attempt.seed === "string" && !!attempt.seed.trim() && attempt.seed.length <= 240 &&
      !seeds.has(attempt.seed) && Number.isSafeInteger(attempt.allowance) && attempt.allowance > 0 &&
      attempt.allowance === Math.min(HYPOTHESIS_PHASE_ALLOWANCE[phase], reserved);
    // The claim consumes the slot even when the runner did nothing, failed or abandoned.
    consumedPhases.add(key);
    seeds.add(attempt.seed);
    if (attempt.phase === "audit") attemptedAudits.add(attempt.hypothesisId);
    return valid;
  };

  for (const episode of station.episodes) {
    const { digest, ...unsigned } = episode;
    if (episodeIds.has(episode.id) || episode.previousDigest !== previous || researchDigest(unsigned) !== digest ||
      !Number.isSafeInteger(episode.calls) || episode.calls < episode.observations.length || episode.calls > station.policy.maxCallsPerEpisode) chain = false;
    previous = digest;
    const reserved = Math.min(station.policy.maxCallsPerEpisode, station.policy.maxOracleCalls - oracleCalls);
    oracleCalls += episode.calls;
    const question = questions.get(episode.questionId);
    const target = catalog.get(episode.subjectId);
    if (!question || !target || !station.subjectIds.includes(episode.subjectId) || question.kind !== episode.kind || question.subjectId !== episode.subjectId) {
      semantics = false;
      if (episode.hypothesis || episode.hypothesisEvaluationAttempt || episode.hypothesisEvaluations?.length) hypothesesValid = false;
      continue;
    }
    const priorObservations = [...checked.values()];
    for (const observation of episode.observations) {
      if (checked.has(observation.id)) { evidence = false; continue; }
      checked.set(observation.id, observation);
      try {
        const subject = catalog.get(observation.subjectId);
        const actualInput = normalizeResearchJson(observation.input);
        if (!subject || subject.version !== observation.subjectVersion || researchDigest(actualInput) !== observation.inputDigest || !subject.valid(structuredClone(actualInput))) {
          evidence = false; continue;
        }
        // Every receipt is compared; identical versioned pure inputs share one independent replay.
        const replayKey = researchDigest({ subject: subject.id, version: subject.version, input: observation.inputDigest });
        let actual = replayedInputs.get(replayKey);
        if (!actual) {
          if (reexecuted >= maxReexecutions) { evidence = false; continue; }
          reexecuted++;
          const measurement = await subject.measure(structuredClone(actualInput));
          actual = { ...measurement, facts: normalizeResearchJson(measurement.facts) };
          replayedInputs.set(replayKey, actual);
        }
        if (canonical(actual) !== canonical(observation.measurement)) evidence = false;
        else verifiedObservations.add(observation.id);
      } catch { evidence = false; }
    }
    const evaluations = episode.evaluations ?? [];
    const hypothesisEvaluations = Array.isArray(episode.hypothesisEvaluations) ? episode.hypothesisEvaluations : [];
    if (episode.hypothesisEvaluations !== undefined && !Array.isArray(episode.hypothesisEvaluations)) hypothesesValid = false;
    const attempt = episode.hypothesisEvaluationAttempt;
    const phase = hypothesisPhase(episode.kind);
    let attemptValid = false;
    if (attempt) {
      attemptValid = checkAttempt(attempt, question, reserved);
      if (!attemptValid || hypothesisEvaluations.length > 1) hypothesesValid = false;
    } else if (phase || hypothesisEvaluations.length || ["hypothesis-refuted", "hypothesis-survived"].includes(episode.verdict)) hypothesesValid = false;
    if (phase && (evaluations.length > 0 || episode.observations.some((observation) => observation.subjectId !== target.id ||
      observation.subjectVersion !== target.version || observation.partition !== (phase === "audit" ? "hypothesis-audit" : "hypothesis-falsification")))) hypothesesValid = false;
    if (!phase && episode.observations.some((observation) => ["hypothesis-audit", "hypothesis-falsification"].includes(observation.partition))) hypothesesValid = false;

    let proposalValid = false;
    if (episode.hypothesis) {
      const hypothesis = episode.hypothesis;
      try {
        const snapshot = buildTrainingSnapshot([...priorObservations, ...episode.observations], target);
        const expected = proposeHypothesis(target, snapshot, hypothesis.program, episode.id, hypothesis.parentHypothesisId);
        const source = priorHypotheses.filter((item) => item.subjectId === hypothesis.subjectId && item.subjectVersion === hypothesis.subjectVersion);
        const parent = source.find((item) => item.id === hypothesis.parentHypothesisId);
        const lineageValid = hypothesis.parentHypothesisId === null ? source.length === 0 : !!parent &&
          verifiedHypothesisEvaluations.some((receipt) => receipt.hypothesisId === parent.id && receipt.phase === "falsification" && receipt.status === "refuted") &&
          !source.some((item) => attemptedAudits.has(item.id));
        proposalValid = episode.kind === "induce" && episode.verdict === "hypothesis-proposed" &&
          hypothesis.createdByEpisodeId === episode.id && hypothesis.parentHypothesisId === (question.hypothesisId ?? null) &&
          canonical(expected) === canonical(hypothesis) &&
          retainedHypotheses.some((item) => canonical(item) === canonical(hypothesis)) &&
          snapshot.observationIds.every((id) => verifiedObservations.has(id)) &&
          priorHypotheses.length < 16 && source.length < 4 && lineageValid &&
          !priorHypotheses.some((item) => item.id === hypothesis.id) &&
          !source.some((item) => item.programDigest === hypothesis.programDigest && item.trainingDigest === hypothesis.trainingDigest);
        if (proposalValid) {
          // Renaming questions, observation IDs or artifacts cannot manufacture new work.
          hypothesisContent.set(hypothesis.id, researchDigest({ program: hypothesis.program,
            training: snapshot.examples.map(({ input, holds }) => ({ input, holds })), subjectVersion: target.version }));
        }
      } catch { proposalValid = false; }
      if (!proposalValid) hypothesesValid = false;
    } else if (episode.verdict === "hypothesis-proposed") hypothesesValid = false;

    const lessons = station.lessons.filter((lesson) => lesson.episodeId === episode.id);
    const semanticErrors = verdictEvidenceErrors({ kind: episode.kind, subjectId: episode.subjectId,
      episodeId: episode.id, subject: target, verdict: episode.verdict, question,
      lessons, selectionReason: episode.selectionReason, requireKernelLessons: true,
      observations: episode.observations, evaluations, priorObservations, tools: station.tools,
      hypothesis: episode.hypothesis, hypotheses: priorHypotheses, hypothesisEvaluations, attempt,
      hypothesisEvaluation: hypothesisEvaluations.find((receipt) => receipt.hypothesisId === question.hypothesisId && receipt.phase === phase),
      ...(episode.tool ? { tool: episode.tool } : {}) });
    if (semanticErrors.length > 0) {
      semantics = false;
      if (episode.kind === "induce" || episode.hypothesis || phase || attempt || hypothesisEvaluations.length ||
        lessons.some((lesson) => lesson.kind === "hypothesis") ||
        semanticErrors.includes("hypothesis-lesson-outside-phase")) hypothesesValid = false;
    }
    let completedEvaluation = false;
    for (const evaluation of hypothesisEvaluations) {
      priorHypothesisEvaluations.push(evaluation);
      try {
        const hypothesis = priorHypotheses.find((item) => item.id === evaluation.hypothesisId);
        if (!hypothesis) { hypothesesValid = false; continue; }
        const errors = hypothesisReceiptErrors(evaluation, hypothesis, episode.observations, priorObservations, attempt);
        let valid = errors.length === 0 && attemptValid && !!attempt && validHypotheses.has(hypothesis.id) &&
          evaluation.calls === episode.calls && evaluation.calls === episode.observations.length &&
          canonical(evaluation.observationIds) === canonical(episode.observations.map((observation) => observation.id)) &&
          episode.observations.every((observation) => verifiedObservations.has(observation.id));
        if (!attemptValid || !attempt || evaluation.samplingProtocol !== HYPOTHESIS_SAMPLING_PROTOCOL ||
          evaluation.evaluatorVersion !== HYPOTHESIS_EVALUATOR_VERSION) {
          // Historical receipts remain readable, but replaying a different sampling
          // protocol is not an exact reexecution of the recorded experiment.
          hypothesesValid = false;
          continue;
        }
        let used = 0;
        const repeatedObservations: Observation[] = [];
        const scoped: OracleMeter = {
          get used() { return used; }, limit: attempt.allowance,
          async observe(instrument, value, partition) {
            if (used >= attempt.allowance) throw new Error("Original hypothesis evaluation fuel exhausted");
            used++;
            const observation = await verificationMeter.observe(instrument, value, partition);
            repeatedObservations.push(observation);
            return observation;
          },
        };
        // Do not reuse reported samples or cached outcomes: independently select and
        // execute the fixed kernel with precisely the frozen claim and earlier history.
        const repeated = await evaluateHypothesis(hypothesis, target, priorObservations, scoped, attempt.phase, attempt.seed);
        if (replayBudgetExhausted || canonical(hypothesisReceiptResult(repeated, repeatedObservations)) !==
          canonical(hypothesisReceiptResult(evaluation, episode.observations))) valid = false;
        if (!valid) hypothesesValid = false;
        else {
          verifiedHypothesisEvaluations.push(evaluation);
          // Genuine private receipts remain factual even when the surrounding task failed;
          // an inconclusive episode is never promoted to a completed scientific operation.
          if (semanticErrors.length === 0 && episode.verdict !== "inconclusive" && evaluation.status !== "inconclusive") {
            completedEvaluation = true;
            completedHypothesisEvaluations++;
            if (evaluation.status === "refuted") refutedHypotheses.add(hypothesis.id);
            if (evaluation.status === "survived-budget") survivedHypotheses.add(hypothesis.id);
            if (evaluation.phase === "audit") auditedHypotheses.add(hypothesis.id);
          }
        }
      } catch { hypothesesValid = false; }
    }
    if (episode.hypothesis) {
      priorHypotheses.push(episode.hypothesis);
      if (proposalValid && semanticErrors.length === 0) {
        validHypotheses.add(episode.hypothesis.id);
        proposedPrograms.add(researchDigest({ programDigest: episode.hypothesis.programDigest, subjectVersion: episode.hypothesis.subjectVersion }));
      }
    }
    const performed = episode.kind === "induce" ? proposalValid && semanticErrors.length === 0
      : phase ? completedEvaluation : episode.observations.length > 0;
    if (performed) {
      executedEpisodes++;
      families.add(target.family);
      const witness = question.observationId ? priorObservations.find((item) => item.id === question.observationId)?.inputDigest : null;
      semanticActions.add(researchDigest({ kind: question.kind, subject: question.subjectId, version: target.version,
        witness: witness ?? null, tool: tools.get(question.toolId ?? "")?.digest ?? null,
        hypothesis: hypothesisContent.get(episode.hypothesis?.id ?? question.hypothesisId ?? "") ?? null }));
    }
    for (const evaluation of evaluations) {
      try {
        const tool = episode.tool?.digest === evaluation.programDigest ? episode.tool : station.tools.find((item) => item.digest === evaluation.programDigest);
        const subject = catalog.get(evaluation.subjectId);
        const initial = episode.observations.find((item) => item.id === evaluation.initialObservationId);
        const input = normalizeResearchJson(initial?.input ?? evaluation.reduced);
        if (!tool || !subject || subject.version !== evaluation.subjectVersion || researchDigest(input) !== evaluation.inputDigest) { toolsValid = false; continue; }
        validateReducerProgram(tool.program);
        let used = 0;
        const scoped: OracleMeter = {
          get used() { return used; }, limit: evaluation.allowance,
          async observe(instrument, value, partition) {
            if (used >= evaluation.allowance) throw new Error("Original evaluation fuel exhausted");
            used++;
            return verificationMeter.observe(instrument, value, partition);
          },
        };
        const repeated = await evaluateReducer(tool.program, subject, input, scoped);
        if (canonical(receiptResult(repeated)) !== canonical(receiptResult(evaluation))) toolsValid = false;
      } catch { toolsValid = false; }
    }
    if (episode.tool) {
      const retained = tools.get(episode.tool.id);
      if (!retained || retained.createdByEpisodeId !== episode.id) toolsValid = false;
      else {
        const { reusedOnSubjectIds: _retainedReuse, ...retainedArtifact } = retained;
        const { reusedOnSubjectIds: _createdReuse, ...createdArtifact } = episode.tool;
        void _retainedReuse; void _createdReuse;
        if (canonical(retainedArtifact) !== canonical(createdArtifact)) toolsValid = false;
      }
    }
    if (episode.verdict === "counterexample" && semanticErrors.length === 0) {
      if (target.origin === "known-audit-seed") known++;
      if (target.origin === "generated-challenge") generated++;
    }
    if (question.parentEpisodeId && !episodeIds.has(question.parentEpisodeId)) chain = false;
    for (const id of episode.generatedQuestionIds) {
      const generatedQuestion = questions.get(id);
      if (generatedQuestion?.parentEpisodeId !== episode.id) chain = false;
      if (generatedQuestion?.hypothesisId !== undefined && !priorHypotheses.some((hypothesis) =>
        hypothesis.id === generatedQuestion.hypothesisId && hypothesis.subjectId === generatedQuestion.subjectId)) hypothesesValid = false;
    }
    for (const id of episode.lessonIds) if (!station.lessons.some((lesson) => lesson.id === id && lesson.episodeId === episode.id)) chain = false;
    episodeIds.add(episode.id);
  }
  // The aggregate is exactly the chronological append-only projection, never a second
  // source of candidate authority. Compare complete artifacts/receipts, including order.
  if (canonical(priorHypotheses) !== canonical(retainedHypotheses) ||
    canonical(priorHypothesisEvaluations) !== canonical(retainedHypothesisEvaluations)) hypothesesValid = false;
  for (const question of station.questions) {
    if (!["survey", "replicate", "minimize", "transfer", "induce", "falsify", "audit-hypothesis"].includes(question.kind) ||
      !station.subjectIds.includes(question.subjectId)) semantics = false;
    const hypothesis = priorHypotheses.find((item) => item.id === question.hypothesisId);
    if ((hypothesisPhase(question.kind) && !hypothesis) || (question.hypothesisId !== undefined &&
      (!hypothesis || hypothesis.subjectId !== question.subjectId || !["induce", "falsify", "audit-hypothesis"].includes(question.kind)))) hypothesesValid = false;
  }
  if (station.lease) {
    const question = questions.get(station.lease.questionId);
    const attempt = station.lease.hypothesisEvaluationAttempt;
    if (attempt) {
      const reserved = Math.min(station.policy.maxCallsPerEpisode, station.policy.maxOracleCalls - oracleCalls);
      if (!question || station.status !== "running" || question.status !== "running" ||
        station.questions.filter((item) => item.status === "running").length !== 1 || episodeIds.has(station.lease.episodeId) ||
        station.lease.reservedCalls !== reserved || station.budget.reservedCalls !== reserved ||
        !checkAttempt(attempt, question, reserved)) hypothesesValid = false;
    } else if (question && hypothesisPhase(question.kind)) hypothesesValid = false;
  }
  for (const tool of station.tools) {
    try {
      validateReducerProgram(tool.program);
      if (researchDigest(tool.program) !== tool.digest || renderReducerSource(tool.program) !== tool.source ||
        !station.episodes.some((episode) => episode.id === tool.createdByEpisodeId && episode.tool?.id === tool.id)) toolsValid = false;
      if (new Set(tool.reusedOnSubjectIds).size !== tool.reusedOnSubjectIds.length) toolsValid = false;
      for (const targetId of tool.reusedOnSubjectIds) {
        if (catalog.get(targetId)?.family === catalog.get(tool.trainingSubjectId)?.family ||
          !station.episodes.some((episode) => episode.subjectId === targetId && episode.verdict === "transferred" &&
            questions.get(episode.questionId)?.toolId === tool.id && episode.evaluations?.some((receipt) => receipt.accepted && receipt.programDigest === tool.digest && receipt.subjectId === targetId))) toolsValid = false;
        else crossFamilyTransfers++;
      }
    } catch { toolsValid = false; }
  }
  for (const lesson of station.lessons) {
    if (!station.episodes.some((episode) => episode.id === lesson.episodeId && episode.lessonIds.includes(lesson.id))) chain = false;
  }
  const gates = {
    observationWindow: executedEpisodes >= minimumEpisodes && semanticActions.size >= minimumEpisodes,
    problemDiversity: families.size >= 2 && new Set(station.episodes.map((episode) => episode.subjectId)).size >= 3,
    traceIntegrity: chain,
    rawMeasurementsReexecuted: evidence && !replayBudgetExhausted && reexecuted > 0,
    outcomeSemantics: semantics,
    hypothesisEvidenceIntegrity: hypothesesValid,
    ...(options.requireHypotheses ? { conditionalHypothesesTested: proposedPrograms.size > 0 && completedHypothesisEvaluations > 0 } : {}),
    quotaConserved: oracleCalls === station.budget.spentCalls && station.budget.spentCalls + station.budget.reservedCalls <= station.policy.maxOracleCalls,
    negativeResultsRetained: station.episodes.some((episode) => episode.observations.length > 0 && ["no-change", "not-reproduced", "tool-rejected", "inconclusive"].includes(episode.verdict)),
    generatedQuestionsLinked: station.questions.some((question) => question.parentEpisodeId && station.episodes.some((episode) => episode.id === question.parentEpisodeId && episode.generatedQuestionIds.includes(question.id))),
    toolArtifactsValid: toolsValid && station.tools.some((tool) => tool.status === "certified"),
    crossFamilyToolReuse: crossFamilyTransfers > 0,
    noExternalAuthority: station.budget.externalModelCalls === 0 && station.budget.actualModelCostUsd === 0,
  };
  return {
    schemaVersion: "nexus.research-verification.v1", scope: "local-bounded-symbolic-kernel", gates,
    passed: Object.values(gates).every(Boolean),
    counters: { episodes: executedEpisodes, distinctQuestions: semanticActions.size, targetFamilies: families.size,
      reexecutedObservations: reexecuted, checkedObservationReceipts: checked.size, oracleCalls,
      knownAuditCounterexamples: known, generatedChallengeCounterexamples: generated, naturalNewDefects: 0,
      tools: new Set(station.tools.map((tool) => tool.digest)).size, toolEvaluationRecords: station.tools.length, crossFamilyTransfers,
      initialHypotheses: station.subjectIds.length, protocolFollowups: station.questions.filter((question) => question.parentEpisodeId).length,
      newlyProposedHypotheses: proposedPrograms.size, hypothesisRefuted: refutedHypotheses.size,
      hypothesisSurvivedBudget: survivedHypotheses.size, hypothesisAudited: auditedHypotheses.size },
    limitations: [
      "Natural previously-unknown repository defect discovery is not demonstrated by these seeded instruments.",
      "Initial catalog claims, protocol followups and data-bound conditional proposals are counted separately; ten operations are not ten independent scientific samples.",
      "This is bounded symbolic program search, not a live LLM or open-ended source-code engineer.",
      "Verifier and subjects are trusted modules, not independently hosted adversarial sandboxes.",
      "Local deterministic replay checks the recorded claim and history; it cannot independently attest historical seed issuance or rule out wholesale ledger replacement.",
      `Exact hypothesis replay requires ${HYPOTHESIS_SAMPLING_PROTOCOL}; other recorded sampling protocols remain readable but fail hypothesis evidence integrity without being replayed as this version.`,
      "Input-new hypothesis samples are not independent generator roots, author-blind evidence or independent third-party attestation; bounded survival is not proof or population coverage.",
      "Verification has one explicit call budget; raw versioned pure inputs share one replay, while reducer and hypothesis kernels re-execute with the original allowances.",
    ],
    traceDigest: researchDigest(station.episodes.map((episode) => episode.digest)),
  };
}
