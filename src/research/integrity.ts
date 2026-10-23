import { createHash } from "node:crypto";
import type { Json, ResearchPolicy } from "./contracts";

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Canonical JSON, not a claim of external attestation. */
export function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("Non-JSON object");
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => {
      if (FORBIDDEN_KEYS.has(key)) throw new Error("Forbidden JSON key");
      return `${JSON.stringify(key)}:${canonical(record[key])}`;
    }).join(",")}}`;
  }
  throw new Error("Value is not finite JSON");
}

/** Normalize the actual domain value before execution, not only its hash. JSON has no distinct -0 wire value. */
export function normalizeResearchJson<T>(value: T): T {
  assertResearchJson(value);
  return JSON.parse(canonical(value)) as T;
}

export function researchDigest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function assertResearchJson(value: unknown): asserts value is Json {
  let nodes = 0;
  const seen = new Set<object>();
  function visit(item: unknown, depth: number): void {
    if (++nodes > 2_048 || depth > 12) throw new Error("Research input exceeds structural budget");
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "number") {
      if (!Number.isFinite(item) || Math.abs(item) > 1_000_000_000) throw new Error("Research number outside bounds");
      return;
    }
    if (typeof item === "string") {
      if (item.length > 4_096) throw new Error("Research string outside bounds");
      return;
    }
    if (typeof item !== "object") throw new Error("Research input must be JSON");
    if (seen.has(item)) throw new Error("Cyclic research input");
    seen.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Object.getOwnPropertySymbols(item).length > 0) throw new Error("Symbol research keys are forbidden");
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype || item.length > 128) throw new Error("Research array outside bounds");
      if (Object.keys(descriptors).length !== item.length + 1) throw new Error("Research arrays must be dense and unextended");
      for (let index = 0; index < item.length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("Research arrays must contain plain values");
        visit(descriptor.value, depth + 1);
      }
    } else {
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) throw new Error("Research object must be plain");
      const entries = Object.entries(descriptors);
      if (entries.length > 64) throw new Error("Research object outside bounds");
      for (const [key, descriptor] of entries) {
        if (FORBIDDEN_KEYS.has(key) || key.length > 128) throw new Error("Forbidden research input key");
        if (!("value" in descriptor) || !descriptor.enumerable) throw new Error("Research objects must contain plain enumerable values");
        visit(descriptor.value, depth + 1);
      }
    }
    seen.delete(item);
  }
  visit(value, 0);
  if (canonical(value).length > 32_768) throw new Error("Research input exceeds byte budget");
}

/** Counts structural and value complexity, so reducing a numeric horizon is useful. */
export function researchSize(value: Json): number {
  if (value === null || typeof value === "boolean") return 1;
  if (typeof value === "number") return 1 + Math.ceil(Math.log2(1 + Math.abs(value)));
  if (typeof value === "string") return 1 + value.length;
  if (Array.isArray(value)) return 1 + value.reduce<number>((total, child) => total + researchSize(child), 0);
  return 1 + Object.entries(value).reduce((total, [key, child]) => total + key.length + researchSize(child), 0);
}

export const DEFAULT_RESEARCH_POLICY: ResearchPolicy = {
  maxOracleCalls: 800,
  maxCallsPerEpisode: 96,
  maxEpisodes: 40,
  maxAttemptsPerQuestion: 2,
  leaseMs: 120_000,
};

export function validateResearchPolicy(value: ResearchPolicy): void {
  const bounds: Record<keyof ResearchPolicy, [number, number]> = {
    maxOracleCalls: [0, 20_000],
    maxCallsPerEpisode: [1, 256],
    maxEpisodes: [1, 200],
    maxAttemptsPerQuestion: [1, 3],
    leaseMs: [1_000, 600_000],
  };
  if (!value || typeof value !== "object" || Object.keys(value).length !== Object.keys(bounds).length) {
    throw new Error("Research policy has unknown or missing fields");
  }
  for (const [key, [minimum, maximum]] of Object.entries(bounds)) {
    const amount = value[key as keyof ResearchPolicy];
    if (!Number.isSafeInteger(amount) || amount < minimum || amount > maximum) {
      throw new Error(`Research policy ${key} outside bounds`);
    }
  }
}
