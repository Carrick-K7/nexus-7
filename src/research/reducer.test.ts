// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { REDUCER_SCHEMA, type Json, type ReducerProgram, type ReductionOperator } from "./contracts";
import { researchDigest, researchSize } from "./integrity";
import { hasReductionCandidate, reduceCounterexample, renderReducerSource, synthesizeReducer, validateReducerProgram } from "./reducer";

function program(...operators: ReductionOperator[]): ReducerProgram {
  return { schemaVersion: REDUCER_SCHEMA, operators, maxPasses: 32 };
}
const numberDomain = (input: Json): boolean => typeof input === "number" && input >= 0;
const positive = (input: Json): boolean => typeof input === "number" && input > 0;
const anything = (): boolean => true;

function isRecord(value: Json): value is { [key: string]: Json } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

describe("closed reducer DSL", () => {
  it("validates the whitelist and renders a real portable data module without executing code", async () => {
    const ast = program("chunk-array", "delete-entry", "halve-number", "decrement-number", "shorten-string");
    expect(() => validateReducerProgram(ast)).not.toThrow();
    const source = renderReducerSource(ast);
    expect(source).not.toMatch(/\b(?:eval|Function|import|require|process|fetch)\s*\(/);
    // The artifact is a literal module, parsed as data here, never eval'ed or imported.
    const literal = source.slice(source.indexOf("export default ") + "export default ".length).trim().replace(/;$/, "");
    const portable: unknown = JSON.parse(literal);
    validateReducerProgram(portable);
    expect(portable).toEqual(ast);
    const result = await reduceCounterexample(portable, { nested: { n: 64 }, padding: "discard" },
      (input) => isRecord(input) && isRecord(input.nested) && typeof input.nested.n === "number",
      (input) => isRecord(input) && isRecord(input.nested) && Number(input.nested.n) > 2, 40);
    expect(result.status).toBe("reduced");
    expect(result.reducedSize).toBeLessThan(result.originalSize);
    expect(result.counterexamplePreserved).toBe(true);
  });

  it.each([
    null,
    [],
    {},
    { ...program("halve-number"), schemaVersion: "javascript.v1" },
    { ...program("halve-number"), operators: [] },
    { ...program("halve-number"), operators: ["eval"] },
    { ...program("halve-number"), operators: ["import('node:child_process')"] },
    { ...program("halve-number"), operators: ["halve-number", "halve-number"] },
    { ...program("halve-number"), operators: [{ operator: "halve-number", expression: "globalThis" }] },
    { ...program("halve-number"), maxPasses: 0 },
    { ...program("halve-number"), maxPasses: 33 },
    { ...program("halve-number"), maxPasses: 1.5 },
    { ...program("halve-number"), maxPasses: NaN },
    { ...program("halve-number"), maxPasses: Infinity },
    { ...program("halve-number"), source: "process.exit(0)" },
    { ...program("halve-number"), shell: "touch /tmp/not-executed" },
    JSON.parse('{"schemaVersion":"nexus.counterexample-reducer.v1","operators":["halve-number"],"maxPasses":2,"__proto__":{"polluted":true}}'),
  ])("rejects a malformed or malicious program %#", (value) => {
    expect(() => validateReducerProgram(value)).toThrow();
    expect(() => renderReducerSource(value as ReducerProgram)).toThrow();
    expect(() => hasReductionCandidate(value as ReducerProgram, 8, numberDomain)).toThrow();
  });

  it("rejects prototypes, cycles, accessors and hidden fields without invoking getters", () => {
    const getter = vi.fn(() => ["halve-number"]);
    const accessor = { schemaVersion: REDUCER_SCHEMA, get operators() { return getter(); }, maxPasses: 2 };
    const cycle: Record<string, unknown> = { ...program("halve-number") };
    cycle.extra = cycle;
    const hidden = Object.defineProperty(program("halve-number"), "hidden", { value: "code", enumerable: false });
    const symbol = { ...program("halve-number"), [Symbol("hidden")]: "code" };
    const arrayPrototype = Object.setPrototypeOf(["halve-number"], { ...Array.prototype });
    for (const value of [accessor, cycle, hidden, symbol, Object.create(program("halve-number")),
      { ...program("halve-number"), operators: arrayPrototype },
      { ...program("halve-number"), operators: new Array(1) }]) {
      expect(() => validateReducerProgram(value)).toThrow();
      expect(() => hasReductionCandidate(value as ReducerProgram, 8, numberDomain)).toThrow();
    }
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("bounded tree reduction", () => {
  it.each<[{ name: ReductionOperator; input: Json; expected: Json }]>([
    [{ name: "delete-entry", input: { nested: { keep: true, extra: false } }, expected: { nested: { keep: true } } }],
    [{ name: "halve-number", input: { nested: [-64] }, expected: { nested: [0] } }],
    [{ name: "decrement-number", input: { nested: [1] }, expected: { nested: [0] } }],
    [{ name: "shorten-string", input: { nested: ["abcdef"] }, expected: { nested: [""] } }],
    [{ name: "chunk-array", input: { nested: [1, 2, 3, 4] }, expected: { nested: [] } }],
  ])("applies $name recursively while preserving the domain", async ({ name, input, expected }) => {
    const valid = (value: Json): boolean => {
      if (!isRecord(value) || !Object.hasOwn(value, "nested")) return false;
      return name !== "delete-entry" || (isRecord(value.nested) && value.nested.keep === true);
    };
    const result = await reduceCounterexample(program(name), input, valid, anything, 40);
    expect(result.status).toBe("reduced");
    expect(result.reduced).toEqual(expected);
    expect(result.reducedSize).toBeLessThan(result.originalSize);
    expect(result.counterexamplePreserved).toBe(true);
    expect(result.trace.every((step) => step.operator === name && step.beforeDigest !== step.afterDigest)).toBe(true);
    expect(result.trace[0].beforeDigest).toBe(researchDigest(input));
    expect(result.trace.at(-1)?.afterDigest).toBe(researchDigest(result.reduced));
  });

  it("chunks arrays even when deleting a single entry violates the domain", async () => {
    const input: Json = [1, 2, 3, 4, 5, 6, 7, 8];
    const valid = (value: Json): boolean => Array.isArray(value) && value.length >= 2 && value.length % 2 === 0;
    const stuck = await reduceCounterexample(program("delete-entry"), input, valid, anything, 32);
    const shrunk = await reduceCounterexample(program("chunk-array"), input, valid, anything, 32);
    expect(stuck.status).toBe("stuck");
    expect(stuck.calls).toBe(1);
    expect(shrunk.status).toBe("reduced");
    expect(shrunk.reduced).toHaveLength(2);
  });

  it("never treats a size plateau as a gain or spends oracle calls on it", async () => {
    const predicate = vi.fn(positive);
    expect(researchSize(10)).toBe(researchSize(9));
    const result = await reduceCounterexample(program("decrement-number"), 10, numberDomain, predicate, 8);
    expect(result).toMatchObject({ status: "stuck", reduced: 10, calls: 1, trace: [], counterexamplePreserved: true });
    expect(predicate).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a healthy relation, invalid input, and an irreducible counterexample", async () => {
    const healthy = await reduceCounterexample(program("halve-number"), 16, numberDomain, () => false, 10);
    const invalid = await reduceCounterexample(program("halve-number"), -1, numberDomain, anything, 10);
    const stuck = await reduceCounterexample(program("halve-number"), 1, numberDomain, positive, 10);
    expect(healthy).toMatchObject({ status: "not-counterexample", calls: 1, counterexamplePreserved: false, trace: [] });
    expect(invalid).toMatchObject({ status: "not-counterexample", calls: 0, counterexamplePreserved: false });
    expect(stuck).toMatchObject({ status: "stuck", reduced: 1, calls: 2, counterexamplePreserved: true });
  });

  it("retains valid counterexamples at every accepted step and does not mutate the source", async () => {
    const input: Json = { numbers: [32, 16, 8], note: "padding" };
    const before = JSON.stringify(input);
    const valid = (value: Json): boolean => isRecord(value) && Array.isArray(value.numbers) && value.numbers.length > 0;
    const calls: Json[] = [];
    const predicate = (value: Json): boolean => {
      calls.push(value);
      return isRecord(value) && Array.isArray(value.numbers) && value.numbers.some((n) => typeof n === "number" && n > 2);
    };
    const result = await reduceCounterexample(program("chunk-array", "delete-entry", "halve-number"), input, valid, predicate, 40);
    expect(result.status).toBe("reduced");
    expect(valid(result.reduced)).toBe(true);
    expect(result.reducedSize).toBeLessThan(result.originalSize);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.calls).toBe(calls.length);
    for (const call of calls) expect(valid(call)).toBe(true);
    expect(calls.at(-1)).toEqual(result.reduced);
    expect(result.trace.length).toBeGreaterThan(0);
    const measured = new Map(calls.map((value) => [researchDigest(value), value]));
    for (const step of result.trace) {
      const beforeStep = measured.get(step.beforeDigest);
      const afterStep = measured.get(step.afterDigest);
      expect(beforeStep).toBeDefined();
      expect(afterStep).toBeDefined();
      if (beforeStep === undefined || afterStep === undefined) throw new Error("Trace lacks measured inputs");
      expect(researchSize(afterStep)).toBeLessThan(researchSize(beforeStep));
      expect(valid(afterStep)).toBe(true);
      expect(isRecord(afterStep) && Array.isArray(afterStep.numbers)
        && afterStep.numbers.some((n) => typeof n === "number" && n > 2)).toBe(true);
    }
  });

  it("bounds local candidate enumeration even when no candidate is valid", async () => {
    const input: Json = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`key${index}`, Array(32).fill(64)]));
    const originalDigest = researchDigest(input);
    const valid = vi.fn((value: Json) => researchDigest(value) === originalDigest);
    const predicate = vi.fn(anything);
    const result = await reduceCounterexample(program("delete-entry", "halve-number"), input, valid, predicate, 20_000);
    expect(result).toMatchObject({ status: "stuck", calls: 1, counterexamplePreserved: true });
    expect(valid.mock.calls.length).toBeLessThanOrEqual(513);
    expect(predicate).toHaveBeenCalledTimes(1);
  });

  it("snapshots the program and input across awaited instrumentation", async () => {
    const ast = program("halve-number");
    const input = { n: 64 };
    let calls = 0;
    const result = await reduceCounterexample(ast, input, anything, async (value) => {
      if (++calls === 1) {
        input.n = 0;
        ast.operators.length = 0;
        ast.maxPasses = 0;
        await Promise.resolve();
      }
      return isRecord(value) && typeof value.n === "number" && value.n > 1;
    }, 20);
    expect(result.original).toEqual({ n: 64 });
    expect(result.status).toBe("reduced");
    expect(result.reduced).toEqual({ n: 2 });
  });

  it("does not let an oracle mutate the tree it is verifying", async () => {
    const input = { n: 32 };
    const result = await reduceCounterexample(program("halve-number"), input, anything, (value) => {
      (value as { n: number }).n = 0;
      return true;
    }, 12);
    expect(result).toMatchObject({ status: "oracle-error", calls: 1, reduced: input, counterexamplePreserved: false });
    expect(input.n).toBe(32);
  });
});

describe("oracle accounting and fail-closed bounds", () => {
  it("makes zero instrumentation calls at budget zero, including synthesis", async () => {
    const valid = vi.fn(numberDomain);
    const predicate = vi.fn(positive);
    const result = await reduceCounterexample(program("halve-number"), 64, valid, predicate, 0);
    expect(result).toMatchObject({ status: "budget-exhausted", calls: 0, reduced: 64, exhausted: true, counterexamplePreserved: false });
    expect(await synthesizeReducer(64, valid, predicate, 0)).toEqual({ program: null, calls: 0, trials: 0 });
    expect(valid).not.toHaveBeenCalled();
    expect(predicate).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3, 4, 8, 16])("charges every call and reserves the posterior within limit %i", async (limit) => {
    const predicate = vi.fn(positive);
    const result = await reduceCounterexample(program("halve-number"), 64, numberDomain, predicate, limit);
    expect(result.calls).toBe(predicate.mock.calls.length);
    expect(result.calls).toBeLessThanOrEqual(limit);
    if (limit < 3) {
      expect(result.status).toBe("budget-exhausted");
      expect(result.reduced).toBe(64);
    } else {
      expect(result.status).toBe("reduced");
      expect(result.calls).toBeGreaterThanOrEqual(3);
      expect(predicate.mock.calls.at(-1)?.[0]).toEqual(result.reduced);
      expect(result.counterexamplePreserved).toBe(true);
    }
  });

  it.each([1, 2, 3])("charges a thrown oracle at invocation %i and rolls back", async (throwAt) => {
    let attempts = 0;
    const result = await reduceCounterexample(program("halve-number"), 64, numberDomain, async () => {
      if (++attempts === throwAt) throw new Error("instrumentation unavailable");
      return true;
    }, throwAt === 3 ? 3 : 10);
    expect(result).toMatchObject({ status: "oracle-error", calls: throwAt, reduced: 64, trace: [], counterexamplePreserved: false });
    expect(attempts).toBe(throwAt);
  });

  it("rejects a posterior that no longer reproduces rather than advertising a gain", async () => {
    let attempts = 0;
    const result = await reduceCounterexample(program("halve-number"), 64, numberDomain, () => ++attempts < 3, 3);
    expect(result).toMatchObject({ status: "oracle-error", reduced: 64, calls: 3, counterexamplePreserved: false, trace: [] });
  });

  it("fails closed on non-boolean and throwing callbacks", async () => {
    const notBoolean = await reduceCounterexample(program("halve-number"), 64, anything,
      (() => "yes") as unknown as (input: Json) => boolean, 8);
    expect(notBoolean).toMatchObject({ status: "oracle-error", calls: 1 });
    const throwingValid = await reduceCounterexample(program("halve-number"), 64, () => { throw new Error("invalid"); }, anything, 8);
    expect(throwingValid).toMatchObject({ status: "oracle-error", calls: 0 });
  });

  it.each([-1, 0.5, NaN, Infinity, 20_001])("rejects invalid budget %s before invoking an oracle", async (limit) => {
    const predicate = vi.fn(positive);
    await expect(reduceCounterexample(program("halve-number"), 8, numberDomain, predicate, limit)).rejects.toThrow();
    await expect(synthesizeReducer(8, numberDomain, predicate, limit)).rejects.toThrow();
    expect(predicate).not.toHaveBeenCalled();
  });

  it("rejects unsafe or oversized JSON before instrumentation, even at budget zero", async () => {
    const cycle: Json[] = [];
    cycle.push(cycle);
    const getter = vi.fn(() => 1);
    const accessor = { get n() { return getter(); } };
    let deep: Json = 1;
    for (let index = 0; index < 14; index++) deep = { child: deep };
    const values: unknown[] = [
      NaN, Infinity, 1_000_000_001, "x".repeat(4097), Array(129).fill(1), Array(1),
      cycle, deep, new Date(), Object.create({ n: 1 }), accessor,
      { [Symbol("secret")]: 1 }, Object.defineProperty({}, "n", { value: 1 }),
      { constructor: 1 }, JSON.parse('{"__proto__":{"polluted":true}}'),
      Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`key${index}`, 0])),
      Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`key${index}`, Array(32).fill(null)])),
      Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`key${index}`, "x".repeat(4096)])),
    ];
    const predicate = vi.fn(positive);
    for (const value of values) {
      await expect(reduceCounterexample(program("halve-number"), value as Json, anything, predicate, 0)).rejects.toThrow();
      await expect(synthesizeReducer(value as Json, anything, predicate, 0)).rejects.toThrow();
      expect(() => hasReductionCandidate(program("halve-number"), value as Json, anything)).toThrow();
    }
    expect(predicate).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("zero-oracle domain compatibility hint", () => {
  it("uses the same AST across scalar, object and nested-array schemas without subject names", () => {
    const ast = program("shorten-string");
    const before = JSON.stringify(ast);
    expect(hasReductionCandidate(ast, "long text", (value) => typeof value === "string" && value.length >= 1)).toBe(true);
    expect(hasReductionCandidate(ast, { nested: ["long text"] }, (value) => isRecord(value)
      && Array.isArray(value.nested) && typeof value.nested[0] === "string" && value.nested[0].length >= 1)).toBe(true);
    expect(hasReductionCandidate(ast, { horizon: 64, weights: [1, 2, 3] }, anything)).toBe(false);
    expect(hasReductionCandidate(program("halve-number"), { nested: [64] }, anything)).toBe(true);
    expect(JSON.stringify(ast)).toBe(before);
  });

  it("requires the initial domain and a valid strictly smaller edit, not merely an applicable primitive", () => {
    expect(hasReductionCandidate(program("halve-number"), 64, () => false)).toBe(false);
    expect(hasReductionCandidate(program("shorten-string"), "fixed", (value) => value === "fixed")).toBe(false);
    expect(hasReductionCandidate(program("decrement-number"), 10, numberDomain)).toBe(false);
    expect(hasReductionCandidate(program("decrement-number"), 8, numberDomain)).toBe(true);
    const evenArray = (value: Json): boolean => Array.isArray(value) && value.length >= 2 && value.length % 2 === 0;
    expect(hasReductionCandidate(program("delete-entry"), [1, 2, 3, 4], evenArray)).toBe(false);
    expect(hasReductionCandidate(program("chunk-array"), [1, 2, 3, 4], evenArray)).toBe(true);
  });

  it("does not call a healthy oracle and makes no counterexample-preservation claim", async () => {
    const healthyOracle = vi.fn(() => false);
    const ast = program("halve-number");
    expect(hasReductionCandidate(ast, 64, numberDomain)).toBe(true);
    expect(healthyOracle).not.toHaveBeenCalled();
    const healthy = await reduceCounterexample(ast, 64, numberDomain, healthyOracle, 8);
    expect(healthy).toMatchObject({ status: "not-counterexample", calls: 1, counterexamplePreserved: false });
    expect(healthyOracle).toHaveBeenCalledTimes(1);

    // A valid edit can also erase the only counterexample; compatibility cannot certify it.
    const isolatedCounterexample = vi.fn((value: Json) => value === 64);
    expect(hasReductionCandidate(ast, 64, numberDomain)).toBe(true);
    expect(isolatedCounterexample).not.toHaveBeenCalled();
    const stuck = await reduceCounterexample(ast, 64, numberDomain, isolatedCounterexample, 8);
    expect(stuck.status).toBe("stuck");
    expect(stuck.reduced).toBe(64);
  });

  it("fails closed on throwing and non-boolean domain callbacks", () => {
    const ast = program("halve-number");
    expect(hasReductionCandidate(ast, 64, () => { throw new Error("unavailable"); })).toBe(false);
    let calls = 0;
    expect(hasReductionCandidate(ast, 64, () => {
      if (++calls === 2) throw new Error("candidate rejected unexpectedly");
      return true;
    })).toBe(false);
    expect(calls).toBe(2);
    expect(hasReductionCandidate(ast, 64, (() => "yes") as unknown as (value: Json) => boolean)).toBe(false);
    calls = 0;
    expect(hasReductionCandidate(ast, 64, (() => ++calls === 1 ? true : "yes") as unknown as (value: Json) => boolean)).toBe(false);
  });

  it("caps local enumeration at 512 candidates with no oracle budget to consume", () => {
    const input: Json = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`key${index}`, Array(32).fill(64)]));
    const originalDigest = researchDigest(input);
    const valid = vi.fn((value: Json) => researchDigest(value) === originalDigest);
    expect(hasReductionCandidate(program("delete-entry", "halve-number"), input, valid)).toBe(false);
    expect(valid.mock.calls.length).toBeLessThanOrEqual(513);
  });

  it("snapshots caller-owned data and freezes each domain-check argument", () => {
    const ast = program("shorten-string");
    const input = { text: "long text" };
    let calls = 0;
    expect(hasReductionCandidate(ast, input, (value) => {
      if (++calls === 1) {
        ast.operators.length = 0;
        input.text = "";
      }
      return isRecord(value) && typeof value.text === "string" && value.text.length >= 1;
    })).toBe(true);
    const pristine = { text: "long text" };
    expect(hasReductionCandidate(program("shorten-string"), pristine, (value) => {
      (value as { text: string }).text = "mutated";
      return true;
    })).toBe(false);
    expect(pristine).toEqual({ text: "long text" });
  });

  it("rejects prototype and accessor risks before calling local domain instrumentation", () => {
    const valid = vi.fn(anything);
    const getter = vi.fn(() => "secret");
    const accessor = { get text() { return getter(); } };
    for (const input of [Object.create({ text: "inherited" }), accessor,
      JSON.parse('{"__proto__":{"text":"inherited"}}')]) {
      expect(() => hasReductionCandidate(program("shorten-string"), input, valid)).toThrow();
    }
    expect(valid).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("bounded primitive synthesis and transfer", () => {
  it("searches singleton grammar nodes before compositions without a privileged all-operator tool", async () => {
    // The first two uniform grammar nodes (chunk/delete) cannot change a scalar.
    // Their initial checks still cost quota; a budget of three cannot reach a verified halve.
    const insufficient = await synthesizeReducer(64, numberDomain, positive, 3);
    expect(insufficient).toEqual({ program: null, calls: 1, trials: 1 });
    const sufficient = await synthesizeReducer(64, numberDomain, positive, 5);
    expect(sufficient.calls).toBe(5);
    expect(sufficient.trials).toBe(3);
    expect(sufficient.program?.operators).toEqual(["halve-number"]);
  });

  it("synthesizes a shrinking AST and transfers it unchanged across two function families", async () => {
    // Family 1: an integer-root reconstruction claim, falsified by nonsquares.
    const rootValid = (value: Json): boolean => typeof value === "number" && Number.isInteger(value) && value >= 0;
    const rootCounterexample = (value: Json): boolean => typeof value === "number" && Math.floor(Math.sqrt(value)) ** 2 !== value;
    const synthesis = await synthesizeReducer(96, rootValid, rootCounterexample, 96);
    expect(synthesis.program).not.toBeNull();
    expect(synthesis.trials).toBeGreaterThan(1);
    if (!synthesis.program) throw new Error("Expected a synthesized AST");
    const astBefore = JSON.stringify(synthesis.program);
    const trained = await reduceCounterexample(synthesis.program, 96, rootValid, rootCounterexample, 40);
    expect(trained.status).toBe("reduced");
    expect(trained.reducedSize).toBeLessThan(trained.originalSize);

    // Family 2: a grid-layout reconstruction claim with nested width, not a root function.
    const gridValid = (value: Json): boolean => isRecord(value) && isRecord(value.layout)
      && typeof value.layout.width === "number" && Number.isInteger(value.layout.width) && value.layout.width >= 0;
    const gridCounterexample = (value: Json): boolean => isRecord(value) && isRecord(value.layout)
      && typeof value.layout.width === "number" && Math.floor(value.layout.width / 3) * 3 !== value.layout.width;
    const transferred = await reduceCounterexample(synthesis.program, { layout: { width: 257 } }, gridValid, gridCounterexample, 40);
    expect(transferred.status).toBe("reduced");
    expect(transferred.reducedSize).toBeLessThan(transferred.originalSize);
    expect(gridCounterexample(transferred.reduced)).toBe(true);
    expect(gridValid(transferred.reduced)).toBe(true);
    expect(JSON.stringify(synthesis.program)).toBe(astBefore);
  });

  it("uses compositions, not only an unchanged primitive lookup", async () => {
    const valid = (value: Json): boolean => isRecord(value) && typeof value.n === "number" && typeof value.text === "string";
    const counterexample = (value: Json): boolean => valid(value) && isRecord(value) && Number(value.n) >= 1 && String(value.text).includes("x");
    const input: Json = { n: 64, text: "xxxx" };
    const synthesis = await synthesizeReducer(input, valid, counterexample, 160);
    expect(synthesis.program).not.toBeNull();
    if (!synthesis.program) throw new Error("Expected composed AST");
    expect(synthesis.program.operators).toHaveLength(2);
    expect(synthesis.program.operators).toContain("halve-number");
    expect(synthesis.program.operators).toContain("shorten-string");
    const result = await reduceCounterexample(synthesis.program, input, valid, counterexample, 40);
    expect(result.status).toBe("reduced");
    expect(result.reduced).toEqual({ n: 1, text: "x" });
  });

  it("never selects a healthy, stuck, unverified or throwing candidate", async () => {
    const healthy = vi.fn(() => false);
    expect(await synthesizeReducer(32, numberDomain, healthy, 20)).toMatchObject({ program: null, calls: 1 });
    expect(healthy).toHaveBeenCalledTimes(1);
    const stuck = await synthesizeReducer(0, numberDomain, anything, 200);
    expect(stuck.program).toBeNull();
    expect(stuck.trials).toBe(85);
    expect(stuck.calls).toBe(stuck.trials);
    const throwing = vi.fn(() => { throw new Error("offline"); });
    expect(await synthesizeReducer(32, numberDomain, throwing, 20)).toMatchObject({ program: null, calls: 1 });
    const tooSmall = await synthesizeReducer(64, numberDomain, positive, 2);
    expect(tooSmall.program).toBeNull();
  });

  it.each([1, 2, 3, 8, 16, 32, 96])("accounts for all search trials within shared budget %i", async (limit) => {
    const predicate = vi.fn(positive);
    const result = await synthesizeReducer(64, numberDomain, predicate, limit);
    expect(result.calls).toBe(predicate.mock.calls.length);
    expect(result.calls).toBeLessThanOrEqual(limit);
    expect(result.trials).toBeLessThanOrEqual(85);
    if (result.program) {
      const replay = await reduceCounterexample(result.program, 64, numberDomain, positive, 32);
      expect(replay.status).toBe("reduced");
      expect(replay.counterexamplePreserved).toBe(true);
    }
  });
});
