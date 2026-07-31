import {
  getMetric,
  roundMetric,
  setMetric,
} from "@/simulation/core/metrics";
import type {
  SimulationMetric,
  WorldState,
} from "@/simulation/types";
import type {
  CityMechanismApplication,
  CityMechanismCode,
} from "./types";

interface Effect {
  mechanism: CityMechanismCode;
  causeMetric: SimulationMetric;
  threshold: number;
  direction: "below" | "above";
  effectMetric: SimulationMetric;
  coefficient: number;
  formula: string;
}

const EFFECTS: Effect[] = [
  {
    mechanism: "energy-shortage-cascade",
    causeMetric: "energy",
    threshold: 60,
    direction: "below",
    effectMetric: "traffic",
    coefficient: 0.03,
    formula: "traffic += max(0, 60-energy) * 0.03",
  },
  {
    mechanism: "energy-shortage-cascade",
    causeMetric: "energy",
    threshold: 60,
    direction: "below",
    effectMetric: "gdp",
    coefficient: -0.02,
    formula: "gdp -= max(0, 60-energy) * 0.02",
  },
  {
    mechanism: "energy-shortage-cascade",
    causeMetric: "energy",
    threshold: 60,
    direction: "below",
    effectMetric: "internet",
    coefficient: -0.01,
    formula: "internet -= max(0, 60-energy) * 0.01",
  },
  {
    mechanism: "congestion-productivity",
    causeMetric: "traffic",
    threshold: 60,
    direction: "above",
    effectMetric: "pollution",
    coefficient: 0.02,
    formula: "pollution += max(0, traffic-60) * 0.02",
  },
  {
    mechanism: "congestion-productivity",
    causeMetric: "traffic",
    threshold: 60,
    direction: "above",
    effectMetric: "gdp",
    coefficient: -0.015,
    formula: "gdp -= max(0, traffic-60) * 0.015",
  },
  {
    mechanism: "congestion-productivity",
    causeMetric: "traffic",
    threshold: 60,
    direction: "above",
    effectMetric: "happiness",
    coefficient: -0.01,
    formula: "happiness -= max(0, traffic-60) * 0.01",
  },
  {
    mechanism: "network-emergency-dependency",
    causeMetric: "internet",
    threshold: 80,
    direction: "below",
    effectMetric: "gdp",
    coefficient: -0.015,
    formula: "gdp -= max(0, 80-internet) * 0.015",
  },
  {
    mechanism: "network-emergency-dependency",
    causeMetric: "internet",
    threshold: 80,
    direction: "below",
    effectMetric: "medical",
    coefficient: -0.01,
    formula: "medical -= max(0, 80-internet) * 0.01",
  },
  {
    mechanism: "pollution-health-burden",
    causeMetric: "pollution",
    threshold: 55,
    direction: "above",
    effectMetric: "medical",
    coefficient: -0.012,
    formula: "medical -= max(0, pollution-55) * 0.012",
  },
  {
    mechanism: "pollution-health-burden",
    causeMetric: "pollution",
    threshold: 55,
    direction: "above",
    effectMetric: "happiness",
    coefficient: -0.01,
    formula: "happiness -= max(0, pollution-55) * 0.01",
  },
  {
    mechanism: "water-service-dependency",
    causeMetric: "water",
    threshold: 65,
    direction: "below",
    effectMetric: "medical",
    coefficient: -0.015,
    formula: "medical -= max(0, 65-water) * 0.015",
  },
  {
    mechanism: "water-service-dependency",
    causeMetric: "water",
    threshold: 65,
    direction: "below",
    effectMetric: "happiness",
    coefficient: -0.012,
    formula: "happiness -= max(0, 65-water) * 0.012",
  },
];

export function applyCityMechanisms(
  state: WorldState,
): {
  state: WorldState;
  applications: CityMechanismApplication[];
} {
  let next = state;
  const applications: CityMechanismApplication[] = [];
  for (const effect of EFFECTS) {
    const causeValue = getMetric(next, effect.causeMetric);
    const magnitude =
      effect.direction === "below"
        ? Math.max(0, effect.threshold - causeValue)
        : Math.max(0, causeValue - effect.threshold);
    if (magnitude === 0) {
      continue;
    }
    const before = getMetric(next, effect.effectMetric);
    const delta = roundMetric(magnitude * effect.coefficient);
    next = setMetric(next, effect.effectMetric, before + delta);
    const after = getMetric(next, effect.effectMetric);
    applications.push({
      mechanism: effect.mechanism,
      causeMetric: effect.causeMetric,
      causeValue,
      effectMetric: effect.effectMetric,
      formula: effect.formula,
      delta: roundMetric(after - before),
      before,
      after,
    });
  }
  return { state: next, applications };
}
