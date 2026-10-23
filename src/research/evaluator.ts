import { RESEARCH_EVALUATOR_VERSION, type Json, type OracleMeter, type ReducerProgram, type ResearchSubject, type ToolEvaluation } from "./contracts";
import { assertResearchJson, canonical, researchDigest, researchSize } from "./integrity";
import { reduceCounterexample, validateReducerProgram } from "./reducer";
import { researchSubject } from "./catalog";

export { RESEARCH_EVALUATOR_VERSION } from "./contracts";

/** Trusted grading code, never a candidate-provided pass flag. The service records the
 * exact returned receipt privately. This module alone is not hostile-process isolation.
 */
export async function evaluateReducer(
  program: ReducerProgram,
  subject: ResearchSubject,
  freshInput: Json,
  rawMeter: OracleMeter,
): Promise<ToolEvaluation> {
  validateReducerProgram(program);
  assertResearchJson(freshInput);
  // Snapshot before the first await: the caller must not change what was graded.
  const instructions = structuredClone(program);
  const input = structuredClone(freshInput);
  const target = { ...subject, valid: subject.valid, measure: subject.measure };
  const programDigest = researchDigest(instructions);
  const inputDigest = researchDigest(input);
  const observationIds: string[] = [];
  let initialObservationId: string | null = null;
  let finalObservationId: string | null = null;
  let controlObservationId: string | null = null;
  const meter: OracleMeter = {
    get used() { return rawMeter.used; }, get limit() { return rawMeter.limit; },
    async observe(instrument, value, partition) {
      const observed = await rawMeter.observe(instrument, value, partition);
      observationIds.push(observed.id);
      return observed;
    },
  };
  const start = meter.used;
  const originalSize = researchSize(input);
  const allowance = meter.limit - start;
  const result = (accepted: boolean, code: string, reduced: Json, preserved: boolean, controlRejected: boolean): ToolEvaluation => ({
    verifierVersion: RESEARCH_EVALUATOR_VERSION, programDigest, subjectId: target.id, subjectVersion: target.version,
    inputDigest, observationIds: [...observationIds], initialObservationId, finalObservationId, controlObservationId, allowance,
    accepted, code, calls: meter.used - start, originalSize, reducedSize: researchSize(reduced),
    counterexamplePreserved: preserved, controlRejected, reduced: structuredClone(reduced),
  });
  if (meter.limit - meter.used < 5) return result(false, "validation-budget-insufficient", input, false, false);
  const initial = await meter.observe(target, input, "tool-validation");
  initialObservationId = initial.id;
  if (initial.measurement.holds) return result(false, "fresh-counterexample-not-reproduced", input, false, false);
  // Keep fuel for independent final re-execution and the healthy-input negative control.
  const reduction = await reduceCounterexample(instructions, input, target.valid, async (candidate) => {
    const observation = await meter.observe(target, candidate, "tool-validation");
    return !observation.measurement.holds;
  }, Math.min(48, meter.limit - meter.used - 2));
  const final = await meter.observe(target, reduction.reduced, "tool-validation");
  finalObservationId = final.id;
  const preserved = !final.measurement.holds && target.valid(reduction.reduced);
  const control = researchSubject("integer-sum-control");
  const healthyInput = control.generate("control");
  const healthy = await reduceCounterexample(instructions, healthyInput, control.valid, async (candidate) => {
    const observation = await meter.observe(control, candidate, "tool-validation");
    controlObservationId = observation.id;
    return !observation.measurement.holds;
  }, 1);
  const controlRejected = healthy.status === "not-counterexample" && canonical(healthy.reduced) === canonical(healthyInput);
  const strictReduction = reduction.status === "reduced" && reduction.counterexamplePreserved &&
    canonical(reduction.original) === canonical(input) && reduction.originalSize === originalSize &&
    researchSize(reduction.reduced) < originalSize;
  const accepted = preserved && strictReduction && controlRejected;
  return result(accepted, accepted ? "fresh-witness-reduced-and-rechecked" : !preserved ? "counterexample-lost" : !strictReduction ? "no-measurable-reduction" : "healthy-control-not-rejected", reduction.reduced, preserved, controlRejected);
}
