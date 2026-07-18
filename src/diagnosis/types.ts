import type {
  AgentId,
  SimulationMetric,
} from "@/simulation/types";
import type {
  CityIncident,
} from "@/city/model-types";
import type {
  CityIncidentFamily,
  CityScenarioMode,
} from "@/city/scenarios";
import type {
  CoherentCitySnapshot,
} from "@/city/types";
import type {
  LifecycleEvent,
} from "@/lifecycle";

export const CAUSAL_DIAGNOSIS_SCHEMA_VERSION =
  "nexus.causal-diagnosis.v1" as const;
export const DIAGNOSTIC_CALIBRATION_SCHEMA_VERSION =
  "nexus.diagnostic-calibration.v1" as const;
export const DIAGNOSTIC_TRUST_SCHEMA_VERSION =
  "nexus.diagnostic-trust.v1" as const;

export type EvidenceClassification =
  | "fact"
  | "inference"
  | "prediction"
  | "human-judgment";

export type DiagnosticAuthor = AgentId | "aria" | "human";

export interface DiagnosticEvidence {
  id: string;
  classification: EvidenceClassification;
  statement: string;
  sourceType:
    | "metric-snapshot"
    | "domain-mechanism"
    | "diagnostic-policy"
    | "governance-boundary";
  sourceId: string;
  observedFromTick: number;
  observedToTick: number;
  metric?: SimulationMetric;
  value?: number;
  confidence: number;
}

export interface EvidenceReference {
  evidenceId: string;
  stance: "supports" | "contradicts" | "neutral";
  weight: number;
  explanation: string;
}

export interface DiagnosticHypothesis {
  id: string;
  rootCauseCode: string;
  title: string;
  family: CityIncidentFamily;
  rank: number;
  confidence: number;
  status: "leading" | "alternative" | "rejected" | "unknown";
  proposedBy: DiagnosticAuthor[];
  evidence: EvidenceReference[];
  falsificationTest: {
    type: "remove-candidate-cause";
    candidateRootCauseCode: string;
    expectedObservation: string;
    executable: true;
  };
  whatWouldChangeConclusion: string;
}

export interface HypothesisGraphNode {
  id: string;
  kind: "symptom" | "hypothesis" | "mechanism" | "uncertainty";
  label: string;
  classification?: EvidenceClassification;
  confidence?: number;
}

export interface HypothesisGraphEdge {
  id: string;
  from: string;
  to: string;
  relation: "supports" | "contradicts" | "causes" | "predicts";
  source: string;
  observedFromTick: number;
  observedToTick: number;
  confidence: number;
  applicableScenarioIds: string[];
}

export interface HypothesisGraph {
  nodes: HypothesisGraphNode[];
  edges: HypothesisGraphEdge[];
}

export interface DiagnosticAgentSubmission {
  id: string;
  agentId: AgentId;
  submittedAt: string;
  source: "deterministic-policy" | "validated-model-proposal";
  policyVersion: string;
  proposedHypothesisIds: string[];
  challengedHypothesisIds: string[];
  evidenceIds: string[];
  unknowns: string[];
  preservedByAggregator: true;
}

export interface CounterfactualDiagnosticRun {
  schemaVersion: "nexus.diagnostic-counterfactual.v1";
  id: string;
  hypothesisId: string;
  candidateRootCauseCode: string;
  frozenSnapshotFingerprint: string;
  baselineFingerprint: string;
  counterfactualFingerprint: string;
  repeatedCounterfactualFingerprint: string;
  removedMetricDeltas: Partial<Record<SimulationMetric, number>>;
  symptomCountBefore: number;
  symptomCountAfter: number;
  symptomResolutionPercent: number;
  effectSize: number;
  confidenceInterval: [number, number];
  intervalMethod: "deterministic-sensitivity-band";
  sideEffectMetrics: SimulationMetric[];
  deterministicReplay: boolean;
  supportsHypothesis: boolean;
}

export interface DiagnosticCalibrationSample {
  id: string;
  scenarioId: string;
  family: CityIncidentFamily;
  agentId: DiagnosticAuthor;
  predictedProbability: number;
  outcome: 0 | 1;
  hypothesisCode: string;
}

export interface DiagnosticCalibrationReport {
  schemaVersion: typeof DIAGNOSTIC_CALIBRATION_SCHEMA_VERSION;
  generatedAt: string;
  sampleCount: number;
  brierScore: number;
  expectedCalibrationError: number;
  top3RootCauseHitRatePercent: number;
  byAgent: Array<{
    agentId: DiagnosticAuthor;
    sampleCount: number;
    brierScore: number;
  }>;
  byFamily: Array<{
    family: CityIncidentFamily;
    sampleCount: number;
    brierScore: number;
  }>;
  passed: boolean;
  fingerprint: string;
}

export interface DiagnosticTrustAssessment {
  schemaVersion: typeof DIAGNOSTIC_TRUST_SCHEMA_VERSION;
  assessedAt: string;
  environment: string;
  dataDistributionShift: number;
  policyEffectShift: number;
  modelOutputShift: number;
  calibrationPassed: boolean;
  mode: "active" | "read-only" | "deterministic-fallback";
  automationAllowed: boolean;
  reasons: string[];
}

export interface CausalDiagnosis {
  schemaVersion: typeof CAUSAL_DIAGNOSIS_SCHEMA_VERSION;
  id: string;
  incidentId: string;
  scenarioTruthId: string;
  scenarioMode: CityScenarioMode;
  correlationId: string;
  causationId: string;
  status: "diagnosed" | "inconclusive" | "low-confidence";
  createdAt: string;
  policyVersion: string;
  frozenSnapshot: CoherentCitySnapshot;
  incidentSummary: string;
  evidence: DiagnosticEvidence[];
  hypotheses: DiagnosticHypothesis[];
  graph: HypothesisGraph;
  agentSubmissions: DiagnosticAgentSubmission[];
  aggregation: {
    aggregator: "aria";
    preservedSubmissionIds: string[];
    disagreements: string[];
    selectedHypothesisId?: string;
    selectionBasis: string;
  };
  counterfactuals: CounterfactualDiagnosticRun[];
  trust: DiagnosticTrustAssessment;
  leadingConfidence: number;
  experimentEligibility: {
    eligible: boolean;
    minimumConfidence: number;
    blockers: string[];
  };
  unknowns: string[];
  hiddenTruthUsedForVerificationOnly: true;
  synthetic: true;
  fingerprint: string;
}

export interface DiagnosisOverview {
  schemaVersion: "nexus.diagnosis-overview.v1";
  generatedAt: string;
  diagnoses: CausalDiagnosis[];
  calibration: DiagnosticCalibrationReport;
  trust: DiagnosticTrustAssessment;
  events: LifecycleEvent[];
  gates: {
    minimumExperimentConfidence: number;
    diagnosedWithAlternativeAndCounterevidencePercent: number;
    deterministicCounterfactualReplayPercent: number;
    lowConfidenceAutomationAttempts: number;
  };
  evidenceBoundary: string;
}

export interface DiagnosisBuildInput {
  diagnosisId?: string;
  incident: CityIncident;
  scenarioMode: CityScenarioMode;
  scenarioTruthId: string;
  family: CityIncidentFamily;
  injectedMetricDeltas: Partial<Record<SimulationMetric, number>>;
  createdAt: string;
  trust: DiagnosticTrustAssessment;
  confidenceCeiling?: number;
}
