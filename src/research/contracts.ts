/** Research is a separate bounded context. Nothing here grants city or host write access. */
export const RESEARCH_SCHEMA = "nexus.research-station.v1" as const;
export const RESEARCH_RECORD_KIND = "research-station" as const;
export const REDUCER_SCHEMA = "nexus.counterexample-reducer.v1" as const;
export const RESEARCH_EVALUATOR_VERSION = "counterexample-preservation-v2" as const;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Localized { en: string; zh: string }
export type EvidenceOrigin = "known-audit-seed" | "generated-challenge" | "repository-observation";

/** A subject is trusted executable instrumentation, never submitted candidate code. */
export interface ResearchSubject {
  id: string;
  version: string;
  title: Localized;
  claim: Localized;
  origin: EvidenceOrigin;
  interpretation: "declared-contract" | "exploratory-hypothesis";
  family: string;
  generate(seed: string): Json;
  valid(input: Json): boolean;
  measure(input: Json): Promise<Measurement>;
}
export interface Measurement {
  holds: boolean;
  facts: { [key: string]: Json };
  code: string;
}
export interface Observation {
  id: string;
  subjectId: string;
  subjectVersion: string;
  input: Json;
  inputDigest: string;
  measurement: Measurement;
  partition: "discovery" | "confirmation" | "tool-training" | "tool-validation" | "transfer" | "hypothesis-training" | "hypothesis-falsification" | "hypothesis-audit";
}

/** Closed, explicit data DSL; no expressions, functions, imports, paths or shell. */
export type ReductionOperator =
  | "delete-entry"
  | "halve-number"
  | "decrement-number"
  | "shorten-string"
  | "chunk-array";
export interface ReducerProgram {
  schemaVersion: typeof REDUCER_SCHEMA;
  operators: ReductionOperator[];
  maxPasses: number;
}
export interface ReductionResult {
  status: "reduced" | "not-counterexample" | "stuck" | "oracle-error" | "budget-exhausted";
  counterexamplePreserved: boolean;
  original: Json;
  reduced: Json;
  originalSize: number;
  reducedSize: number;
  calls: number;
  exhausted: boolean;
  trace: Array<{ operator: ReductionOperator; beforeDigest: string; afterDigest: string }>;
}
export interface ToolEvaluation {
  verifierVersion: string;
  programDigest: string;
  subjectId: string;
  subjectVersion: string;
  inputDigest: string;
  observationIds: string[];
  initialObservationId: string | null;
  finalObservationId: string | null;
  controlObservationId: string | null;
  allowance: number;
  accepted: boolean;
  code: string;
  calls: number;
  originalSize: number;
  reducedSize: number;
  counterexamplePreserved: boolean;
  controlRejected: boolean;
  reduced: Json;
}
export interface ResearchTool {
  id: string;
  program: ReducerProgram;
  digest: string;
  source: string;
  createdByEpisodeId: string;
  trainingSubjectId: string;
  status: "certified" | "rejected";
  evaluation: ToolEvaluation;
  reusedOnSubjectIds: string[];
}

export interface HypothesisTrainingSnapshot {
  subjectId: string;
  subjectVersion: string;
  observationIds: string[];
  digest: string;
  examples: Array<{ id: string; input: Json; holds: boolean }>;
  status: "ready" | "insufficient-data" | "capacity-exceeded";
}
export interface ResearchHypothesis {
  id: string;
  subjectId: string;
  subjectVersion: string;
  program: import("./induction").Hypothesis;
  programDigest: string;
  trainingDigest: string;
  trainingObservationIds: string[];
  createdByEpisodeId: string;
  parentHypothesisId: string | null;
}
export interface HypothesisEvaluation {
  evaluatorVersion: "conditional-falsifier-v1";
  hypothesisId: string;
  programDigest: string;
  trainingDigest: string;
  subjectId: string;
  subjectVersion: string;
  phase: "falsification" | "audit";
  seed: string;
  status: "refuted" | "survived-budget" | "inconclusive";
  reason: string;
  observationIds: string[];
  counterexampleIds: string[];
  inScope: number;
  outOfScope: number;
  attemptedCandidates: number;
  samplingProtocol: "bounded-perturbation-v1" | "bounded-perturbation-v2";
  sampleKinds: Array<"exploration" | "boundary">;
  excludedInputDigests: string[];
  calls: number;
  allowance: number;
}

export type QuestionKind = "survey" | "replicate" | "minimize" | "transfer" | "induce" | "falsify" | "audit-hypothesis";
export interface ResearchQuestion {
  id: string;
  kind: QuestionKind;
  subjectId: string;
  title: Localized;
  status: "pending" | "running" | "answered" | "stopped";
  createdAtRound: number;
  parentEpisodeId?: string;
  observationId?: string;
  toolId?: string;
  hypothesisId?: string;
  priority: number;
  attempts: number;
  reasonCode: string;
}
export interface ResearchLesson {
  id: string;
  subjectId: string;
  kind: "counterexample" | "confirmation" | "refutation" | "tool" | "transfer" | "limit" | "hypothesis";
  statement: Localized;
  evidenceIds: string[];
  episodeId: string;
  applicability: string;
  status: "provisional" | "confirmed" | "refuted";
  supersedes?: string;
}
export type EpisodeVerdict =
  | "counterexample"
  | "not-reproduced"
  | "confirmed"
  | "tool-certified"
  | "tool-rejected"
  | "transferred"
  | "no-change"
  | "inconclusive"
  | "hypothesis-proposed"
  | "hypothesis-refuted"
  | "hypothesis-survived";
export interface ResearchEpisode {
  id: string;
  questionId: string;
  subjectId: string;
  kind: QuestionKind;
  selectionReason: string;
  verdict: EpisodeVerdict;
  observations: Observation[];
  /** Kernel-issued evaluation receipts, not fields supplied by the candidate runner. */
  evaluations?: ToolEvaluation[];
  hypothesis?: ResearchHypothesis;
  hypothesisEvaluations?: HypothesisEvaluation[];
  hypothesisEvaluationAttempt?: HypothesisEvaluationAttempt;
  tool?: ResearchTool;
  lessonIds: string[];
  generatedQuestionIds: string[];
  calls: number;
  startedAt: string;
  completedAt: string;
  inputStateDigest: string;
  previousDigest: string;
  digest: string;
}
export interface ResearchPolicy {
  maxOracleCalls: number;
  maxCallsPerEpisode: number;
  maxEpisodes: number;
  maxAttemptsPerQuestion: number;
  leaseMs: number;
}
export interface HypothesisEvaluationAttempt {
  samplingProtocol?: HypothesisEvaluation["samplingProtocol"];
  evaluatorVersion?: string;
  hypothesisId: string;
  phase: HypothesisEvaluation["phase"];
  seed: string;
  allowance: number;
}
export interface ResearchLease {
  hypothesisEvaluationAttempt?: HypothesisEvaluationAttempt;
  token: string;
  owner: string;
  questionId: string;
  episodeId: string;
  reservedCalls: number;
  acquiredAt: string;
  expiresAt: string;
  inputStateDigest: string;
}
export interface ResearchOperatorAuthorization {
  schemaVersion: "nexus.research-operator-authorization.v1";
  approvalSource: "operator-delegated";
  purpose: "start-once";
  authentication: "local-root-permit-not-oidc-or-third-party-signature";
  approvedBy: string;
  executorId: string;
  humanReferenceDigest: string;
  releaseRevision: string;
  configDigest: string;
  nonceDigest: string;
  permitDigest: string;
  issuedAt: string;
  expiresAt: string;
}
export interface ResearchStation {
  authorization?: ResearchOperatorAuthorization;
  schemaVersion: typeof RESEARCH_SCHEMA;
  id: string;
  workspaceId: string;
  organizationId: string;
  revision: number;
  status: "running" | "paused" | "idle" | "budget-exhausted";
  mode: "bounded-symbolic-research";
  seed: string;
  subjectIds: string[];
  subjectVersions: Record<string, string>;
  policy: ResearchPolicy;
  budget: {
    spentCalls: number;
    reservedCalls: number;
    abandonedReservations: number;
    externalModelCalls: 0;
    actualModelCostUsd: 0;
  };
  questions: ResearchQuestion[];
  episodes: ResearchEpisode[];
  lessons: ResearchLesson[];
  tools: ResearchTool[];
  /** Additive draft fields: older local v1 records remain readable without rewriting their trace. */
  hypotheses?: ResearchHypothesis[];
  hypothesisEvaluations?: HypothesisEvaluation[];
  lease: ResearchLease | null;
  stopReason: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ResearchOverview {
  runtime?: {
    releaseRevision: string | null;
    evidence: "deployment-env" | "local-unbound";
    lastEpisodeAt: string | null;
  };
  schemaVersion: typeof RESEARCH_SCHEMA;
  generatedAt: string;
  backend: "memory" | "postgres";
  station: ResearchStation | null;
  subjects: Array<Pick<ResearchSubject, "id" | "version" | "title" | "claim" | "origin" | "interpretation" | "family">>;
  boundary: {
    /** Legacy field: instruments cannot mutate production subjects or deploy; the research ledger itself persists. */
    productionWrites: false;
    arbitraryCodeExecution: false;
    liveModelCalls: false;
    knownSeedsAreNotDiscoveries: true;
    evaluatorIsolation: "separate-module-not-hostile-process-isolation";
  };
}

/** The service reserves quota before work. Every target call must pass through this meter. */
export interface OracleMeter {
  readonly used: number;
  readonly limit: number;
  observe(subject: ResearchSubject, input: Json, partition: Observation["partition"]): Promise<Observation>;
  /** Only the service can mint a persisted certification; callers may request, not forge it. */
  evaluateReducer?(program: ReducerProgram, subject: ResearchSubject, input: Json): Promise<ToolEvaluation>;
  /** Evaluates only an already-persisted frozen hypothesis; callers choose neither inputs nor seeds. */
  evaluateHypothesis?(hypothesisId: string, phase: HypothesisEvaluation["phase"]): Promise<HypothesisEvaluation>;
}
export interface EpisodeResult {
  verdict: EpisodeVerdict;
  observations: Observation[];
  tool?: ResearchTool;
  hypothesis?: ResearchHypothesis;
  /** Candidate fields are matched against kernel-private issuance, never trusted directly. */
  hypothesisEvaluation?: HypothesisEvaluation;
  lessons: ResearchLesson[];
  questions: ResearchQuestion[];
  reusedTool?: { toolId: string; subjectId: string };
}
export type EpisodeRunner = (
  station: ResearchStation,
  question: ResearchQuestion,
  episodeId: string,
  meter: OracleMeter,
) => Promise<EpisodeResult>;
