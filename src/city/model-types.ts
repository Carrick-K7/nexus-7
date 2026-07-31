import type {
  AgentId,
  SimulationMetric,
} from "@/simulation/types";
import type {
  LifecycleEvent,
} from "@/lifecycle";
import type {
  CityMetricCode,
  CityMetricDefinition,
  CoherentCitySnapshot,
} from "./types";
import type {
  CityScenarioTruth,
  CityScenarioVerificationReport,
  CityScenarioSymptom,
} from "./scenarios";

export const CITY_OBJECTIVE_SCHEMA_VERSION =
  "nexus.city-objective.v1" as const;
export const CITY_GUARDRAIL_SCHEMA_VERSION =
  "nexus.city-guardrail.v1" as const;
export const CITY_INCIDENT_SCHEMA_VERSION =
  "nexus.city-incident.v1" as const;

export interface CityObjective {
  schemaVersion: typeof CITY_OBJECTIVE_SCHEMA_VERSION;
  id: string;
  name: string;
  metric: CityMetricCode;
  direction: "increase" | "decrease" | "maintain";
  target: number;
  weight: number;
  owner: string;
  scope: "city" | "organization" | "scenario";
  version: string;
  effectiveAt: string;
  deadlineAt?: string;
  status: "active" | "superseded";
  synthetic: true;
}

export interface CityGuardrail {
  schemaVersion: typeof CITY_GUARDRAIL_SCHEMA_VERSION;
  id: string;
  name: string;
  metric: CityMetricCode;
  comparison: "minimum" | "maximum";
  threshold: number;
  groupIds: string[];
  severity: "warning" | "critical";
  breachAction: "pause" | "rollback" | "human-review";
  owner: string;
  version: string;
  effectiveAt: string;
  status: "active" | "superseded";
  synthetic: true;
}

export type CityIncidentStatus =
  | "detected"
  | "triaged"
  | "investigating"
  | "resolved";

export interface CityIncidentImpact {
  affectedGroupIds: string[];
  populationSharePercent: number;
  vulnerableGroupCount: number;
  durationTicks: number;
  irreversibility: number;
  severityScore: number;
}

export interface CityIncident {
  schemaVersion: typeof CITY_INCIDENT_SCHEMA_VERSION;
  id: string;
  scenarioTruthId: string;
  correlationId: string;
  causationId: string;
  status: CityIncidentStatus;
  severity: "low" | "moderate" | "high" | "critical";
  summary: string;
  family: CityScenarioTruth["family"];
  detectedAt: string;
  detectionTick: number;
  evidence: Array<{
    metric: SimulationMetric;
    value: number;
    threshold: number;
    comparison: CityScenarioSymptom["comparison"];
    sourceWorldFingerprint: string;
  }>;
  impact: CityIncidentImpact;
  hiddenTruth: CityScenarioTruth["hiddenRootCause"];
  assignedAgents: AgentId[];
  objectiveVersion: string;
  guardrailVersion: string;
  resolvedAt?: string;
  resolution?: string;
  synthetic: true;
}

export interface CityModelOverview {
  schemaVersion: "nexus.city-model-overview.v1";
  generatedAt: string;
  ontology: {
    version: "nexus.city-ontology.v1";
    metrics: ReadonlyArray<CityMetricDefinition>;
  };
  snapshot: CoherentCitySnapshot;
  objectives: CityObjective[];
  guardrails: CityGuardrail[];
  incidents: CityIncident[];
  scenarioTruth: CityScenarioTruth[];
  scenarioVerification: CityScenarioVerificationReport;
  events: LifecycleEvent[];
  syntheticBoundary: string;
}

export interface CreateCityObjectiveInput {
  name: string;
  metric: CityMetricCode;
  direction: CityObjective["direction"];
  target: number;
  weight: number;
  owner: string;
  scope?: CityObjective["scope"];
  deadlineAt?: string;
}

export interface CreateCityGuardrailInput {
  name: string;
  metric: CityMetricCode;
  comparison: CityGuardrail["comparison"];
  threshold: number;
  groupIds?: string[];
  severity: CityGuardrail["severity"];
  breachAction: CityGuardrail["breachAction"];
  owner: string;
}
