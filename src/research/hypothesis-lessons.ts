import type { HypothesisEvaluation, ResearchHypothesis, ResearchLesson, ResearchSubject } from "./contracts";
import { researchDigest } from "./integrity";

/** Scientific claim status/text come from kernel facts, never a candidate's self-assessment. */
export function formatHypothesisLesson(
  episodeId: string,
  subject: ResearchSubject,
  hypothesis: ResearchHypothesis,
  evaluation?: HypothesisEvaluation,
): ResearchLesson {
  const statement = !evaluation ? {
    en: "Observed input/outcome contrasts produced a conditional prediction. This is a frozen proposal, not a verified law.",
    zh: "输入与结果的真实对比产生了条件预测。这是冻结提案，不是已经证实的定律。",
  } : evaluation.status === "refuted" ? {
    en: "New legal inputs refuted this condition. The failed program and counterexamples remain part of the record.",
    zh: "新的合法输入反驳了该条件。失败程序和反例继续保留在记录中。",
  } : evaluation.status === "survived-budget" ? {
    en: "No contradiction was found within this finite sample budget. The hypothesis remains unproven; later healthy samples cannot erase a prior refutation.",
    zh: "有限采样预算内未找到矛盾。命题仍未被证明；后续健康样本不能抹去先前否证。",
  } : {
    en: "Fresh-input, scope or fuel coverage was insufficient. No successful scientific claim is authorized.",
    zh: "新输入、作用域或燃料覆盖不足。不授权成功的科学结论。",
  };
  return {
    id: `lesson-${researchDigest({ episodeId, kind: "hypothesis", subjectId: subject.id }).slice(0, 24)}`,
    subjectId: subject.id,
    kind: "hypothesis",
    statement,
    evidenceIds: [hypothesis.id, ...(evaluation?.observationIds ?? [])],
    episodeId,
    applicability: `${subject.id}@${subject.version}; ${subject.interpretation}; ${subject.origin}`,
    status: evaluation?.status === "refuted" ? "refuted" : "provisional",
  };
}

export function formatResearchLimitLesson(episodeId: string, subjectId: string, code: string): ResearchLesson {
  return {
    id: `${episodeId}:limit`, subjectId, kind: "limit",
    statement: {
      en: `Research was inconclusive (${code}); no scientific success is claimed.`,
      zh: `研究未得出结论（${code}）；不宣称科学成功。`,
    },
    evidenceIds: [episodeId], episodeId, applicability: code, status: "provisional",
  };
}
