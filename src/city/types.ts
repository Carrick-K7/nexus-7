import type {
  AgentId,
  SimulationMetric,
} from "@/simulation/types";

export const CITY_ONTOLOGY_VERSION = "nexus.city-ontology.v1" as const;
export const CITY_SNAPSHOT_SCHEMA_VERSION =
  "nexus.city-snapshot.v1" as const;

export type CityDomain =
  | "population"
  | "district"
  | "housing"
  | "transport"
  | "energy"
  | "economy"
  | "public-safety"
  | "environment"
  | "digital-network";

export type CityMetricCode =
  | SimulationMetric
  | "housing-cost-burden"
  | "housing-supply"
  | "employment"
  | "inequality"
  | "public-service-access"
  | "vulnerable-service-access"
  | "productivity"
  | "emergency-readiness"
  | "climate-resilience"
  | "migration-pressure"
  | "budget-health"
  | "network-continuity";

export type CityMetricUnit =
  | "people"
  | "index"
  | "percent"
  | "celsius"
  | "kilometers-per-hour";

export interface CityMetricDefinition {
  code: CityMetricCode;
  domain: CityDomain;
  unit: CityMetricUnit;
  minimum: number;
  maximum: number;
  direction: "higher-is-better" | "lower-is-better" | "contextual";
  updateFrequencyTicks: number;
  owner: AgentId;
  source: string;
  formula: string;
  observability: "direct" | "derived";
  sensitivity: string[];
}

export interface CityMetricValue {
  value: number;
  unit: CityMetricUnit;
  source: string;
  owner: AgentId;
}

export interface SyntheticStakeholderImpact {
  groupId: string;
  districtId: string;
  incomeBand: "low" | "middle" | "high";
  vulnerability: "standard" | "elevated" | "high";
  populationSharePercent: number;
  serviceAccess: number;
  burden: number;
  synthetic: true;
}

export interface CoherentCitySnapshot {
  schemaVersion: typeof CITY_SNAPSHOT_SCHEMA_VERSION;
  ontologyVersion: typeof CITY_ONTOLOGY_VERSION;
  scenarioId: string;
  tick: number;
  observedAtSimulationMinute: number;
  metrics: Record<CityMetricCode, CityMetricValue>;
  stakeholderImpacts: SyntheticStakeholderImpact[];
  sourceWorldFingerprint: string;
  synthetic: true;
}

export type CityMechanismCode =
  | "energy-shortage-cascade"
  | "congestion-productivity"
  | "network-emergency-dependency"
  | "pollution-health-burden"
  | "water-service-dependency";

export interface CityMechanismApplication {
  mechanism: CityMechanismCode;
  causeMetric: SimulationMetric;
  causeValue: number;
  effectMetric: SimulationMetric;
  formula: string;
  delta: number;
  before: number;
  after: number;
}
