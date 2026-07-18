import type {
  DomainEvent,
  SimulationMetric,
} from "../types";

export interface ActionTrace {
  id: string;
  tick: number;
  correlationId: string;
  agentId: string;
  observation?: DomainEvent;
  proposal?: DomainEvent;
  command?: Record<string, unknown>;
  action?: DomainEvent;
  evaluation?: DomainEvent;
  rejection?: DomainEvent;
  completeness: number;
  causalLinksComplete: boolean;
  rollbackReady: boolean;
  replayReady: boolean;
  guardrailRecorded: boolean;
  metricsRecorded: boolean;
  policyVersioned: boolean;
  status: "accepted" | "rejected" | "incomplete";
}

export interface ActionTraceMetrics {
  totalActions: number;
  verifiedActions: number;
  rejectedProposals: number;
  verifiedAutonomyLoopRate: number;
  causalTraceCompleteness: number;
  successfulEvaluations: number;
  successfulEvaluationRate: number;
  rollbackReadyActions: number;
  rollbackCoverage: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function buildActionTraces(events: DomainEvent[]): ActionTrace[] {
  const groups = new Map<string, DomainEvent[]>();

  for (const event of events) {
    const current = groups.get(event.correlationId) ?? [];
    current.push(event);
    groups.set(event.correlationId, current);
  }

  const traces: ActionTrace[] = [];

  for (const [correlationId, groupedEvents] of groups) {
    const proposal = groupedEvents.find(
      (event) => event.type === "agent.proposal",
    );
    const action = groupedEvents.find((event) => event.type === "agent.action");
    const evaluation = groupedEvents.find(
      (event) => event.type === "action.evaluated",
    );
    const rejection = groupedEvents.find(
      (event) => event.type === "command.rejected",
    );

    if (!proposal && !action && !rejection) {
      continue;
    }

    const observation = groupedEvents.find(
      (event) =>
        event.type === "observation.threshold" ||
        (event.type === "system.signal" &&
          (event.payload.category === "routine-agent-cycle" ||
            event.payload.category === "model-provider")),
    );
    const command = asRecord(proposal?.payload.command);
    const commandId =
      typeof command?.id === "string"
        ? command.id
        : typeof action?.payload.commandId === "string"
          ? action.payload.commandId
          : undefined;
    const agentId = String(
      proposal?.payload.agentId ??
        action?.payload.actorId ??
        rejection?.payload.actorId ??
        "unknown",
    );

    const presentStages = [
      observation,
      proposal,
      command,
      action ?? rejection,
      evaluation,
    ].filter(Boolean).length;
    const completeness = presentStages * 20;

    const proposalLinkValid =
      !proposal ||
      (Boolean(observation) && proposal.causationId === observation?.id);
    const actionLinkValid =
      !action || (Boolean(commandId) && action.causationId === commandId);
    const rejectionLinkValid =
      !rejection ||
      (Boolean(commandId) && rejection.causationId === commandId);
    const resolution = action ?? rejection;
    const evaluationLinkValid =
      !evaluation ||
      (Boolean(resolution) && evaluation.causationId === resolution?.id);
    const rollback = asRecord(action?.payload.rollback);
    const replay = asRecord(action?.payload.replay);
    const rollbackReady =
      rollback?.available === true &&
      typeof rollback.metric === "string" &&
      typeof rollback.delta === "number" &&
      typeof rollback.restoreValue === "number";
    const replayReady =
      typeof replay?.seed === "string" &&
      typeof replay.tick === "number" &&
      typeof replay.policyVersion === "string" &&
      typeof replay.commandId === "string";
    const guardrailRecorded =
      typeof action?.payload.guardrail === "string" ||
      typeof rejection?.payload.code === "string";
    const metricsRecorded =
      typeof action?.payload.before === "number" &&
      typeof action?.payload.after === "number";
    const policyVersioned = groupedEvents.every(
      (event) => event.policyVersion.trim().length > 0,
    );

    traces.push({
      id: `trace-${correlationId}`,
      tick: Math.max(...groupedEvents.map((event) => event.tick)),
      correlationId,
      agentId,
      observation,
      proposal,
      command,
      action,
      evaluation,
      rejection,
      completeness,
      causalLinksComplete:
        proposalLinkValid &&
        actionLinkValid &&
        rejectionLinkValid &&
        evaluationLinkValid,
      rollbackReady,
      replayReady,
      guardrailRecorded,
      metricsRecorded,
      policyVersioned,
      status: rejection ? "rejected" : action ? "accepted" : "incomplete",
    });
  }

  return traces.sort((left, right) => right.tick - left.tick);
}

export function calculateActionTraceMetrics(
  traces: ActionTrace[],
): ActionTraceMetrics {
  const autonomousAgents = new Set([
    "atlas",
    "economica",
    "civitas",
    "spectre",
  ]);
  const acceptedTraces = traces.filter(
    (trace) =>
      trace.status === "accepted" &&
      autonomousAgents.has(trace.agentId),
  );
  const totalActions = acceptedTraces.length;
  const verifiedActions = acceptedTraces.filter(
    (trace) =>
      trace.completeness === 100 &&
      trace.causalLinksComplete &&
      trace.rollbackReady &&
      trace.replayReady &&
      trace.guardrailRecorded &&
      trace.metricsRecorded &&
      trace.policyVersioned,
  ).length;
  const causallyComplete = acceptedTraces.filter(
    (trace) => trace.causalLinksComplete,
  ).length;
  const evaluated = acceptedTraces.filter((trace) => trace.evaluation).length;
  const successfulEvaluations = acceptedTraces.filter(
    (trace) => trace.evaluation?.payload.successful === true,
  ).length;
  const rollbackReadyActions = acceptedTraces.filter(
    (trace) => trace.rollbackReady,
  ).length;

  return {
    totalActions,
    verifiedActions,
    rejectedProposals: traces.filter((trace) => trace.status === "rejected")
      .length,
    verifiedAutonomyLoopRate:
      totalActions === 0 ? 100 : (verifiedActions / totalActions) * 100,
    causalTraceCompleteness:
      totalActions === 0 ? 100 : (causallyComplete / totalActions) * 100,
    successfulEvaluations,
    successfulEvaluationRate:
      evaluated === 0 ? 100 : (successfulEvaluations / evaluated) * 100,
    rollbackReadyActions,
    rollbackCoverage:
      totalActions === 0
        ? 100
        : (rollbackReadyActions / totalActions) * 100,
  };
}

export function getTraceMetric(trace: ActionTrace): SimulationMetric | null {
  const metric =
    trace.action?.payload.metric ??
    asRecord(trace.proposal?.payload.expectedEffect)?.metric;

  return typeof metric === "string"
    ? (metric as SimulationMetric)
    : null;
}
