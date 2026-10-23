// @vitest-environment node
import { describe, expect, it } from "vitest";
import { REDUCER_SCHEMA, type Json, type Observation, type OracleMeter, type ReducerProgram, type ResearchSubject } from "./contracts";
import { evaluateReducer } from "./evaluator";
import { evaluationEvidenceErrors } from "./evidence";
import { researchDigest } from "./integrity";

const subject: ResearchSubject = {
  id: "conditional-number", version: "1", family: "fixture", origin: "generated-challenge", interpretation: "declared-contract",
  title: { en: "Number", zh: "数值" }, claim: { en: "Fixture", zh: "夹具" }, generate: () => ({ n: 8 }),
  valid(input) { return input !== null && !Array.isArray(input) && typeof input === "object" && Object.keys(input).length === 1 && typeof input.n === "number" && Number.isInteger(input.n) && input.n >= 0 && input.n <= 64; },
  async measure(input) { const n = (input as { n: number }).n; return { holds: n === 0, code: "tiny-counterexample", facts: { n } }; },
};
function metered(limit = 64, afterCopy?: (count: number) => void) {
  let used = 0;
  const observations: Observation[] = [];
  const meter: OracleMeter = {
    get used() { return used; }, limit,
    async observe(target, input, partition) {
      if (used >= limit) throw new Error("fixture fuel exhausted");
      used++;
      const copy = structuredClone(input);
      afterCopy?.(used);
      await Promise.resolve();
      const record = { id: `tiny-${used}`, subjectId: target.id, subjectVersion: target.version, input: copy,
        inputDigest: researchDigest(copy), partition, measurement: await target.measure(copy) };
      observations.push(record);
      return record;
    },
  };
  return { meter, observations };
}

describe("kernel evaluator bindings", () => {
  it("certifies an actual reduction and binds exact input/output/control receipts and fuel", async () => {
    const { meter, observations } = metered();
    const program: ReducerProgram = { schemaVersion: REDUCER_SCHEMA, operators: ["halve-number"], maxPasses: 32 };
    const evaluation = await evaluateReducer(program, subject, { n: 8 }, meter);
    expect(evaluation).toMatchObject({ accepted: true, reduced: { n: 1 }, allowance: 64, programDigest: researchDigest(program) });
    expect(evaluation.observationIds).toEqual(observations.map((record) => record.id));
    expect(evaluation.calls).toBe(meter.used);
    expect(evaluationEvidenceErrors(evaluation, observations)).toEqual([]);
    expect(evaluationEvidenceErrors({ ...evaluation, reduced: { n: 0 }, reducedSize: 3 }, observations)).toContain("evaluation-final-binding");
  });

  it("cannot gain size reduction by mutating an input across await", async () => {
    const input = { n: 64 };
    const program: ReducerProgram = { schemaVersion: REDUCER_SCHEMA, operators: ["shorten-string"], maxPasses: 32 };
    const { meter } = metered(64, (count) => { if (count === 1) input.n = 1; });
    const evaluation = await evaluateReducer(program, subject, input, meter);
    expect(evaluation.accepted).toBe(false);
    expect(evaluation.reduced).toEqual({ n: 64 });
    expect(evaluation.reducedSize).toBe(evaluation.originalSize);
    expect(evaluation.inputDigest).toBe(researchDigest({ n: 64 }));
  });

  it("snapshots the program before an asynchronous observation", async () => {
    const program: ReducerProgram = { schemaVersion: REDUCER_SCHEMA, operators: ["halve-number"], maxPasses: 32 };
    const digest = researchDigest(program);
    const { meter } = metered(64, (count) => { if (count === 1) program.operators = ["shorten-string"]; });
    const evaluation = await evaluateReducer(program, subject, { n: 8 }, meter);
    expect(evaluation.accepted).toBe(true);
    expect(evaluation.programDigest).toBe(digest);
  });

  it("rejects healthy inputs and insufficient fuel without inventing control receipts", async () => {
    const program: ReducerProgram = { schemaVersion: REDUCER_SCHEMA, operators: ["halve-number"], maxPasses: 32 };
    const none = metered(0);
    expect(await evaluateReducer(program, subject, { n: 8 }, none.meter)).toMatchObject({ accepted: false, calls: 0, initialObservationId: null, controlObservationId: null });
    const healthy = metered();
    const result = await evaluateReducer(program, subject, { n: 0 } as Json, healthy.meter);
    expect(result).toMatchObject({ accepted: false, calls: 1, finalObservationId: null, controlObservationId: null });
    expect(evaluationEvidenceErrors(result, healthy.observations)).toEqual([]);
  });
});
