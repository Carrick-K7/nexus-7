import {
  DEFAULT_SCENARIO,
  cloneWorldState,
} from "@/simulation/scenarios";
import {
  getMetric,
  setMetric,
} from "@/simulation/core/metrics";
import {
  inspectWorldInvariants,
} from "@/simulation/core/invariants";
import {
  replaySimulation,
} from "@/simulation/replay";
import type {
  SimulationMetric,
  SimulationScenario,
} from "@/simulation/types";

export const CITY_SCENARIO_SCHEMA_VERSION =
  "nexus.city-scenario.v1" as const;

export type CityIncidentFamily =
  | "infrastructure"
  | "economic"
  | "public-safety"
  | "environment"
  | "digital-network";

export type CityScenarioMode =
  | "normal"
  | "single-fault"
  | "cascade"
  | "conflicting-objectives";

export interface CityScenarioSymptom {
  metric: SimulationMetric;
  comparison: "greater-than" | "less-than";
  threshold: number;
  firstObservableTick: number;
}

export interface CityScenarioTruth {
  schemaVersion: typeof CITY_SCENARIO_SCHEMA_VERSION;
  id: string;
  family: CityIncidentFamily;
  mode: CityScenarioMode;
  title: string;
  seed: string;
  hiddenRootCause?: {
    code: string;
    domain: string;
    injectedAtTick: number;
  };
  injectedMetricDeltas: Partial<Record<SimulationMetric, number>>;
  observableSymptoms: CityScenarioSymptom[];
  affectedGroupIds: string[];
  durationTicks: number;
  irreversibility: number;
  objectiveConflict?: {
    objectives: string[];
    description: string;
  };
  expectedIncident: boolean;
  synthetic: true;
}

export interface ScenarioDetectionResult {
  scenarioId: string;
  family: CityIncidentFamily;
  mode: CityScenarioMode;
  expectedIncident: boolean;
  detected: boolean;
  detectionDelayTicks?: number;
  matchedSymptoms: CityScenarioSymptom[];
}

export interface CityScenarioVerificationReport {
  schemaVersion: "nexus.city-scenario-verification.v1";
  scenarioCount: number;
  familyCount: number;
  modeCount: number;
  deterministicReplayPercent: number;
  precisionPercent: number;
  recallPercent: number;
  averageDetectionDelayTicks: number;
  invariantViolations: string[];
  results: ScenarioDetectionResult[];
  passed: boolean;
}

interface FamilyTemplate {
  family: CityIncidentFamily;
  title: string;
  rootCause: string;
  domain: string;
  single: Partial<Record<SimulationMetric, number>>;
  cascade: Partial<Record<SimulationMetric, number>>;
  symptoms: CityScenarioSymptom[];
  affectedGroupIds: string[];
  conflictObjectives: string[];
}

const FAMILY_TEMPLATES: FamilyTemplate[] = [
  {
    family: "infrastructure",
    title: "Grid capacity disturbance",
    rootCause: "GRID_TRANSFORMER_CAPACITY_LOSS",
    domain: "energy",
    single: { energy: -55 },
    cascade: { energy: -60, traffic: 35, internet: -35, medical: -20 },
    symptoms: [
      {
        metric: "energy",
        comparison: "less-than",
        threshold: 40,
        firstObservableTick: 0,
      },
      {
        metric: "traffic",
        comparison: "greater-than",
        threshold: 80,
        firstObservableTick: 2,
      },
    ],
    affectedGroupIds: [
      "synthetic-industrial-workers",
      "synthetic-service-limited",
    ],
    conflictObjectives: [
      "objective-essential-services",
      "objective-budget-health",
    ],
  },
  {
    family: "economic",
    title: "Employment and supply shock",
    rootCause: "SUPPLY_CREDIT_CONTRACTION",
    domain: "economy",
    single: { gdp: -1_900 },
    cascade: { gdp: -2_100, happiness: -38, crime: 55 },
    symptoms: [
      {
        metric: "gdp",
        comparison: "less-than",
        threshold: 1_500,
        firstObservableTick: 1,
      },
      {
        metric: "crime",
        comparison: "greater-than",
        threshold: 70,
        firstObservableTick: 4,
      },
    ],
    affectedGroupIds: [
      "synthetic-middle-income",
      "synthetic-industrial-workers",
    ],
    conflictObjectives: [
      "objective-employment",
      "objective-housing-affordability",
    ],
  },
  {
    family: "public-safety",
    title: "Coordinated public safety incident",
    rootCause: "COORDINATED_SERVICE_DISRUPTION",
    domain: "public-safety",
    single: { crime: 60 },
    cascade: { crime: 65, medical: -35, traffic: 30 },
    symptoms: [
      {
        metric: "crime",
        comparison: "greater-than",
        threshold: 70,
        firstObservableTick: 0,
      },
      {
        metric: "medical",
        comparison: "less-than",
        threshold: 55,
        firstObservableTick: 2,
      },
    ],
    affectedGroupIds: [
      "synthetic-service-limited",
      "synthetic-industrial-workers",
    ],
    conflictObjectives: [
      "objective-public-safety",
      "objective-civil-service-access",
    ],
  },
  {
    family: "environment",
    title: "Extreme weather and contamination",
    rootCause: "EXTREME_WEATHER_FILTRATION_FAILURE",
    domain: "environment",
    single: { pollution: 60 },
    cascade: { pollution: 65, water: -50, medical: -35, energy: -45 },
    symptoms: [
      {
        metric: "pollution",
        comparison: "greater-than",
        threshold: 75,
        firstObservableTick: 0,
      },
      {
        metric: "water",
        comparison: "less-than",
        threshold: 50,
        firstObservableTick: 3,
      },
    ],
    affectedGroupIds: [
      "synthetic-service-limited",
      "synthetic-middle-income",
    ],
    conflictObjectives: [
      "objective-climate-resilience",
      "objective-energy-continuity",
    ],
  },
  {
    family: "digital-network",
    title: "Network control-plane outage",
    rootCause: "NETWORK_CONTROL_PLANE_PARTITION",
    domain: "digital-network",
    single: { internet: -70 },
    cascade: { internet: -75, medical: -40, gdp: -1_600, crime: 50 },
    symptoms: [
      {
        metric: "internet",
        comparison: "less-than",
        threshold: 40,
        firstObservableTick: 0,
      },
      {
        metric: "medical",
        comparison: "less-than",
        threshold: 55,
        firstObservableTick: 2,
      },
    ],
    affectedGroupIds: [
      "synthetic-high-income",
      "synthetic-service-limited",
    ],
    conflictObjectives: [
      "objective-network-continuity",
      "objective-public-safety",
    ],
  },
];

const MODES: CityScenarioMode[] = [
  "normal",
  "single-fault",
  "cascade",
  "conflicting-objectives",
];

function scenarioFor(
  template: FamilyTemplate,
  mode: CityScenarioMode,
): CityScenarioTruth {
  const normal = mode === "normal";
  const cascade =
    mode === "cascade" || mode === "conflicting-objectives";
  const id = `city-${template.family}-${mode}`;
  return {
    schemaVersion: CITY_SCENARIO_SCHEMA_VERSION,
    id,
    family: template.family,
    mode,
    title: `${template.title} · ${mode}`,
    seed: `nexus-7-${id}`,
    hiddenRootCause: normal
      ? undefined
      : {
          code: template.rootCause,
          domain: template.domain,
          injectedAtTick: 0,
        },
    injectedMetricDeltas: normal
      ? {}
      : structuredClone(cascade ? template.cascade : template.single),
    observableSymptoms: normal
      ? structuredClone(template.symptoms)
      : structuredClone(
          cascade ? template.symptoms : template.symptoms.slice(0, 1),
        ),
    affectedGroupIds: normal
      ? []
      : structuredClone(template.affectedGroupIds),
    durationTicks: normal ? 0 : cascade ? 120 : 45,
    irreversibility:
      mode === "conflicting-objectives" ? 0.55 : cascade ? 0.35 : 0.1,
    objectiveConflict:
      mode === "conflicting-objectives"
        ? {
            objectives: structuredClone(template.conflictObjectives),
            description:
              "Improving one objective consumes resources needed by another protected objective.",
          }
        : undefined,
    expectedIncident: !normal,
    synthetic: true,
  };
}

export const PUBLIC_CITY_SCENARIOS: ReadonlyArray<CityScenarioTruth> =
  FAMILY_TEMPLATES.flatMap((template) =>
    MODES.map((mode) => scenarioFor(template, mode)),
  );

export function materializeCityScenario(
  truth: CityScenarioTruth,
): SimulationScenario {
  let world = cloneWorldState(DEFAULT_SCENARIO.world);
  for (const [metric, delta] of Object.entries(
    truth.injectedMetricDeltas,
  )) {
    const typedMetric = metric as SimulationMetric;
    world = setMetric(
      world,
      typedMetric,
      getMetric(world, typedMetric) + (delta ?? 0),
    );
  }
  world = {
    ...world,
    scenarioId: truth.id,
  };
  return {
    id: truth.id,
    seed: truth.seed,
    policyVersion: DEFAULT_SCENARIO.policyVersion,
    configuration: structuredClone(DEFAULT_SCENARIO.configuration),
    world,
  };
}

function symptomMatches(
  symptom: CityScenarioSymptom,
  scenario: SimulationScenario,
): boolean {
  const value = getMetric(scenario.world, symptom.metric);
  return symptom.comparison === "greater-than"
    ? value > symptom.threshold
    : value < symptom.threshold;
}

export function evaluateCityScenarioDetection(
  truth: CityScenarioTruth,
): ScenarioDetectionResult {
  const scenario = materializeCityScenario(truth);
  const matchedSymptoms = truth.observableSymptoms.filter((symptom) =>
    symptomMatches(symptom, scenario),
  );
  return {
    scenarioId: truth.id,
    family: truth.family,
    mode: truth.mode,
    expectedIncident: truth.expectedIncident,
    detected: matchedSymptoms.length > 0,
    detectionDelayTicks:
      matchedSymptoms.length > 0
        ? Math.min(
            ...matchedSymptoms.map(
              (symptom) => symptom.firstObservableTick,
            ),
          )
        : undefined,
    matchedSymptoms,
  };
}

export function verifyCityScenarioCatalog(
  ticks = 120,
): CityScenarioVerificationReport {
  const results = PUBLIC_CITY_SCENARIOS.map(
    evaluateCityScenarioDetection,
  );
  const positives = results.filter((result) => result.expectedIncident);
  const truePositives = positives.filter((result) => result.detected);
  const detected = results.filter((result) => result.detected);
  const precision =
    detected.length === 0
      ? 100
      : (truePositives.length / detected.length) * 100;
  const recall =
    positives.length === 0
      ? 100
      : (truePositives.length / positives.length) * 100;
  const delays = truePositives.flatMap((result) =>
    result.detectionDelayTicks === undefined
      ? []
      : [result.detectionDelayTicks],
  );
  const invariantViolations: string[] = [];
  let replayMatches = 0;
  for (const truth of PUBLIC_CITY_SCENARIOS) {
    const scenario = materializeCityScenario(truth);
    const first = replaySimulation(
      scenario.world,
      {
        seed: scenario.seed,
        policyVersion: scenario.policyVersion,
        configuration: scenario.configuration,
      },
      ticks,
    );
    const second = replaySimulation(
      scenario.world,
      {
        seed: scenario.seed,
        policyVersion: scenario.policyVersion,
        configuration: scenario.configuration,
      },
      ticks,
    );
    if (first.fingerprint === second.fingerprint) {
      replayMatches += 1;
    }
    invariantViolations.push(
      ...inspectWorldInvariants(first.state).map(
        (violation) => `${truth.id}: ${violation}`,
      ),
    );
  }
  const deterministicReplayPercent =
    (replayMatches / PUBLIC_CITY_SCENARIOS.length) * 100;
  const report = {
    schemaVersion: "nexus.city-scenario-verification.v1" as const,
    scenarioCount: PUBLIC_CITY_SCENARIOS.length,
    familyCount: new Set(
      PUBLIC_CITY_SCENARIOS.map((scenario) => scenario.family),
    ).size,
    modeCount: new Set(
      PUBLIC_CITY_SCENARIOS.map((scenario) => scenario.mode),
    ).size,
    deterministicReplayPercent,
    precisionPercent: precision,
    recallPercent: recall,
    averageDetectionDelayTicks:
      delays.reduce((sum, delay) => sum + delay, 0) /
      Math.max(1, delays.length),
    invariantViolations,
    results,
    passed:
      PUBLIC_CITY_SCENARIOS.length >= 20 &&
      deterministicReplayPercent === 100 &&
      precision >= 95 &&
      recall >= 95 &&
      invariantViolations.length === 0,
  };
  return report;
}
