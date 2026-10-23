// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { HypothesisTrainingSnapshot, Json, Observation, OracleMeter, ResearchSubject } from "./contracts";
import { researchSubject } from "./catalog";
import { extractFeatures, fitConditional, predict, type Hypothesis } from "./induction";
import { assertResearchJson, canonical, researchDigest } from "./integrity";
import {
  buildTrainingSnapshot, evaluateHypothesis, HYPOTHESIS_EVALUATOR_VERSION,
  HYPOTHESIS_PHASE_ALLOWANCE, HYPOTHESIS_SAMPLING_PROTOCOL, proposeHypothesis, sampleHypothesisInputs, validateProposal,
} from "./hypotheses";

function numericSubject(threshold = 0): ResearchSubject {
  return {
    id: "controlled-hidden-number", version: "1", family: "controlled-test", origin: "generated-challenge",
    interpretation: "exploratory-hypothesis", title: { en: "Controlled number", zh: "受控数字" },
    claim: { en: "Controlled relation, not a natural bug", zh: "受控关系，不是自然缺陷" },
    generate: (seed) => ({ n: Number.parseInt(researchDigest(seed).slice(0, 8), 16) % 201 - 100 }),
    valid: (input) => input !== null && typeof input === "object" && !Array.isArray(input)
      && typeof input.n === "number" && Number.isFinite(input.n) && Math.abs(input.n) <= 1_024,
    async measure(input) { return { holds: (input as { n: number }).n <= threshold, code: "controlled-threshold", facts: {} }; },
  };
}
function condition(threshold = 0, expectedHolds = true, op: "lte" | "gt" = "lte"): Hypothesis {
  return { schemaVersion: "nexus.conditional-hypothesis.v1", when: { op, feature: "n:/n", threshold }, expectedHolds };
}
async function observe(subject: ResearchSubject, inputs: Json[], partition: Observation["partition"] = "hypothesis-training", prefix = "training"): Promise<Observation[]> {
  return Promise.all(inputs.map(async (input, index) => ({ id: `${prefix}-${index}`, subjectId: subject.id,
    subjectVersion: subject.version, input: structuredClone(input), inputDigest: researchDigest(input),
    partition, measurement: await subject.measure(structuredClone(input)) })));
}
const trainingInputs = [-8, -6, -4, -2, 2, 4, 6, 8].map((n) => ({ n }));
async function setup(subject = numericSubject(), inputs: Json[] = trainingInputs, program = condition()) {
  const observations = await observe(subject, inputs);
  const snapshot = buildTrainingSnapshot(observations, subject);
  const hypothesis = proposeHypothesis(subject, snapshot, program, "controlled-episode");
  return { subject, observations, snapshot, hypothesis };
}
function metered(limit = 100, options: { initialUsed?: number; afterCopy?: (used: number) => void; errorAt?: number } = {}) {
  let used = options.initialUsed ?? 0;
  const observations: Observation[] = [];
  const meter: OracleMeter = {
    get used() { return used; }, limit,
    async observe(target, input, partition) {
      if (used >= limit) throw new Error("Test fuel exhausted");
      used++;
      const copy = structuredClone(input);
      options.afterCopy?.(used);
      await Promise.resolve();
      if (options.errorAt === used) throw new Error("Controlled oracle failure");
      const observation = { id: `fresh-${used}`, subjectId: target.id, subjectVersion: target.version,
        input: copy, inputDigest: researchDigest(copy), partition, measurement: await target.measure(copy) };
      observations.push(observation);
      return observation;
    },
  };
  return { meter, observations };
}
function resign(snapshot: HypothesisTrainingSnapshot): HypothesisTrainingSnapshot {
  const { digest: _digest, ...content } = snapshot;
  void _digest;
  return { ...content, digest: researchDigest({ schemaVersion: "nexus.hypothesis-training.v1", ...content }) };
}

// Frozen diagnostic reference for v1's selector (source ee19cb735a57eeeaeda5b7982d60a81e7cd0abbc951795f42cc38ac5ef8cc5d2).
// Tests only: never an alternate evaluator or a way to rewrite historical v1 receipts.
function legacyDiagnosticSelection(subject: ResearchSubject, program: Hypothesis, seed: string) {
  const pool: Array<{ input: Json; features: Record<string, number>; order: number }> = [];
  const seen = new Set<string>();
  for (let index = 0; index < 256; index++) {
    const root = Math.floor(index / 4) % 16, operation = index % 4 + Math.floor(index / 64) * 4;
    const stride = 1 + Number.parseInt(researchDigest({ seed, baseIndex: root, protocol: "bounded-perturbation-v1" }).slice(0, 8), 16) % 17;
    const perturb = (value: Json): Json => {
      if (typeof value === "number") {
        switch (operation) {
          case 1: return Math.round(value); case 2: return value * 2;
          case 4: return value + stride; case 5: return value - stride; case 6: return value / 2;
          case 9: return Math.ceil(value); case 10: return Math.floor(value);
          case 11: return value * 10; case 12: return value / 10; case 15: return -value;
          default: return value;
        }
      }
      if (Array.isArray(value)) {
        const items = value.map(perturb);
        switch (operation) {
          case 3: return items.reverse(); case 7: return [...items, items.length ? structuredClone(items[0]) : 0];
          case 8: return items.slice(0, Math.floor(items.length / 2)); case 13: return items.slice(1);
          case 14: return items.length ? [...items.slice(1), items[0]] : items;
          default: return items;
        }
      }
      if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, perturb(child)]));
      return value;
    };
    try {
      const input = perturb(subject.generate(`${seed}:bounded-perturbation-v1:${root}`));
      assertResearchJson(input);
      const features = extractFeatures(input), digest = researchDigest(input);
      if (!seen.has(digest) && subject.valid(input)) { seen.add(digest); pool.push({ input, features, order: index }); }
    } catch { /* The frozen v1 protocol also rejected invalid/oversized candidates. */ }
  }
  const atoms = "left" in program.when ? [program.when.left, program.when.right] : [program.when];
  const distance = (features: Record<string, number>) => Math.min(...atoms.map((atom) => Object.hasOwn(features, atom.feature)
    ? Math.abs(features[atom.feature] - atom.threshold) / Math.max(1, Math.abs(atom.threshold)) : Infinity));
  const count = Math.min(24, pool.length), explorationCount = Math.ceil(count / 2);
  const exploration = pool.slice(0, explorationCount);
  const boundary = pool.slice(explorationCount).sort((a, b) => {
    const delta = distance(a.features) - distance(b.features);
    return Number.isNaN(delta) || !delta ? a.order - b.order : delta;
  });
  const selected: Json[] = [];
  exploration.forEach((candidate, index) => {
    selected.push(candidate.input);
    if (index >= count - explorationCount) return;
    const preferred = boundary.findIndex((item) => (predict(program, item.input) !== null) === (index % 2 === 0));
    selected.push(boundary.splice(preferred < 0 ? 0 : preferred, 1)[0].input);
  });
  return { pool: pool.map((item) => item.input), selected };
}

const diagnosedProgram: Hypothesis = {
  schemaVersion: "nexus.conditional-hypothesis.v1", expectedHolds: true,
  when: { op: "or", left: { op: "gt", feature: "a:min:", threshold: -21_226_575.5 },
    right: { op: "lte", feature: "a:length:", threshold: 2.5 } },
};
function referenceSumHolds(input: Json): boolean {
  const values = input as number[];
  const sum = (items: number[]) => items.reduce((a, b) => a + b, 0);
  return sum(values) === sum([...values].sort((a, b) => Math.abs(a) - Math.abs(b)));
}

describe("complete version-bound training snapshots", () => {
  it("retains every eligible ID, deduplicates exact input+holds, and never borrows control or audit labels", async () => {
    const { subject, observations } = await setup();
    const duplicate = { ...observations[0], id: "repeat" };
    const conflict = { ...observations[0], id: "conflict", measurement: { ...observations[0].measurement, holds: false } };
    const audit = { ...observations[1], id: "audit", partition: "hypothesis-audit" as const };
    const oldVersion = { ...observations[2], id: "old", subjectVersion: "0" };
    const control = { ...observations[3], id: "control", subjectId: "integer-sum-control" };
    const falsification = { ...observations[4], id: "falsification", partition: "hypothesis-falsification" as const };
    const all = [...observations, duplicate, conflict, audit, oldVersion, control, falsification];
    const snapshot = buildTrainingSnapshot(all, subject);
    expect(snapshot.observationIds).toEqual([...observations.map((o) => o.id), "repeat", "conflict", "falsification"].sort());
    expect(snapshot.examples).toHaveLength(9);
    expect(snapshot.examples.filter((e) => canonical(e.input) === canonical(observations[0].input)).map((e) => e.holds).sort()).toEqual([false, true]);
    expect(buildTrainingSnapshot([...all].reverse(), subject)).toEqual(snapshot);
    expect(validateProposal(condition(), snapshot).reasons).toContain("training-scope-contradiction");
  });

  it("treats empty/single-class evidence as insufficient; fit abstains rather than fabricating a contrast", async () => {
    const subject = numericSubject(100);
    for (const inputs of [[], trainingInputs]) {
      const snapshot = buildTrainingSnapshot(await observe(subject, inputs), subject);
      expect(snapshot.status).toBe("insufficient-data");
      expect(fitConditional(snapshot.examples)).toMatchObject({ status: "no-action", hypothesis: null });
      expect(validateProposal(condition(), snapshot).valid).toBe(false);
    }
  });

  it("deduplicates before the 128 cap but preserves every source ID", async () => {
    const { subject, observations } = await setup();
    const many = Array.from({ length: 192 }, (_, index) => ({ ...observations[index % 8], id: `duplicate-${index}` }));
    const snapshot = buildTrainingSnapshot(many, subject);
    expect(snapshot).toMatchObject({ status: "ready" });
    expect(snapshot.examples).toHaveLength(8);
    expect(snapshot.observationIds).toHaveLength(192);
    expect(validateProposal(condition(), snapshot).valid).toBe(true);
  });

  it("keeps exactly 128 distinct pairs without treating the capacity boundary as overflow", async () => {
    const subject = numericSubject();
    const observations = await observe(subject, Array.from({ length: 128 }, (_, index) => ({ n: index - 64 })));
    const snapshot = buildTrainingSnapshot(observations, subject);
    expect(snapshot.status).toBe("ready");
    expect(snapshot.examples).toHaveLength(128);
    expect(validateProposal(condition(0.5), snapshot).valid).toBe(true);
  });

  it("fails capacity without a partial favorable training subset, binding even the final observation", async () => {
    const subject = numericSubject(64);
    const observations = await observe(subject, Array.from({ length: 129 }, (_, n) => ({ n })));
    const snapshot = buildTrainingSnapshot(observations, subject);
    expect(snapshot.status).toBe("capacity-exceeded");
    expect(snapshot.examples).toEqual([]);
    expect(snapshot.observationIds).toHaveLength(129);
    expect(validateProposal(condition(), snapshot).reasons).toEqual(["training-capacity-exceeded"]);
    observations[128] = { ...observations[128], measurement: { holds: true, facts: {}, code: "changed-controlled-evidence" } };
    expect(buildTrainingSnapshot(observations, subject).digest).not.toBe(snapshot.digest);
  });

  it("copies inputs and rejects broken input digests", async () => {
    const { subject, observations, snapshot } = await setup();
    const before = structuredClone(snapshot);
    (observations[0].input as { n: number }).n = 999;
    expect(snapshot).toEqual(before);
    expect(() => buildTrainingSnapshot(observations, subject)).toThrow("input digest mismatch");
  });

  it("ignores identity/seed/label/hash/inputDigest and measurement facts as predictive features", async () => {
    const subject = numericSubject();
    const decorate = (reverse: boolean) => trainingInputs.map(({ n }, index) => ({ n, id: index, seed: reverse ? -index : index,
      label: index % 2, hash: index * 3, inputDigest: index * 5, admin: { sessionId: index, seed: index } }));
    const first = await observe(subject, decorate(false));
    const second = await observe(subject, decorate(true), "discovery", "renamed");
    first.forEach((o) => { o.measurement.facts = { answer: o.measurement.holds ? 1 : 0, secretThreshold: 0 }; });
    for (const observation of first) expect(Object.keys(extractFeatures(observation.input))).toEqual(["n:/n"]);
    const left = fitConditional(buildTrainingSnapshot(first, subject).examples);
    const right = fitConditional(buildTrainingSnapshot(second, subject).examples);
    expect(left.status).toBe("proposed");
    expect(right.hypothesis).toEqual(left.hypothesis);
    const snapshot = buildTrainingSnapshot(first, subject);
    first.forEach((o) => { o.measurement.facts = { answer: 12345 }; });
    expect(buildTrainingSnapshot(first, subject).digest).toBe(snapshot.digest);
    for (const name of ["seed", "label", "id", "hash", "inputDigest"]) {
      expect(validateProposal({ ...condition(), when: { op: "lte", feature: `n:/${name}`, threshold: 0 } }, snapshot).valid).toBe(false);
    }
    expect(validateProposal({ ...condition(), when: { op: "lte", feature: "n:/facts/answer", threshold: 0.5 } }, snapshot).valid).toBe(false);
  });

  it("changes the induced AST when real controlled hidden-threshold observations change", async () => {
    const inputs = Array.from({ length: 16 }, (_, index) => ({ n: index - 8 }));
    const programs: Hypothesis[] = [];
    for (const hidden of [-2, 2]) {
      const subject = numericSubject(hidden);
      const snapshot = buildTrainingSnapshot(await observe(subject, inputs), subject);
      const fit = fitConditional(snapshot.examples);
      expect(fit.status).toBe("proposed");
      expect(validateProposal(fit.hypothesis!, snapshot).valid).toBe(true);
      programs.push(fit.hypothesis!);
    }
    expect(programs[0]).not.toEqual(programs[1]);
  });
});

describe("independent proposal checks and content bindings", () => {
  it("accepts a sourced midpoint, rejects fabricated cuts and closed-AST extensions", async () => {
    const { snapshot } = await setup();
    expect(validateProposal(condition(), snapshot)).toEqual({ valid: true, reasons: [], inScope: 4, outOfScope: 4 });
    expect(validateProposal(condition(1), snapshot).reasons).toContain("threshold-not-from-adjacent-training-values");
    expect(validateProposal({ ...condition(), passed: true } as Hypothesis, snapshot).reasons).toContain("invalid-closed-hypothesis-ast");
    expect(validateProposal(condition(0, false), snapshot).reasons).toContain("training-scope-contradiction");
    expect(validateProposal(condition(-3), snapshot).reasons).toContain("insufficient-independent-scope-contrast");
  });

  it("checks representational fallback endpoints rather than arbitrary observed endpoints", async () => {
    const low = 1, high = 1 + Number.EPSILON;
    const subject = numericSubject();
    const inputs = [0, 0.25, 0.5, low, high, 2, 3, 4].map((n) => ({ n }));
    const observations = await observe(subject, inputs);
    observations.forEach((o) => { o.measurement.holds = (o.input as { n: number }).n <= low; });
    const snapshot = buildTrainingSnapshot(observations, subject);
    expect(validateProposal(condition(low), snapshot).valid).toBe(true);
    expect(validateProposal(condition(0.5), snapshot).reasons).toContain("threshold-not-from-adjacent-training-values");
  });

  it("independently rejects a falsely-ready snapshot with only three independent negative vectors", async () => {
    const subject = numericSubject();
    const observations = await observe(subject, trainingInputs.slice(0, 7));
    const snapshot = resign({ ...buildTrainingSnapshot(observations, subject), status: "ready" });
    expect(validateProposal(condition(), snapshot).reasons).toContain("insufficient-independent-label-support");
  });

  it("checks both compound AST forms from raw feature vectors and abstains on missing atomic features", async () => {
    const subject = { ...numericSubject(), async measure(input: Json) {
      const { n, m } = input as { n: number; m: number };
      return { holds: n <= 0 && m > 0, code: "controlled-two-axis", facts: {} };
    } };
    const inputs: Json[] = [-4, -2, 2, 4].flatMap((n) => [-4, -2, 2, 4].map((m) => ({ n, m })));
    inputs.push({ n: -6 }, { n: -8 });
    const snapshot = buildTrainingSnapshot(await observe(subject, inputs), subject);
    const and: Hypothesis = { schemaVersion: "nexus.conditional-hypothesis.v1", expectedHolds: true,
      when: { op: "and", left: { op: "lte", feature: "n:/n", threshold: 0 }, right: { op: "gt", feature: "n:/m", threshold: 0 } } };
    const or: Hypothesis = { ...and, expectedHolds: false,
      when: { op: "or", left: { op: "gt", feature: "n:/n", threshold: 0 }, right: { op: "lte", feature: "n:/m", threshold: 0 } } };
    expect(validateProposal(and, snapshot)).toEqual({ valid: true, reasons: [], inScope: 4, outOfScope: 14 });
    expect(validateProposal(or, snapshot)).toEqual({ valid: true, reasons: [], inScope: 12, outOfScope: 6 });
    expect(predict(and, { n: -6 })).toBeNull();
    expect(predict(or, { n: -6 })).toBeNull();
  });

  it("does not erase opposing labels when different exact inputs have the same allowed feature vector", async () => {
    const { subject, observations } = await setup();
    const alias = { ...observations[0], id: "metadata-alias", input: { n: -8, label: "different" },
      inputDigest: researchDigest({ n: -8, label: "different" }), measurement: { holds: false, code: "controlled-conflict", facts: {} } };
    const snapshot = buildTrainingSnapshot([...observations, alias], subject);
    expect(snapshot.examples).toHaveLength(9);
    expect(validateProposal(condition(), snapshot)).toMatchObject({ valid: false, inScope: 4, outOfScope: 4 });
    expect(validateProposal(condition(), snapshot).reasons).toContain("training-scope-contradiction");
  });

  it("retains both conflicting labels and independently rejects zero information gain", async () => {
    const subject = numericSubject();
    const observations = await observe(subject, trainingInputs);
    const both = observations.flatMap((o) => [o, { ...o, id: `${o.id}-conflict`, measurement: { ...o.measurement, holds: !o.measurement.holds } }]);
    const snapshot = buildTrainingSnapshot(both, subject);
    expect(snapshot.examples).toHaveLength(16);
    const result = validateProposal(condition(), snapshot);
    expect(result).toMatchObject({ valid: false, inScope: 4, outOfScope: 4 });
    expect(result.reasons).toEqual(expect.arrayContaining(["training-scope-contradiction", "nonpositive-information-gain"]));
    expect(fitConditional(snapshot.examples).status).toBe("no-action");
  });

  it("rejects a tampered subset and makes a recomputed candidate subset differ from the authoritative full snapshot", async () => {
    const { subject, observations, snapshot } = await setup();
    const contradictory = { ...observations[0], id: "new-contradiction", measurement: { holds: false, facts: {}, code: "controlled-conflict" } };
    const complete = buildTrainingSnapshot([...observations, contradictory], subject);
    expect(validateProposal(condition(), { ...complete, examples: snapshot.examples }).valid).toBe(false);
    expect(validateProposal(condition(), complete).reasons).toContain("training-scope-contradiction");
    // Only the service knows all history: re-hashing an omitted-history subset is not authority.
    const candidate = proposeHypothesis(subject, snapshot, condition(), "subset-attempt");
    expect(candidate.trainingDigest).not.toBe(complete.digest);
    expect(candidate.trainingObservationIds).not.toEqual(complete.observationIds);
  });

  it("binds complete IDs/digest, program, version and parent, not display or episode names", async () => {
    const { subject, snapshot, hypothesis } = await setup();
    const renamed = { ...subject, title: { en: "Other title", zh: "别名" } };
    expect(proposeHypothesis(renamed, snapshot, condition(), "different-episode").id).toBe(hypothesis.id);
    expect(hypothesis).toMatchObject({ programDigest: researchDigest(condition()), trainingDigest: snapshot.digest,
      trainingObservationIds: snapshot.observationIds, parentHypothesisId: null });
    expect(proposeHypothesis(subject, snapshot, condition(), "episode", "parent").id).not.toBe(hypothesis.id);
    expect(proposeHypothesis(subject, snapshot, condition(0, false, "gt"), "episode").id).not.toBe(hypothesis.id);
    expect(() => proposeHypothesis({ ...subject, version: "2" }, snapshot, condition(), "episode")).toThrow("subject/version mismatch");
    expect("passed" in hypothesis).toBe(false);
  });
});

describe("fixed bounded sampler", () => {
  it("is deterministic, valid, deduplicated, leaves exclusions alone and performs no measurements", () => {
    const subject = numericSubject();
    subject.measure = vi.fn(subject.measure);
    const excluded = new Set([researchDigest({ n: 0 })]);
    const samples = sampleHypothesisInputs(subject, condition(), "repeatable", excluded, 32);
    expect(samples).toEqual(sampleHypothesisInputs(subject, condition(), "repeatable", excluded, 32));
    expect(new Set(samples.map((s) => researchDigest(s.input))).size).toBe(samples.length);
    expect(samples.every((s) => subject.valid(s.input) && !excluded.has(researchDigest(s.input)))).toBe(true);
    expect(excluded).toEqual(new Set([researchDigest({ n: 0 })]));
    expect(subject.measure).not.toHaveBeenCalled();
    expect(samples).toHaveLength(32);
    expect(samples.every((s) => Object.keys(s).sort().join(",") === "input,kind")).toBe(true);
  });

  it("reserves at least half predicate-independent exploration and preserves that ratio in all prefixes", () => {
    const subject = numericSubject();
    const first = sampleHypothesisInputs(subject, condition(0), "independent", new Set(), 25);
    const different = sampleHypothesisInputs(subject, condition(70, false), "independent", new Set(), 25);
    expect(first.filter((s) => s.kind === "exploration")).toEqual(different.filter((s) => s.kind === "exploration"));
    for (let length = 1; length <= first.length; length++) {
      expect(first.slice(0, length).filter((s) => s.kind === "exploration").length).toBeGreaterThanOrEqual(Math.ceil(length / 2));
    }
    expect(sampleHypothesisInputs(subject, null, "independent", new Set(), 25).every((s) => s.kind === "exploration")).toBe(true);
  });

  it("uses generic integerization, shifts/scales and array shrink/expansion/permutation within structural bounds", () => {
    const subject: ResearchSubject = { ...numericSubject(), generate: () => [1.25, -2.75, 3.5],
      valid: (input) => Array.isArray(input) && input.length >= 1 && input.length <= 8 && input.every((v) => typeof v === "number" && Math.abs(v) <= 100) };
    const samples = sampleHypothesisInputs(subject, null, "array-perturbation", new Set(), 256).map((s) => s.input as number[]);
    expect(samples.some((s) => s.every(Number.isInteger))).toBe(true);
    expect(samples.some((s) => s.length < 3)).toBe(true);
    expect(samples.some((s) => s.length > 3)).toBe(true);
    expect(samples).toContainEqual([3.5, -2.75, 1.25]);
    expect(samples).toContainEqual([2.5, -5.5, 7]);
    expect(samples.some((s) => s[0] > 1.25)).toBe(true);
    expect(samples.some((s) => s[0] < 1.25)).toBe(true);
    expect(samples.length).toBeLessThanOrEqual(256);
  });

  it("honestly stops for excluded finite domains and invalid or structurally overlarge generators", () => {
    const subject = { ...numericSubject(), generate: () => ({ n: 0 }), valid: (input: Json) => canonical(input) === canonical({ n: 0 }) };
    expect(sampleHypothesisInputs(subject, null, "finite", new Set([researchDigest({ n: 0 })]), 24)).toEqual([]);
    expect(sampleHypothesisInputs({ ...subject, generate: () => Array.from({ length: 129 }, () => 0) }, null, "oversized", new Set(), 24)).toEqual([]);
    expect(() => sampleHypothesisInputs(subject, null, "invalid-limit", new Set(), -1)).toThrow();
  });
});

describe("v2 stratified and per-atom sampling regressions", () => {
  it.each(["sampler-audit-a", "sampler-audit-b", "sampler-audit-c"])("exposes the available other-OR-branch counterexample missed by v1 for preregistered %s", async (seed) => {
    const subject = researchSubject("sum-grouping-hypothesis");
    const old = legacyDiagnosticSelection(subject, diagnosedProgram, seed);
    const contradicts = (input: Json) => predict(diagnosedProgram, input) === true && !referenceSumHolds(input);
    expect(old.pool).toHaveLength(224);
    expect(old.selected).toHaveLength(24);
    expect(old.selected.filter(contradicts)).toHaveLength(0);
    expect(old.pool.filter(contradicts)).toHaveLength(16);
    // Fresh, explicit training for a new protocol trial, not the unavailable original F/T
    // station and not a replacement for its honestly bounded v1 survived receipts.
    const trainingInputs: Json[] = [
      ...Array.from({ length: 4 }, (_, index) => [-42_453_151 - index, 1]),
      ...Array.from({ length: 4 }, (_, index) => [0, 1 + index, 2 + index]),
      ...Array.from({ length: 4 }, (_, index) => [42_453_151 + index, -42_453_151 - index, 1e-7, 2e-7, 3e-7]),
    ];
    const training = metered(12);
    for (const input of trainingInputs) await training.meter.observe(subject, input, "hypothesis-training");
    const snapshot = buildTrainingSnapshot(training.observations, subject);
    expect(validateProposal(diagnosedProgram, snapshot).valid).toBe(true);
    const hypothesis = proposeHypothesis(subject, snapshot, diagnosedProgram, `v2-diagnostic-${seed}`);
    const excluded = new Set(training.observations.map((observation) => observation.inputDigest));
    expect(old.pool.every((input) => !excluded.has(researchDigest(input)))).toBe(true);
    const selected = sampleHypothesisInputs(subject, hypothesis, seed, excluded, 24);
    const first = selected.findIndex((sample) => contradicts(sample.input));
    expect(first).toBeGreaterThanOrEqual(0);
    const fresh = metered(24);
    const result = await evaluateHypothesis(hypothesis, subject, training.observations, fresh.meter, "falsification", seed);
    expect(result).toMatchObject({ samplingProtocol: "bounded-perturbation-v2", status: "refuted", allowance: 24, calls: first + 1 });
    expect(result.counterexampleIds).toEqual([fresh.observations.at(-1)!.id]);
    expect(fresh.observations.map((observation) => observation.input)).toEqual(selected.slice(0, first + 1).map((sample) => sample.input));
    const counterexample = fresh.observations.at(-1)!;
    expect(counterexample.measurement.holds).toBe(false);
    expect(extractFeatures(counterexample.input)["a:min:"]).toBeGreaterThan(-21_226_575.5);
    expect(extractFeatures(counterexample.input)["a:length:"]).toBeGreaterThan(2.5);
    expect(result.attemptedCandidates).toBeLessThanOrEqual(256);
  });

  it("balances exploration across generated roots without using predicate or string contents as features", () => {
    const subject = { ...numericSubject(), generate: (seed: string) => {
      const root = Number(seed.split(":").at(-1));
      return { n: 100 + root + 0.25, witness: `root-${root}` };
    } };
    const samples = sampleHypothesisInputs(subject, condition(), "root-stratification", new Set(), 24);
    const exploration = samples.filter((sample) => sample.kind === "exploration");
    expect(exploration).toHaveLength(12);
    expect(new Set(exploration.map((sample) => (sample.input as { witness: string }).witness)).size).toBeGreaterThanOrEqual(8);
    expect(exploration.every((sample) => Object.keys(extractFeatures(sample.input)).join(",") === "n:/n")).toBe(true);
    expect(exploration).toEqual(sampleHypothesisInputs(subject, condition(200, false), "root-stratification", new Set(), 24)
      .filter((sample) => sample.kind === "exploration"));
  });

  it("deletes, duplicates and rotates different positions in wholly non-numeric arrays", () => {
    const base = ["red", "green", "blue", "white"];
    const subject = { ...numericSubject(), generate: () => base,
      valid: (input: Json) => Array.isArray(input) && input.length >= 1 && input.length <= 8 && input.every((item) => typeof item === "string") };
    const samples = sampleHypothesisInputs(subject, null, "non-numeric-positions", new Set(), 256).map((sample) => sample.input as string[]);
    for (let index = 0; index < base.length; index++) {
      expect(samples).toContainEqual(base.filter((_, position) => index !== position));
      expect(samples.some((sample) => sample.length === 5 && sample.filter((item) => item === base[index]).length === 2)).toBe(true);
      if (index) expect(samples).toContainEqual([...base.slice(index), ...base.slice(0, index)]);
    }
    expect(base).toEqual(["red", "green", "blue", "white"]);
    expect(samples.every((sample) => Object.keys(extractFeatures(sample)).join(",") === "a:length:")).toBe(true);
  });

  it("finds a fresh counterexample through a different nested non-numeric schema without a subject-name branch", async () => {
    const input = (items: string[]): Json => ({ packet: { items, enabled: true, note: "not a value feature" } });
    const subject: ResearchSubject = { ...numericSubject(), id: "controlled-nested-text",
      generate: () => input(["ok", "bad", "third", "fourth"]),
      valid: (value) => {
        const packet = (value as { packet?: { items?: Json[]; enabled?: boolean } } | null)?.packet;
        return !!packet && packet.enabled === true && Array.isArray(packet.items) && packet.items.length >= 1
          && packet.items.length <= 12 && packet.items.every((item) => typeof item === "string");
      },
      async measure(value) { return { holds: !(value as { packet: { items: string[] } }).packet.items.includes("bad"), code: "controlled-text-membership", facts: {} }; },
    };
    const inputs = Array.from({ length: 8 }, (_, index) => input(Array.from({ length: index + 1 }, (_, position) => index >= 4 && !position ? "bad" : "ok")));
    const program: Hypothesis = { schemaVersion: "nexus.conditional-hypothesis.v1", expectedHolds: true,
      when: { op: "lte", feature: "a:length:/packet/items", threshold: 4.5 } };
    const { observations, hypothesis } = await setup(subject, inputs, program);
    const pool = sampleHypothesisInputs(subject, null, "nested-text", new Set(), 256);
    expect(pool.some((sample) => (sample.input as { packet: { items: string[] } }).packet.items.length > 4)).toBe(true);
    expect(pool.some((sample) => (sample.input as { packet: { items: string[] } }).packet.items.length < 4)).toBe(true);
    expect(pool.every((sample) => Object.keys(extractFeatures(sample.input)).join(",") === "a:length:/packet/items")).toBe(true);
    const fresh = metered(24);
    const result = await evaluateHypothesis(hypothesis, subject, observations, fresh.meter, "falsification", "nested-text");
    expect(result.status).toBe("refuted");
    expect(fresh.observations.at(-1)!.measurement.holds).toBe(false);
    expect(predict(program, fresh.observations.at(-1)!.input)).toBe(true);
    expect(result.calls).toBeLessThanOrEqual(24);
  });

  it("keeps nested expansion structurally bounded before materializing excessive copies", () => {
    let base: Json = Array.from({ length: 64 }, () => null);
    for (let depth = 0; depth < 9; depth++) base = [base];
    const original = canonical(base);
    const subject = { ...numericSubject(), generate: () => base, valid: (value: Json) => Array.isArray(value) };
    const samples = sampleHypothesisInputs(subject, null, "nested-structural-budget", new Set(), 256);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.length).toBeLessThanOrEqual(256);
    samples.forEach((sample) => expect(() => assertResearchJson(sample.input)).not.toThrow());
    expect(canonical(base)).toBe(original);
  });
});

describe("service-owned fresh falsification and audit", () => {
  it("refutes a legal but overbroad condition with a real fresh controlled counterexample", async () => {
    const subject = { ...numericSubject(0), generate: () => ({ n: 5 }) };
    const { observations, hypothesis } = await setup(subject, [-8, -6, -4, -2, 16, 18, 20, 22].map((n) => ({ n })), condition(7));
    const { meter, observations: fresh } = metered();
    const result = await evaluateHypothesis(hypothesis, subject, observations, meter, "falsification", "controlled-gap");
    expect(result).toMatchObject({ status: "refuted", reason: "fresh-in-scope-counterexample" });
    const counterexample = fresh.at(-1)!;
    expect(result.counterexampleIds).toEqual([counterexample.id]);
    expect(counterexample.measurement.holds).toBe(false);
    expect(predict(hypothesis.program, counterexample.input)).toBe(true);
    expect(observations.every((observation) => observation.inputDigest !== counterexample.inputDigest)).toBe(true);
    expect(fresh.slice(0, -1).every((observation) => predict(hypothesis.program, observation.input) === null
      || predict(hypothesis.program, observation.input) === observation.measurement.holds)).toBe(true);
    expect(result.calls).toBe(meter.used);
  });

  it.each(["falsification", "audit"] as const)("replays the exact same-allowance sample prefix when %s stops early at a counterexample", async (phase) => {
    const subject = { ...numericSubject(0), generate: () => ({ n: -5 }) };
    const { observations, hypothesis } = await setup(subject, [-8, -6, -4, -2, 16, 18, 20, 22].map((n) => ({ n })), condition(7));
    const { meter, observations: fresh } = metered();
    const seed = "early-refutation-replay";
    const result = await evaluateHypothesis(hypothesis, subject, observations, meter, phase, seed);
    const replay = sampleHypothesisInputs(subject, hypothesis, seed, new Set(result.excludedInputDigests), result.allowance);
    expect(result.status).toBe("refuted");
    expect(result.allowance).toBe(HYPOTHESIS_PHASE_ALLOWANCE[phase]);
    expect(Object.isFrozen(HYPOTHESIS_PHASE_ALLOWANCE)).toBe(true);
    const firstContradiction = replay.findIndex((sample) => predict(hypothesis.program, sample.input) !== null
      && predict(hypothesis.program, sample.input) !== ((sample.input as { n: number }).n <= 0));
    expect(firstContradiction).toBeGreaterThanOrEqual(0);
    expect(result.calls).toBe(firstContradiction + 1);
    expect(result.calls).toBeLessThan(replay.length);
    expect(fresh.map((observation) => observation.input)).toEqual(replay.slice(0, result.calls).map((sample) => sample.input));
    expect(result.sampleKinds).toEqual(replay.slice(0, result.calls).map((sample) => sample.kind));
    expect(result.counterexampleIds).toEqual([fresh.at(-1)!.id]);
    const rerun = metered();
    expect(await evaluateHypothesis(hypothesis, subject, observations, rerun.meter, phase, seed)).toEqual(result);
    expect(rerun.observations).toEqual(fresh);
  });

  it("also refutes an expected-false conditional with an actual fresh true observation", async () => {
    const subject = { ...numericSubject(0), generate: () => ({ n: -5 }) };
    const { observations, hypothesis } = await setup(subject, [-22, -20, -18, -16, 2, 4, 6, 8].map((n) => ({ n })), condition(-7, false, "gt"));
    const { meter, observations: fresh } = metered();
    const result = await evaluateHypothesis(hypothesis, subject, observations, meter, "falsification", "opposite-gap");
    expect(result.status).toBe("refuted");
    expect(result.counterexampleIds).toEqual([fresh.at(-1)!.id]);
    expect(fresh.at(-1)!.measurement.holds).toBe(true);
    expect(predict(hypothesis.program, fresh.at(-1)!.input)).toBe(false);
  });

  it.each(["falsification", "audit"] as const)("enforces the %s ceiling and exposes recomputable raw evidence, without claiming proof", async (phase) => {
    const { subject, observations, hypothesis } = await setup();
    const { meter, observations: fresh } = metered(100);
    const seed = "fresh-recomputation";
    const result = await evaluateHypothesis(hypothesis, subject, observations, meter, phase, seed);
    const expectedScope = fresh.filter((o) => predict(hypothesis.program, o.input) !== null);
    const counterexamples = expectedScope.filter((o) => predict(hypothesis.program, o.input) !== o.measurement.holds);
    expect(result).toMatchObject({ evaluatorVersion: HYPOTHESIS_EVALUATOR_VERSION, samplingProtocol: HYPOTHESIS_SAMPLING_PROTOCOL,
      hypothesisId: hypothesis.id, programDigest: researchDigest(hypothesis.program), trainingDigest: hypothesis.trainingDigest,
      subjectId: subject.id, subjectVersion: subject.version, phase, seed, status: "survived-budget", allowance: phase === "audit" ? 32 : 24,
      calls: meter.used, observationIds: fresh.map((o) => o.id), counterexampleIds: counterexamples.map((o) => o.id),
      inScope: expectedScope.length, outOfScope: fresh.length - expectedScope.length,
      excludedInputDigests: observations.map((o) => o.inputDigest).sort() });
    expect(result.calls).toBe(result.allowance);
    expect(fresh.every((o) => o.partition === (phase === "audit" ? "hypothesis-audit" : "hypothesis-falsification"))).toBe(true);
    expect(result.inScope).toBeGreaterThanOrEqual(4); expect(result.outOfScope).toBeGreaterThanOrEqual(4);
    expect(result.reason).toContain("not-proof-or-population-coverage");
    expect(result.attemptedCandidates).toBeLessThanOrEqual(256);
    expect(result.attemptedCandidates).toBeGreaterThanOrEqual(result.calls);
    const samples = sampleHypothesisInputs(subject, hypothesis, seed, new Set(result.excludedInputDigests), result.allowance);
    expect(result.sampleKinds).toEqual(samples.map((s) => s.kind));
    expect(fresh.map((o) => o.input)).toEqual(samples.map((s) => s.input));
  });

  it("excludes all prior same-version inputs including old audits, not other versions or subjects", async () => {
    const { subject, observations, hypothesis } = await setup();
    const previous = metered();
    await evaluateHypothesis(hypothesis, subject, observations, previous.meter, "audit", "old-audit");
    const old = [...observations, ...previous.observations];
    const extra = { ...old[0], id: "other-version", subjectVersion: "other", input: { n: 999 }, inputDigest: researchDigest({ n: 999 }) };
    const foreign = { ...extra, id: "foreign", subjectId: "other", subjectVersion: subject.version };
    const next = metered();
    const result = await evaluateHypothesis(hypothesis, subject, [...old, extra, foreign], next.meter, "falsification", "old-audit");
    expect(result.excludedInputDigests).toEqual([...new Set(old.map((o) => o.inputDigest))].sort());
    expect(next.observations.every((o) => !result.excludedInputDigests.includes(o.inputDigest))).toBe(true);
    expect(new Set(next.observations.map((o) => o.inputDigest)).size).toBe(next.observations.length);
  });

  it("makes zero calls and generates no candidates with zero budget", async () => {
    const { subject, observations, hypothesis } = await setup();
    subject.generate = vi.fn(subject.generate);
    const { meter } = metered(0);
    expect(await evaluateHypothesis(hypothesis, subject, observations, meter, "audit", "zero")).toMatchObject({
      status: "inconclusive", reason: "zero-oracle-allowance", calls: 0, allowance: 0, observationIds: [], sampleKinds: [], attemptedCandidates: 0,
    });
    expect(subject.generate).not.toHaveBeenCalled();
  });

  it("respects the remaining meter budget and cannot pass with fewer than eight fresh calls", async () => {
    const { subject, observations, hypothesis } = await setup();
    const { meter } = metered(11, { initialUsed: 5 });
    expect(await evaluateHypothesis(hypothesis, subject, observations, meter, "audit", "limited")).toMatchObject({
      status: "inconclusive", calls: 6, allowance: 6, reason: "insufficient-fresh-calls",
    });
    expect(meter.used).toBe(11);
  });

  it("does not pass merely because it can reach P: both scope and outside need four samples", async () => {
    const subject = { ...numericSubject(), generate: () => ({ n: 100 }) };
    const { observations, hypothesis } = await setup(subject);
    const { meter } = metered();
    const result = await evaluateHypothesis(hypothesis, subject, observations, meter, "falsification", "one-sided");
    expect(result.status).toBe("inconclusive");
    expect(result.reason).toBe("insufficient-scope-contrast");
    expect(result.calls).toBeGreaterThanOrEqual(8);
    expect(result.inScope).toBeLessThan(4);
    expect(result.counterexampleIds).toEqual([]);
  });

  it("does not pretend a finite already-seen domain has fresh input coverage", async () => {
    const domain = [...trainingInputs, { n: 0 }];
    const subject = { ...numericSubject(), generate: () => ({ n: 0 }), valid: (input: Json) => domain.some((candidate) => canonical(candidate) === canonical(input)) };
    const { observations, hypothesis } = await setup(subject);
    const audit = await observe(subject, [{ n: 0 }], "hypothesis-audit", "old-audit");
    const { meter } = metered();
    const result = await evaluateHypothesis(hypothesis, subject, [...observations, ...audit], meter, "audit", "finite");
    expect(result).toMatchObject({ status: "inconclusive", reason: "no-fresh-valid-inputs", calls: 0, inScope: 0, outOfScope: 0, attemptedCandidates: 256 });
  });

  it("replays a controlled seed exactly and snapshots generated inputs, prior exclusions, subject and AST across await", async () => {
    const shared = { n: 0 };
    const subject = numericSubject();
    const generate = subject.generate;
    subject.generate = (seed) => { shared.n = (generate(seed) as { n: number }).n; return shared; };
    const { observations, hypothesis } = await setup(subject);
    const baseline = metered();
    const expected = await evaluateHypothesis(hypothesis, subject, observations, baseline.meter, "falsification", "frozen");
    const originalDigest = hypothesis.programDigest;
    const changed = metered(100, { afterCopy: (used) => {
      if (used !== 1) return;
      shared.n = 999;
      hypothesis.program.when = { op: "lte", feature: "n:/n", threshold: 999 };
      hypothesis.program.expectedHolds = false;
      hypothesis.id = "mutated";
      (observations[0].input as { n: number }).n = 999;
      subject.generate = () => ({ n: 999 }); subject.valid = () => false;
      subject.measure = async () => ({ holds: false, facts: {}, code: "mutated" });
    } });
    const actual = await evaluateHypothesis(hypothesis, subject, observations, changed.meter, "falsification", "frozen");
    expect(actual).toEqual(expected);
    expect(actual.programDigest).toBe(originalDigest);
    expect(changed.observations).toEqual(baseline.observations);
  });

  it("charges an oracle failure without inventing successful observations or survival", async () => {
    const { subject, observations, hypothesis } = await setup();
    const { meter } = metered(100, { errorAt: 1 });
    expect(await evaluateHypothesis(hypothesis, subject, observations, meter, "falsification", "failure")).toMatchObject({
      status: "inconclusive", reason: "oracle-error", calls: 1, observationIds: [], counterexampleIds: [],
    });
  });

  it("rejects changed program/version bindings before making any target call", async () => {
    const { subject, observations, hypothesis } = await setup();
    const { meter } = metered();
    await expect(evaluateHypothesis({ ...hypothesis, program: condition(1) }, subject, observations, meter, "audit", "binding")).rejects.toThrow("content binding mismatch");
    await expect(evaluateHypothesis(hypothesis, { ...subject, version: "2" }, observations, meter, "audit", "binding")).rejects.toThrow("content binding mismatch");
    expect(meter.used).toBe(0);
  });
});

function hasNegativeZero(value: Json): boolean {
  if (typeof value === "number") return Object.is(value, -0);
  if (Array.isArray(value)) return value.some(hasNegativeZero);
  return value !== null && typeof value === "object" && Object.values(value).some(hasNegativeZero);
}

describe("canonical JSON execution and wire parity", () => {
  it("accepts a legal zero counterexample and never lets valid or measure see JS negative zero", async () => {
    const original = numericSubject(-1), validated: Json[] = [], measured: Json[] = [];
    const subject: ResearchSubject = { ...original, generate: () => ({ n: -0 }),
      valid(input) { validated.push(structuredClone(input)); return original.valid(input) && !hasNegativeZero(input); },
      async measure(input) { measured.push(structuredClone(input)); return original.measure(input); },
    };
    const { observations, hypothesis } = await setup(subject, trainingInputs, condition(-0));
    const samples = sampleHypothesisInputs(subject, hypothesis, "canonical-zero-counterexample", new Set(), 256);
    expect(samples.some((sample) => (sample.input as { n: number }).n === 0)).toBe(true);
    expect(samples.every((sample) => !hasNegativeZero(sample.input))).toBe(true);
    const fresh = metered(24);
    const result = await evaluateHypothesis(hypothesis, subject, observations, fresh.meter, "falsification", "canonical-zero-counterexample");
    expect(result).toMatchObject({ status: "refuted", samplingProtocol: "bounded-perturbation-v2", allowance: 24 });
    expect(fresh.observations.at(-1)!.input).toStrictEqual({ n: 0 });
    expect(result.counterexampleIds).toEqual([fresh.observations.at(-1)!.id]);
    expect(validated.length).toBeGreaterThan(0);
    expect([...validated, ...measured].every((input) => !hasNegativeZero(input))).toBe(true);
  });

  it("normalizes training examples and the proposal AST without changing canonical identity or the caller's data", async () => {
    const subject = numericSubject();
    const observations = await observe(subject, trainingInputs.map(({ n }) => ({ n, seed: -0 })));
    const wireObservations = JSON.parse(JSON.stringify(observations)) as Observation[];
    const snapshot = buildTrainingSnapshot(observations, subject), wireSnapshot = buildTrainingSnapshot(wireObservations, subject);
    expect(snapshot).toStrictEqual(wireSnapshot);
    expect(snapshot).toStrictEqual(JSON.parse(JSON.stringify(snapshot)));
    const program = condition(-0);
    const hypothesis = proposeHypothesis(subject, snapshot, program, "zero-program");
    expect(hypothesis).toStrictEqual(JSON.parse(JSON.stringify(hypothesis)));
    expect(hypothesis).toStrictEqual(proposeHypothesis(subject, wireSnapshot, condition(0), "zero-program"));
    expect(Object.is((program.when as { threshold: number }).threshold, -0)).toBe(true);
    expect(Object.is((hypothesis.program.when as { threshold: number }).threshold, -0)).toBe(false);
    expect(hasNegativeZero(observations[0].input)).toBe(true);
    expect(snapshot.examples.every((example) => !hasNegativeZero(example.input))).toBe(true);
  });

  it("makes [-1,-0] inputs, JSON roundtrips, meter receipts and replay strictly identical", async () => {
    const template: Json = [-1, -0];
    const subject: ResearchSubject = { ...numericSubject(), id: "controlled-zero-array", generate: () => template,
      valid: (input) => Array.isArray(input) && input.length === 2 && input.every((item) => typeof item === "number" && Math.abs(item) <= 1_024) && !hasNegativeZero(input),
      async measure(input) {
        if (hasNegativeZero(input)) throw new Error("The executed input was not canonical JSON");
        const values = input as number[];
        return { holds: values[0] <= 0, code: "canonical-array", facts: { last: values[1] } };
      },
    };
    const wireSubject = { ...subject, generate: () => JSON.parse(JSON.stringify(template)) as Json };
    const program: Hypothesis = { schemaVersion: "nexus.conditional-hypothesis.v1", expectedHolds: true,
      when: { op: "lte", feature: "n:/0", threshold: -0 } };
    const { observations, hypothesis } = await setup(subject, trainingInputs.map(({ n }) => [n, 0]), program);
    const legacyObservations = structuredClone(observations);
    legacyObservations.forEach((observation) => { (observation.input as number[])[1] = -0; });
    const seed = "canonical-array-replay", excluded = new Set(observations.map((observation) => observation.inputDigest));
    const samples = sampleHypothesisInputs(subject, hypothesis, seed, excluded, 24);
    expect(samples).toStrictEqual(sampleHypothesisInputs(wireSubject, JSON.parse(JSON.stringify(hypothesis)), seed, excluded, 24));
    expect(samples).toStrictEqual(JSON.parse(JSON.stringify(samples)));
    const entirePool = sampleHypothesisInputs(subject, null, seed, new Set(), 256);
    expect(entirePool.some((sample) => canonical(sample.input) === "[-1,0]")).toBe(true);
    expect(entirePool.every((sample) => !hasNegativeZero(sample.input))).toBe(true);
    const raw = metered(24), wire = metered(24);
    const wireMeter: OracleMeter = { get used() { return wire.meter.used; }, limit: wire.meter.limit,
      async observe(target, input, partition) { return JSON.parse(JSON.stringify(await wire.meter.observe(target, input, partition))) as Observation; },
    };
    const evaluated = await evaluateHypothesis(hypothesis, subject, legacyObservations, raw.meter, "falsification", seed);
    const replayed = await evaluateHypothesis(JSON.parse(JSON.stringify(hypothesis)), wireSubject, observations, wireMeter, "falsification", seed);
    expect(evaluated).toStrictEqual(replayed);
    expect(raw.observations).toStrictEqual(wire.observations);
    expect(raw.observations).toStrictEqual(JSON.parse(JSON.stringify(raw.observations)));
    expect(raw.observations.map((observation) => observation.input)).toStrictEqual(samples.slice(0, evaluated.calls).map((sample) => sample.input));
    expect(hasNegativeZero(template)).toBe(true); // Caller-owned JS data was not mutated.
  });

  it("rejects getter inputs, ASTs and snapshot containers without executing any getter", async () => {
    const { subject, observations, snapshot } = await setup();
    let getterCalls = 0;
    const poison = Object.defineProperty({}, "n", { enumerable: true, get() { getterCalls++; return 0; } }) as Json;
    const valid = vi.fn(() => true);
    expect(sampleHypothesisInputs({ ...subject, generate: () => poison, valid }, null, "getter-root", new Set(), 24)).toEqual([]);
    expect(valid).not.toHaveBeenCalled();
    expect(() => buildTrainingSnapshot([{ ...observations[0], input: poison }], subject)).toThrow();
    const poisonedExample = { ...snapshot, examples: snapshot.examples.map((example, index) => index ? example : { ...example, input: poison }) };
    expect(validateProposal(condition(), poisonedExample).valid).toBe(false);
    const poisonedRoot = Object.defineProperty({ ...snapshot }, "digest", { enumerable: true, get() { getterCalls++; return snapshot.digest; } });
    expect(validateProposal(condition(), poisonedRoot).valid).toBe(false);
    const poisonedArray = [...snapshot.examples];
    Object.defineProperty(poisonedArray, "0", { enumerable: true, get() { getterCalls++; return snapshot.examples[0]; } });
    expect(validateProposal(condition(), { ...snapshot, examples: poisonedArray }).valid).toBe(false);
    const program = condition();
    Object.defineProperty(program.when, "threshold", { enumerable: true, get() { getterCalls++; return 0; } });
    expect(() => proposeHypothesis(subject, snapshot, program, "getter-program")).toThrow();
    expect(() => sampleHypothesisInputs(subject, program, "getter-ast", new Set(), 24)).toThrow();
    expect(getterCalls).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity])("rejects nonfinite %s before serialization instead of quietly changing it to null", async (value) => {
    const { subject, observations, snapshot } = await setup();
    const valid = vi.fn(() => true), input = { n: value };
    expect(sampleHypothesisInputs({ ...subject, generate: () => input, valid }, null, "nonfinite-json", new Set(), 24)).toEqual([]);
    expect(valid).not.toHaveBeenCalled();
    expect(() => buildTrainingSnapshot([{ ...observations[0], input, inputDigest: researchDigest({ n: null }) }], subject)).toThrow();
    expect(validateProposal(condition(), { ...snapshot, examples: snapshot.examples.map((example, index) => index ? example : { ...example, input }) }).valid).toBe(false);
    expect(() => proposeHypothesis(subject, snapshot, condition(value), "nonfinite-program")).toThrow();
  });

  it("validates meter-returned input before canonical hashing, charging a malformed receipt without invoking its getter", async () => {
    const { subject, observations, hypothesis } = await setup();
    const inner = metered(24);
    let getterCalls = 0;
    const meter: OracleMeter = { get used() { return inner.meter.used; }, limit: inner.meter.limit,
      async observe(target, input, partition) {
        const observation = await inner.meter.observe(target, input, partition);
        return { ...observation, input: Object.defineProperty({}, "n", { enumerable: true, get() { getterCalls++; return 0; } }) as Json };
      },
    };
    const result = await evaluateHypothesis(hypothesis, subject, observations, meter, "falsification", "getter-receipt");
    expect(result).toMatchObject({ status: "inconclusive", reason: "oracle-error", calls: 1, observationIds: [] });
    expect(getterCalls).toBe(0);
  });
});

describe("tiny real floating-point instrument check, not a natural-bug or multi-round CEGIS claim", () => {
  it("records eight actual sum-grouping measurements with independently recomputed arithmetic", async () => {
    const subject = researchSubject("sum-grouping-hypothesis");
    const inputs = sampleHypothesisInputs(subject, null, "tiny-real-sum", new Set(), 8).map((sample) => sample.input);
    const { meter, observations } = metered(8);
    for (const input of inputs) await meter.observe(subject, input, "hypothesis-training");
    expect(meter.used).toBe(8);
    for (const observation of observations) {
      const values = observation.input as number[];
      const sum = (input: number[]) => input.reduce((a, b) => a + b, 0);
      const original = sum(values), reordered = sum([...values].sort((a, b) => Math.abs(a) - Math.abs(b)));
      expect(observation.measurement.holds).toBe(original === reordered);
      expect(observation.measurement.facts).toMatchObject({ original, reordered });
    }
    expect(new Set(observations.map((o) => o.measurement.holds)).size).toBe(2);
    const snapshot = buildTrainingSnapshot(observations, subject);
    expect(snapshot.observationIds).toHaveLength(8);
    expect(subject.origin).toBe("generated-challenge");
  });
});
