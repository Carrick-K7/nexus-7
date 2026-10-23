import type {
  EpisodeResult, EpisodeRunner, Localized, Observation, ResearchLesson, ResearchQuestion,
  ResearchStation, ResearchSubject, ResearchTool, ResearchHypothesis,
} from "./contracts";
import { researchDigest } from "./integrity";
import { synthesizeReducer, renderReducerSource, hasReductionCandidate } from "./reducer";
import { fitConditional } from "./induction";
import { buildTrainingSnapshot, proposeHypothesis } from "./hypotheses";
import { formatHypothesisLesson } from "./hypothesis-lessons";
export { selectResearchQuestion as nextResearchQuestion } from "./agenda";

function question(
  station: ResearchStation, kind: ResearchQuestion["kind"], subject: ResearchSubject,
  parentEpisodeId: string, evidence?: Observation, tool?: ResearchTool,
): ResearchQuestion {
  const names: Record<ResearchQuestion["kind"], Localized> = {
    survey: { en: "Probe", zh: "探索" }, replicate: { en: "Challenge the first counterexample", zh: "挑战首个反例" },
    minimize: { en: "Synthesize a smaller witness", zh: "综合更小的反例" }, transfer: { en: "Test transfer without rewriting the tool", zh: "不改工具检验跨题迁移" },
    induce: { en: "Induce a conditional hypothesis", zh: "归纳条件命题" },
    falsify: { en: "Try to refute the frozen hypothesis", zh: "尝试反驳冻结命题" },
    "audit-hypothesis": { en: "One-shot independent hypothesis audit", zh: "一次性独立命题审计" },
  };
  const semanticKey = { kind, subjectId: subject.id, toolDigest: tool?.digest ?? null,
    witnessDigest: kind === "replicate" || kind === "minimize" ? evidence?.inputDigest ?? null : null };
  return {
    id: `question-${researchDigest(semanticKey).slice(0, 24)}`, kind, subjectId: subject.id,
    title: { en: `${names[kind].en}: ${subject.title.en}`, zh: `${names[kind].zh}：${subject.title.zh}` },
    status: "pending", createdAtRound: station.episodes.length + 1, parentEpisodeId,
    ...(evidence ? { observationId: evidence.id } : {}), ...(tool ? { toolId: tool.id } : {}),
    priority: kind === "replicate" ? 300 : kind === "minimize" ? 200 : kind === "transfer" ? 150 : 100,
    attempts: 0, reasonCode: kind === "replicate" ? "counterexample-needs-independent-confirmation" : kind === "minimize" ? "confirmed-witness-is-costly" : "certified-tool-may-transfer",
  };
}
function evidenceById(station: ResearchStation, id: string | undefined): Observation | undefined {
  return station.episodes.flatMap((episode) => episode.observations).find((observation) => observation.id === id);
}
function freshSeed(station: ResearchStation, subject: ResearchSubject, purpose: string): string {
  // A question's display name/id/round number is not a random coordinate.
  return researchDigest({ seed: station.seed, subjectVersion: subject.version, family: subject.family, purpose });
}
function lesson(
  episodeId: string, subject: ResearchSubject, kind: ResearchLesson["kind"],
  statement: Localized, observations: Observation[], status: ResearchLesson["status"], supersedes?: string,
): ResearchLesson {
  return {
    id: `lesson-${researchDigest({ episodeId, kind, subjectId: subject.id }).slice(0, 24)}`,
    subjectId: subject.id, kind, statement, evidenceIds: observations.map((item) => item.id), episodeId,
    applicability: `${subject.id}@${subject.version}; ${subject.interpretation}; ${subject.origin}`,
    status, ...(supersedes ? { supersedes } : {}),
  };
}
function empty(): EpisodeResult {
  return { verdict: "inconclusive", observations: [], lessons: [], questions: [] };
}
function addIfNew(station: ResearchStation, result: EpisodeResult, value: ResearchQuestion): void {
  if (!station.questions.some((existing) => existing.id === value.id) && !result.questions.some((existing) => existing.id === value.id)) result.questions.push(value);
}
function transferQuestions(station: ResearchStation, result: EpisodeResult, tool: ResearchTool, subjects: ResearchSubject[], episodeId: string): void {
  const source = subjects.find((subject) => subject.id === tool.trainingSubjectId);
  for (const target of subjects) {
    if (station.subjectIds.includes(target.id) && target.family !== source?.family && !tool.reusedOnSubjectIds.includes(target.id)) {
      const proposed = question(station, "transfer", target, episodeId, undefined, tool);
      const input = target.generate(freshSeed(station, target, `transfer:${tool.digest}`));
      const structurallyCompatible = hasReductionCandidate(tool.program, input, target.valid);
      proposed.priority = structurallyCompatible ? 150 : 50;
      proposed.reasonCode = structurallyCompatible ? "frozen-tool-has-valid-structural-edit" : "structural-search-found-no-valid-edit";
      // Keep even low-priority candidates visible: a bounded structural check is not impossibility proof.
      addIfNew(station, result, proposed);
    }
  }
}

function createProtocolRunner(subjects: readonly ResearchSubject[]): EpisodeRunner {
  const catalog = new Map(subjects.map((subject) => [subject.id, subject]));
  return async (station, current, episodeId, rawMeter) => {
    const subject = catalog.get(current.subjectId);
    if (!subject || subject.version !== station.subjectVersions[subject.id]) throw new Error("Research subject version changed");
    const result = empty();
    const meter: typeof rawMeter = {
      get used() { return rawMeter.used; },
      get limit() { return rawMeter.limit; },
      async observe(target, input, partition) {
        const value = await rawMeter.observe(target, input, partition);
        result.observations.push(value);
        return value;
      },
    };
    const observe = (input: Parameters<typeof meter.observe>[1], partition: Observation["partition"]) => meter.observe(subject, input, partition);
    const certify = (program: ResearchTool["program"], target: ResearchSubject, input: Parameters<typeof meter.observe>[1]) => {
      if (!rawMeter.evaluateReducer) throw new Error("Kernel-owned evaluation is unavailable");
      return rawMeter.evaluateReducer(program, target, input);
    };
    if (current.kind === "survey") {
      const observed = await observe(subject.generate(freshSeed(station, subject, "discovery")), "discovery");
      if (observed.measurement.holds) {
        result.verdict = "no-change";
        result.lessons.push(lesson(episodeId, subject, "limit", {
          en: "This sampled input did not falsify the claim. It does not prove the claim universally.",
          zh: "该样本未否证假设；这不证明假设普遍成立。",
        }, [observed], "provisional"));
      } else {
        result.verdict = "counterexample";
        result.lessons.push(lesson(episodeId, subject, "counterexample", {
          en: subject.interpretation === "declared-contract" ? "A legal input contradicts the declared contract; confirmation is required." : "A legal input refutes the exploratory hypothesis, not necessarily the implementation.",
          zh: subject.interpretation === "declared-contract" ? "合法输入与声明契约矛盾，仍需独立确认。" : "合法输入否证探索性假设，不一定意味着实现有缺陷。",
        }, [observed], "provisional"));
        addIfNew(station, result, question(station, "replicate", subject, episodeId, observed));
      }
      return result;
    }
    if (current.kind === "replicate") {
      const prior = evidenceById(station, current.observationId);
      if (!prior || prior.subjectId !== subject.id || prior.measurement.holds) throw new Error("Missing prior counterexample");
      const exact = await observe(prior.input, "confirmation");
      const fresh = await observe(subject.generate(freshSeed(station, subject, "confirmation")), "confirmation");
      const confirmed = !exact.measurement.holds;
      result.verdict = confirmed ? "confirmed" : "not-reproduced";
      const previousLesson = station.lessons.find((item) => item.subjectId === subject.id && item.kind === "counterexample" && item.evidenceIds.includes(prior.id));
      result.lessons.push(lesson(episodeId, subject, confirmed ? "confirmation" : "refutation", confirmed ? {
        en: "The original legal counterexample reproduced. This establishes existence, not failure on every input.",
        zh: "原合法反例已复现。这证明反例存在，不表示每个输入都失败。",
      } : {
        en: "The exact original input did not reproduce its earlier counterexample. Suspend that witness claim, not all other possible findings.",
        zh: "完全相同的原输入未复现先前反例。暂停该反例声明，而非否定其他可能发现。",
      }, [exact], confirmed ? "confirmed" : "refuted", previousLesson?.id));
      if (confirmed) {
        addIfNew(station, result, question(station, "minimize", subject, episodeId, exact));
        if (fresh.measurement.holds) result.lessons.push(lesson(episodeId, subject, "limit", {
          en: "The fresh input was healthy. The confirmed counterexample remains valid, but its scope must not be generalized to all inputs.",
          zh: "新输入健康。已确认反例仍然有效，但不能把其作用域泛化到所有输入。",
        }, [exact, fresh], "confirmed"));
      } else if (!fresh.measurement.holds) {
        result.lessons.push(lesson(episodeId, subject, "counterexample", {
          en: "A different fresh input supplies a new provisional counterexample; confirm it separately.",
          zh: "另一个新输入给出新的暂定反例，需要独立确认。",
        }, [fresh], "provisional"));
        addIfNew(station, result, question(station, "replicate", subject, episodeId, fresh));
      }
      return result;
    }
    if (current.kind === "minimize") {
      const prior = evidenceById(station, current.observationId);
      if (!prior || prior.subjectId !== subject.id || prior.measurement.holds) throw new Error("Missing confirmed witness");
      const allowance = Math.max(0, Math.floor((meter.limit - meter.used) * 0.55));
      const synthesized = await synthesizeReducer(prior.input, subject.valid, async (input) => {
        const value = await observe(input, "tool-training");
        return !value.measurement.holds;
      }, allowance);
      if (!synthesized.program) {
        result.verdict = "no-change";
        result.lessons.push(lesson(episodeId, subject, "limit", {
          en: `No useful reducer was found within ${synthesized.calls} calls and ${synthesized.trials} candidates. This is a search limit, not evidence of impossibility.`,
          zh: `在 ${synthesized.calls} 次调用、${synthesized.trials} 个候选内未找到有效缩减器。这是搜索边界，不是不可能性证明。`,
        }, result.observations, "provisional"));
        return result;
      }
      const digest = researchDigest(synthesized.program);
      const existing = station.tools.find((tool) => tool.digest === digest && tool.status === "certified");
      if (existing) {
        result.verdict = "no-change";
        result.lessons.push(lesson(episodeId, subject, "limit", {
          en: "The synthesized program already exists. Do not count a renamed artifact as a new tool; test reuse instead.",
          zh: "综合所得程序已经存在。不把改名制品计为新工具，改为检验复用。",
        }, result.observations, "confirmed"));
        transferQuestions(station, result, existing, [...catalog.values()], episodeId);
        return result;
      }
      const evaluation = await certify(synthesized.program, subject, subject.generate(freshSeed(station, subject, `validation:${digest}`)));
      const tool: ResearchTool = {
        id: `tool-${digest.slice(0, 16)}-evaluation-${researchDigest(episodeId).slice(0, 8)}`, program: synthesized.program, digest,
        source: renderReducerSource(synthesized.program), createdByEpisodeId: episodeId,
        trainingSubjectId: subject.id, status: evaluation.accepted ? "certified" : "rejected", evaluation, reusedOnSubjectIds: [],
      };
      result.tool = tool;
      result.verdict = evaluation.accepted ? "tool-certified" : "tool-rejected";
      result.lessons.push(lesson(episodeId, subject, "tool", {
        en: evaluation.accepted ? "A synthesized bounded reducer preserved a fresh counterexample, reduced input complexity and rejected a healthy control." : "The candidate did not meet independent preservation, reduction and healthy-control checks. It is not reusable evidence.",
        zh: evaluation.accepted ? "综合的有界缩减器保留新反例、降低输入复杂度，并拒绝健康对照。" : "候选未满足独立的反例保留、缩减与健康对照检查，不作为可复用证据。",
      }, result.observations, evaluation.accepted ? "confirmed" : "refuted"));
      result.lessons.at(-1)!.evidenceIds = [...new Set([...result.lessons.at(-1)!.evidenceIds, ...evaluation.observationIds])];
      if (evaluation.accepted) transferQuestions(station, result, tool, [...catalog.values()], episodeId);
      return result;
    }
    const tool = station.tools.find((item) => item.id === current.toolId && item.status === "certified");
    if (!tool || tool.digest !== researchDigest(tool.program)) throw new Error("Missing immutable certified tool");
    const fresh = subject.generate(freshSeed(station, subject, `transfer:${tool.digest}`));
    const measured = await observe(fresh, "transfer");
    if (measured.measurement.holds) {
      result.verdict = "no-change";
      result.lessons.push(lesson(episodeId, subject, "limit", {
        en: "No counterexample was observed on the transfer input. Reuse is not claimed.",
        zh: "迁移输入未观察到反例，不宣称工具复用成功。",
      }, [measured], "provisional"));
      return result;
    }
    const evaluation = await certify(tool.program, subject, fresh);
    result.verdict = evaluation.accepted ? "transferred" : "tool-rejected";
    result.lessons.push(lesson(episodeId, subject, "transfer", {
      en: evaluation.accepted ? "The exact same frozen program reduced a counterexample in another subject without modification." : "The frozen tool did not transfer with measurable reduction. Preserve this negative result.",
      zh: evaluation.accepted ? "完全相同的冻结程序在另一个研究对象上缩小了反例，未修改程序。" : "冻结工具未以可测缩减迁移到此对象，保留该负性结果。",
    }, [measured], evaluation.accepted ? "confirmed" : "refuted"));
    result.lessons.at(-1)!.evidenceIds = [...new Set([...result.lessons.at(-1)!.evidenceIds, ...evaluation.observationIds])];
    if (evaluation.accepted) result.reusedTool = { toolId: tool.id, subjectId: subject.id };
    addIfNew(station, result, question(station, "replicate", subject, episodeId, measured));
    return result;
  };
}

function hypothesisQuestion(station: ResearchStation, subject: ResearchSubject, kind: "induce" | "falsify" | "audit-hypothesis",
  episodeId: string, hypothesisId?: string, trainingDigest?: string): ResearchQuestion {
  const value = question(station, kind, subject, episodeId);
  value.id = `question-${researchDigest({ kind, subjectId: subject.id, subjectVersion: subject.version, hypothesisId: hypothesisId ?? null, trainingDigest: trainingDigest ?? null }).slice(0, 24)}`;
  if (hypothesisId) value.hypothesisId = hypothesisId;
  value.priority = kind === "falsify" ? 280 : kind === "audit-hypothesis" ? 260 : 180;
  value.reasonCode = kind === "induce" ? "contrasting-data-supports-a-testable-condition" : kind === "falsify" ? "frozen-condition-needs-counterexamples" : "feedback-phase-survived-audit-remains-one-shot";
  return value;
}

function lineage(station: ResearchStation, hypothesis: ResearchHypothesis): ResearchHypothesis[] {
  const result: ResearchHypothesis[] = [];
  const seen = new Set<string>();
  let current: ResearchHypothesis | undefined = hypothesis;
  while (current && !seen.has(current.id)) {
    seen.add(current.id); result.push(current);
    current = (station.hypotheses ?? []).find((item) => item.id === current!.parentHypothesisId);
  }
  return result;
}

/** Only actual contrasting observations create an induction opportunity; no round-number script. */
function proposeInductionQuestions(station: ResearchStation, result: EpisodeResult, subjects: readonly ResearchSubject[], episodeId: string): void {
  const observations = station.episodes.flatMap((episode) => episode.observations);
  const hypotheses = [...(station.hypotheses ?? []), ...(result.hypothesis ? [result.hypothesis] : [])];
  if (hypotheses.length >= 16) return;
  for (const subject of subjects) {
    if (result.questions.length >= 8) break;
    if (!station.subjectIds.includes(subject.id) || station.questions.some((item) => item.subjectId === subject.id && item.kind === "induce" && ["pending", "running"].includes(item.status))) continue;
    const parent = hypotheses.filter((item) => item.subjectId === subject.id).at(-1);
    if (parent) {
      if (result.hypothesis?.id === parent.id) continue;
      const chain = lineage(station, parent);
      const ids = new Set(chain.map((item) => item.id));
      const refuted = (station.hypothesisEvaluations ?? []).some((receipt) => receipt.hypothesisId === parent.id && receipt.phase === "falsification" && receipt.status === "refuted");
      const audited = station.episodes.some((episode) => episode.hypothesisEvaluationAttempt?.phase === "audit" && ids.has(episode.hypothesisEvaluationAttempt.hypothesisId));
      if (!refuted || audited || chain.length >= 4) continue;
    }
    const snapshot = buildTrainingSnapshot(observations, subject);
    const fit = snapshot.status === "ready" ? fitConditional(snapshot.examples) : null;
    if (!fit?.hypothesis || fit.status !== "proposed" || (parent && researchDigest(fit.hypothesis) === parent.programDigest)) continue;
    addIfNew(station, result, hypothesisQuestion(station, subject, "induce", episodeId, parent?.id, snapshot.digest));
  }
}

export function createResearchRunner(subjects: readonly ResearchSubject[]): EpisodeRunner {
  const protocol = createProtocolRunner(subjects);
  const catalog = new Map(subjects.map((subject) => [subject.id, subject]));
  return async (station, current, episodeId, meter) => {
    const subject = catalog.get(current.subjectId);
    if (!subject || station.subjectVersions[subject.id] !== subject.version) throw new Error("Research subject version changed");
    let result = empty();
    if (current.kind === "induce") {
      const snapshot = buildTrainingSnapshot(station.episodes.flatMap((episode) => episode.observations), subject);
      const fitted = snapshot.status === "ready" ? fitConditional(snapshot.examples) : null;
      const previous = current.hypothesisId ? (station.hypotheses ?? []).find((item) => item.id === current.hypothesisId) : undefined;
      const alreadyHasRoot = !previous && (station.hypotheses ?? []).some((item) => item.subjectId === subject.id);
      if (!fitted?.hypothesis || fitted.status !== "proposed" || alreadyHasRoot) {
        result.verdict = "no-change";
        // The kernel records state/selection reason; no candidate-authored scientific lesson is issued.
      } else {
        const hypothesis = proposeHypothesis(subject, snapshot, fitted.hypothesis, episodeId, previous?.id ?? null);
        result.hypothesis = hypothesis;
        result.verdict = "hypothesis-proposed";
        result.lessons.push(formatHypothesisLesson(episodeId, subject, hypothesis));
        addIfNew(station, result, hypothesisQuestion(station, subject, "falsify", episodeId, hypothesis.id));
      }
    } else if (current.kind === "falsify" || current.kind === "audit-hypothesis") {
      const hypothesis = (station.hypotheses ?? []).find((item) => item.id === current.hypothesisId);
      if (!hypothesis || !meter.evaluateHypothesis) throw new Error("A persisted hypothesis and kernel evaluator are required");
      const phase = current.kind === "falsify" ? "falsification" : "audit";
      const evaluation = await meter.evaluateHypothesis(hypothesis.id, phase);
      result.hypothesisEvaluation = evaluation;
      result.verdict = evaluation.status === "refuted" ? "hypothesis-refuted" : evaluation.status === "survived-budget" ? "hypothesis-survived" : "inconclusive";
      result.lessons.push(formatHypothesisLesson(episodeId, subject, hypothesis, evaluation));
      if (phase === "falsification" && evaluation.status === "survived-budget") {
        addIfNew(station, result, hypothesisQuestion(station, subject, "audit-hypothesis", episodeId, hypothesis.id));
      } else if (phase === "falsification" && evaluation.status === "refuted" && lineage(station, hypothesis).length < 4) {
        addIfNew(station, result, hypothesisQuestion(station, subject, "induce", episodeId, hypothesis.id));
      }
    } else {
      result = await protocol(station, current, episodeId, meter);
    }
    return result;
  };
}

/** Kernel-only post-episode planning: includes every actual/private observation, never a candidate subset. */
export function derivePostEpisodeInduction(
  station: ResearchStation, subjects: readonly ResearchSubject[], episodeId: string, remainingSlots: number,
): ResearchQuestion[] {
  if (!Number.isSafeInteger(remainingSlots) || remainingSlots <= 0 || station.status === "paused" ||
    station.episodes.length >= station.policy.maxEpisodes || station.budget.spentCalls + station.budget.reservedCalls >= station.policy.maxOracleCalls) return [];
  const derived = empty();
  proposeInductionQuestions(station, derived, subjects, episodeId);
  return derived.questions.slice(0, Math.min(8, remainingSlots)).map((value) => ({
    ...value, createdAtRound: station.episodes.length,
  }));
}
