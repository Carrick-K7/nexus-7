import { advanceClock } from "./clock";
import { assertWorldInvariants } from "./invariants";
import {
  clamp,
  getMetric,
  roundMetric,
  selectCityMetrics,
  setMetric,
} from "./metrics";
import {
  deterministicIndex,
  randomBetween,
  randomUnit,
} from "./random";
import {
  AGENT_DEFINITIONS,
  runAgentRuntime,
} from "../agents";
import type {
  AgentProposal,
  RuntimeRejection,
} from "../agents";
import type {
  AgentId,
  CommandRejection,
  DomainEvent,
  SimulationCommand,
  SimulationMetric,
  StepContext,
  StepResult,
  WorldState,
} from "../types";
import {
  applyCityMechanisms,
} from "@/city/mechanisms";

function getActorCapabilities(
  actorId: AgentId | "operator" | "system",
): SimulationMetric[] {
  if (actorId === "operator") {
    return [
      "population",
      "gdp",
      "happiness",
      "pollution",
      "crime",
      "traffic",
      "energy",
      "water",
      "internet",
      "medical",
    ];
  }

  if (actorId === "aria" || actorId === "system") {
    return [];
  }

  return AGENT_DEFINITIONS[actorId].capabilities;
}

const METRIC_LIMITS: Record<SimulationMetric, number> = {
  population: 10_000,
  gdp: 100,
  happiness: 20,
  pollution: 20,
  crime: 20,
  traffic: 20,
  energy: 20,
  water: 20,
  internet: 20,
  medical: 20,
};

interface EventFactory {
  create: (
    type: DomainEvent["type"],
    payload: Record<string, unknown>,
    correlationId: string,
    causationId?: string,
  ) => DomainEvent;
}

function createEventFactory(tick: number, policyVersion: string): EventFactory {
  let sequence = 0;

  return {
    create(type, payload, correlationId, causationId) {
      sequence += 1;
      return {
        id: `evt-${tick}-${sequence}`,
        tick,
        type,
        payload,
        correlationId,
        causationId,
        policyVersion,
      };
    },
  };
}

function approach(
  current: number,
  target: number,
  rate: number,
  jitter: number,
): number {
  return roundMetric(current + (target - current) * rate + jitter);
}

function evolveEnvironment(
  state: WorldState,
  context: StepContext,
): WorldState {
  const tick = state.tick + 1;
  const clock = advanceClock(state.clock, context.configuration.minutesPerTick);
  const hour = clock.hour;
  const rushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  const overnight = hour >= 22 || hour <= 5;
  const daylight = hour >= 8 && hour <= 18;

  const trafficTarget = rushHour ? 84 : overnight ? 24 : 52;
  const energyTarget = hour >= 18 && hour <= 22 ? 88 : overnight ? 68 : 80;
  const crimeTarget = hour >= 22 || hour <= 3 ? 52 : hour >= 12 && hour <= 14 ? 30 : 22;
  const pollutionTarget = daylight ? 58 : 34;

  let nextState: WorldState = {
    ...state,
    tick,
    clock,
    weather: {
      ...state.weather,
      temp: roundMetric(
        approach(
          state.weather.temp,
          daylight ? 25 : 19,
          0.15,
          randomBetween(context.seed, tick, "weather.temp", -0.5, 0.5),
        ),
      ),
      humidity: clamp(
        approach(
          state.weather.humidity,
          overnight ? 72 : 58,
          0.12,
          randomBetween(context.seed, tick, "weather.humidity", -1.5, 1.5),
        ),
      ),
      wind: clamp(
        approach(
          state.weather.wind,
          14,
          0.2,
          randomBetween(context.seed, tick, "weather.wind", -2, 2),
        ),
        0,
        80,
      ),
    },
  };

  nextState = setMetric(
    nextState,
    "traffic",
    approach(
      state.infrastructure.traffic,
      trafficTarget,
      0.22,
      randomBetween(context.seed, tick, "city.traffic", -4, 4),
    ),
  );
  nextState = setMetric(
    nextState,
    "energy",
    approach(
      state.infrastructure.energy,
      energyTarget,
      0.16,
      randomBetween(context.seed, tick, "city.energy", -2, 2),
    ),
  );
  nextState = setMetric(
    nextState,
    "crime",
    approach(
      state.security.crime,
      crimeTarget,
      0.18,
      randomBetween(context.seed, tick, "city.crime", -2.5, 2.5),
    ),
  );
  nextState = setMetric(
    nextState,
    "pollution",
    approach(
      state.weather.pollution,
      pollutionTarget,
      0.14,
      randomBetween(context.seed, tick, "city.pollution", -3, 3),
    ),
  );

  const happinessTarget =
    94 -
    nextState.security.crime * 0.28 -
    nextState.weather.pollution * 0.14 -
    nextState.infrastructure.traffic * 0.08;
  nextState = setMetric(
    nextState,
    "happiness",
    approach(
      state.city.happiness,
      happinessTarget,
      0.12,
      randomBetween(context.seed, tick, "city.happiness", -1, 1),
    ),
  );

  const economicDrift =
    (nextState.city.happiness - 60) / 50 +
    randomBetween(context.seed, tick, "city.gdp", -1.5, 2.5);
  nextState = setMetric(nextState, "gdp", state.economy.gdp + economicDrift);

  if (clock.day > state.clock.day) {
    nextState = setMetric(
      nextState,
      "population",
      state.city.population +
        Math.round(randomBetween(context.seed, tick, "city.population", 120, 980)),
    );
  }

  const weatherRoll = randomUnit(context.seed, tick, "weather.condition");
  nextState = {
    ...nextState,
    weather: {
      ...nextState.weather,
      condition:
        weatherRoll > 0.94
          ? "storm"
          : weatherRoll > 0.76
            ? "rain"
            : weatherRoll > 0.5
              ? "cloudy"
              : "clear",
    },
  };

  return nextState;
}

function validateCommand(
  command: SimulationCommand,
  expectedTick: number,
): CommandRejection | null {
  if (command.tick !== expectedTick) {
    return {
      command,
      code: "WRONG_TICK",
      reason: `Command tick ${command.tick} does not match step tick ${expectedTick}`,
    };
  }

  const { metric, delta, reason } = command.payload;
  if (
    !Object.hasOwn(METRIC_LIMITS, metric) ||
    !Number.isFinite(delta) ||
    typeof reason !== "string" ||
    reason.trim().length === 0
  ) {
    return {
      command,
      code: "INVALID_PAYLOAD",
      reason: "Command payload must include a known metric, finite delta, and reason",
    };
  }

  if (!getActorCapabilities(command.actorId).includes(metric)) {
    return {
      command,
      code: "FORBIDDEN_CAPABILITY",
      reason: `${command.actorId} cannot modify ${metric}`,
    };
  }

  if (Math.abs(delta) > METRIC_LIMITS[metric]) {
    return {
      command,
      code: "DELTA_EXCEEDS_LIMIT",
      reason: `${metric} delta exceeds the ${METRIC_LIMITS[metric]} point guardrail`,
    };
  }

  return null;
}

function applyCommand(
  state: WorldState,
  command: SimulationCommand,
): {
  state: WorldState;
  before: number;
  after: number;
} {
  const before = getMetric(state, command.payload.metric);
  let nextState = setMetric(
    state,
    command.payload.metric,
    before + command.payload.delta,
  );
  const after = getMetric(nextState, command.payload.metric);

  if (command.actorId !== "operator" && command.actorId !== "system") {
    const agent = nextState.agents[command.actorId];
    nextState = {
      ...nextState,
      agents: {
        ...nextState.agents,
        [command.actorId]: {
          ...agent,
          status: "active",
          mood: clamp(agent.mood + (after === before ? -1 : 1)),
          currentTask: command.payload.task ?? command.payload.reason,
          lastActionTick: nextState.tick,
        },
      },
    };
  }

  return { state: nextState, before, after };
}

function makePolicyCommand(
  proposal: AgentProposal,
  causationId: string,
): SimulationCommand {
  return {
    id: `cmd-${proposal.tick}-${proposal.agentId}-${proposal.metric}-${proposal.id}`,
    tick: proposal.tick,
    actorId: proposal.agentId,
    type: "adjust-metric",
    payload: {
      metric: proposal.metric,
      delta: proposal.delta,
      reason: proposal.rationale,
      task: proposal.task,
    },
    correlationId: proposal.correlationId,
    causationId,
    source: "policy",
  };
}

function createAgentRuntimePlan(
  state: WorldState,
  context: StepContext,
  eventFactory: EventFactory,
): {
  events: DomainEvent[];
  commands: SimulationCommand[];
  rejections: Array<{
    runtime: RuntimeRejection;
    command: SimulationCommand;
    proposalEvent: DomainEvent;
  }>;
} {
  const runtime = runAgentRuntime(state, context);
  const events: DomainEvent[] = [];
  const observationEvents = new Map<string, DomainEvent>();
  for (const observation of runtime.observations) {
    const event = eventFactory.create(
      observation.kind === "threshold"
        ? "observation.threshold"
        : "system.signal",
      {
        observationId: observation.id,
        category:
          observation.kind === "routine"
            ? "routine-agent-cycle"
            : "threshold",
        kind: observation.kind,
        metric: observation.metric,
        value: observation.value,
        threshold: observation.threshold,
        assignedAgent: observation.agentId,
        summary: observation.summary,
        priority: observation.priority,
        riskTier: observation.riskTier,
      },
      observation.correlationId,
    );
    observationEvents.set(observation.id, event);
    events.push(event);
  }

  const scheduledIds = new Set(
    runtime.scheduledProposals.map((proposal) => proposal.id),
  );
  const rejectionByProposal = new Map(
    runtime.rejectedProposals.map((rejection) => [
      rejection.proposal.id,
      rejection,
    ]),
  );
  const proposalPlans = new Map<
    string,
    {
      proposal: AgentProposal;
      event: DomainEvent;
      command: SimulationCommand;
    }
  >();

  for (const proposal of runtime.proposals) {
    const observationEvent = observationEvents.get(proposal.observationId);
    if (!observationEvent) {
      continue;
    }

    const previewCommand = makePolicyCommand(proposal, observationEvent.id);
    const runtimeRejection = rejectionByProposal.get(proposal.id);
    const proposalEvent = eventFactory.create(
      "agent.proposal",
      {
        proposalId: proposal.id,
        observationId: proposal.observationId,
        agentId: proposal.agentId,
        rationale: proposal.rationale,
        priority: proposal.priority,
        riskTier: proposal.riskTier,
        expectedEffect: {
          metric: proposal.metric,
          delta: proposal.delta,
          direction: proposal.delta >= 0 ? "increase" : "decrease",
        },
        command: {
          id: previewCommand.id,
          tick: previewCommand.tick,
          actorId: previewCommand.actorId,
          type: previewCommand.type,
          payload: previewCommand.payload,
        },
        guardrail: scheduledIds.has(proposal.id)
          ? "scheduled"
          : runtimeRejection?.code ?? "not-scheduled",
      },
      proposal.correlationId,
      observationEvent.id,
    );
    const command = makePolicyCommand(proposal, proposalEvent.id);
    events.push(proposalEvent);
    proposalPlans.set(proposal.id, {
      proposal,
      event: proposalEvent,
      command,
    });
  }

  const commands = runtime.scheduledProposals.flatMap((proposal) => {
    const plan = proposalPlans.get(proposal.id);
    return plan ? [plan.command] : [];
  });
  const rejections = runtime.rejectedProposals.flatMap((runtimeRejection) => {
    const plan = proposalPlans.get(runtimeRejection.proposal.id);
    return plan
      ? [
          {
            runtime: runtimeRejection,
            command: plan.command,
            proposalEvent: plan.event,
          },
        ]
      : [];
  });

  events.push(
    eventFactory.create(
      "coordinator.decision",
      {
        coordinatorId: "aria",
        observationCount: runtime.observations.length,
        proposalCount: runtime.proposals.length,
        scheduled: runtime.scheduledProposals.map((proposal) => ({
          proposalId: proposal.id,
          agentId: proposal.agentId,
          metric: proposal.metric,
          priority: proposal.priority,
          riskTier: proposal.riskTier,
        })),
        rejected: runtime.rejectedProposals.map((rejection) => ({
          proposalId: rejection.proposal.id,
          agentId: rejection.proposal.agentId,
          metric: rejection.proposal.metric,
          code: rejection.code,
          reason: rejection.reason,
        })),
      },
      `corr-${state.tick}-aria-coordinator`,
    ),
  );

  return {
    events,
    commands,
    rejections,
  };
}

function prepareExternalCommands(
  commands: SimulationCommand[],
  eventFactory: EventFactory,
): {
  events: DomainEvent[];
  commands: SimulationCommand[];
} {
  const events: DomainEvent[] = [];
  const preparedCommands = commands.map((command) => {
    if (command.source === "policy") {
      const observation = eventFactory.create(
        "system.signal",
        {
          category: "routine-agent-cycle",
          assignedAgent: command.actorId,
          summary: "A controlled policy variant submitted an intervention",
        },
        command.correlationId,
      );
      const proposal = eventFactory.create(
        "agent.proposal",
        {
          agentId: command.actorId,
          rationale: command.payload.reason,
          expectedEffect: {
            metric: command.payload.metric,
            delta: command.payload.delta,
            direction:
              command.payload.delta >= 0 ? "increase" : "decrease",
          },
          command: {
            id: command.id,
            tick: command.tick,
            actorId: command.actorId,
            type: command.type,
            payload: command.payload,
          },
          guardrail: "controlled-policy-experiment",
        },
        command.correlationId,
        observation.id,
      );
      events.push(observation, proposal);
      return {
        ...command,
        causationId: proposal.id,
      };
    }
    if (command.source !== "model" || !command.payload.model) {
      return command;
    }

    const model = command.payload.model;
    const observation = eventFactory.create(
      "system.signal",
      {
        category: "model-provider",
        assignedAgent: command.actorId,
        summary: "A structured model proposal was submitted for validation",
        providerId: model.providerId,
        model: model.model,
        promptVersion: model.promptVersion,
        policyVersion: model.policyVersion,
        riskTier: model.riskTier,
        tokenCount: model.tokenCount,
        costUsd: model.costUsd,
        latencyMs: model.latencyMs,
        fallbackReason: model.fallbackReason,
      },
      command.correlationId,
    );
    const proposal = eventFactory.create(
      "agent.proposal",
      {
        agentId: command.actorId,
        rationale: command.payload.reason,
        expectedEffect: {
          metric: command.payload.metric,
          delta: command.payload.delta,
          direction: command.payload.delta >= 0 ? "increase" : "decrease",
        },
        command: {
          id: command.id,
          tick: command.tick,
          actorId: command.actorId,
          type: command.type,
          payload: command.payload,
        },
        guardrail:
          model.approvedBy === "operator"
            ? "human-approved"
            : "policy-auto-approved",
        approvalId: model.approvalId,
        providerId: model.providerId,
        model: model.model,
        promptVersion: model.promptVersion,
        riskTier: model.riskTier,
      },
      command.correlationId,
      observation.id,
    );
    events.push(observation, proposal);
    return {
      ...command,
      causationId: proposal.id,
    };
  });

  return { events, commands: preparedCommands };
}

export function stepSimulation(
  state: WorldState,
  commands: SimulationCommand[],
  context: StepContext,
): StepResult {
  assertWorldInvariants(state);

  const beforeMetrics = selectCityMetrics(state);
  let nextState = evolveEnvironment(state, context);
  const mechanismResult = applyCityMechanisms(nextState);
  nextState = mechanismResult.state;
  const eventFactory = createEventFactory(nextState.tick, context.policyVersion);
  const events: DomainEvent[] = [];
  const acceptedCommands: SimulationCommand[] = [];
  const rejectedCommands: CommandRejection[] = [];

  for (const application of mechanismResult.applications) {
    events.push(
      eventFactory.create(
        "city.mechanism.applied",
        {
          ...application,
          ontologyVersion: "nexus.city-ontology.v1",
          synthetic: true,
        },
        `corr-${nextState.tick}-${application.mechanism}`,
      ),
    );
  }

  if (nextState.clock.day > state.clock.day) {
    events.push(
      eventFactory.create(
        "city.day.started",
        {
          day: nextState.clock.day,
          population: nextState.city.population,
        },
        `corr-${nextState.tick}-day`,
      ),
    );
  }

  const applyCommands = (pendingCommands: SimulationCommand[]) => {
    for (const command of pendingCommands) {
      const rejection = validateCommand(command, nextState.tick);

      if (rejection) {
        rejectedCommands.push(rejection);
        events.push(
          eventFactory.create(
            "command.rejected",
            {
              commandId: command.id,
              actorId: command.actorId,
              metric: command.payload.metric,
              code: rejection.code,
              reason: rejection.reason,
            },
            command.correlationId,
            command.causationId,
          ),
        );
        continue;
      }

      const applied = applyCommand(nextState, command);
      nextState = applied.state;
      acceptedCommands.push(command);
      const actualDelta = roundMetric(applied.after - applied.before);
      const action = eventFactory.create(
        "agent.action",
        {
          commandId: command.id,
          actorId: command.actorId,
          metric: command.payload.metric,
          delta: command.payload.delta,
          reason: command.payload.reason,
          task: command.payload.task,
          before: applied.before,
          after: applied.after,
          guardrail: "accepted",
          source: command.source,
          replay: {
            seed: context.seed,
            tick: nextState.tick,
            policyVersion: context.policyVersion,
            commandId: command.id,
          },
          rollback: {
            available: true,
            metric: command.payload.metric,
            delta: roundMetric(-actualDelta),
            restoreValue: applied.before,
          },
        },
        command.correlationId,
        command.id,
      );
      events.push(action);

      const fulfilled =
        command.payload.delta === 0
          ? actualDelta === 0
          : actualDelta !== 0 &&
            Math.sign(actualDelta) === Math.sign(command.payload.delta);
      events.push(
        eventFactory.create(
          "action.evaluated",
          {
            commandId: command.id,
            actorId: command.actorId,
            metric: command.payload.metric,
            expectedDelta: command.payload.delta,
            actualDelta,
            before: applied.before,
            after: applied.after,
            outcome: fulfilled ? "expected-direction" : "no-effective-change",
            successful: fulfilled,
          },
          command.correlationId,
          action.id,
        ),
      );
    }
  };

  const external = prepareExternalCommands(commands, eventFactory);
  events.push(...external.events);
  applyCommands(external.commands);

  const agentRuntimePlan = createAgentRuntimePlan(
    nextState,
    context,
    eventFactory,
  );
  events.push(...agentRuntimePlan.events);

  for (const rejected of agentRuntimePlan.rejections) {
    const rejection: CommandRejection = {
      command: rejected.command,
      code: rejected.runtime.code,
      reason: rejected.runtime.reason,
    };
    rejectedCommands.push(rejection);
    const rejectionEvent = eventFactory.create(
      "command.rejected",
      {
        commandId: rejected.command.id,
        proposalId: rejected.runtime.proposal.id,
        actorId: rejected.command.actorId,
        metric: rejected.command.payload.metric,
        code: rejected.runtime.code,
        reason: rejected.runtime.reason,
        stage: "scheduler",
      },
      rejected.command.correlationId,
      rejected.command.id,
    );
    events.push(rejectionEvent);
    events.push(
      eventFactory.create(
        "action.evaluated",
        {
          commandId: rejected.command.id,
          actorId: rejected.command.actorId,
          metric: rejected.command.payload.metric,
          expectedDelta: rejected.command.payload.delta,
          actualDelta: 0,
          outcome: `rejected:${rejected.runtime.code}`,
          successful: false,
        },
        rejected.command.correlationId,
        rejectionEvent.id,
      ),
    );
  }
  applyCommands(agentRuntimePlan.commands);

  if (
    randomUnit(context.seed, nextState.tick, "system.ambient.enabled") <
    context.configuration.ambientEventProbability
  ) {
    const signals = [
      "Traffic sensor mesh recalibrated",
      "Power grid harmonic stabilized",
      "Weather model assimilated new data",
      "Network latency anomaly resolved",
    ];
    const signal =
      signals[
        deterministicIndex(
          context.seed,
          nextState.tick,
          "system.ambient.signal",
          signals.length,
        )
      ];
    events.push(
      eventFactory.create(
        "system.signal",
        { category: "ambient", message: signal },
        `corr-${nextState.tick}-ambient`,
      ),
    );
  }

  const afterMetrics = selectCityMetrics(nextState);
  events.push(
    eventFactory.create(
      "city.metrics.updated",
      {
        before: beforeMetrics,
        after: afterMetrics,
      },
      `corr-${nextState.tick}-metrics`,
    ),
  );

  assertWorldInvariants(nextState);

  return {
    state: nextState,
    acceptedCommands,
    rejectedCommands,
    events,
    metrics: {
      tick: nextState.tick,
      clock: nextState.clock,
      city: afterMetrics,
    },
  };
}
