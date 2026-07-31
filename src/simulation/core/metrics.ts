import type {
  CityMetricSnapshot,
  SimulationMetric,
  WorldState,
} from "../types";

export const PERCENTAGE_METRICS: SimulationMetric[] = [
  "happiness",
  "pollution",
  "crime",
  "traffic",
  "energy",
  "water",
  "internet",
  "medical",
];

export function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

export function selectCityMetrics(state: WorldState): CityMetricSnapshot {
  return {
    population: state.city.population,
    gdp: state.economy.gdp,
    happiness: state.city.happiness,
    pollution: state.weather.pollution,
    crime: state.security.crime,
    traffic: state.infrastructure.traffic,
    energy: state.infrastructure.energy,
    water: state.infrastructure.water,
    internet: state.infrastructure.internet,
    medical: state.infrastructure.medical,
  };
}

export function getMetric(state: WorldState, metric: SimulationMetric): number {
  return selectCityMetrics(state)[metric];
}

export function setMetric(
  state: WorldState,
  metric: SimulationMetric,
  value: number,
): WorldState {
  const boundedValue = PERCENTAGE_METRICS.includes(metric)
    ? clamp(roundMetric(value))
    : Math.max(0, roundMetric(value));

  switch (metric) {
    case "population":
      return { ...state, city: { ...state.city, population: boundedValue } };
    case "happiness":
      return { ...state, city: { ...state.city, happiness: boundedValue } };
    case "gdp":
      return { ...state, economy: { ...state.economy, gdp: boundedValue } };
    case "pollution":
      return {
        ...state,
        weather: {
          ...state.weather,
          pollution: boundedValue,
          aqi: Math.round(20 + boundedValue * 1.8),
        },
      };
    case "crime":
      return { ...state, security: { ...state.security, crime: boundedValue } };
    case "traffic":
    case "energy":
    case "water":
    case "internet":
    case "medical":
      return {
        ...state,
        infrastructure: {
          ...state.infrastructure,
          [metric]: boundedValue,
        },
      };
  }
}

export function applyCityMetrics(
  state: WorldState,
  metrics: Partial<CityMetricSnapshot>,
): WorldState {
  return Object.entries(metrics).reduce(
    (nextState, [metric, value]) =>
      typeof value === "number"
        ? setMetric(nextState, metric as SimulationMetric, value)
        : nextState,
    state,
  );
}
