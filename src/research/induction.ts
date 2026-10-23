/** Bounded conditional induction: proposed data, never certification or a global classifier. */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type Example = { id: string; input: Json; holds: boolean };
export type Atom = { op: 'lte' | 'gt'; feature: string; threshold: number };
export type Predicate = Atom | { op: 'and' | 'or'; left: Atom; right: Atom };
export type Hypothesis = {
  schemaVersion: 'nexus.conditional-hypothesis.v1';
  when: Predicate;
  expectedHolds: boolean;
};
type Stats = {
  samples: number; candidates: number; inScope: number;
  contradictions: number; informationGain: number;
};
type FitResult = {
  status: 'proposed' | 'no-action'; reason: string; hypothesis: Hypothesis | null; stats: Stats;
};
type Row = { features: Record<string, number>; labels: number };
const SCHEMA = 'nexus.conditional-hypothesis.v1';
const MAX_FEATURES = 32, MAX_SAMPLES = 128, MAX_CUTS = 8, MAX_CANDIDATES = 512;
const MAX_DEPTH = 12, MAX_NODES = 1024, MAX_KEYS = 128, MAX_ARRAY = 256;
const MAX_KEY = 80, MAX_STRING = 4096, MAX_TEXT = 16384;
const INVALID = new TypeError('Expected bounded, finite, plain JSON data / closed hypothesis AST');
const BUDGET = new RangeError('Bounded induction budget exceeded');
const METRICS = ['length', 'nonIntegerCount', 'min', 'max', 'maxAbs', 'nonZeroOrderSpan'];
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const own = (o: object, k: string): boolean => Object.hasOwn(o, k);
const pointer = (k: string): string => k.replace(/~/g, '~0').replace(/\//g, '~1');
const forbidden = (k: string): boolean => /^(?:__proto__|prototype|constructor)$/i.test(k);

// Conservative metadata exclusion, including camelCase, separators and common joined variants.
function identity(k: string): boolean {
  const text = k.normalize('NFKC').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const compact = text.replace(/[^a-z0-9]/g, '');
  return /seed|label|hash|digest|time|stamp|code|holds|identity|identifier|uuid|guid|nonce/.test(compact)
    || /createdat|updatedat|randomstate/.test(compact)
    || /(?:id|uid)(?:value|number|num|key|index|score|token|field|count|numeric)/.test(compact)
    || text.split(/[^a-z0-9]+/).some(p => /^(?:id|ids|uid|hold|date|epoch|ts|token|serial|session|trace)\d*$/.test(p))
    || /^(?:id|uid)|(?:id|ids)\d*$/.test(compact);
}

// Descriptors are checked before reading values: ordinary getters are never invoked.
function fields(value: unknown, expected?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw INVALID;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw INVALID;
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_KEYS) throw BUDGET;
  if (expected && (keys.length !== expected.length || expected.some(k => !keys.includes(k)))) throw INVALID;
  const result: Record<string, unknown> = Object.create(null);
  for (const k of keys) {
    if (typeof k !== 'string' || forbidden(k)) throw INVALID;
    if (k.length > MAX_KEY) throw BUDGET;
    const d = Object.getOwnPropertyDescriptor(value, k);
    if (!d || !own(d, 'value') || !d.enumerable) throw INVALID;
    result[k] = d.value;
  }
  return result;
}
function array(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value)) throw INVALID;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Array.prototype && proto !== null) throw INVALID;
  const d = Object.getOwnPropertyDescriptor(value, 'length');
  if (!d || !own(d, 'value') || !Number.isSafeInteger(d.value) || d.value < 0) throw INVALID;
  if (d.value > limit) throw BUDGET;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== d.value + 1) throw INVALID;
  const result: unknown[] = [];
  for (let i = 0; i < d.value; i++) {
    const item = Object.getOwnPropertyDescriptor(value, String(i));
    if (!item || !own(item, 'value') || !item.enumerable) throw INVALID;
    result.push(item.value);
  }
  return result;
}

/** n:<JSON-pointer>; a:<metric>:<JSON-pointer>. Strings/booleans/null have no value features. */
export function extractFeatures(input: Json): Record<string, number> {
  const features: Record<string, number> = {};
  const active = new Set<object>();
  let nodes = 0, text = 0;
  const add = (key: string, value: number): void => {
    if (!Number.isFinite(value)) throw INVALID;
    features[key] = value === 0 ? 0 : value;
    if (Object.keys(features).length > MAX_FEATURES) throw BUDGET;
  };
  const visit = (value: unknown, path: string, depth: number, included: boolean): void => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw BUDGET;
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw INVALID;
      if (included) add('n:' + path, value);
      return;
    }
    if (typeof value === 'string') {
      text += value.length;
      if (value.length > MAX_STRING || text > MAX_TEXT) throw BUDGET;
      return;
    }
    if (typeof value !== 'object' || active.has(value)) throw INVALID;
    active.add(value);
    if (Array.isArray(value)) {
      const items = array(value, MAX_ARRAY);
      if (included) {
        add('a:length:' + path, items.length);
        const nums = items.filter((v): v is number => typeof v === 'number');
        if (nums.length) {
          let min = Infinity, max = -Infinity, maxAbs = 0, nonInteger = 0;
          let lowOrder = Infinity, highOrder = -Infinity;
          for (const n of nums) {
            if (!Number.isFinite(n)) throw INVALID;
            min = Math.min(min, n); max = Math.max(max, n); maxAbs = Math.max(maxAbs, Math.abs(n));
            if (!Number.isInteger(n)) nonInteger++;
            if (n !== 0) {
              const order = Math.floor(Math.log10(Math.abs(n)));
              lowOrder = Math.min(lowOrder, order); highOrder = Math.max(highOrder, order);
            }
          }
          for (const [name, number] of [
            ['nonIntegerCount', nonInteger], ['min', min], ['max', max], ['maxAbs', maxAbs],
            ['nonZeroOrderSpan', highOrder === -Infinity ? 0 : highOrder - lowOrder],
          ] as [string, number][]) add('a:' + name + ':' + path, number);
        }
      }
      items.forEach((v, i) => visit(v, path + '/' + i, depth + 1, included));
    } else {
      const object = fields(value);
      for (const key of Object.keys(object).sort(compare)) {
        text += key.length;
        if (text > MAX_TEXT) throw BUDGET;
        visit(object[key], path + '/' + pointer(key), depth + 1, included && !identity(key));
      }
    }
    active.delete(value);
  };
  visit(input, '', 0, true);
  return Object.fromEntries(Object.keys(features).sort(compare).map(k => [k, features[k]]));
}

function validFeature(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  let path: string;
  if (value.startsWith('n:')) path = value.slice(2);
  else {
    const metric = METRICS.find(m => value.startsWith('a:' + m + ':'));
    if (!metric) return false;
    path = value.slice(metric.length + 3);
  }
  if (path === '') return true;
  if (!path.startsWith('/')) return false;
  const pieces = path.slice(1).split('/');
  return pieces.length <= MAX_DEPTH && pieces.every(piece => {
    if (/~(?![01])/.test(piece)) return false;
    const key = piece.replace(/~1/g, '/').replace(/~0/g, '~');
    return key.length <= MAX_KEY && !forbidden(key) && !identity(key) && pointer(key) === piece;
  });
}
function readAtom(value: unknown): Atom {
  const a = fields(value, ['op', 'feature', 'threshold']);
  if ((a.op !== 'lte' && a.op !== 'gt') || !validFeature(a.feature)
      || typeof a.threshold !== 'number' || !Number.isFinite(a.threshold)) throw INVALID;
  return { op: a.op, feature: a.feature, threshold: a.threshold === 0 ? 0 : a.threshold };
}
function readHypothesis(value: unknown): Hypothesis {
  const h = fields(value, ['schemaVersion', 'when', 'expectedHolds']);
  if (h.schemaVersion !== SCHEMA || typeof h.expectedHolds !== 'boolean') throw INVALID;
  const p = fields(h.when);
  let when: Predicate;
  if (p.op === 'and' || p.op === 'or') {
    fields(h.when, ['op', 'left', 'right']);
    when = { op: p.op, left: readAtom(p.left), right: readAtom(p.right) };
  } else when = readAtom(h.when);
  return { schemaVersion: SCHEMA, when, expectedHolds: h.expectedHolds };
}
export function validateHypothesis(value: unknown): asserts value is Hypothesis {
  readHypothesis(value);
}
function atomMatches(a: Atom, features: Record<string, number>): boolean {
  if (!own(features, a.feature)) return false;
  return a.op === 'lte' ? features[a.feature] <= a.threshold : features[a.feature] > a.threshold;
}
function matches(p: Predicate, features: Record<string, number>): boolean {
  if (!('left' in p)) return atomMatches(p, features);
  return p.op === 'and' ? atomMatches(p.left, features) && atomMatches(p.right, features)
    : atomMatches(p.left, features) || atomMatches(p.right, features);
}
/** Outside P (including unavailable atomic features), abstain; no complementary claim is implied. */
export function predict(h: Hypothesis, input: Json): boolean | null {
  const checked = readHypothesis(h);
  return matches(checked.when, extractFeatures(input)) ? checked.expectedHolds : null;
}

function entropy(no: number, yes: number): number {
  if (!no || !yes) return 0;
  return Math.log2(no + yes) - (no * Math.log2(no) + yes * Math.log2(yes)) / (no + yes);
}
const programKey = (p: Predicate): string => JSON.stringify(p);
function canonical(op: 'and' | 'or', a: Atom, b: Atom): Predicate {
  return compare(programKey(a), programKey(b)) <= 0
    ? { op, left: a, right: b } : { op, left: b, right: a };
}

/** Raw budget precedes deduplication. Conflicting labels are BOTH retained, never majority-voted. */
export function fitConditional(examples: readonly Example[]): FitResult {
  const stats: Stats = { samples: 0, candidates: 0, inScope: 0, contradictions: 0, informationGain: 0 };
  const noAction = (reason: string): FitResult => ({ status: 'no-action', reason, hypothesis: null, stats });
  let rows: Row[];
  try {
    const raw = array(examples, MAX_SAMPLES);
    const distinct = new Map<string, Row>();
    const featureNames = new Set<string>();
    for (const example of raw) {
      const e = fields(example, ['id', 'input', 'holds']);
      if (typeof e.id !== 'string' || typeof e.holds !== 'boolean') throw INVALID;
      if (e.id.length > MAX_STRING) throw BUDGET;
      const features = extractFeatures(e.input as Json);
      for (const key of Object.keys(features)) featureNames.add(key);
      if (featureNames.size > MAX_FEATURES) throw BUDGET;
      const signature = JSON.stringify(features);
      const labels = e.holds ? 2 : 1;
      const previous = distinct.get(signature);
      if (previous) previous.labels |= labels;
      else distinct.set(signature, { features, labels });
    }
    rows = [...distinct.entries()].sort(([a], [b]) => compare(a, b)).map(([, row]) => row);
  } catch (error) {
    return noAction(error === BUDGET ? 'budget-exceeded' : 'invalid-input');
  }
  stats.samples = rows.length; // Independent allowed feature vectors, NOT raw IDs or duplicates.
  const conflicts = rows.filter(r => r.labels === 3).length;
  stats.contradictions = conflicts; // On abstention: conflicting vectors; on proposal: in-P errors.
  const totalNo = rows.filter(r => r.labels & 1).length;
  const totalYes = rows.filter(r => r.labels & 2).length;
  if (!totalNo || !totalYes) return noAction('single-label-or-empty');
  if (rows.length < 8 || totalNo < 4 || totalYes < 4) return noAction('insufficient-independent-support');
  const total = totalNo + totalYes, baseEntropy = entropy(totalNo, totalYes);
  const names = [...new Set(rows.flatMap(r => Object.keys(r.features)))].sort(compare);
  type Choice = { when: Predicate; expectedHolds: boolean; gain: number; scope: number; score: number; key: string };
  let best: Choice | null = null;
  const evaluated = new Set<string>();
  const consider = (when: Predicate): number => {
    const key = programKey(when);
    if (stats.candidates >= MAX_CANDIDATES || evaluated.has(key)) return -1;
    evaluated.add(key); stats.candidates++;
    let no = 0, yes = 0, scope = 0;
    for (const row of rows) if (matches(when, row.features)) {
      scope++;
      if (row.labels & 1) no++;
      if (row.labels & 2) yes++;
    }
    const count = no + yes;
    const gain = Math.max(0, baseEntropy - count / total * entropy(no, yes)
      - (total - count) / total * entropy(totalNo - no, totalYes - yes));
    if (scope < 4 || rows.length - scope < 4 || (no && yes) || gain <= 1e-12) return gain;
    // Modest structural MDL-style ranking cost, not a probability, proof, or eligibility gate.
    const cost = when.op === 'and' || when.op === 'or' ? 3 : 1;
    const choice: Choice = { when, expectedHolds: no === 0, gain, scope, score: gain - 0.015 * cost, key };
    if (!best || choice.score > best.score + 1e-12
      || (Math.abs(choice.score - best.score) <= 1e-12
        && (choice.scope > best.scope || (choice.scope === best.scope && compare(key, best.key) < 0)))) best = choice;
    return gain;
  };
  const atoms: { atom: Atom; gain: number; key: string }[] = [];
  for (const feature of names) {
    const values = [...new Set(rows.filter(r => own(r.features, feature)).map(r => r.features[feature]))]
      .sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const gaps = values.length - 1, cuts = Math.min(MAX_CUTS, gaps);
    for (let i = 0; i < cuts; i++) {
      const index = Math.floor(i * gaps / cuts), low = values[index], high = values[index + 1];
      const midpoint = low / 2 + high / 2;
      const threshold = midpoint >= low && midpoint < high ? midpoint : low;
      for (const op of ['lte', 'gt'] as const) {
        const atom: Atom = { op, feature, threshold: threshold === 0 ? 0 : threshold };
        atoms.push({ atom, gain: consider(atom), key: programKey(atom) });
      }
    }
  }
  // Search is deliberately incomplete: atoms first, then pairs from the best 24 atomic splits.
  atoms.sort((a, b) => Math.abs(a.gain - b.gain) > 1e-12 ? b.gain - a.gain : compare(a.key, b.key));
  const short = atoms.slice(0, 24);
  pairs: for (let i = 0; i < short.length; i++) for (let j = i + 1; j < short.length; j++) {
    const a = short[i].atom, b = short[j].atom;
    if (a.feature === b.feature && (a.op === b.op || a.threshold === b.threshold)) continue;
    for (const op of ['and', 'or'] as const) {
      if (stats.candidates >= MAX_CANDIDATES) break pairs;
      consider(canonical(op, a, b));
    }
  }
  // The closure mutates best; the annotation makes that control flow explicit to TypeScript.
  const chosen = best as Choice | null;
  if (!chosen) return noAction(atoms.length ? 'no-supported-pure-positive-gain-condition' : 'constant-or-empty-features');
  stats.inScope = chosen.scope;
  stats.contradictions = 0;
  stats.informationGain = chosen.gain;
  return {
    status: 'proposed',
    reason: conflicts ? `training-pure-condition; conflicting-vectors-outside-scope:${conflicts}` : 'training-pure-condition',
    hypothesis: { schemaVersion: SCHEMA, when: chosen.when, expectedHolds: chosen.expectedHolds }, stats,
  };
}
