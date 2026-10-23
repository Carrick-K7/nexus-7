import { CognitiveGateway } from "@/symbiosis/cognition";
import { createInitialWorld, cognitiveCandidatesForTurn, replayWorld } from "@/symbiosis/engine";
import { createCampaignInitialWorld, runHypothesisCampaign } from "@/symbiosis/campaign";
import { rolloverSeason } from "@/symbiosis/season";
import type { Json, ResearchSubject } from "./contracts";
import { canonical, researchDigest } from "./integrity";

// These adapters call pure/in-memory original code. Never import a server factory here.
function object(input: Json): Record<string, Json> | null {
  return input !== null && typeof input === "object" && !Array.isArray(input) ? input : null;
}
function integer(value: Json | undefined, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
function text(value: Json | undefined, maximum = 40): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum && /^[a-z0-9-]+$/i.test(value);
}
function variation(seed: string): number {
  return Number.parseInt(researchDigest(seed).slice(0, 6), 16);
}

const reportIdentity: ResearchSubject = {
  id: "campaign-content-identity", version: "legacy-v4.10.1-probe-v1", family: "evidence-serialization",
  origin: "known-audit-seed", interpretation: "declared-contract",
  title: { en: "Reproduction identity", zh: "复现身份" },
  claim: { en: "Equal scientific results keep the reproduction digest when only execution time changes.", zh: "只改变执行时间时，相同科学结果应保持复现摘要。" },
  generate: (seed) => ({ turns: 2 + variation(seed) % 3, offset: 100 + variation(seed) % 800, seed: researchDigest(seed).slice(0, 12) }),
  valid(input) {
    const value = object(input);
    return !!value && Object.keys(value).length === 3 && integer(value.turns, 1, 6) && integer(value.offset, 1, 1_000) && text(value.seed);
  },
  async measure(input) {
    const value = input as { turns: number; offset: number; seed: string };
    const definition = {
      id: "research-content-identity", version: "1.0.0", lockedAt: "2026-10-20T00:00:00.000Z",
      turnsPerRun: value.turns, seeds: [value.seed],
      regimes: [{ id: "unchanged", label: { en: "Unchanged", zh: "不变" }, description: "Isolated instrumentation", policy: {} }],
      hypotheses: [{ id: "instrument-only", prediction: "Record results without promotion", analysis: "No production effect" }],
      command: "reference instrumentation, not a published campaign",
      evaluate: () => [{ passed: true, observed: "instrumentation-only" }],
    };
    const first = await runHypothesisCampaign(definition, { generatedAt: "2026-10-20T00:00:00.000Z" });
    const second = await runHypothesisCampaign(definition, { generatedAt: new Date(Date.parse(first.generatedAt) + value.offset).toISOString() });
    const resultsEqual = first.integrity.resultsSha256 === second.integrity.resultsSha256;
    const reproductionDigestEqual = first.integrity.reportSha256 === second.integrity.reportSha256;
    return { holds: resultsEqual && reproductionDigestEqual, code: "scientific-content-versus-execution-envelope", facts: { resultsEqual, reproductionDigestEqual, turns: value.turns } };
  },
};

const calendar: ResearchSubject = {
  id: "season-calendar-continuity", version: "legacy-v4.10.1-probe-v1", family: "calendar-state-transition",
  origin: "known-audit-seed", interpretation: "declared-contract",
  title: { en: "Season calendar continuity", zh: "赛季日期连续性" },
  claim: { en: "The next season starts on its archive's declared next date.", zh: "下一赛季应从档案声明的下一日期开始。" },
  generate: (seed) => ({ turns: 2 + variation(seed) % 5, quarter: 1 + variation(seed) % 4 }),
  valid(input) {
    const value = object(input);
    return !!value && Object.keys(value).length === 2 && integer(value.turns, 1, 8) && integer(value.quarter, 1, 4);
  },
  async measure(input) {
    const value = input as { turns: number; quarter: number };
    const previous = replayWorld(createInitialWorld({ seasonId: `symbiotic-shenzhen-season-2026-q${value.quarter}` }), value.turns);
    const next = rolloverSeason(previous, { archivedAt: "2026-10-20T00:00:00.000Z" });
    return {
      holds: next.next.season.startDate === next.archive.nextStartDate,
      code: "archive-and-genesis-date-agreement",
      facts: { previous: previous.turn.simulationDate, declaredNext: next.archive.nextStartDate, actualNext: next.next.season.startDate },
    };
  },
};

const budget: ResearchSubject = {
  id: "zero-budget-no-dispatch", version: "legacy-v4.10.1-probe-v1", family: "resource-admission",
  origin: "known-audit-seed", interpretation: "declared-contract",
  title: { en: "Zero-budget admission", zh: "零预算准入" },
  claim: { en: "A zero budget dispatches no provider request, even before any spend.", zh: "预算为零时，即使尚无支出也不得分发 provider 请求。" },
  generate: (seed) => ({ turn: 2 + variation(seed) % 29, conflict: variation(seed) % 100 }),
  valid(input) {
    const value = object(input);
    return !!value && Object.keys(value).length === 2 && integer(value.turn, 1, 60) && integer(value.conflict, 0, 100);
  },
  async measure(input) {
    const value = input as { turn: number; conflict: number };
    const world = createInitialWorld();
    const candidate = cognitiveCandidatesForTurn(world.season, world.residents, world.snapshot)[0];
    candidate.turn = value.turn;
    candidate.context.relationshipConflict = value.conflict;
    let calls = 0;
    const gateway = new CognitiveGateway({
      id: "research-in-memory-fake", external: false,
      async decide() {
        calls++;
        return { provider: "research-in-memory-fake", model: "fixture-not-a-live-model", mode: "non-thinking" as const,
          finalAnswer: { disposition: "engage" as const, action: "negotiate-shared-community-task" as const, reasonCode: "audit-fixture" },
          inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 };
      },
    }, { monthlyCapUsd: 0, routineReductionThreshold: 0.7, proRestrictionThreshold: 0.9 });
    await gateway.decide(candidate, 0);
    return { holds: calls === 0, code: "zero-cap-provider-dispatch", facts: { fakeCalls: calls, actualModelCalls: 0, actualCostUsd: 0 } };
  },
};

const labelInvariance: ResearchSubject = {
  id: "campaign-label-invariance", version: "legacy-v4.10.1-probe-v1", family: "experimental-randomization",
  origin: "known-audit-seed", interpretation: "exploratory-hypothesis",
  title: { en: "Label invariance", zh: "标签不变性" },
  claim: { en: "Changing an administrative scenario label alone leaves paired relationship outcomes unchanged.", zh: "只更改场景管理标签，配对关系结局应保持不变。" },
  generate: (seed) => ({ turns: 3 + variation(seed) % 4, label: `variant-${researchDigest(seed).slice(0, 10)}`, seed: researchDigest(seed).slice(0, 12) }),
  valid(input) {
    const value = object(input);
    return !!value && Object.keys(value).length === 3 && integer(value.turns, 1, 8) && text(value.label, 24) && value.label !== "control" && text(value.seed);
  },
  async measure(input) {
    const value = input as { turns: number; label: string; seed: string };
    const run = (label: string) => {
      const result = replayWorld(createCampaignInitialWorld({ seasonId: label, seed: value.seed, policy: {} }), value.turns);
      return result.reciprocalEpisodes.map((episode) => ({
        outcome: episode.outcome, negotiation: episode.negotiation,
        dispositions: episode.preferences.map((preference) => preference.disposition),
      }));
    };
    const control = run("control");
    const candidate = run(value.label);
    const equivalent = canonical(control) === canonical(candidate);
    return { holds: equivalent, code: "label-randomness-hypothesis", facts: { equivalent, controlDigest: researchDigest(control), candidateDigest: researchDigest(candidate), comparedEpisodes: control.length } };
  },
};

const floatingPoint: ResearchSubject = {
  id: "sum-grouping-hypothesis", version: "ieee754-instrument-v1", family: "numeric-aggregation",
  origin: "generated-challenge", interpretation: "exploratory-hypothesis",
  title: { en: "Aggregation order hypothesis", zh: "聚合顺序假设" },
  claim: { en: "Reordering a finite floating-point sum leaves its exact result unchanged.", zh: "重新排列有限浮点求和的顺序，其精确结果保持不变。" },
  generate: (seed) => [100_000_000 + variation(seed), -(100_000_000 + variation(seed)), 0.0000001, 0.0000002, 0.0000003],
  valid: (input) => Array.isArray(input) && input.length >= 2 && input.length <= 12 && input.every((item) => typeof item === "number" && Number.isFinite(item) && Math.abs(item) <= 1_000_000_000),
  async measure(input) {
    const values = input as number[];
    const sum = (numbers: number[]) => numbers.reduce((total, item) => total + item, 0);
    const original = sum(values);
    const reordered = sum([...values].sort((left, right) => Math.abs(left) - Math.abs(right)));
    return { holds: original === reordered, code: "finite-precision-hypothesis-not-a-production-bug", facts: { original, reordered, difference: Math.abs(original - reordered) } };
  },
};

const healthy: ResearchSubject = {
  id: "integer-sum-control", version: "bounded-integer-control-v1", family: "exact-aggregation-control",
  origin: "generated-challenge", interpretation: "declared-contract",
  title: { en: "Healthy integer control", zh: "健康整数对照" },
  claim: { en: "A bounded integer sum is invariant under permutation.", zh: "有界整数求和在置换下保持不变。" },
  generate: (seed) => [variation(seed) % 101, -31, 5, 29, -17],
  valid: (input) => Array.isArray(input) && input.length >= 1 && input.length <= 12 && input.every((item) => typeof item === "number" && Number.isSafeInteger(item) && Math.abs(item) <= 1_000),
  async measure(input) {
    const values = input as number[];
    const left = values.reduce((total, value) => total + value, 0);
    const right = [...values].reverse().reduce((total, value) => total + value, 0);
    return { holds: left === right, code: "healthy-exact-sum-control", facts: { left, right } };
  },
};

export const RESEARCH_SUBJECTS: readonly ResearchSubject[] = [reportIdentity, calendar, budget, labelInvariance, floatingPoint, healthy];
export function researchSubject(id: string): ResearchSubject {
  const subject = RESEARCH_SUBJECTS.find((candidate) => candidate.id === id);
  if (!subject) throw new Error("Unknown research subject");
  return subject;
}
