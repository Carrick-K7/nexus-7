import type { HumanAtom, HumanCondition, HumanFeature, HumanRule } from "@/research/human-contracts";
import type { HumanLanguage } from "./format";

function atomText(atom: HumanAtom, language: HumanLanguage): string {
  const { feature, op, threshold } = atom;
  const zh = language === "zh";
  if (feature === "length" || feature === "nonIntegerCount") {
    const integer = op === "lte" ? Math.floor(threshold) : Math.floor(threshold) + 1;
    if (feature === "length") return zh
      ? `这组${op === "lte" ? "最多" : "至少"}有 ${integer} 个数`
      : `the group has ${op === "lte" ? "at most" : "at least"} ${integer} numbers`;
    if (op === "lte" && integer === 0) return zh ? "这一组全是整数" : "every number in the group is an integer";
    return zh ? `这组${op === "lte" ? "最多" : "至少"}有 ${integer} 个带小数部分的数`
      : `the group has ${op === "lte" ? "at most" : "at least"} ${integer} non-integers`;
  }
  const featureText = {
    min: { zh: "其中最小的数", en: "the smallest number" },
    max: { zh: "其中最大的数", en: "the largest number" },
    maxAbs: { zh: "忽略正负号后最大的数", en: "the largest number when signs are ignored" },
    nonZeroOrderSpan: { zh: "非零数字之间相差的十进制数量级", en: "the decimal order-of-magnitude span of nonzero numbers" },
  }[feature];
  return zh ? `${featureText.zh}${op === "lte" ? "不大于" : "大于"} ${threshold}`
    : `${featureText.en} is ${op === "lte" ? "at most" : "greater than"} ${threshold}`;
}

export function conditionText(condition: HumanCondition, language: HumanLanguage): string {
  if ("feature" in condition) return atomText(condition, language);
  const join = language === "zh" ? condition.op === "and" ? "，并且" : "；或者" : condition.op === "and" ? ", and " : "; or ";
  return `${atomText(condition.left, language)}${join}${atomText(condition.right, language)}`;
}

/** Exact, compact presentation of a validated predicate; never re-evaluates its input. */
export function compactCondition(condition: HumanCondition, language: HumanLanguage): string {
  const zh = language === "zh";
  const numeric = (value: number) => Math.abs(value) >= 0.001 && Math.abs(value) < 1e21
    ? value.toLocaleString(zh ? "zh-CN" : "en-US", { maximumSignificantDigits: 21 }) : String(value);
  const atom = ({ feature, op, threshold }: HumanAtom) => {
    const integerFeature = feature === "length" || feature === "nonIntegerCount";
    // Counts are integers. Never round a continuous feature or an unsafe integer bound.
    const integerBound = Math.floor(threshold) + (op === "gt" ? 1 : 0);
    const simplifyCount = integerFeature && Number.isSafeInteger(integerBound);
    const value = simplifyCount ? integerBound : threshold;
    if (feature === "nonIntegerCount" && op === "lte" && value === 0) return zh ? "全部为整数" : "All integers";
    const label = {
      length: zh ? "数量" : "Count", nonIntegerCount: zh ? "非整数数量" : "Non-integer count",
      min: zh ? "最小值" : "Minimum", max: zh ? "最大值" : "Maximum",
      maxAbs: zh ? "最大绝对值" : "Maximum absolute value", nonZeroOrderSpan: zh ? "非零数数量级跨度" : "Nonzero order-of-magnitude span",
    }[feature];
    const operator = op === "lte" ? "≤" : simplifyCount ? "≥" : ">";
    return `${label}${zh ? "" : " "}${operator}${numeric(value)}`;
  };
  if ("feature" in condition) return atom(condition);
  const join = zh ? condition.op === "and" ? " 且 " : " 或 " : condition.op === "and" ? " AND " : " OR ";
  return `${atom(condition.left)}${join}${atom(condition.right)}`;
}

export function compactRule(rule: HumanRule, language: HumanLanguage): string {
  const condition = compactCondition(rule.condition, language);
  const scoped = "feature" in rule.condition ? condition : `(${condition})`;
  return language === "zh" ? `${scoped}：预测${rule.expectedEqual ? "相同" : "不同"}`
    : `${scoped}: predicts ${rule.expectedEqual ? "equal" : "different"} results`;
}

/** Conceptual reading of the known original rule shape; no production threshold is hardcoded. */
export function originalIdea(rule: HumanRule, language: HumanLanguage): string | null {
  const condition = rule.condition;
  if (rule.expectedEqual && "left" in condition && condition.op === "or") {
    const atoms = [condition.left, condition.right];
    if (atoms.some((a) => a.feature === "min" && a.op === "gt") &&
        atoms.some((a) => a.feature === "length" && a.op === "lte")) {
      return language === "zh"
        ? "它原先按数字大小或数量，判断换顺序后是否会得到相同答案。这组数字符合它当时的条件，它预计两次答案相同。"
        : "Its original guess predicted equal answers when either a size condition or a count condition was met. This group met its conditions, so it predicted equal answers.";
    }
  }
  return briefRule(rule, language);
}

const featureConcepts: Record<HumanFeature, { zh: string; en: string }> = {
  length: { zh: "一共有几个数", en: "how many numbers there are" },
  nonIntegerCount: { zh: "有几个数带小数部分", en: "how many numbers have a fractional part" },
  min: { zh: "最小的数有多小", en: "how small the smallest number is" },
  max: { zh: "最大的数有多大", en: "how large the largest number is" },
  maxAbs: { zh: "忽略正负号后最大的数有多大", en: "how large the largest number is when signs are ignored" },
  nonZeroOrderSpan: { zh: "非零数的大小相差多悬殊", en: "how widely the nonzero numbers differ in size" },
};

function knownAtom(value: unknown): value is HumanAtom {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const atom = value as Record<string, unknown>;
  return Object.keys(atom).length === 3 && typeof atom.feature === "string" && Object.hasOwn(featureConcepts, atom.feature) &&
    (atom.op === "gt" || atom.op === "lte") && typeof atom.threshold === "number" && Number.isFinite(atom.threshold);
}

/** Explain known features and the actual connective, without inventing a numeric cutoff. */
export function conceptualRule(rule: HumanRule, language: HumanLanguage): string | null {
  if (!rule || typeof rule.expectedEqual !== "boolean" || !rule.condition || typeof rule.condition !== "object") return null;
  const condition = rule.condition;
  const single = knownAtom(condition);
  if (!single && (!("left" in condition) || Object.keys(condition).length !== 3 ||
      (condition.op !== "and" && condition.op !== "or") || !knownAtom(condition.left) || !knownAtom(condition.right))) return null;
  const atoms = single ? [condition] : [condition.left, condition.right];
  const names = atoms.map((atom) => featureConcepts[atom.feature][language]);
  const both = !single && condition.op === "and";
  if (language === "zh") {
    const subjects = single ? `「${names[0]}」` : `「${names[0]}」${both ? "和" : "或"}「${names[1]}」`;
    const requirement = single ? "满足这项判断的门槛时" : both ? "两项条件同时满足时" : "满足其中一种条件时";
    return `它改成${both ? "同时" : ""}看${subjects}；${requirement}，预计两次结果${rule.expectedEqual ? "相同" : "不同"}。具体门槛在下面。`;
  }
  const subjects = names.join(both ? " and " : " or ");
  const requirement = single ? "When that condition is met" : both ? "When both conditions are met" : "When either condition is met";
  return `It now considers ${subjects}. ${requirement}, it predicts ${rule.expectedEqual ? "equal" : "different"} results. The exact cutoffs are below.`;
}

/** This special sentence is gated by the whole known rule, not a feature label. */
export function briefRule(rule: HumanRule, language: HumanLanguage): string | null {
  const condition = rule.condition;
  if (rule.expectedEqual && "left" in condition && condition.op === "or") {
    const atoms = [condition.left, condition.right];
    if (atoms.some((a) => a.feature === "length" && a.op === "lte" && a.threshold === 2.5) &&
        atoms.some((a) => a.feature === "nonIntegerCount" && a.op === "lte" && a.threshold === 0.5)) {
      return language === "zh" ? "在这次允许测试的范围内，只有两个数，或者这一组全是整数时，换顺序也应得到同样结果。"
        : "Within the allowed test range, if there are just two numbers, or all the numbers are integers, changing the order should give the same result.";
    }
  }
  const atoms = "feature" in condition ? [condition] : [condition.left, condition.right];
  if (atoms.some((a) => a.feature === "nonZeroOrderSpan" || Math.abs(a.threshold) > 1000 ||
      (a.threshold !== 0 && Math.abs(a.threshold) < 0.001))) return null;
  return language === "zh"
    ? `如果${conditionText(condition, language)}，就预计两次结果${rule.expectedEqual ? "相同" : "不同"}。`
    : `If ${conditionText(condition, language)}, it predicts ${rule.expectedEqual ? "equal" : "different"} results.`;
}
