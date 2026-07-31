export type AgentId = "aria" | "atlas" | "economica" | "civitas" | "spectre";

export type AgentStatus = "active" | "idle" | "warning";

export type SimulationMetric =
  | "population"
  | "gdp"
  | "happiness"
  | "pollution"
  | "crime"
  | "traffic"
  | "energy"
  | "water"
  | "internet"
  | "medical";

export interface CityMetricSnapshot {
  population: number;
  gdp: number;
  happiness: number;
  pollution: number;
  crime: number;
  traffic: number;
  energy: number;
  water: number;
  internet: number;
  medical: number;
}

export interface SimulationClock {
  day: number;
  hour: number;
  minute: number;
  totalMinutes: number;
}

export interface AgentRuntimeState {
  status: AgentStatus;
  mood: number;
  currentTask?: string;
  lastActionTick?: number;
}

export interface WorldState {
  schemaVersion: 1;
  scenarioId: string;
  tick: number;
  clock: SimulationClock;
  city: {
    population: number;
    happiness: number;
  };
  weather: {
    temp: number;
    humidity: number;
    wind: number;
    condition: "clear" | "cloudy" | "rain" | "storm" | "fog";
    aqi: number;
    pollution: number;
  };
  economy: {
    gdp: number;
  };
  infrastructure: {
    traffic: number;
    energy: number;
    water: number;
    internet: number;
    medical: number;
  };
  security: {
    crime: number;
  };
  agents: Record<AgentId, AgentRuntimeState>;
}

export interface SimulationThresholds {
  crimeHigh: number;
  trafficHigh: number;
  energyLow: number;
  pollutionHigh: number;
}

export interface SimulationConfiguration {
  minutesPerTick: number;
  backgroundActionProbability: number;
  ambientEventProbability: number;
  thresholds: SimulationThresholds;
  agentRuntime?: {
    globalCommandBudget: number;
    agents: Record<
      Exclude<AgentId, "aria">,
      {
        commandBudget: number;
        cooldownTicks: number;
        priority: number;
        maxRiskTier: "low" | "medium" | "high";
      }
    >;
  };
}

export interface StepContext {
  seed: string;
  policyVersion: string;
  configuration: SimulationConfiguration;
}

export interface MetricAdjustmentPayload {
  metric: SimulationMetric;
  delta: number;
  reason: string;
  task?: string;
  model?: {
    providerId: string;
    model: string;
    promptVersion: string;
    policyVersion: string;
    riskTier: "low" | "medium" | "high" | "critical";
    approvalId: string;
    approvedBy: "operator" | "policy";
    tokenCount: number;
    costUsd: number;
    latencyMs: number;
    fallbackReason?: string;
  };
}

export interface SimulationCommand {
  id: string;
  tick: number;
  actorId: AgentId | "operator" | "system";
  type: "adjust-metric";
  payload: MetricAdjustmentPayload;
  correlationId: string;
  causationId?: string;
  source: "operator" | "policy" | "model";
}

export interface CommandRejection {
  command: SimulationCommand;
  code:
    | "WRONG_TICK"
    | "INVALID_PAYLOAD"
    | "FORBIDDEN_CAPABILITY"
    | "DELTA_EXCEEDS_LIMIT"
    | "BUDGET_EXCEEDED"
    | "COOLDOWN_ACTIVE"
    | "COMMAND_CONFLICT"
    | "RISK_NOT_ALLOWED";
  reason: string;
}

export interface DomainEvent {
  id: string;
  tick: number;
  type:
    | "city.metrics.updated"
    | "city.mechanism.applied"
    | "city.day.started"
    | "observation.threshold"
    | "agent.proposal"
    | "coordinator.decision"
    | "agent.action"
    | "action.evaluated"
    | "command.rejected"
    | "system.signal";
  payload: Record<string, unknown>;
  correlationId: string;
  causationId?: string;
  policyVersion: string;
}

export interface MetricSnapshot {
  tick: number;
  clock: SimulationClock;
  city: CityMetricSnapshot;
}

export interface StepResult {
  state: WorldState;
  acceptedCommands: SimulationCommand[];
  rejectedCommands: CommandRejection[];
  events: DomainEvent[];
  metrics: MetricSnapshot;
}

export interface SimulationScenario {
  id: string;
  seed: string;
  policyVersion: string;
  configuration: SimulationConfiguration;
  world: WorldState;
}

export interface ReplayResult {
  state: WorldState;
  events: DomainEvent[];
  acceptedCommands: SimulationCommand[];
  rejectedCommands: CommandRejection[];
  fingerprint: string;
}

export interface SimulationRunExport {
  schemaVersion: 1;
  seed: string;
  policyVersion: string;
  configuration: SimulationConfiguration;
  initialState: WorldState;
  world: WorldState;
  events: DomainEvent[];
  operatorCommands: SimulationCommand[];
}
