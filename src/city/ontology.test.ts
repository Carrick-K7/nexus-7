// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENARIO,
  stepSimulation,
} from "@/simulation";
import {
  applyCityMechanisms,
  CITY_METRIC_DICTIONARY,
  projectCoherentCitySnapshot,
  validateCityOntology,
} from "./index";

describe("coherent city ontology and mechanisms", () => {
  it("defines every metric with unit, source, range, owner, and sensitivity", () => {
    expect(validateCityOntology()).toEqual([]);
    expect(CITY_METRIC_DICTIONARY.length).toBeGreaterThanOrEqual(20);
    expect(
      new Set(CITY_METRIC_DICTIONARY.map((entry) => entry.domain)),
    ).toEqual(
      new Set([
        "population",
        "district",
        "housing",
        "transport",
        "energy",
        "economy",
        "public-safety",
        "environment",
        "digital-network",
      ]),
    );
  });

  it("projects one fingerprinted snapshot and synthetic group impacts", () => {
    const first = projectCoherentCitySnapshot(DEFAULT_SCENARIO.world);
    const second = projectCoherentCitySnapshot(
      structuredClone(DEFAULT_SCENARIO.world),
    );

    expect(first).toEqual(second);
    expect(first.synthetic).toBe(true);
    expect(first.sourceWorldFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(first.metrics)).toHaveLength(
      CITY_METRIC_DICTIONARY.length,
    );
    expect(first.stakeholderImpacts).toHaveLength(4);
    expect(
      first.stakeholderImpacts.every((impact) => impact.synthetic),
    ).toBe(true);
  });

  it("applies cross-domain dependencies deterministically and emits evidence", () => {
    const stressed = structuredClone(DEFAULT_SCENARIO.world);
    stressed.infrastructure.energy = 30;
    stressed.infrastructure.internet = 50;
    stressed.infrastructure.traffic = 90;
    stressed.infrastructure.water = 40;
    stressed.weather.pollution = 80;

    const first = applyCityMechanisms(stressed);
    const second = applyCityMechanisms(structuredClone(stressed));
    expect(first).toEqual(second);
    expect(
      new Set(first.applications.map((entry) => entry.mechanism)),
    ).toEqual(
      new Set([
        "energy-shortage-cascade",
        "congestion-productivity",
        "network-emergency-dependency",
        "pollution-health-burden",
        "water-service-dependency",
      ]),
    );
    expect(first.state.economy.gdp).toBeLessThan(stressed.economy.gdp);
    expect(first.state.infrastructure.medical).toBeLessThan(
      stressed.infrastructure.medical,
    );

    const result = stepSimulation(stressed, [], {
      seed: DEFAULT_SCENARIO.seed,
      policyVersion: DEFAULT_SCENARIO.policyVersion,
      configuration: DEFAULT_SCENARIO.configuration,
    });
    expect(
      result.events.filter(
        (event) => event.type === "city.mechanism.applied",
      ).length,
    ).toBeGreaterThan(0);
  });
});
