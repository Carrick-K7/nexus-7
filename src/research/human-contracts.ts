/** Versioned, read-only facts for a human explanation; all prose belongs to the UI.
 * Transport failure is NOT a study state: an unsuccessful HTTP read has no overview.
 * `running` means the ledger permits more work, never an OS/process heartbeat.
 */
export const HUMAN_OVERVIEW_SCHEMA = "nexus.research-human.v1" as const;

export type HumanFeature = "length" | "nonIntegerCount" | "min" | "max" | "maxAbs" | "nonZeroOrderSpan";
export interface HumanAtom { op: "lte" | "gt"; feature: HumanFeature; threshold: number }
export type HumanCondition = HumanAtom | { op: "and" | "or"; left: HumanAtom; right: HumanAtom };
export interface HumanRule { expectedEqual: boolean; condition: HumanCondition }
export type HumanEvaluationStatus = "refuted" | "survived-budget" | "inconclusive";
export interface HumanEvaluation {
  phase: "falsification" | "audit";
  status: HumanEvaluationStatus;
  /** Internal measurements, NOT HTTP requests or model calls. */
  calls: number;
  inScope: number;
  outOfScope: number;
  allowance: number;
  episodeId: string;
  observationIds: string[];
  counterexampleIds: string[];
}
export interface HumanHypothesis {
  id: string;
  rule: HumanRule;
  /** Any historical refutation takes precedence over later healthy samples. */
  status: HumanEvaluationStatus | "pending";
  evaluations: HumanEvaluation[];
  evidence: {
    creationEpisodeId: string;
    programDigest: string;
    trainingDigest: string;
    trainingObservationIds: string[];
  };
}
export interface HumanStory {
  kind: "floating-point-sum-order";
  subject: { id: string; version: string };
  initial: HumanHypothesis & { status: "refuted" };
  counterexample: { observationId: string; input: number[]; original: number; reordered: number };
  revised: HumanHypothesis;
}
export type HumanStoryReason =
  | "no-study" | "no-hypotheses" | "unsupported-source" | "unsupported-version"
  | "unsupported-predicate" | "missing-reference" | "invalid-binding" | "invalid-receipt"
  | "unreliable-measurement" | "no-refutation" | "no-revision" | "invalid-data";
export interface HumanOverview {
  schemaVersion: typeof HUMAN_OVERVIEW_SCHEMA;
  /** When this snapshot was read, NOT when research last progressed. */
  readAt: string;
  source: {
    backend: "memory" | "postgres" | "unknown";
    releaseRevision: string | null;
    releaseEvidence: "deployment-env" | "local-unbound";
    stationRevision: number | null;
  };
  study: null | {
    state: "running" | "paused" | "idle" | "budget-exhausted" | "unknown";
    /** `oracle-budget` is the internal measurement cap, not monetary spend. */
    stopReason: "episode-cap" | "oracle-budget" | "human-paused" | "agenda-empty" | "unknown" | null;
    steps: number;
    stepLimit: number;
    measurements: number;
    reserved: number;
    measurementLimit: number;
    modelCalls: number;
    modelCostUsd: number;
    /** Last persisted completed episode, never a runtime heartbeat or updatedAt. */
    lastActivityAt: string | null;
    pendingQuestions: number;
    /** Inventory counts do not certify the truth of hypotheses or lesson text. */
    counts: { hypotheses: number; tools: number; lessons: number };
  };
  story: HumanStory | null;
  storyAvailability: { status: "available" | "pending" | "unavailable"; reason: HumanStoryReason | null };
}

/** Browser-safe wire validation only; scientific issuance is checked on the server.
 * Invalid/partial HTTP data is a transport/data error, never an empty or zero study.
 */
export function parseHumanOverview(value: unknown): HumanOverview | null {
  type RecordValue = Record<string, unknown>;
  const object = (v: unknown): v is RecordValue => v !== null && typeof v === "object" && !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null) &&
    Reflect.ownKeys(v).every((key) => typeof key === "string" && !!Object.getOwnPropertyDescriptor(v, key)?.enumerable &&
      Object.hasOwn(Object.getOwnPropertyDescriptor(v, key)!, "value"));
  const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const count = (v: unknown): v is number => number(v) && Number.isSafeInteger(v) && v >= 0;
  const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 1024;
  const timestamp = (v: unknown): boolean => text(v) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
  const choice = (v: unknown, choices: readonly string[]): boolean => typeof v === "string" && choices.includes(v);
  const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 20_000 && v.every(text) && new Set(v).size === v.length;
  const features = ["length", "nonIntegerCount", "min", "max", "maxAbs", "nonZeroOrderSpan"];
  const atom = (v: unknown): boolean => object(v) && Object.keys(v).length === 3 && choice(v.op, ["lte", "gt"]) &&
    choice(v.feature, features) && number(v.threshold);
  const rule = (v: unknown): boolean => {
    if (!object(v) || typeof v.expectedEqual !== "boolean" || !object(v.condition)) return false;
    return atom(v.condition) || Object.keys(v.condition).length === 3 && choice(v.condition.op, ["and", "or"]) && atom(v.condition.left) && atom(v.condition.right);
  };
  const statuses = ["refuted", "survived-budget", "inconclusive"];
  const evaluation = (v: unknown): v is HumanEvaluation => {
    if (!object(v) || !choice(v.phase, ["falsification", "audit"]) || !choice(v.status, statuses) || !text(v.episodeId) ||
      !count(v.calls) || !count(v.inScope) || !count(v.outOfScope) || !count(v.allowance) || !ids(v.observationIds) || !ids(v.counterexampleIds)) return false;
    return v.calls === v.inScope + v.outOfScope && v.calls === v.observationIds.length && v.calls <= v.allowance &&
      v.allowance <= (v.phase === "falsification" ? 24 : 32) && v.counterexampleIds.every((id) => (v.observationIds as string[]).includes(id)) &&
      (v.status === "refuted" ? v.counterexampleIds.length > 0 : v.counterexampleIds.length === 0) &&
      (v.status !== "survived-budget" || v.calls >= 8 && v.inScope >= 4 && v.outOfScope >= 4);
  };
  const hypothesis = (v: unknown): v is HumanHypothesis => {
    if (!object(v) || !text(v.id) || !rule(v.rule) || !choice(v.status, [...statuses, "pending"]) ||
      !object(v.evidence) || !text(v.evidence.creationEpisodeId) || !text(v.evidence.programDigest) || !text(v.evidence.trainingDigest) ||
      !ids(v.evidence.trainingObservationIds) || !Array.isArray(v.evaluations) || v.evaluations.length > 2 || !v.evaluations.every(evaluation)) return false;
    if (new Set(v.evaluations.map((item) => item.phase)).size !== v.evaluations.length) return false;
    const derived = v.evaluations.some((item) => item.status === "refuted") ? "refuted"
      : v.evaluations.some((item) => item.status === "inconclusive") ? "inconclusive" : v.evaluations.length ? "survived-budget" : "pending";
    return v.status === derived;
  };
  try {
    if (!object(value) || value.schemaVersion !== HUMAN_OVERVIEW_SCHEMA || !timestamp(value.readAt) || !object(value.source) ||
      !choice(value.source.backend, ["memory", "postgres", "unknown"]) || !choice(value.source.releaseEvidence, ["deployment-env", "local-unbound"]) ||
      !(value.source.stationRevision === null || count(value.source.stationRevision)) ||
      !(value.source.releaseRevision === null || typeof value.source.releaseRevision === "string" && /^[a-f0-9]{40}$/.test(value.source.releaseRevision)) ||
      (value.source.releaseEvidence === "deployment-env") !== (value.source.releaseRevision !== null)) return null;
    if (value.study === null) { if (value.source.stationRevision !== null) return null; }
    else {
      const s = value.study;
      if (!object(s) || !choice(s.state, ["running", "paused", "idle", "budget-exhausted", "unknown"]) ||
        !(s.stopReason === null || choice(s.stopReason, ["episode-cap", "oracle-budget", "human-paused", "agenda-empty", "unknown"])) ||
        ![s.steps, s.stepLimit, s.measurements, s.reserved, s.measurementLimit, s.modelCalls, s.pendingQuestions].every(count) ||
        !number(s.modelCostUsd) || s.modelCostUsd < 0 || !(s.lastActivityAt === null || timestamp(s.lastActivityAt)) ||
        !object(s.counts) || ![s.counts.hypotheses, s.counts.tools, s.counts.lessons].every(count) || !count(value.source.stationRevision)) return null;
      if ((s.steps as number) > (s.stepLimit as number) ||
        (s.measurements as number) + (s.reserved as number) > (s.measurementLimit as number)) return null;
      if (s.state === "running" && s.stopReason !== null || s.state === "paused" && s.stopReason !== "human-paused" ||
        s.state === "idle" && !["agenda-empty", "unknown"].includes(s.stopReason as string) ||
        s.state === "budget-exhausted" && !["episode-cap", "oracle-budget", "unknown"].includes(s.stopReason as string)) return null;
    }
    const availability = value.storyAvailability;
    const reasons: HumanStoryReason[] = ["no-study", "no-hypotheses", "unsupported-source", "unsupported-version", "unsupported-predicate", "missing-reference",
      "invalid-binding", "invalid-receipt", "unreliable-measurement", "no-refutation", "no-revision", "invalid-data"];
    if (!object(availability) || !choice(availability.status, ["available", "pending", "unavailable"])) return null;
    if (value.story === null) {
      if (availability.status === "available" || !choice(availability.reason, reasons)) return null;
    } else {
      const story = value.story;
      if (value.study === null || availability.status !== "available" || availability.reason !== null || !object(story) || story.kind !== "floating-point-sum-order" ||
        !object(story.subject) || story.subject.id !== "sum-grouping-hypothesis" || story.subject.version !== "ieee754-instrument-v1" ||
        !hypothesis(story.initial) || !hypothesis(story.revised) || story.initial.id === story.revised.id || story.initial.status !== "refuted" ||
        !story.initial.rule.expectedEqual || !object(story.counterexample)) return null;
      const c = story.counterexample;
      if (!text(c.observationId) || !Array.isArray(c.input) || c.input.length < 2 || c.input.length > 12 ||
        !c.input.every((item) => number(item) && Math.abs(item) <= 1_000_000_000) || !number(c.original) || !number(c.reordered) || c.original === c.reordered ||
        !story.initial.evaluations.some((item) => item.counterexampleIds.includes(c.observationId as string))) return null;
    }
    return value as unknown as HumanOverview;
  } catch { return null; }
}
