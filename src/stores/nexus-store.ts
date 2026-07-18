import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AIAgent,
  AriaMessage,
  CityStats,
  District,
  GameTime,
  Mission,
  NeuralNode,
  Notification,
  Qubit,
  ThemeMode,
  TradeAsset,
  Weather,
} from "@/types";
import type { Language } from "@/i18n/translations";
import {
  DEFAULT_SCENARIO,
  approvalPolicyForRisk,
  applyCityMetrics,
  assessModelRisk,
  cloneWorldState,
  createDefaultWorld,
  deterministicMockProvider,
  executeModelWithFallback,
  fingerprint,
  isReplayEquivalent,
  parseSimulationRun,
  replaySimulation,
  selectCityMetrics,
  serializeSimulationRun,
  stepSimulation,
} from "@/simulation";
import type {
  DomainEvent,
  ModelBudgets,
  ModelExecution,
  ModelRiskTier,
  PolicyAgentId,
  SimulationCommand,
  SimulationConfiguration,
  SimulationRunExport,
  StepContext,
  StepResult,
  WorldState,
} from "@/simulation";

export type ReplayVerificationStatus = "not-run" | "verified" | "mismatch";

export interface ImportSimulationResult {
  ok: boolean;
  error?: string;
}

export type ModelApprovalStatus =
  | "pending"
  | "approved"
  | "auto-approved"
  | "executed"
  | "rejected"
  | "expired"
  | "forbidden"
  | "failed";

export interface ModelApprovalRequest {
  id: string;
  agentId: PolicyAgentId;
  createdAtTick: number;
  expiresAtTick: number;
  status: ModelApprovalStatus;
  riskTier?: ModelRiskTier;
  execution?: ModelExecution;
  commandId?: string;
  error?: string;
}

export interface ModelRuntimeState {
  providerId: string;
  model: string;
  promptVersion: string;
  policyVersion: string;
  budgets: ModelBudgets;
  requestSequence: number;
  generating: boolean;
  approvals: ModelApprovalRequest[];
  lastExecution?: ModelExecution;
}

export interface SimulationSession {
  status: "running" | "paused";
  seed: string;
  policyVersion: string;
  configuration: SimulationConfiguration;
  initialState: WorldState;
  world: WorldState;
  events: DomainEvent[];
  operatorCommands: SimulationCommand[];
  replay: {
    status: ReplayVerificationStatus;
    checkedAtTick?: number;
    fingerprint?: string;
  };
}

interface NexusStore {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  language: Language;
  setLanguage: (lang: Language) => void;

  simulation: SimulationSession;
  advanceSimulation: () => void;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  stepSimulationOnce: () => void;
  resetSimulation: () => void;
  verifySimulationReplay: () => void;
  exportSimulationRun: () => string;
  importSimulationRun: (serialized: string) => ImportSimulationResult;
  setSimulationSpeed: (speed: GameTime["speed"]) => void;

  modelRuntime: ModelRuntimeState;
  requestModelProposal: (agentId: PolicyAgentId) => Promise<void>;
  approveModelProposal: (approvalId: string) => void;
  rejectModelProposal: (approvalId: string) => void;

  cityStats: CityStats;
  cityStatsHistory: { tick: number; stats: CityStats }[];

  weather: Weather;
  setWeather: (weather: Partial<Weather>) => void;

  districts: District[];
  updateDistrict: (id: string, data: Partial<District>) => void;

  neuralNodes: NeuralNode[];
  setNeuralNodes: (nodes: NeuralNode[]) => void;
  updateNode: (id: string, data: Partial<NeuralNode>) => void;

  tradeAssets: TradeAsset[];
  updateAsset: (id: string, data: Partial<TradeAsset>) => void;

  missions: Mission[];
  addMission: (mission: Mission) => void;
  updateMission: (id: string, data: Partial<Mission>) => void;

  notifications: Notification[];
  addNotification: (
    notification: Omit<Notification, "id" | "timestamp" | "read">,
  ) => void;
  markAsRead: (id: string) => void;
  clearNotifications: () => void;

  ariaMessages: AriaMessage[];
  addAriaMessage: (message: Omit<AriaMessage, "id" | "timestamp">) => void;

  aiAgents: AIAgent[];
  agentLogs: {
    id: string;
    timestamp: number;
    type: "info" | "warning" | "success" | "error";
    message: string;
    agentId: string;
  }[];

  qubits: Qubit[];
  setQubits: (qubits: Qubit[]) => void;

  gameTime: GameTime;

  activeView: string;
  setActiveView: (view: string) => void;
}

const STORAGE_KEY = "nexus-store";
const MAX_HISTORY = 120;
const MAX_EVENTS = 10_000;
const DEFAULT_MODEL_BUDGETS: ModelBudgets = {
  maxTokensPerProposal: 512,
  maxCostUsdPerProposal: 0.05,
  timeoutMs: 2_000,
};

function createModelRuntimeState(): ModelRuntimeState {
  return {
    providerId: "server-configured",
    model: "server-configured",
    promptVersion: "prompt-1.2.0",
    policyVersion: "model-policy-1.2.0",
    budgets: DEFAULT_MODEL_BUDGETS,
    requestSequence: 0,
    generating: false,
    approvals: [],
  };
}

interface ServerModelProposalResponse {
  execution: ModelExecution;
  riskTier: ModelRiskTier;
  approvalPolicy: "auto-approve" | "human-approval" | "forbidden";
  promptVersion: string;
  policyVersion: string;
  budgets: ModelBudgets;
}

async function requestServerModelProposal(
  request: {
    requestId: string;
    tick: number;
    seed: string;
    agentId: PolicyAgentId;
    city: CityStats;
  },
  modelRuntime: ModelRuntimeState,
): Promise<ServerModelProposalResponse> {
  if (process.env.NODE_ENV === "test") {
    const execution = await executeModelWithFallback(
      deterministicMockProvider,
      {
        ...request,
        promptVersion: modelRuntime.promptVersion,
        policyVersion: modelRuntime.policyVersion,
      },
      modelRuntime.budgets,
    );
    const riskTier = assessModelRisk(execution.proposal);
    return {
      execution,
      riskTier,
      approvalPolicy: approvalPolicyForRisk(riskTier),
      promptVersion: modelRuntime.promptVersion,
      policyVersion: modelRuntime.policyVersion,
      budgets: modelRuntime.budgets,
    };
  }

  const response = await fetch("/api/models/proposals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const payload = (await response.json()) as ServerModelProposalResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.error ?? `Model proposal request failed with ${response.status}`,
    );
  }
  return payload;
}

function createApprovedModelCommand(
  approval: ModelApprovalRequest,
  tick: number,
  approvedBy: "operator" | "policy",
  modelRuntime: ModelRuntimeState,
): SimulationCommand | null {
  if (!approval.execution || !approval.riskTier) {
    return null;
  }

  const { execution } = approval;
  return {
    id: `cmd-model-${tick}-${approval.agentId}-${approval.id}`,
    tick,
    actorId: approval.agentId,
    type: "adjust-metric",
    payload: {
      metric: execution.proposal.metric,
      delta: execution.proposal.delta,
      reason: execution.proposal.rationale,
      task: `Model-assisted ${execution.proposal.metric} intervention`,
      model: {
        providerId: execution.providerId,
        model: execution.model,
        promptVersion: modelRuntime.promptVersion,
        policyVersion: modelRuntime.policyVersion,
        riskTier: approval.riskTier,
        approvalId: approval.id,
        approvedBy,
        tokenCount: execution.usage.tokenCount,
        costUsd: execution.usage.costUsd,
        latencyMs: execution.usage.latencyMs,
        fallbackReason: execution.fallbackReason,
      },
    },
    correlationId: `corr-model-${tick}-${approval.id}`,
    causationId: approval.id,
    source: "model",
  };
}

const INITIAL_AGENTS: AIAgent[] = [
  {
    id: "aria",
    name: "ARIA",
    role: "Central Intelligence",
    status: "active",
    mood: 85,
    specialty: ["reasoning", "creativity", "analysis"],
    avatar: "🧠",
  },
  {
    id: "atlas",
    name: "ATLAS",
    role: "Security Chief",
    status: "active",
    mood: 72,
    specialty: ["threat_detection", "surveillance", "countermeasures"],
    avatar: "🛡️",
  },
  {
    id: "economica",
    name: "ECONOMICA",
    role: "Economic Advisor",
    status: "idle",
    mood: 90,
    specialty: ["market_analysis", "resource_allocation", "forecasting"],
    avatar: "📊",
  },
  {
    id: "civitas",
    name: "CIVITAS",
    role: "Infrastructure Director",
    status: "active",
    mood: 68,
    specialty: ["urban_planning", "maintenance", "utilities"],
    avatar: "🏗️",
  },
  {
    id: "spectre",
    name: "SPECTRE",
    role: "Intelligence Chief",
    status: "idle",
    mood: 55,
    specialty: ["reconnaissance", "data_mining", "espionage"],
    avatar: "👁️",
  },
];

function createSimulationSession(
  world = createDefaultWorld(),
  seed = DEFAULT_SCENARIO.seed,
): SimulationSession {
  return {
    status: "running",
    seed,
    policyVersion: DEFAULT_SCENARIO.policyVersion,
    configuration: structuredClone(DEFAULT_SCENARIO.configuration),
    initialState: cloneWorldState(world),
    world: cloneWorldState(world),
    events: [],
    operatorCommands: [],
    replay: { status: "not-run" },
  };
}

function createStepContext(session: SimulationSession): StepContext {
  return {
    seed: session.seed,
    policyVersion: session.policyVersion,
    configuration: session.configuration,
  };
}

function syncAgents(
  agents: AIAgent[],
  world: WorldState,
  timestamp: number,
): AIAgent[] {
  return agents.map((agent) => {
    const runtime = world.agents[agent.id as keyof typeof world.agents];
    if (!runtime) {
      return agent;
    }

    return {
      ...agent,
      status: runtime.status,
      mood: runtime.mood,
      currentTask: runtime.currentTask,
      lastAction:
        runtime.lastActionTick === world.tick ? timestamp : agent.lastAction,
    };
  });
}

function eventNotifications(
  events: DomainEvent[],
  timestamp: number,
): Notification[] {
  return events.flatMap((event): Notification[] => {
    if (event.type === "observation.threshold") {
      const metric = String(event.payload.metric);
      return [
        {
          id: `notif-${event.id}`,
          timestamp,
          read: false,
          type: "warning",
          title: `${metric.toUpperCase()} threshold observed`,
          message: `${metric} reached ${String(event.payload.value)}; ${String(event.payload.assignedAgent).toUpperCase()} assigned.`,
          source: "OBSERVER",
        },
      ];
    }

    if (event.type === "agent.action") {
      const actorId = String(event.payload.actorId);
      return [
        {
          id: `notif-${event.id}`,
          timestamp,
          read: false,
          type: "info",
          title: `${actorId.toUpperCase()} action`,
          message: `${String(event.payload.reason)}: ${String(event.payload.metric)} ${String(event.payload.before)} → ${String(event.payload.after)}`,
          source: actorId.toUpperCase(),
        },
      ];
    }

    if (
      event.type === "system.signal" &&
      typeof event.payload.message === "string"
    ) {
      return [
        {
          id: `notif-${event.id}`,
          timestamp,
          read: false,
          type: "success",
          title: "System signal",
          message: event.payload.message,
          source: "NEXUS",
        },
      ];
    }

    if (event.type === "city.day.started") {
      return [
        {
          id: `notif-${event.id}`,
          timestamp,
          read: false,
          type: "info",
          title: `Day ${String(event.payload.day)} begins`,
          message: `Population: ${Number(event.payload.population).toLocaleString()}`,
          source: "SIMULATION",
        },
      ];
    }

    if (event.type === "command.rejected") {
      return [
        {
          id: `notif-${event.id}`,
          timestamp,
          read: false,
          type: "warning",
          title: "Command rejected",
          message: String(event.payload.reason),
          source: "GUARDRAIL",
        },
      ];
    }

    if (event.type === "coordinator.decision") {
      const scheduled = Array.isArray(event.payload.scheduled)
        ? event.payload.scheduled.length
        : 0;
      const rejected = Array.isArray(event.payload.rejected)
        ? event.payload.rejected.length
        : 0;
      if (scheduled === 0 && rejected === 0) {
        return [];
      }
      return [
        {
          id: `notif-${event.id}`,
          timestamp,
          read: false,
          type: rejected > 0 ? "warning" : "info",
          title: "ARIA coordination",
          message: `${scheduled} command(s) scheduled; ${rejected} proposal(s) rejected.`,
          source: "ARIA",
        },
      ];
    }

    return [];
  });
}

function eventAgentLogs(
  events: DomainEvent[],
  timestamp: number,
): NexusStore["agentLogs"] {
  return events.flatMap((event): NexusStore["agentLogs"] => {
    if (event.type === "coordinator.decision") {
      const scheduled = Array.isArray(event.payload.scheduled)
        ? event.payload.scheduled.length
        : 0;
      const rejected = Array.isArray(event.payload.rejected)
        ? event.payload.rejected.length
        : 0;
      if (scheduled === 0 && rejected === 0) {
        return [];
      }
      return [
        {
          id: `log-${event.id}`,
          timestamp,
          type: rejected > 0 ? "warning" : "info",
          agentId: "aria",
          message: `Coordinator reviewed ${String(event.payload.proposalCount)} proposal(s): ${scheduled} scheduled, ${rejected} rejected.`,
        },
      ];
    }

    if (event.type !== "agent.action") {
      return [];
    }

    const agentId = String(event.payload.actorId);
    if (agentId === "operator" || agentId === "system") {
      return [];
    }

    return [
      {
        id: `log-${event.id}`,
        timestamp,
        type: "info",
        agentId,
        message: `${String(event.payload.reason)} — ${String(event.payload.metric)}: ${String(event.payload.before)} → ${String(event.payload.after)}`,
      },
    ];
  });
}

function projectStepResult(
  state: NexusStore,
  result: StepResult,
): Partial<NexusStore> {
  const timestamp = Date.now();
  const generatedNotifications = eventNotifications(result.events, timestamp);
  const generatedLogs = eventAgentLogs(result.events, timestamp);
  const acceptedCommandIds = new Set(
    result.acceptedCommands.map((command) => command.id),
  );

  return {
    simulation: {
      ...state.simulation,
      world: result.state,
      events: [...state.simulation.events, ...result.events].slice(-MAX_EVENTS),
      replay: { status: "not-run" },
    },
    cityStats: result.metrics.city,
    cityStatsHistory: [
      ...state.cityStatsHistory,
      { tick: result.metrics.tick, stats: result.metrics.city },
    ].slice(-MAX_HISTORY),
    weather: {
      temp: result.state.weather.temp,
      humidity: result.state.weather.humidity,
      wind: result.state.weather.wind,
      condition: result.state.weather.condition,
      aqi: result.state.weather.aqi,
    },
    gameTime: {
      ...state.gameTime,
      day: result.state.clock.day,
      hour: result.state.clock.hour,
      minute: result.state.clock.minute,
    },
    aiAgents: syncAgents(state.aiAgents, result.state, timestamp),
    notifications: [
      ...generatedNotifications.reverse(),
      ...state.notifications,
    ].slice(0, 50),
    agentLogs: [...state.agentLogs, ...generatedLogs].slice(-200),
    modelRuntime: {
      ...state.modelRuntime,
      approvals: state.modelRuntime.approvals.map((approval) => {
        if (
          approval.commandId &&
          acceptedCommandIds.has(approval.commandId)
        ) {
          return { ...approval, status: "executed" };
        }
        if (
          approval.status === "pending" &&
          approval.expiresAtTick < result.state.tick
        ) {
          return { ...approval, status: "expired" };
        }
        return approval;
      }),
    },
  };
}

function runNextStep(
  state: NexusStore,
  force: boolean,
): Partial<NexusStore> {
  if (!force && state.simulation.status !== "running") {
    return {};
  }

  const nextTick = state.simulation.world.tick + 1;
  const commands = state.simulation.operatorCommands.filter(
    (command) => command.tick === nextTick,
  );
  const result = stepSimulation(
    state.simulation.world,
    commands,
    createStepContext(state.simulation),
  );

  return projectStepResult(state, result);
}

function migratePersistedState(
  persistedState: unknown,
  persistedVersion = 0,
): Partial<NexusStore> {
  const persisted = (persistedState ?? {}) as Partial<NexusStore>;

  if (persisted.simulation?.world) {
    const simulation =
      persistedVersion < 3
        ? {
            ...createSimulationSession(
              persisted.simulation.world,
              persisted.simulation.seed,
            ),
            status: persisted.simulation.status,
          }
        : persisted.simulation;
    const metrics = selectCityMetrics(simulation.world);
    return {
      ...persisted,
      simulation,
      cityStats: metrics,
      gameTime: {
        day: simulation.world.clock.day,
        hour: simulation.world.clock.hour,
        minute: simulation.world.clock.minute,
        speed: persisted.gameTime?.speed ?? 1,
      },
    };
  }

  const initialWorld = applyCityMetrics(
    createDefaultWorld(),
    persisted.cityStats ?? {},
  );
  const migratedWorld: WorldState = {
    ...initialWorld,
    clock: {
      day: persisted.gameTime?.day ?? initialWorld.clock.day,
      hour: persisted.gameTime?.hour ?? initialWorld.clock.hour,
      minute: persisted.gameTime?.minute ?? initialWorld.clock.minute,
      totalMinutes:
        ((persisted.gameTime?.day ?? initialWorld.clock.day) - 1) * 1440 +
        (persisted.gameTime?.hour ?? initialWorld.clock.hour) * 60 +
        (persisted.gameTime?.minute ?? initialWorld.clock.minute),
    },
  };

  return {
    ...persisted,
    simulation: createSimulationSession(migratedWorld),
    cityStats: selectCityMetrics(migratedWorld),
    cityStatsHistory: [],
    gameTime: {
      day: migratedWorld.clock.day,
      hour: migratedWorld.clock.hour,
      minute: migratedWorld.clock.minute,
      speed: persisted.gameTime?.speed ?? 1,
    },
  };
}

const initialWorld = createDefaultWorld();
const initialMetrics = selectCityMetrics(initialWorld);

export const useNexusStore = create<NexusStore>()(
  persist(
    (set, get) => ({
      theme: "dark",
      setTheme: (theme) => set({ theme }),

      language: "en",
      setLanguage: (language) => set({ language }),

      simulation: createSimulationSession(initialWorld),
      advanceSimulation: () =>
        set((state) => runNextStep(state, false)),
      pauseSimulation: () =>
        set((state) => ({
          simulation: { ...state.simulation, status: "paused" },
        })),
      resumeSimulation: () =>
        set((state) => ({
          simulation: { ...state.simulation, status: "running" },
        })),
      stepSimulationOnce: () =>
        set((state) => runNextStep(state, true)),
      resetSimulation: () =>
        set((state) => {
          const world = createDefaultWorld();
          const simulation = createSimulationSession(
            world,
            state.simulation.seed,
          );
          return {
            simulation: {
              ...simulation,
              status: state.simulation.status,
            },
            cityStats: selectCityMetrics(world),
            cityStatsHistory: [],
            weather: {
              temp: world.weather.temp,
              humidity: world.weather.humidity,
              wind: world.weather.wind,
              condition: world.weather.condition,
              aqi: world.weather.aqi,
            },
            gameTime: {
              day: world.clock.day,
              hour: world.clock.hour,
              minute: world.clock.minute,
              speed: state.gameTime.speed,
            },
            aiAgents: syncAgents(INITIAL_AGENTS, world, Date.now()),
            agentLogs: [],
            notifications: [],
            modelRuntime: createModelRuntimeState(),
          };
        }),
      verifySimulationReplay: () =>
        set((state) => {
          const ticks =
            state.simulation.world.tick - state.simulation.initialState.tick;
          const replay = replaySimulation(
            state.simulation.initialState,
            createStepContext(state.simulation),
            ticks,
            state.simulation.operatorCommands,
          );
          const equivalent = isReplayEquivalent(
            state.simulation.world,
            state.simulation.events,
            replay,
          );

          return {
            simulation: {
              ...state.simulation,
              replay: {
                status: equivalent ? "verified" : "mismatch",
                checkedAtTick: state.simulation.world.tick,
                fingerprint: replay.fingerprint,
              },
            },
          };
        }),
      exportSimulationRun: () => {
        const { simulation } = get();
        const run: SimulationRunExport = {
          schemaVersion: 1,
          seed: simulation.seed,
          policyVersion: simulation.policyVersion,
          configuration: simulation.configuration,
          initialState: simulation.initialState,
          world: simulation.world,
          events: simulation.events,
          operatorCommands: simulation.operatorCommands,
        };
        return serializeSimulationRun(run);
      },
      importSimulationRun: (serialized) => {
        try {
          const run = parseSimulationRun(serialized);
          const timestamp = Date.now();
          const metrics = selectCityMetrics(run.world);
          set((state) => ({
            simulation: {
              status: "paused",
              seed: run.seed,
              policyVersion: run.policyVersion,
              configuration: run.configuration,
              initialState: run.initialState,
              world: run.world,
              events: run.events,
              operatorCommands: run.operatorCommands,
              replay: {
                status: "verified",
                checkedAtTick: run.world.tick,
                fingerprint: fingerprint({
                  state: run.world,
                  events: run.events,
                }),
              },
            },
            cityStats: metrics,
            cityStatsHistory: [{ tick: run.world.tick, stats: metrics }],
            weather: {
              temp: run.world.weather.temp,
              humidity: run.world.weather.humidity,
              wind: run.world.weather.wind,
              condition: run.world.weather.condition,
              aqi: run.world.weather.aqi,
            },
            gameTime: {
              day: run.world.clock.day,
              hour: run.world.clock.hour,
              minute: run.world.clock.minute,
              speed: state.gameTime.speed,
            },
            aiAgents: syncAgents(INITIAL_AGENTS, run.world, timestamp),
            notifications: eventNotifications(run.events, timestamp)
              .reverse()
              .slice(0, 50),
            agentLogs: eventAgentLogs(run.events, timestamp).slice(-200),
            modelRuntime: createModelRuntimeState(),
          }));
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unknown simulation import error",
          };
        }
      },
      setSimulationSpeed: (speed) =>
        set((state) => ({
          gameTime: { ...state.gameTime, speed },
        })),

      modelRuntime: createModelRuntimeState(),
      requestModelProposal: async (agentId) => {
        const initial = get();
        const requestSequence = initial.modelRuntime.requestSequence + 1;
        const requestId = `model-request-${initial.simulation.world.tick}-${agentId}-${requestSequence}`;
        set((state) => ({
          simulation: { ...state.simulation, status: "paused" },
          modelRuntime: {
            ...state.modelRuntime,
            requestSequence,
            generating: true,
          },
        }));

        try {
          const response = await requestServerModelProposal(
            {
              requestId,
              tick: initial.simulation.world.tick,
              seed: initial.simulation.seed,
              agentId,
              city: initial.cityStats,
            },
            initial.modelRuntime,
          );
          const {
            execution,
            riskTier,
            approvalPolicy,
            promptVersion,
            policyVersion,
            budgets,
          } = response;

          set((state) => {
            const approval: ModelApprovalRequest = {
              id: requestId,
              agentId,
              createdAtTick: state.simulation.world.tick,
              expiresAtTick: state.simulation.world.tick + 10,
              status:
                approvalPolicy === "auto-approve"
                  ? "auto-approved"
                  : approvalPolicy === "forbidden"
                    ? "forbidden"
                    : "pending",
              riskTier,
              execution,
            };
            const command =
              approvalPolicy === "auto-approve"
                ? createApprovedModelCommand(
                    approval,
                    state.simulation.world.tick + 1,
                    "policy",
                    state.modelRuntime,
                  )
                : null;
            const recordedApproval = command
              ? { ...approval, commandId: command.id }
              : approval;

            return {
              simulation: command
                ? {
                    ...state.simulation,
                    operatorCommands: [
                      ...state.simulation.operatorCommands,
                      command,
                    ],
                  }
                : state.simulation,
              modelRuntime: {
                ...state.modelRuntime,
                providerId: execution.providerId,
                model: execution.model,
                promptVersion,
                policyVersion,
                budgets,
                generating: false,
                lastExecution: execution,
                approvals: [
                  recordedApproval,
                  ...state.modelRuntime.approvals,
                ].slice(0, 50),
              },
            };
          });
        } catch (error) {
          set((state) => ({
            modelRuntime: {
              ...state.modelRuntime,
              generating: false,
              approvals: [
                {
                  id: requestId,
                  agentId,
                  createdAtTick: state.simulation.world.tick,
                  expiresAtTick: state.simulation.world.tick,
                  status: "failed" as const,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Unknown model provider error",
                },
                ...state.modelRuntime.approvals,
              ].slice(0, 50),
            },
          }));
        }
      },
      approveModelProposal: (approvalId) =>
        set((state) => {
          const approval = state.modelRuntime.approvals.find(
            (candidate) => candidate.id === approvalId,
          );
          if (!approval || approval.status !== "pending") {
            return {};
          }
          if (approval.expiresAtTick < state.simulation.world.tick) {
            return {
              modelRuntime: {
                ...state.modelRuntime,
                approvals: state.modelRuntime.approvals.map((candidate) =>
                  candidate.id === approvalId
                    ? { ...candidate, status: "expired" }
                    : candidate,
                ),
              },
            };
          }

          const command = createApprovedModelCommand(
            approval,
            state.simulation.world.tick + 1,
            "operator",
            state.modelRuntime,
          );
          if (!command) {
            return {};
          }

          return {
            simulation: {
              ...state.simulation,
              operatorCommands: [
                ...state.simulation.operatorCommands,
                command,
              ],
            },
            modelRuntime: {
              ...state.modelRuntime,
              approvals: state.modelRuntime.approvals.map((candidate) =>
                candidate.id === approvalId
                  ? {
                      ...candidate,
                      status: "approved",
                      commandId: command.id,
                    }
                  : candidate,
              ),
            },
          };
        }),
      rejectModelProposal: (approvalId) =>
        set((state) => ({
          modelRuntime: {
            ...state.modelRuntime,
            approvals: state.modelRuntime.approvals.map((approval) =>
              approval.id === approvalId && approval.status === "pending"
                ? { ...approval, status: "rejected" }
                : approval,
            ),
          },
        })),

      cityStats: initialMetrics,
      cityStatsHistory: [],

      weather: {
        temp: initialWorld.weather.temp,
        humidity: initialWorld.weather.humidity,
        wind: initialWorld.weather.wind,
        condition: initialWorld.weather.condition,
        aqi: initialWorld.weather.aqi,
      },
      setWeather: (weather) =>
        set((state) => ({
          weather: { ...state.weather, ...weather },
        })),

      districts: [
        {
          id: "d1",
          name: "Neo Downtown",
          type: "commercial",
          population: 420000,
          development: 95,
          status: "normal",
        },
        {
          id: "d2",
          name: "Chrome Heights",
          type: "residential",
          population: 890000,
          development: 78,
          status: "normal",
        },
        {
          id: "d3",
          name: "Iron Works",
          type: "industrial",
          population: 120000,
          development: 62,
          status: "warning",
        },
        {
          id: "d4",
          name: "Black Zone",
          type: "restricted",
          population: 0,
          development: 0,
          status: "critical",
        },
        {
          id: "d5",
          name: "Silicon Valley II",
          type: "commercial",
          population: 340000,
          development: 88,
          status: "normal",
        },
        {
          id: "d6",
          name: "Green Sector",
          type: "residential",
          population: 560000,
          development: 71,
          status: "normal",
        },
      ],
      updateDistrict: (id, data) =>
        set((state) => ({
          districts: state.districts.map((district) =>
            district.id === id ? { ...district, ...data } : district,
          ),
        })),

      neuralNodes: [],
      setNeuralNodes: (neuralNodes) => set({ neuralNodes }),
      updateNode: (id, data) =>
        set((state) => ({
          neuralNodes: state.neuralNodes.map((node) =>
            node.id === id ? { ...node, ...data } : node,
          ),
        })),

      tradeAssets: [
        {
          id: "pwr",
          symbol: "PWR",
          name: "Power Grid",
          price: 847.32,
          change: 12.45,
          changePercent: 1.49,
          volume: 2847293,
          high: 852,
          low: 834,
          history: [],
        },
        {
          id: "dat",
          symbol: "DAT",
          name: "Data Bandwidth",
          price: 234.18,
          change: -3.21,
          changePercent: -1.35,
          volume: 1928347,
          high: 238,
          low: 231,
          history: [],
        },
        {
          id: "mat",
          symbol: "MAT",
          name: "Raw Materials",
          price: 156.72,
          change: 5.67,
          changePercent: 3.75,
          volume: 3847291,
          high: 158,
          low: 149,
          history: [],
        },
        {
          id: "chp",
          symbol: "CHP",
          name: "Neural Chips",
          price: 1247.83,
          change: 23.45,
          changePercent: 1.91,
          volume: 947283,
          high: 1255,
          low: 1220,
          history: [],
        },
        {
          id: "nrg",
          symbol: "NRG",
          name: "Energy Cells",
          price: 89.45,
          change: -1.23,
          changePercent: -1.36,
          volume: 5629384,
          high: 92,
          low: 88,
          history: [],
        },
      ],
      updateAsset: (id, data) =>
        set((state) => ({
          tradeAssets: state.tradeAssets.map((asset) =>
            asset.id === id ? { ...asset, ...data } : asset,
          ),
        })),

      missions: [],
      addMission: (mission) =>
        set((state) => ({ missions: [...state.missions, mission] })),
      updateMission: (id, data) =>
        set((state) => ({
          missions: state.missions.map((mission) =>
            mission.id === id ? { ...mission, ...data } : mission,
          ),
        })),

      notifications: [],
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: `notif-${Date.now()}`,
              timestamp: Date.now(),
              read: false,
            },
            ...state.notifications,
          ].slice(0, 50),
        })),
      markAsRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((notification) =>
            notification.id === id
              ? { ...notification, read: true }
              : notification,
          ),
        })),
      clearNotifications: () => set({ notifications: [] }),

      ariaMessages: [],
      addAriaMessage: (message) =>
        set((state) => ({
          ariaMessages: [
            ...state.ariaMessages,
            {
              ...message,
              id: `msg-${Date.now()}`,
              timestamp: Date.now(),
            },
          ],
        })),

      aiAgents: INITIAL_AGENTS,
      agentLogs: [],

      qubits: Array.from({ length: 8 }, (_, index) => ({
        id: index,
        state: (index % 3 === 0
          ? "superposition"
          : index % 2 === 0
            ? 0
            : 1) as 0 | 1 | "superposition",
        entangled: index < 7 ? [index + 1] : [],
      })),
      setQubits: (qubits) => set({ qubits }),

      gameTime: {
        hour: initialWorld.clock.hour,
        minute: initialWorld.clock.minute,
        day: initialWorld.clock.day,
        speed: 1,
      },

      activeView: "dashboard",
      setActiveView: (activeView) => set({ activeView }),
    }),
    {
      name: STORAGE_KEY,
      version: 3,
      migrate: (persistedState, version) =>
        migratePersistedState(persistedState, version),
      storage: {
        getItem: (name: string) => {
          if (typeof window === "undefined") {
            return null;
          }
          const raw = localStorage.getItem(name);
          if (!raw) {
            return null;
          }
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        },
        setItem: (name: string, value: unknown) => {
          if (typeof window !== "undefined") {
            localStorage.setItem(name, JSON.stringify(value));
          }
        },
        removeItem: (name: string) => {
          if (typeof window !== "undefined") {
            localStorage.removeItem(name);
          }
        },
      },
      partialize: (state): Partial<NexusStore> => ({
        simulation: state.simulation,
        modelRuntime: state.modelRuntime,
        cityStats: state.cityStats,
        cityStatsHistory: state.cityStatsHistory,
        weather: state.weather,
        districts: state.districts,
        aiAgents: state.aiAgents,
        gameTime: state.gameTime,
        language: state.language,
        theme: state.theme,
      }),
    },
  ),
);

export function getSimulationFingerprint(): string {
  const { simulation } = useNexusStore.getState();
  return fingerprint({
    state: simulation.world,
    events: simulation.events,
  });
}
