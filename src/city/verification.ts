import {
  createHash,
} from "node:crypto";
import {
  readFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";
import {
  DEFAULT_SCENARIO,
} from "@/simulation/scenarios";
import {
  selectCityMetrics,
} from "@/simulation/core/metrics";
import {
  stableStringify,
} from "@/simulation/core/random";
import {
  applyCityMechanisms,
} from "./mechanisms";
import {
  CITY_METRIC_DICTIONARY,
  projectCoherentCitySnapshot,
  validateCityOntology,
} from "./ontology";
import {
  verifyCityScenarioCatalog,
} from "./scenarios";

export const CITY_MODEL_ACCEPTANCE_SCHEMA_VERSION =
  "nexus.city-model-acceptance.v1" as const;

export interface CityModelAcceptanceReport {
  schemaVersion: typeof CITY_MODEL_ACCEPTANCE_SCHEMA_VERSION;
  generatedAt: string;
  checks: {
    ontologyComplete: boolean;
    allDomainsRepresented: boolean;
    sharedSnapshotMatchesWorld: boolean;
    allMechanismsExecutable: boolean;
    publicScenarioCorpus: boolean;
    detectionTruthGate: boolean;
    deterministicReplayGate: boolean;
    legacyViewsUseSharedWorld: boolean;
    randomBusinessStateAbsent: boolean;
    sandboxRandomnessDeclared: boolean;
  };
  metrics: {
    ontologyMetrics: number;
    ontologyDomains: number;
    scenarios: number;
    eventFamilies: number;
    scenarioModes: number;
    precisionPercent: number;
    recallPercent: number;
    deterministicReplayPercent: number;
    mechanismFamilies: number;
    governedLegacyViews: number;
  };
  failures: string[];
  passed: boolean;
  fingerprint: string;
}

const GOVERNED_VIEW_FILES = [
  "src/components/weather/WeatherPanel.tsx",
  "src/components/resource/ResourceManagement.tsx",
  "src/components/trading/Trading.tsx",
  "src/components/emergency/EmergencyResponse.tsx",
  "src/components/analytics/DataAnalytics.tsx",
  "src/components/news/NewsPanel.tsx",
  "src/components/missions/Missions.tsx",
] as const;

const SANDBOX_RANDOM_FILES = [
  "src/components/hacker/HackerGame.tsx",
  "src/components/quantum/Quantum.tsx",
  "src/components/terminal/Terminal.tsx",
] as const;

async function auditViewSources(root: string): Promise<{
  governedViews: number;
  legacyViewsUseSharedWorld: boolean;
  randomBusinessStateAbsent: boolean;
  sandboxRandomnessDeclared: boolean;
}> {
  const governedSources = await Promise.all(
    GOVERNED_VIEW_FILES.map((file) =>
      readFile(resolve(root, file), "utf8"),
    ),
  );
  const sandboxSources = await Promise.all(
    SANDBOX_RANDOM_FILES.map((file) =>
      readFile(resolve(root, file), "utf8"),
    ),
  );
  return {
    governedViews: governedSources.length,
    legacyViewsUseSharedWorld: governedSources.every(
      (source) =>
        source.includes("useNexusStore") &&
        (
          source.includes("simulation") ||
          source.includes("cityStats") ||
          source.includes("weather")
        ),
    ),
    randomBusinessStateAbsent: governedSources.every(
      (source) =>
        !source.includes("Math.random") &&
        !source.includes("Date.now()") &&
        !source.includes("setInterval("),
    ),
    sandboxRandomnessDeclared: sandboxSources.every(
      (source) => source.includes("<SandboxNotice"),
    ),
  };
}

export async function verifyCityModelAcceptance(
  root = process.cwd(),
  now = new Date("2026-07-18T12:00:00.000Z"),
): Promise<CityModelAcceptanceReport> {
  const ontologyFailures = validateCityOntology();
  const snapshot = projectCoherentCitySnapshot(DEFAULT_SCENARIO.world);
  const direct = selectCityMetrics(DEFAULT_SCENARIO.world);
  const sharedSnapshotMatchesWorld = Object.entries(direct).every(
    ([metric, value]) =>
      snapshot.metrics[
        metric as keyof typeof direct
      ].value === value,
  );
  const stressed = structuredClone(DEFAULT_SCENARIO.world);
  stressed.infrastructure.energy = 20;
  stressed.infrastructure.internet = 20;
  stressed.infrastructure.traffic = 95;
  stressed.infrastructure.water = 20;
  stressed.weather.pollution = 90;
  const mechanisms = applyCityMechanisms(stressed);
  const mechanismFamilies = new Set(
    mechanisms.applications.map((application) => application.mechanism),
  ).size;
  const scenarios = verifyCityScenarioCatalog(120);
  const sourceAudit = await auditViewSources(root);
  const checks: CityModelAcceptanceReport["checks"] = {
    ontologyComplete: ontologyFailures.length === 0,
    allDomainsRepresented:
      new Set(
        CITY_METRIC_DICTIONARY.map((definition) => definition.domain),
      ).size === 9,
    sharedSnapshotMatchesWorld,
    allMechanismsExecutable: mechanismFamilies === 5,
    publicScenarioCorpus:
      scenarios.scenarioCount >= 20 &&
      scenarios.familyCount === 5 &&
      scenarios.modeCount === 4,
    detectionTruthGate:
      scenarios.precisionPercent >= 95 &&
      scenarios.recallPercent >= 95,
    deterministicReplayGate:
      scenarios.deterministicReplayPercent === 100 &&
      scenarios.invariantViolations.length === 0,
    legacyViewsUseSharedWorld: sourceAudit.legacyViewsUseSharedWorld,
    randomBusinessStateAbsent: sourceAudit.randomBusinessStateAbsent,
    sandboxRandomnessDeclared: sourceAudit.sandboxRandomnessDeclared,
  };
  const failures = [
    ...ontologyFailures,
    ...Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([check]) => `${check} failed`),
    ...scenarios.invariantViolations,
  ];
  const withoutFingerprint = {
    schemaVersion: CITY_MODEL_ACCEPTANCE_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    checks,
    metrics: {
      ontologyMetrics: CITY_METRIC_DICTIONARY.length,
      ontologyDomains: new Set(
        CITY_METRIC_DICTIONARY.map((definition) => definition.domain),
      ).size,
      scenarios: scenarios.scenarioCount,
      eventFamilies: scenarios.familyCount,
      scenarioModes: scenarios.modeCount,
      precisionPercent: scenarios.precisionPercent,
      recallPercent: scenarios.recallPercent,
      deterministicReplayPercent: scenarios.deterministicReplayPercent,
      mechanismFamilies,
      governedLegacyViews: sourceAudit.governedViews,
    },
    failures,
    passed: failures.length === 0,
  };
  return {
    ...withoutFingerprint,
    fingerprint: createHash("sha256")
      .update(stableStringify(withoutFingerprint), "utf8")
      .digest("hex"),
  };
}
