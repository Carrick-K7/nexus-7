import type {
  HypothesisEvaluation, HypothesisTrainingSnapshot, Json, Observation, OracleMeter,
  ResearchHypothesis, ResearchSubject,
} from "./contracts";
import { extractFeatures, validateHypothesis, type Atom, type Hypothesis, type Predicate } from "./induction";
import { assertResearchJson, canonical, normalizeResearchJson, researchDigest } from "./integrity";

const MAX_EXAMPLES = 128;
const MAX_CANDIDATES = 256;
export const HYPOTHESIS_EVALUATOR_VERSION = "conditional-falsifier-v1" as const;
export const HYPOTHESIS_SAMPLING_PROTOCOL = "bounded-perturbation-v2" as const;
export const HYPOTHESIS_PHASE_ALLOWANCE = Object.freeze({ falsification: 24, audit: 32 } as const);
const SAMPLING_PROTOCOL = HYPOTHESIS_SAMPLING_PROTOCOL;
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
type Row = { features: Record<string, number>; labels: number };
type Sample = { input: Json; kind: "exploration" | "boundary" };
type SampleProgram = Hypothesis | ResearchHypothesis | null;

function rowsOf(examples: HypothesisTrainingSnapshot["examples"]): Row[] {
  const rows = new Map<string, Row>();
  const names = new Set<string>();
  for (const example of examples) {
    const features = extractFeatures(example.input);
    Object.keys(features).forEach((name) => names.add(name));
    if (names.size > 32) throw new RangeError("Training feature budget exceeded");
    const key = canonical(features);
    const labels = example.holds ? 2 : 1;
    const previous = rows.get(key);
    if (previous) previous.labels |= labels; // A conflicting vector has BOTH labels.
    else rows.set(key, { features, labels });
  }
  return [...rows.entries()].sort(([a], [b]) => compare(a, b)).map(([, row]) => row);
}

function supported(rows: Row[]): boolean {
  return rows.length >= 8 && rows.filter((row) => row.labels & 1).length >= 4
    && rows.filter((row) => row.labels & 2).length >= 4;
}

function snapshotDigest(snapshot: Omit<HypothesisTrainingSnapshot, "digest">): string {
  return researchDigest({ schemaVersion: "nexus.hypothesis-training.v1", ...snapshot });
}

/** All seen observations for this exact instrument version, except the held-out audit.
 * IDs retain repetitions of an input; only exact (input, holds) pairs are deduplicated.
 * Capacity failure returns NO partial training set, and still commits to all source data.
 * `ready` is only a support precheck: fit/validation can still abstain for conflicts,
 * missing contrasts or lack of a positive-gain pure condition. No output facts or other
 * subject's control labels are features. The service must supply the complete history;
 * no function accepting only a snapshot can detect evidence omitted before construction.
 */
export function buildTrainingSnapshot(
  observations: readonly Observation[], subject: ResearchSubject,
): HypothesisTrainingSnapshot {
  const eligible = observations.filter((observation) => observation.subjectId === subject.id
    && observation.subjectVersion === subject.version && observation.partition !== "hypothesis-audit");
  const ids = new Set<string>();
  const distinct = new Map<string, HypothesisTrainingSnapshot["examples"][number]>();
  const sources: Array<{ id: string; inputDigest: string; holds: boolean }> = [];
  let capacityExceeded = false;
  for (const observation of [...eligible].sort((a, b) => compare(a.id, b.id))) {
    if (typeof observation.id !== "string" || !observation.id || ids.has(observation.id)
      || typeof observation.measurement.holds !== "boolean") throw new TypeError("Invalid training observation identity/label");
    ids.add(observation.id);
    const input = normalizeResearchJson(observation.input);
    const inputDigest = researchDigest(input);
    if (observation.inputDigest !== inputDigest) throw new TypeError("Training input digest mismatch");
    const holds = observation.measurement.holds;
    sources.push({ id: observation.id, inputDigest, holds });
    if (!capacityExceeded) {
      const key = canonical({ input, holds });
      if (!distinct.has(key)) distinct.set(key, { id: observation.id, input, holds });
      if (distinct.size > MAX_EXAMPLES) { capacityExceeded = true; distinct.clear(); }
    }
  }
  const observationIds = sources.map((source) => source.id);
  if (capacityExceeded) {
    const snapshot = { subjectId: subject.id, subjectVersion: subject.version, observationIds,
      examples: [], status: "capacity-exceeded" as const };
    return { ...snapshot, digest: researchDigest({ schemaVersion: "nexus.hypothesis-training.v1", ...snapshot, sources }) };
  }
  const examples = [...distinct.entries()].sort(([a], [b]) => compare(a, b)).map(([, example]) => example);
  let ready = false;
  try { ready = supported(rowsOf(examples)); } catch { /* Bounded learner will also abstain. */ }
  const snapshot = { subjectId: subject.id, subjectVersion: subject.version, observationIds, examples,
    status: ready ? "ready" as const : "insufficient-data" as const };
  return { ...snapshot, digest: snapshotDigest(snapshot) };
}

function atomMatches(atom: Atom, features: Record<string, number>): boolean {
  if (!Object.hasOwn(features, atom.feature)) return false;
  return atom.op === "lte" ? features[atom.feature] <= atom.threshold : features[atom.feature] > atom.threshold;
}
function matches(predicate: Predicate, features: Record<string, number>): boolean {
  if (!("left" in predicate)) return atomMatches(predicate, features);
  return predicate.op === "and"
    ? atomMatches(predicate.left, features) && atomMatches(predicate.right, features)
    : atomMatches(predicate.left, features) || atomMatches(predicate.right, features);
}
function atomsOf(predicate: Predicate): Atom[] {
  return "left" in predicate ? [predicate.left, predicate.right] : [predicate];
}
function entropy(no: number, yes: number): number {
  const total = no + yes;
  if (!no || !yes) return 0;
  const p = yes / total;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

function dataRecord(value: unknown, keys: readonly string[]): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => {
    const descriptor = descriptors[key];
    return descriptor && "value" in descriptor && descriptor.enumerable;
  });
}
function dataArray(value: unknown): boolean {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(length) || length < 0 || Reflect.ownKeys(value).length !== length + 1) return false;
  for (let index = 0; index < length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return false;
  }
  return true;
}

/** This checks data, not learner.stats or candidate-provided pass flags. A digest is a
 * content binding, NOT authority: the service must rebuild the complete snapshot itself
 * before accepting a proposal, otherwise a caller could fabricate a self-consistent subset.
 */
export function validateProposal(
  program: Hypothesis, snapshot: HypothesisTrainingSnapshot,
): { valid: boolean; reasons: string[]; inScope: number; outOfScope: number } {
  const reasons: string[] = [];
  let inScope = 0, outOfScope = 0;
  const result = () => ({ valid: reasons.length === 0, reasons, inScope, outOfScope });
  try { validateHypothesis(program); } catch { reasons.push("invalid-closed-hypothesis-ast"); return result(); }
  try {
    if (!dataRecord(snapshot, ["subjectId", "subjectVersion", "observationIds", "examples", "status", "digest"])) throw new TypeError("Invalid training snapshot fields");
    if (snapshot.status !== "ready") {
      reasons.push(snapshot?.status === "capacity-exceeded" ? "training-capacity-exceeded" : "training-insufficient-data");
      return result();
    }
    const { subjectId, subjectVersion, observationIds, examples, status } = snapshot;
    if (typeof subjectId !== "string" || !subjectId || typeof subjectVersion !== "string" || !subjectVersion
      || !dataArray(observationIds) || !observationIds.length || new Set(observationIds).size !== observationIds.length
      || observationIds.some((id) => typeof id !== "string" || !id)
      || !dataArray(examples) || examples.length > MAX_EXAMPLES) {
      reasons.push("training-snapshot-binding"); return result();
    }
    const sourceIds = new Set(observationIds), exampleIds = new Set<string>(), exact = new Set<string>();
    for (const example of examples) {
      if (!dataRecord(example, ["holds", "id", "input"]) || typeof example.holds !== "boolean"
        || !sourceIds.has(example.id) || exampleIds.has(example.id)) throw new TypeError("Invalid training example");
      assertResearchJson(example.input);
      const key = canonical({ input: example.input, holds: example.holds });
      if (exact.has(key)) throw new TypeError("Training pair was not deduplicated");
      exact.add(key); exampleIds.add(example.id);
    }
    // Hash only after validating plain descriptors and inputs; canonical must never read
    // a candidate getter or turn malformed numeric data into a different wire value.
    if (snapshot.digest !== snapshotDigest({ subjectId, subjectVersion, observationIds, examples, status })) {
      reasons.push("training-snapshot-binding"); return result();
    }
    const rows = rowsOf(examples);
    if (!supported(rows)) reasons.push("insufficient-independent-label-support");
    for (const atom of atomsOf(program.when)) {
      const values = [...new Set(rows.filter((row) => Object.hasOwn(row.features, atom.feature))
        .map((row) => row.features[atom.feature]))].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      const sourced = values.some((high, index) => {
        if (!index) return false;
        const low = values[index - 1], midpoint = low / 2 + high / 2;
        // Endpoint fallback is allowed only when the adjacent midpoint is unrepresentable.
        return atom.threshold === (midpoint >= low && midpoint < high ? midpoint : low);
      });
      if (!sourced) reasons.push("threshold-not-from-adjacent-training-values");
    }
    let totalNo = 0, totalYes = 0, scopedNo = 0, scopedYes = 0;
    for (const row of rows) {
      const no = row.labels & 1 ? 1 : 0, yes = row.labels & 2 ? 1 : 0;
      totalNo += no; totalYes += yes;
      if (matches(program.when, row.features)) { inScope++; scopedNo += no; scopedYes += yes; }
      else outOfScope++;
    }
    if (inScope < 4 || outOfScope < 4) reasons.push("insufficient-independent-scope-contrast");
    if (program.expectedHolds ? scopedNo > 0 : scopedYes > 0) reasons.push("training-scope-contradiction");
    const total = totalNo + totalYes, scope = scopedNo + scopedYes;
    const gain = total ? entropy(totalNo, totalYes) - scope / total * entropy(scopedNo, scopedYes)
      - (total - scope) / total * entropy(totalNo - scopedNo, totalYes - scopedYes) : 0;
    if (!(gain > 1e-12)) reasons.push("nonpositive-information-gain");
  } catch { reasons.push("invalid-training-snapshot"); }
  return result();
}

/** The DSL validates its own closed finite JSON bounds before canonical serialization.
 * Do not use the raw-input numeric cap to silently narrow the predicate language. */
function copyProgram(program: Hypothesis): Hypothesis {
  validateHypothesis(program);
  return JSON.parse(canonical(program)) as Hypothesis;
}

function hypothesisIdentity(hypothesis: Omit<ResearchHypothesis, "id" | "program" | "createdByEpisodeId">): string {
  return `hypothesis-${researchDigest(hypothesis).slice(0, 24)}`;
}

/** Construction after training checks is only a proposal, never a grading certificate. */
export function proposeHypothesis(
  subject: ResearchSubject, snapshot: HypothesisTrainingSnapshot, program: Hypothesis,
  episodeId: string, parentHypothesisId: string | null = null,
): ResearchHypothesis {
  const validation = validateProposal(program, snapshot);
  if (!validation.valid) throw new TypeError(`Invalid hypothesis proposal: ${validation.reasons.join(",")}`);
  if (snapshot.subjectId !== subject.id || snapshot.subjectVersion !== subject.version) throw new TypeError("Training subject/version mismatch");
  if (typeof episodeId !== "string" || !episodeId || (parentHypothesisId !== null
    && (typeof parentHypothesisId !== "string" || !parentHypothesisId))) throw new TypeError("Invalid hypothesis provenance");
  const instructions = copyProgram(program);
  const binding = { subjectId: subject.id, subjectVersion: subject.version, programDigest: researchDigest(instructions),
    trainingDigest: snapshot.digest, trainingObservationIds: [...snapshot.observationIds], parentHypothesisId };
  return { ...binding, id: hypothesisIdentity(binding), program: instructions, createdByEpisodeId: episodeId };
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach((child: unknown) => freeze(child));
    Object.freeze(value);
  }
  return value;
}
function frozenSubject(subject: ResearchSubject): ResearchSubject {
  return Object.freeze({ ...subject, title: freeze(structuredClone(subject.title)), claim: freeze(structuredClone(subject.claim)),
    generate: subject.generate, valid: subject.valid, measure: subject.measure });
}
function programOf(hypothesis: SampleProgram): Hypothesis | null {
  if (hypothesis === null) return null;
  const program = "program" in hypothesis ? hypothesis.program : hypothesis;
  return freeze(copyProgram(program));
}

/** No subject names, output labels, training answers or predicate occur in this transform.
 * Both directions are included; integerization is a generic numeric operation, not a
 * borrowed integer-control label. All candidates must still pass the instrument's valid.
 */
function perturb(input: Json, operation: number, stride: number, seed: string, root: number): Json {
  let nodes = 0;
  const spend = () => { if (++nodes > 2_048) throw new RangeError("Perturbation structural budget exceeded"); };
  // Charge copies as they are built, not only after construction: nested array expansion
  // must not allocate an exponential intermediate that would merely be rejected later.
  const copy = (value: Json): Json => {
    spend();
    if (Array.isArray(value)) return value.map(copy);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]));
    return value;
  };
  const position = (path: Array<string | number>, length: number): number => length
    ? (Number.parseInt(researchDigest({ protocol: SAMPLING_PROTOCOL, seed, operation, path }).slice(0, 8), 16) + root) % length : 0;
  const visit = (value: Json, path: Array<string | number>): Json => {
    spend();
    if (typeof value === "number") {
      switch (operation) {
        case 1: return Math.round(value);
        case 2: return value * 2;
        case 4: return value + stride;
        case 5: return value - stride;
        case 6: return value / 2;
        case 9: return Math.ceil(value);
        case 10: return Math.floor(value);
        case 11: return value * 10;
        case 12: return value / 10;
        case 15: return -value;
        default: return value;
      }
    }
    if (Array.isArray(value)) {
      const items = value.map((child, index) => visit(child, [...path, index]));
      const selected = position(path, items.length);
      switch (operation) {
        case 3: return items.reverse();
        case 7: {
          const insertion = position([...path, "insert"], items.length + 1);
          return [...items.slice(0, insertion), copy(items.length ? items[selected] : 0), ...items.slice(insertion)];
        }
        case 8: return [...items.slice(selected), ...items.slice(0, selected)].slice(0, Math.floor(items.length / 2));
        case 13: return [...items.slice(0, selected), ...items.slice(selected + 1)];
        case 14: {
          const shift = items.length > 1 ? 1 + position(path, items.length - 1) : 0;
          return [...items.slice(shift), ...items.slice(0, shift)];
        }
        default: return items;
      }
    }
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
      .map(([key, child]) => [key, visit(child, [...path, key])]));
    return value;
  };
  return visit(input, []);
}

type SamplingCandidate = {
  input: Json;
  features: Record<string, number>;
  digest: string;
  sources: Array<{ root: number; operation: number }>;
  rank: string;
};

/** Input-only strata, never a predicate/measurement score. Each available operation gets
 * a turn before its next turn; within it, prefer less-used generator roots, then a seeded
 * stable hash. Duplicate inputs retain all generating strata but can be selected only once.
 * A budget smaller than the stratum count cannot cover every transform; no coverage claim
 * follows. Unlike v1's construction prefix, late transforms are eligible from the first cycle.
 */
function explorationOrder(pool: SamplingCandidate[], seed: string): SamplingCandidate[] {
  const rank = (kind: string, index: number) => researchDigest({ protocol: SAMPLING_PROTOCOL, seed, kind, index });
  const operations = Array.from({ length: 16 }, (_, index) => ({ index, rank: rank("operation", index) }))
    .sort((a, b) => compare(a.rank, b.rank) || a.index - b.index).map((entry) => entry.index);
  const rootRanks = Array.from({ length: 16 }, (_, index) => rank("root", index));
  const rootUses = Array<number>(16).fill(0);
  const strata = Array.from({ length: 16 }, (_, operation) => pool.filter((candidate) => candidate.sources.some((source) => source.operation === operation)));
  const remaining = new Set(pool), ordered: SamplingCandidate[] = [];
  while (remaining.size) {
    for (const operation of operations) {
      let best: { candidate: SamplingCandidate; root: number } | undefined;
      for (const candidate of strata[operation]) {
        if (!remaining.has(candidate)) continue;
        const source = candidate.sources.filter((entry) => entry.operation === operation).sort((a, b) =>
          rootUses[a.root] - rootUses[b.root] || compare(rootRanks[a.root], rootRanks[b.root]) || a.root - b.root)[0];
        if (!best || rootUses[source.root] < rootUses[best.root]
          || (rootUses[source.root] === rootUses[best.root] && compare(candidate.rank, best.candidate.rank) < 0)) {
          best = { candidate, root: source.root };
        }
      }
      if (best) { remaining.delete(best.candidate); ordered.push(best.candidate); rootUses[best.root]++; }
    }
  }
  return ordered;
}

function sampleBatch(
  subject: ResearchSubject, hypothesis: SampleProgram, seed: string, excludedDigests: Set<string>, limit: number,
): { samples: Sample[]; attemptedCandidates: number } {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("Invalid sampling limit");
  const wanted = Math.min(limit, MAX_CANDIDATES);
  const target = frozenSubject(subject), program = programOf(hypothesis);
  if (!wanted) return { samples: [], attemptedCandidates: 0 };
  const excluded = new Set(excludedDigests);
  const bases = new Map<number, Json | undefined>();
  const candidates = new Map<string, SamplingCandidate>();
  let attemptedCandidates = 0;
  for (let index = 0; index < MAX_CANDIDATES; index++) {
    attemptedCandidates++;
    const baseIndex = Math.floor(index / 4) % 16;
    const operation = index % 4 + Math.floor(index / 64) * 4;
    if (!bases.has(baseIndex)) {
      try {
        const generated = normalizeResearchJson(target.generate(`${seed}:${SAMPLING_PROTOCOL}:${baseIndex}`));
        bases.set(baseIndex, freeze(generated));
      } catch { bases.set(baseIndex, undefined); }
    }
    const base = bases.get(baseIndex);
    if (base === undefined) continue;
    try {
      const stride = 1 + Number.parseInt(researchDigest({ seed, baseIndex, protocol: SAMPLING_PROTOCOL }).slice(0, 8), 16) % 17;
      // Execute, validate and persist the same JSON-domain value: -0 is +0 on the wire.
      // The validator runs before serialization, so accessors/NaN never become data/null.
      const input = normalizeResearchJson(perturb(base, operation, stride, seed, baseIndex));
      const features = extractFeatures(input);
      const digest = researchDigest(input);
      if (excluded.has(digest)) continue;
      const previous = candidates.get(digest);
      if (previous) { previous.sources.push({ root: baseIndex, operation }); continue; }
      if (target.valid(structuredClone(input)) !== true) continue;
      candidates.set(digest, { input: freeze(input), features, digest, sources: [{ root: baseIndex, operation }],
        rank: researchDigest({ protocol: SAMPLING_PROTOCOL, seed, digest }) });
    } catch { /* Invalid/oversized perturbations are attempts, never oracle calls. */ }
  }
  const pool = explorationOrder([...candidates.values()], seed);
  const count = Math.min(wanted, pool.length);
  // Reserve exploration BEFORE any predicate-dependent selection. This prefix is from
  // the full stratified ordering, not generation order. All output prefixes keep E >= B.
  const explorationCount = program ? Math.ceil(count / 2) : count;
  const exploration = pool.slice(0, explorationCount);
  const remaining = new Set(pool.slice(explorationCount));
  const atoms = program ? [...new Map(atomsOf(program.when).map((atom) => [canonical(atom), atom])).values()] : [];
  const lanes = atoms.flatMap((atom) => [false, true].map((side) => ({
    rank: researchDigest({ protocol: SAMPLING_PROTOCOL, seed, atom, side }),
    cursor: 0,
    queue: [...remaining].filter((candidate) => Object.hasOwn(candidate.features, atom.feature) && atomMatches(atom, candidate.features) === side)
      .sort((a, b) => Math.abs(a.features[atom.feature] - atom.threshold) - Math.abs(b.features[atom.feature] - atom.threshold)
        || compare(a.rank, b.rank)),
  }))).sort((a, b) => compare(a.rank, b.rank));
  let laneCursor = 0;
  const nextBoundary = (): SamplingCandidate | undefined => {
    // Rotate each atom AND each side. Cross-atom minimum distance would let a short-array
    // clause monopolize an OR while systematically missing another available branch.
    for (let visited = 0; visited < lanes.length; visited++) {
      const lane = lanes[laneCursor++ % lanes.length];
      while (lane.cursor < lane.queue.length && !remaining.has(lane.queue[lane.cursor])) lane.cursor++;
      if (lane.cursor < lane.queue.length) return lane.queue[lane.cursor++];
    }
    // Unavailable/exhausted atomic features do not imply impossibility or coverage.
    return pool.find((candidate) => remaining.has(candidate));
  };
  const samples: Sample[] = [];
  for (let index = 0; index < exploration.length; index++) {
    samples.push({ input: structuredClone(exploration[index].input), kind: "exploration" });
    if (program && index < count - explorationCount) {
      const candidate = nextBoundary();
      if (candidate) { remaining.delete(candidate); samples.push({ input: structuredClone(candidate.input), kind: "boundary" }); }
    }
  }
  return { samples, attemptedCandidates };
}

/** Deterministic bounded exploration; null means entirely predicate-independent training
 * inputs. The seed must be controlled by the service for grading. This samples a finite
 * perturbation pool, NOT the subject's entire domain and NOT an unbiased population.
 */
export function sampleHypothesisInputs(
  subject: ResearchSubject, hypothesis: SampleProgram, seed: string, excludedDigests: Set<string>, limit: number,
): Array<{ input: Json; kind: "exploration" | "boundary" }> {
  return sampleBatch(subject, hypothesis, seed, excludedDigests, limit).samples;
}

/** Trusted falsifier module, invoked by the service's PRIVATE issuance method. Exporting
 * a deterministic evaluator does not give its callers certification authority; the service
 * binds its receipt and controls the persisted hypothesis, complete history, seed and meter.
 */
export async function evaluateHypothesis(
  hypothesis: ResearchHypothesis, subject: ResearchSubject, priorObservations: readonly Observation[],
  meter: OracleMeter, phase: "falsification" | "audit", seed: string,
): Promise<HypothesisEvaluation> {
  if (phase !== "falsification" && phase !== "audit") throw new TypeError("Invalid hypothesis evaluation phase");
  const program = programOf(hypothesis)!;
  const target = frozenSubject(subject);
  const binding = { subjectId: hypothesis.subjectId, subjectVersion: hypothesis.subjectVersion,
    programDigest: researchDigest(program), trainingDigest: hypothesis.trainingDigest,
    trainingObservationIds: [...hypothesis.trainingObservationIds], parentHypothesisId: hypothesis.parentHypothesisId };
  if (binding.subjectId !== target.id || binding.subjectVersion !== target.version
    || hypothesis.programDigest !== binding.programDigest || hypothesis.id !== hypothesisIdentity(binding)) throw new TypeError("Hypothesis content binding mismatch");
  const hypothesisId = hypothesis.id;
  const excluded = new Set<string>();
  for (const prior of priorObservations) {
    if (prior.subjectId !== target.id || prior.subjectVersion !== target.version) continue;
    assertResearchJson(prior.input);
    const digest = researchDigest(prior.input);
    if (prior.inputDigest !== digest) throw new TypeError("Prior observation input binding mismatch");
    excluded.add(digest); // Includes ALL partitions, especially every earlier audit.
  }
  const excludedInputDigests = [...excluded].sort(compare);
  const start = meter.used;
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(meter.limit) || meter.limit < 0) throw new TypeError("Invalid oracle meter allowance");
  const allowance = Math.min(HYPOTHESIS_PHASE_ALLOWANCE[phase], Math.max(0, meter.limit - start));
  // Every candidate and AST is snapshotted/frozen before the first asynchronous call.
  const batch = sampleBatch(target, program, seed, excluded, allowance);
  const samples = freeze(batch.samples);
  const observationIds: string[] = [], counterexampleIds: string[] = [];
  const sampleKinds: HypothesisEvaluation["sampleKinds"] = [];
  let inScope = 0, outOfScope = 0, failure: string | null = null;
  const partition = phase === "audit" ? "hypothesis-audit" : "hypothesis-falsification";
  for (const sample of samples) {
    if (meter.used >= meter.limit || meter.used - start >= allowance) { failure = "oracle-budget-exhausted"; break; }
    try {
      const observation = await meter.observe(target, freeze(normalizeResearchJson(sample.input)), partition);
      const observedInput = normalizeResearchJson(observation.input);
      if (observation.subjectId !== target.id || observation.subjectVersion !== target.version || observation.partition !== partition
        || observation.inputDigest !== researchDigest(sample.input) || researchDigest(observedInput) !== observation.inputDigest
        || typeof observation.measurement.holds !== "boolean" || !observation.id || observationIds.includes(observation.id)) {
        failure = "oracle-observation-binding"; break;
      }
      observationIds.push(observation.id); sampleKinds.push(sample.kind);
      const expected = matches(program.when, extractFeatures(observedInput)) ? program.expectedHolds : null;
      if (expected === null) outOfScope++;
      else {
        inScope++;
        if (observation.measurement.holds !== expected) { counterexampleIds.push(observation.id); break; }
      }
    } catch { failure = "oracle-error"; break; }
  }
  const calls = meter.used - start;
  const survived = !failure && observationIds.length >= 8 && calls >= 8 && inScope >= 4 && outOfScope >= 4;
  const status = counterexampleIds.length ? "refuted" : survived ? "survived-budget" : "inconclusive";
  const reason = counterexampleIds.length ? "fresh-in-scope-counterexample"
    : failure ?? (survived ? "no-counterexample-in-bounded-sample-not-proof-or-population-coverage"
      : !allowance ? "zero-oracle-allowance" : !samples.length ? "no-fresh-valid-inputs"
        : observationIds.length < 8 ? "insufficient-fresh-calls" : "insufficient-scope-contrast");
  return { evaluatorVersion: HYPOTHESIS_EVALUATOR_VERSION, hypothesisId, programDigest: binding.programDigest,
    trainingDigest: binding.trainingDigest, subjectId: target.id, subjectVersion: target.version, phase, seed,
    status, reason, observationIds, counterexampleIds, inScope, outOfScope, attemptedCandidates: batch.attemptedCandidates,
    samplingProtocol: SAMPLING_PROTOCOL, sampleKinds, excludedInputDigests, calls, allowance };
}
