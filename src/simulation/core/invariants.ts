import { PERCENTAGE_METRICS, selectCityMetrics } from "./metrics";
import type { WorldState } from "../types";

export function inspectWorldInvariants(state: WorldState): string[] {
  const violations: string[] = [];
  const metrics = selectCityMetrics(state);

  for (const metric of PERCENTAGE_METRICS) {
    const value = metrics[metric];
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      violations.push(`${metric} must be a finite value between 0 and 100`);
    }
  }

  if (!Number.isFinite(metrics.population) || metrics.population < 0) {
    violations.push("population must be a finite non-negative value");
  }

  if (!Number.isFinite(metrics.gdp) || metrics.gdp < 0) {
    violations.push("gdp must be a finite non-negative value");
  }

  if (!Number.isInteger(state.tick) || state.tick < 0) {
    violations.push("tick must be a non-negative integer");
  }

  if (!Number.isInteger(state.clock.day) || state.clock.day < 1) {
    violations.push("clock.day must be a positive integer");
  }

  if (
    !Number.isInteger(state.clock.hour) ||
    state.clock.hour < 0 ||
    state.clock.hour > 23
  ) {
    violations.push("clock.hour must be an integer between 0 and 23");
  }

  if (
    !Number.isInteger(state.clock.minute) ||
    state.clock.minute < 0 ||
    state.clock.minute > 59
  ) {
    violations.push("clock.minute must be an integer between 0 and 59");
  }

  for (const [agentId, agent] of Object.entries(state.agents)) {
    if (!Number.isFinite(agent.mood) || agent.mood < 0 || agent.mood > 100) {
      violations.push(`${agentId}.mood must be between 0 and 100`);
    }
  }

  return violations;
}

export function assertWorldInvariants(state: WorldState): void {
  const violations = inspectWorldInvariants(state);

  if (violations.length > 0) {
    throw new Error(`Simulation invariant violation: ${violations.join("; ")}`);
  }
}
