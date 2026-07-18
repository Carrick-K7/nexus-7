import { fingerprint } from "../core/random";
import { selectCityMetrics } from "../core/metrics";
import type {
  CityMetricSnapshot,
  DomainEvent,
  SimulationMetric,
  WorldState,
} from "../types";

export interface SimulationComparison {
  leftFingerprint: string;
  rightFingerprint: string;
  ticks: number;
  metricDeltas: Record<SimulationMetric, number>;
  eventDelta: number;
  actionDelta: number;
}

export function compareSimulationRuns(
  leftState: WorldState,
  leftEvents: DomainEvent[],
  rightState: WorldState,
  rightEvents: DomainEvent[],
): SimulationComparison {
  const leftMetrics = selectCityMetrics(leftState);
  const rightMetrics = selectCityMetrics(rightState);
  const metricDeltas = Object.fromEntries(
    Object.keys(leftMetrics).map((metric) => [
      metric,
      Math.round(
        (rightMetrics[metric as keyof CityMetricSnapshot] -
          leftMetrics[metric as keyof CityMetricSnapshot]) *
          100,
      ) / 100,
    ]),
  ) as Record<SimulationMetric, number>;
  const countActions = (events: DomainEvent[]) =>
    events.filter((event) => event.type === "agent.action").length;

  return {
    leftFingerprint: fingerprint({ state: leftState, events: leftEvents }),
    rightFingerprint: fingerprint({ state: rightState, events: rightEvents }),
    ticks: Math.max(leftState.tick, rightState.tick),
    metricDeltas,
    eventDelta: rightEvents.length - leftEvents.length,
    actionDelta: countActions(rightEvents) - countActions(leftEvents),
  };
}
