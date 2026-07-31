import { createHash } from "node:crypto";
import {
  clamp,
  roundMetric,
  selectCityMetrics,
} from "@/simulation/core/metrics";
import { stableStringify } from "@/simulation/core/random";
import type { WorldState } from "@/simulation/types";
import {
  CITY_ONTOLOGY_VERSION,
  CITY_SNAPSHOT_SCHEMA_VERSION,
  type CityMetricCode,
  type CityMetricDefinition,
  type CoherentCitySnapshot,
  type SyntheticStakeholderImpact,
} from "./types";

const direct = (
  code: CityMetricCode,
  domain: CityMetricDefinition["domain"],
  unit: CityMetricDefinition["unit"],
  minimum: number,
  maximum: number,
  direction: CityMetricDefinition["direction"],
  owner: CityMetricDefinition["owner"],
  source: string,
  sensitivity: string[],
): CityMetricDefinition => ({
  code,
  domain,
  unit,
  minimum,
  maximum,
  direction,
  updateFrequencyTicks: 1,
  owner,
  source,
  formula: `world.${source}`,
  observability: "direct",
  sensitivity,
});

const derived = (
  code: CityMetricCode,
  domain: CityMetricDefinition["domain"],
  direction: CityMetricDefinition["direction"],
  owner: CityMetricDefinition["owner"],
  formula: string,
  sensitivity: string[],
): CityMetricDefinition => ({
  code,
  domain,
  unit: "percent",
  minimum: 0,
  maximum: 100,
  direction,
  updateFrequencyTicks: 1,
  owner,
  source: "coherent-city-projection",
  formula,
  observability: "derived",
  sensitivity,
});

export const CITY_METRIC_DICTIONARY: ReadonlyArray<CityMetricDefinition> = [
  direct(
    "population",
    "population",
    "people",
    0,
    100_000_000,
    "contextual",
    "civitas",
    "city.population",
    ["migration-pressure", "housing-supply"],
  ),
  direct(
    "gdp",
    "economy",
    "index",
    0,
    100_000,
    "higher-is-better",
    "economica",
    "economy.gdp",
    ["productivity", "employment", "network-continuity"],
  ),
  direct(
    "happiness",
    "population",
    "percent",
    0,
    100,
    "higher-is-better",
    "civitas",
    "city.happiness",
    ["crime", "pollution", "traffic", "housing-cost-burden"],
  ),
  direct(
    "pollution",
    "environment",
    "percent",
    0,
    100,
    "lower-is-better",
    "civitas",
    "weather.pollution",
    ["traffic", "energy", "climate-resilience"],
  ),
  direct(
    "crime",
    "public-safety",
    "percent",
    0,
    100,
    "lower-is-better",
    "atlas",
    "security.crime",
    ["inequality", "employment", "public-service-access"],
  ),
  direct(
    "traffic",
    "transport",
    "percent",
    0,
    100,
    "lower-is-better",
    "civitas",
    "infrastructure.traffic",
    ["energy", "population", "productivity"],
  ),
  direct(
    "energy",
    "energy",
    "percent",
    0,
    100,
    "higher-is-better",
    "civitas",
    "infrastructure.energy",
    ["traffic", "internet", "medical", "productivity"],
  ),
  direct(
    "water",
    "environment",
    "percent",
    0,
    100,
    "higher-is-better",
    "civitas",
    "infrastructure.water",
    ["medical", "public-service-access"],
  ),
  direct(
    "internet",
    "digital-network",
    "percent",
    0,
    100,
    "higher-is-better",
    "spectre",
    "infrastructure.internet",
    ["gdp", "medical", "emergency-readiness"],
  ),
  direct(
    "medical",
    "population",
    "percent",
    0,
    100,
    "higher-is-better",
    "civitas",
    "infrastructure.medical",
    ["energy", "water", "internet", "pollution"],
  ),
  derived(
    "housing-cost-burden",
    "housing",
    "lower-is-better",
    "economica",
    "clamp(58 + traffic*0.18 + inequality*0.22 - happiness*0.28)",
    ["traffic", "inequality", "happiness"],
  ),
  derived(
    "housing-supply",
    "housing",
    "higher-is-better",
    "civitas",
    "clamp(82 - population/500000 + energy*0.12)",
    ["population", "energy"],
  ),
  derived(
    "employment",
    "economy",
    "higher-is-better",
    "economica",
    "clamp(48 + gdp/80 + productivity*0.18 - crime*0.12)",
    ["gdp", "productivity", "crime"],
  ),
  derived(
    "inequality",
    "population",
    "lower-is-better",
    "economica",
    "clamp(62 - happiness*0.45 + crime*0.22 + housingCostBurden*0.2)",
    ["happiness", "crime", "housing-cost-burden"],
  ),
  derived(
    "public-service-access",
    "population",
    "higher-is-better",
    "civitas",
    "mean(water, medical, internet)",
    ["water", "medical", "internet"],
  ),
  derived(
    "vulnerable-service-access",
    "district",
    "higher-is-better",
    "civitas",
    "publicServiceAccess - inequality*0.25",
    ["public-service-access", "inequality"],
  ),
  derived(
    "productivity",
    "economy",
    "higher-is-better",
    "economica",
    "mean(energy, internet, 100-traffic)",
    ["energy", "internet", "traffic"],
  ),
  derived(
    "emergency-readiness",
    "public-safety",
    "higher-is-better",
    "atlas",
    "mean(energy, medical, internet, 100-traffic)",
    ["energy", "medical", "internet", "traffic"],
  ),
  derived(
    "climate-resilience",
    "environment",
    "higher-is-better",
    "civitas",
    "mean(100-pollution, energy, water)",
    ["pollution", "energy", "water"],
  ),
  derived(
    "migration-pressure",
    "population",
    "lower-is-better",
    "civitas",
    "clamp(housingCostBurden*0.45 + inequality*0.35 + (100-serviceAccess)*0.2)",
    ["housing-cost-burden", "inequality", "public-service-access"],
  ),
  derived(
    "budget-health",
    "economy",
    "higher-is-better",
    "economica",
    "clamp(gdp/35 - emergencyBurden*0.15)",
    ["gdp", "emergency-readiness"],
  ),
  derived(
    "network-continuity",
    "digital-network",
    "higher-is-better",
    "spectre",
    "internet",
    ["internet", "energy"],
  ),
] as const;

const DEFINITION_BY_CODE = new Map(
  CITY_METRIC_DICTIONARY.map((definition) => [
    definition.code,
    definition,
  ]),
);

function metricValue(
  code: CityMetricCode,
  value: number,
): CoherentCitySnapshot["metrics"][CityMetricCode] {
  const definition = DEFINITION_BY_CODE.get(code);
  if (!definition) {
    throw new Error(`City metric definition ${code} is missing`);
  }
  return {
    value: roundMetric(value),
    unit: definition.unit,
    source: definition.source,
    owner: definition.owner,
  };
}

function stakeholderImpacts(
  serviceAccess: number,
  inequality: number,
  housingBurden: number,
): SyntheticStakeholderImpact[] {
  const profiles = [
    {
      groupId: "synthetic-high-income",
      districtId: "neo-downtown",
      incomeBand: "high" as const,
      vulnerability: "standard" as const,
      populationSharePercent: 22,
      accessOffset: 8,
      burdenOffset: -12,
    },
    {
      groupId: "synthetic-middle-income",
      districtId: "chrome-heights",
      incomeBand: "middle" as const,
      vulnerability: "standard" as const,
      populationSharePercent: 31,
      accessOffset: 2,
      burdenOffset: -2,
    },
    {
      groupId: "synthetic-industrial-workers",
      districtId: "iron-works",
      incomeBand: "low" as const,
      vulnerability: "elevated" as const,
      populationSharePercent: 29,
      accessOffset: -inequality * 0.12,
      burdenOffset: inequality * 0.15,
    },
    {
      groupId: "synthetic-service-limited",
      districtId: "black-zone",
      incomeBand: "low" as const,
      vulnerability: "high" as const,
      populationSharePercent: 18,
      accessOffset: -inequality * 0.25,
      burdenOffset: inequality * 0.3,
    },
  ];
  return profiles.map((profile) => ({
    groupId: profile.groupId,
    districtId: profile.districtId,
    incomeBand: profile.incomeBand,
    vulnerability: profile.vulnerability,
    populationSharePercent: profile.populationSharePercent,
    serviceAccess: roundMetric(
      clamp(serviceAccess + profile.accessOffset),
    ),
    burden: roundMetric(
      clamp(housingBurden + profile.burdenOffset),
    ),
    synthetic: true,
  }));
}

export function projectCoherentCitySnapshot(
  world: WorldState,
): CoherentCitySnapshot {
  const directMetrics = selectCityMetrics(world);
  const serviceAccess =
    (directMetrics.water +
      directMetrics.medical +
      directMetrics.internet) /
    3;
  const productivity =
    (directMetrics.energy +
      directMetrics.internet +
      (100 - directMetrics.traffic)) /
    3;
  const preliminaryHousingBurden = clamp(
    58 +
      directMetrics.traffic * 0.18 -
      directMetrics.happiness * 0.28,
  );
  const inequality = clamp(
    62 -
      directMetrics.happiness * 0.45 +
      directMetrics.crime * 0.22 +
      preliminaryHousingBurden * 0.2,
  );
  const housingCostBurden = clamp(
    preliminaryHousingBurden + inequality * 0.22,
  );
  const emergencyReadiness =
    (directMetrics.energy +
      directMetrics.medical +
      directMetrics.internet +
      (100 - directMetrics.traffic)) /
    4;
  const values: Record<CityMetricCode, number> = {
    ...directMetrics,
    "housing-cost-burden": housingCostBurden,
    "housing-supply": clamp(
      82 -
        directMetrics.population / 500_000 +
        directMetrics.energy * 0.12,
    ),
    employment: clamp(
      48 +
        directMetrics.gdp / 80 +
        productivity * 0.18 -
        directMetrics.crime * 0.12,
    ),
    inequality,
    "public-service-access": serviceAccess,
    "vulnerable-service-access": clamp(
      serviceAccess - inequality * 0.25,
    ),
    productivity,
    "emergency-readiness": emergencyReadiness,
    "climate-resilience":
      ((100 - directMetrics.pollution) +
        directMetrics.energy +
        directMetrics.water) /
      3,
    "migration-pressure": clamp(
      housingCostBurden * 0.45 +
        inequality * 0.35 +
        (100 - serviceAccess) * 0.2,
    ),
    "budget-health": clamp(
      directMetrics.gdp / 35 -
        (100 - emergencyReadiness) * 0.15,
    ),
    "network-continuity": directMetrics.internet,
  };
  const metrics = Object.fromEntries(
    Object.entries(values).map(([code, value]) => [
      code,
      metricValue(code as CityMetricCode, value),
    ]),
  ) as CoherentCitySnapshot["metrics"];
  const sourceWorldFingerprint = createHash("sha256")
    .update(
      stableStringify({
        ontologyVersion: CITY_ONTOLOGY_VERSION,
        scenarioId: world.scenarioId,
        tick: world.tick,
        clock: world.clock,
        metrics: directMetrics,
      }),
      "utf8",
    )
    .digest("hex");
  return {
    schemaVersion: CITY_SNAPSHOT_SCHEMA_VERSION,
    ontologyVersion: CITY_ONTOLOGY_VERSION,
    scenarioId: world.scenarioId,
    tick: world.tick,
    observedAtSimulationMinute: world.clock.totalMinutes,
    metrics,
    stakeholderImpacts: stakeholderImpacts(
      serviceAccess,
      inequality,
      housingCostBurden,
    ),
    sourceWorldFingerprint,
    synthetic: true,
  };
}

export function validateCityOntology(): string[] {
  const failures: string[] = [];
  const codes = new Set<CityMetricCode>();
  for (const definition of CITY_METRIC_DICTIONARY) {
    if (codes.has(definition.code)) {
      failures.push(`Duplicate city metric ${definition.code}`);
    }
    codes.add(definition.code);
    if (
      !definition.unit ||
      !definition.source ||
      !definition.owner ||
      !definition.formula ||
      definition.minimum >= definition.maximum
    ) {
      failures.push(`Incomplete city metric ${definition.code}`);
    }
  }
  return failures;
}
