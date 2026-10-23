import { REDUCER_SCHEMA, type Json, type ReducerProgram, type ReductionOperator, type ReductionResult } from "./contracts";
import { assertResearchJson, canonical, researchDigest, researchSize } from "./integrity";

const OPERATORS: readonly ReductionOperator[] = [
  "chunk-array", "delete-entry", "halve-number", "decrement-number", "shorten-string",
];
const MAX_PASSES = 32;
const MAX_ORACLE_CALLS = 20_000;
const MAX_CANDIDATES = 512;
const MAX_SYNTHESIS_PROGRAMS = 85;
const CALLS_PER_TRIAL = 16;

type Valid = (input: Json) => boolean;
/** True means the input still violates the relation, not that the relation holds. */
type Counterexample = (input: Json) => boolean | Promise<boolean>;

/** Only finite data is accepted. There are no expression, code, path or import nodes. */
export function validateReducerProgram(value: unknown): asserts value is ReducerProgram {
  assertResearchJson(value);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Reducer program must be a plain data object");
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 3 || !["schemaVersion", "operators", "maxPasses"].every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && "value" in descriptor;
  })) throw new Error("Reducer program has unknown or missing fields");
  if (value.schemaVersion !== REDUCER_SCHEMA) throw new Error("Unsupported reducer schema");
  if (!Array.isArray(value.operators) || value.operators.length < 1 || value.operators.length > OPERATORS.length
    || value.operators.some((operator) => !OPERATORS.includes(operator as ReductionOperator))
    || new Set(value.operators).size !== value.operators.length) {
    throw new Error("Reducer operators must be a nonempty, unique whitelist sequence");
  }
  if (typeof value.maxPasses !== "number" || !Number.isSafeInteger(value.maxPasses)
    || value.maxPasses < 1 || value.maxPasses > MAX_PASSES) {
    throw new Error("Reducer pass count outside bounds");
  }
}

function validateLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_ORACLE_CALLS) {
    throw new Error("Reducer oracle budget outside bounds");
  }
}

function clone(value: Json): Json {
  return JSON.parse(canonical(value)) as Json;
}

function frozenCopy(value: Json): Json {
  function freeze(item: Json): Json {
    if (item !== null && typeof item === "object") {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
    return item;
  }
  return freeze(clone(value));
}

/** Each primitive produces replacements of one node; the interpreter lifts them over the tree. */
function* localEdits(value: Json, operator: ReductionOperator): Generator<Json> {
  switch (operator) {
    case "delete-entry":
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) {
          yield [...value.slice(0, index), ...value.slice(index + 1)];
        }
      } else if (value !== null && typeof value === "object") {
        for (const key of Object.keys(value).sort()) {
          yield Object.fromEntries(Object.entries(value).filter(([entry]) => entry !== key));
        }
      }
      break;
    case "halve-number":
      // Halving is toward zero, including fractional JSON numbers.
      if (typeof value === "number" && value !== 0) yield Math.trunc(value / 2);
      break;
    case "decrement-number":
      if (typeof value === "number" && value !== 0) {
        yield value - Math.sign(value) * Math.min(1, Math.abs(value));
      }
      break;
    case "shorten-string":
      if (typeof value === "string" && value.length > 0) {
        yield "";
        yield value.slice(0, Math.floor(value.length / 2));
        yield value.slice(Math.ceil(value.length / 2));
        yield value.slice(0, -1);
        yield value.slice(1);
      }
      break;
    case "chunk-array":
      if (Array.isArray(value) && value.length > 0) {
        yield [];
        for (let width = Math.ceil(value.length / 2); width >= 1; width = Math.floor(width / 2)) {
          for (let start = 0; start < value.length; start += width) {
            yield [...value.slice(0, start), ...value.slice(start + width)];
          }
        }
      }
      break;
  }
}

function* treeEdits(value: Json, operator: ReductionOperator): Generator<Json> {
  yield* localEdits(value, operator);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      for (const child of treeEdits(value[index], operator)) {
        const result = value.slice();
        result[index] = child;
        yield result;
      }
    }
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value).sort()) {
      for (const child of treeEdits(value[key], operator)) yield { ...value, [key]: child };
    }
  }
}

/**
 * Zero-oracle scheduling hint, not counterexample evidence or certification. Look for one
 * in-domain, strictly smaller immediate edit using the interpreter's own primitives. False
 * means none was found within the local candidate cap, not that transfer is impossible.
 */
export function hasReductionCandidate(program: ReducerProgram, input: Json, valid: Valid): boolean {
  validateReducerProgram(program);
  assertResearchJson(input);
  if (typeof valid !== "function") throw new Error("Reducer requires domain instrumentation");
  const operators = [...program.operators];
  const original = clone(input);
  const originalSize = researchSize(original);
  const seen = new Set([researchDigest(original)]);
  let candidates = 0;
  try {
    if (valid(frozenCopy(original)) !== true) return false;
    for (const operator of operators) {
      for (const candidate of treeEdits(original, operator)) {
        if (++candidates > MAX_CANDIDATES) return false;
        if (researchSize(candidate) >= originalSize) continue;
        const digest = researchDigest(candidate);
        if (seen.has(digest)) continue;
        seen.add(digest);
        const outcome = valid(frozenCopy(candidate));
        if (typeof outcome !== "boolean") return false;
        if (outcome) return true;
      }
    }
  } catch {
    // Domain instrumentation failures are never optimistic compatibility evidence.
    return false;
  }
  return false;
}

/**
 * Execute the closed DSL, never source code. Domain checks are local, synchronous and unmetered;
 * every predicate attempt is an oracle call, including initial/final checks and thrown calls.
 * A changed result always reserves one call for a fresh posterior check. Callback failures or
 * a failed posterior roll back the whole attempt rather than claiming an unverified gain.
 */
export async function reduceCounterexample(
  program: ReducerProgram,
  input: Json,
  valid: Valid,
  predicate: Counterexample,
  limit: number,
): Promise<ReductionResult> {
  validateReducerProgram(program);
  assertResearchJson(input);
  validateLimit(limit);
  if (typeof valid !== "function" || typeof predicate !== "function") {
    throw new Error("Reducer requires domain and counterexample instrumentation");
  }
  // Snapshot both data inputs before awaiting any external instrumentation.
  const instructions: ReducerProgram = {
    schemaVersion: REDUCER_SCHEMA, operators: [...program.operators], maxPasses: program.maxPasses,
  };
  const original = clone(input);
  const originalSize = researchSize(original);
  let current = original;
  let currentSize = originalSize;
  let calls = 0;
  let exhausted = limit === 0;
  let failed = false;
  let preserved = false;
  const trace: ReductionResult["trace"] = [];

  function result(status: ReductionResult["status"]): ReductionResult {
    return {
      status, counterexamplePreserved: preserved,
      original: clone(original), reduced: clone(current), originalSize, reducedSize: currentSize,
      calls, exhausted: exhausted || calls >= limit, trace: [...trace],
    };
  }
  function rollback(): ReductionResult {
    current = original;
    currentSize = originalSize;
    trace.length = 0;
    preserved = false;
    return result("oracle-error");
  }
  function inDomain(candidate: Json): boolean {
    try {
      const outcome = valid(frozenCopy(candidate));
      if (typeof outcome !== "boolean") failed = true;
      return outcome === true;
    } catch {
      failed = true;
      return false;
    }
  }
  async function observe(candidate: Json): Promise<boolean> {
    if (calls >= limit) {
      exhausted = true;
      return false;
    }
    // Bill before invoking the oracle; exceptions must never erase consumed work.
    calls++;
    try {
      const outcome = await predicate(frozenCopy(candidate));
      if (typeof outcome !== "boolean") failed = true;
      return outcome === true;
    } catch {
      failed = true;
      return false;
    }
  }

  if (limit === 0) return result("budget-exhausted");
  if (!inDomain(original)) return failed ? rollback() : result("not-counterexample");
  if (!await observe(original)) return failed ? rollback() : result("not-counterexample");
  preserved = true;
  const seen = new Set([researchDigest(original)]);
  let candidates = 0;

  search: for (let pass = 0; pass < instructions.maxPasses; pass++) {
    let changed = false;
    for (const operator of instructions.operators) {
      for (const candidate of treeEdits(current, operator)) {
        if (++candidates > MAX_CANDIDATES) break search;
        const size = researchSize(candidate);
        // Equality is not progress, even if serialization differs (e.g. a numeric size plateau).
        if (size >= currentSize) continue;
        const digest = researchDigest(candidate);
        if (seen.has(digest)) continue;
        seen.add(digest);
        if (!inDomain(candidate)) {
          if (failed) return rollback();
          continue;
        }
        // Never spend the call needed to validate the final changed output.
        if (limit - calls < 2) {
          exhausted = true;
          break search;
        }
        if (await observe(candidate)) {
          trace.push({ operator, beforeDigest: researchDigest(current), afterDigest: digest });
          current = candidate;
          currentSize = size;
          changed = true;
          break;
        }
        if (failed) return rollback();
      }
    }
    if (!changed) break;
  }

  if (trace.length === 0) return result(exhausted || calls >= limit ? "budget-exhausted" : "stuck");
  if (!inDomain(current) || !await observe(current)) return rollback();
  return result("reduced");
}

/** Generic schedules only: no subject, bug identifier or expected counterexample is an input. */
function* programs(): Generator<ReducerProgram> {
  function program(operators: ReductionOperator[]): ReducerProgram {
    return { schemaVersion: REDUCER_SCHEMA, operators, maxPasses: MAX_PASSES };
  }
  // Uniform grammar, breadth first: all nonrepeating sequences of lengths 1..3.
  // No preassembled full-capability chain receives a privileged early trial (5 + 20 + 60).
  function* sequences(prefix: ReductionOperator[], depth: number): Generator<ReducerProgram> {
    if (prefix.length === depth) {
      yield program(prefix);
      return;
    }
    for (const operator of OPERATORS) {
      if (!prefix.includes(operator)) yield* sequences([...prefix, operator], depth);
    }
  }
  for (let depth = 1; depth <= 3; depth++) yield* sequences([], depth);
}

/** Bounded empirical synthesis, not certification. An independent evaluator must check reuse. */
export async function synthesizeReducer(
  input: Json,
  valid: Valid,
  predicate: Counterexample,
  limit: number,
): Promise<{ program: ReducerProgram | null; calls: number; trials: number }> {
  assertResearchJson(input);
  validateLimit(limit);
  if (typeof valid !== "function" || typeof predicate !== "function") {
    throw new Error("Reducer requires domain and counterexample instrumentation");
  }
  const original = clone(input);
  let best: ReducerProgram | null = null;
  let bestSize = researchSize(original);
  let calls = 0;
  let trials = 0;
  for (const program of programs()) {
    if (calls >= limit || trials >= MAX_SYNTHESIS_PROGRAMS || (trials > 0 && limit - calls < 3)) break;
    trials++;
    const outcome = await reduceCounterexample(program, original, valid, predicate, Math.min(CALLS_PER_TRIAL, limit - calls));
    calls += outcome.calls;
    if (outcome.status === "oracle-error" || outcome.status === "not-counterexample") {
      return { program: null, calls, trials };
    }
    if (outcome.status !== "reduced" || !outcome.counterexamplePreserved || outcome.reducedSize >= outcome.originalSize) continue;
    if (outcome.reducedSize < bestSize
      || (outcome.reducedSize === bestSize && best !== null && program.operators.length < best.operators.length)) {
      best = program;
      bestSize = outcome.reducedSize;
    }
  }
  return { program: best, calls, trials };
}

/** Portable ESM data module: consumers validate this AST and run the trusted interpreter. */
export function renderReducerSource(program: ReducerProgram): string {
  validateReducerProgram(program);
  const data: ReducerProgram = {
    schemaVersion: REDUCER_SCHEMA, operators: [...program.operators], maxPasses: program.maxPasses,
  };
  return `// NEXUS-7 closed reducer data DSL; execute only with a validating interpreter.\nexport default ${JSON.stringify(data, null, 2)};\n`;
}
