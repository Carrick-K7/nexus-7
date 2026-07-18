function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : canonicalize(item),
    );
  }
  if (value instanceof Date) {
    return value.toJSON();
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function randomUnit(
  seed: string,
  tick: number,
  channel: string,
  sample = 0,
): number {
  let value = hashString(`${seed}:${tick}:${channel}:${sample}`);
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function randomBetween(
  seed: string,
  tick: number,
  channel: string,
  minimum: number,
  maximum: number,
  sample = 0,
): number {
  return minimum + randomUnit(seed, tick, channel, sample) * (maximum - minimum);
}

export function deterministicIndex(
  seed: string,
  tick: number,
  channel: string,
  length: number,
): number {
  if (length <= 0) {
    return -1;
  }

  return Math.floor(randomUnit(seed, tick, channel) * length);
}

export function fingerprint(value: unknown): string {
  return hashString(stableStringify(value)).toString(16).padStart(8, "0");
}
