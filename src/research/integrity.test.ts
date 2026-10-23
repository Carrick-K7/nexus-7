// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertResearchJson, canonical, DEFAULT_RESEARCH_POLICY, normalizeResearchJson, researchDigest, researchSize, validateResearchPolicy } from "./integrity";

describe("research input and policy boundaries", () => {
  it("canonicalizes key order without changing array order or values", () => {
    expect(researchDigest({ b: 2, a: 1 })).toBe(researchDigest({ a: 1, b: 2 }));
    expect(researchDigest([1, 2])).not.toBe(researchDigest([2, 1]));
    expect(canonical({ a: null, absent: undefined })).toBe('{"a":null}');
    expect(() => canonical({ bad: Infinity })).toThrow();
  });

  it("normalizes actual JSON wire values before dispatch without hiding invalid inputs", () => {
    const original = { values: [-1, -0], zero: -0 };
    const normalized = normalizeResearchJson(original);
    expect(Object.is(normalized.zero, 0)).toBe(true);
    expect(Object.is(normalized.values[1], 0)).toBe(true);
    expect(normalized).toEqual(JSON.parse(JSON.stringify(normalized)));
    expect(Object.is(original.zero, -0)).toBe(true);
    expect(() => normalizeResearchJson({ value: NaN })).toThrow();
    expect(() => normalizeResearchJson({ value: Infinity })).toThrow();
    let reads = 0;
    expect(() => normalizeResearchJson(Object.defineProperty({}, "x", { enumerable: true, get() { reads++; return 1; } }))).toThrow();
    expect(reads).toBe(0);
  });

  it("rejects accessors without executing them, sparse arrays and hidden keys", () => {
    let executed = 0;
    const getter = Object.defineProperty({}, "claim", { enumerable: true, get() { executed++; return true; } });
    expect(() => assertResearchJson(getter)).toThrow();
    expect(executed).toBe(0);
    expect(() => assertResearchJson(new Array(2))).toThrow();
    expect(() => assertResearchJson(Object.defineProperty({}, "hidden", { value: 1 }))).toThrow();
    expect(() => assertResearchJson({ [Symbol("claim")]: 1 })).toThrow();
    expect(() => assertResearchJson(Object.assign([1], { extra: 2 }))).toThrow();
  });

  it("fails closed on cycles, prototypes, nonfinite values and structural bombs", () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    for (const input of [cyclic, new Date(), NaN, Infinity, undefined, () => 1, JSON.parse('{"__proto__":1}'), Array.from({ length: 129 }, () => 0), "x".repeat(4_097)]) {
      expect(() => assertResearchJson(input)).toThrow();
    }
    expect(() => assertResearchJson({ values: [1, "safe", false, null] })).not.toThrow();
  });

  it("keeps zero budget valid and rejects partial, nonfinite or inflated policies", () => {
    expect(() => validateResearchPolicy({ ...DEFAULT_RESEARCH_POLICY, maxOracleCalls: 0 })).not.toThrow();
    for (const amount of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER]) {
      expect(() => validateResearchPolicy({ ...DEFAULT_RESEARCH_POLICY, maxOracleCalls: amount })).toThrow();
    }
    expect(() => validateResearchPolicy({ ...DEFAULT_RESEARCH_POLICY, extra: 1 } as typeof DEFAULT_RESEARCH_POLICY)).toThrow();
  });

  it("measures reductions independently of field ordering", () => {
    expect(researchSize({ x: 8 })).toBeGreaterThan(researchSize({ x: 2 }));
    expect(researchSize({ x: 100 })).toBe(researchSize({ x: 99 }));
    expect(researchSize([1, 2, 3])).toBeGreaterThan(researchSize([1]));
  });
});
