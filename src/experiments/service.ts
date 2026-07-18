import {
  DEFAULT_SCENARIO,
  buildActionTraces,
  calculateActionTraceMetrics,
  cloneWorldState,
  fingerprint,
  inspectWorldInvariants,
  isReplayEquivalent,
  replaySimulation,
  stepSimulation,
} from "@/simulation";
import type {
  DomainEvent,
  SimulationCommand,
  SimulationRunExport,
  StepContext,
} from "@/simulation";
import {
  ExperimentConflictError,
  ExperimentNotFoundError,
  ExperimentValidationError,
} from "./errors";
import type {
  ExperimentRepository,
} from "./repository";
import type {
  ExperimentActor,
  ExperimentAuditRecord,
  ExperimentOverview,
  ExperimentReport,
  ExperimentRun,
  ExperimentRunAction,
  ExperimentSession,
  ExperimentSnapshot,
  ExperimentWorkspace,
} from "./types";
import {
  actorWorkspaceId,
  assertActorPermission,
  assertWorkspaceAccess,
  DEFAULT_WORKSPACE_ID,
} from "./authorization";

const SNAPSHOT_INTERVAL = 5;

interface ExperimentServiceOptions {
  now?: () => Date;
  id?: () => string;
}

function createRunExport(seed: string): SimulationRunExport {
  const world = cloneWorldState(DEFAULT_SCENARIO.world);
  return {
    schemaVersion: 1,
    seed,
    policyVersion: DEFAULT_SCENARIO.policyVersion,
    configuration: structuredClone(DEFAULT_SCENARIO.configuration),
    initialState: cloneWorldState(world),
    world,
    events: [],
    operatorCommands: [],
  };
}

function createContext(run: SimulationRunExport): StepContext {
  return {
    seed: run.seed,
    policyVersion: run.policyVersion,
    configuration: run.configuration,
  };
}

function normalizeName(name: unknown, fallback: string): string {
  if (typeof name !== "string") {
    return fallback;
  }
  const normalized = name.trim().slice(0, 80);
  return normalized || fallback;
}

export class ExperimentService {
  private readonly now: () => Date;
  private readonly id: () => string;

  constructor(
    readonly repository: ExperimentRepository,
    options: ExperimentServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
  }

  async initialize(): Promise<void> {
    await this.repository.initialize();
    await this.ensureDefaultContext();
  }

  private async ensureDefaultContext(
    workspaceId = DEFAULT_WORKSPACE_ID,
  ): Promise<{
    workspace: ExperimentWorkspace;
    session: ExperimentSession;
  }> {
    const timestamp = this.now().toISOString();
    const workspace = await this.repository.ensureWorkspace({
      id: workspaceId,
      name:
        workspaceId === DEFAULT_WORKSPACE_ID
          ? "Neo Angeles Autonomy Lab"
          : `NEXUS Workspace ${workspaceId}`,
      createdAt: timestamp,
    });
    const session = await this.repository.ensureSession({
      id: `session-${workspace.id}`,
      workspaceId: workspace.id,
      name: "Primary Governed Session",
      createdBy: "system",
      createdAt: timestamp,
    });
    return { workspace, session };
  }

  private assertCanMutate(actor: ExperimentActor): void {
    assertActorPermission(actor, "runs:write");
  }

  private createAudit(
    run: ExperimentRun,
    actor: ExperimentActor,
    action: ExperimentAuditRecord["action"],
    detail: Record<string, unknown>,
    createdAt: string,
  ): ExperimentAuditRecord {
    return {
      id: `audit-${this.id()}`,
      workspaceId: run.workspaceId,
      runId: run.id,
      actorId: actor.id,
      role: actor.role,
      action,
      detail: {
        ...detail,
        authentication: {
          source: actor.authSource ?? "system",
          issuer: actor.issuer,
        },
      },
      createdAt,
    };
  }

  private createSnapshot(
    run: ExperimentRun,
    createdAt: string,
  ): ExperimentSnapshot {
    return {
      id: `snapshot-${this.id()}`,
      runId: run.id,
      tick: run.run.world.tick,
      version: run.version,
      fingerprint: fingerprint({
        state: run.run.world,
        events: run.run.events,
      }),
      run: structuredClone(run.run),
      createdAt,
    };
  }

  async overview(actor?: ExperimentActor): Promise<ExperimentOverview> {
    const workspaceId = actorWorkspaceId(actor);
    if (actor) {
      assertWorkspaceAccess(actor, workspaceId);
    }
    const { workspace, session } =
      await this.ensureDefaultContext(workspaceId);
    return {
      backend: this.repository.backend,
      workspace,
      session,
      runs: await this.repository.listRuns(workspace.id),
    };
  }

  async createRun(
    input: { name?: unknown; seed?: unknown },
    actor: ExperimentActor,
  ): Promise<ExperimentRun> {
    this.assertCanMutate(actor);
    const workspaceId = actorWorkspaceId(actor);
    assertWorkspaceAccess(actor, workspaceId);
    const { workspace, session } =
      await this.ensureDefaultContext(workspaceId);
    const timestamp = this.now().toISOString();
    const seed =
      typeof input.seed === "string" && input.seed.trim()
        ? input.seed.trim().slice(0, 120)
        : DEFAULT_SCENARIO.seed;
    const run: ExperimentRun = {
      id: `run-${this.id()}`,
      workspaceId: workspace.id,
      sessionId: session.id,
      name: normalizeName(input.name, `Experiment ${timestamp.slice(0, 19)}`),
      status: "paused",
      version: 1,
      createdBy: actor.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      run: createRunExport(seed),
    };

    return this.repository.createRun({
      run,
      snapshot: this.createSnapshot(run, timestamp),
      audit: this.createAudit(
        run,
        actor,
        "run.created",
        { seed, scenarioId: run.run.initialState.scenarioId },
        timestamp,
      ),
    });
  }

  async getRun(
    runId: string,
    actor?: ExperimentActor,
  ): Promise<ExperimentRun> {
    const run = await this.repository.getRun(runId);
    if (!run) {
      throw new ExperimentNotFoundError(`Run ${runId} was not found`);
    }
    if (actor) {
      assertWorkspaceAccess(actor, run.workspaceId);
    }
    return run;
  }

  async tickRunningRuns(
    actor: ExperimentActor = {
      id: "experiment-clock",
      role: "admin",
      principalType: "system",
      authSource: "system",
    },
  ): Promise<{
    advanced: string[];
    conflicts: string[];
  }> {
    const runs = await this.repository.listRunningRuns();
    const advanced: string[] = [];
    const conflicts: string[] = [];

    for (const run of runs.filter((candidate) => candidate.status === "running")) {
      try {
        await this.mutateRun(
          run.id,
          run.version,
          { type: "step" },
          actor,
        );
        advanced.push(run.id);
      } catch (error) {
        if (error instanceof ExperimentConflictError) {
          conflicts.push(run.id);
          continue;
        }
        throw error;
      }
    }

    return { advanced, conflicts };
  }

  async queueCommand(
    runId: string,
    expectedVersion: number,
    command: SimulationCommand,
    actor: ExperimentActor,
  ): Promise<ExperimentRun> {
    this.assertCanMutate(actor);
    const current = await this.getRun(runId, actor);
    if (command.tick !== current.run.world.tick + 1) {
      throw new ExperimentValidationError(
        `Queued command must target tick ${current.run.world.tick + 1}`,
      );
    }
    if (
      current.run.operatorCommands.some(
        (candidate) => candidate.id === command.id,
      )
    ) {
      throw new ExperimentValidationError(
        `Command ${command.id} is already queued`,
      );
    }

    const timestamp = this.now().toISOString();
    const next: ExperimentRun = {
      ...current,
      version: current.version + 1,
      updatedAt: timestamp,
      run: {
        ...current.run,
        operatorCommands: [
          ...current.run.operatorCommands,
          structuredClone(command),
        ],
      },
    };
    return this.repository.commitRun({
      run: next,
      expectedVersion,
      newEvents: [],
      audit: this.createAudit(
        next,
        actor,
        "run.command.queued",
        {
          commandId: command.id,
          tick: command.tick,
          actorId: command.actorId,
          metric: command.payload.metric,
          delta: command.payload.delta,
        },
        timestamp,
      ),
    });
  }

  async mutateRun(
    runId: string,
    expectedVersion: number,
    action: ExperimentRunAction,
    actor: ExperimentActor,
  ): Promise<ExperimentRun> {
    this.assertCanMutate(actor);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ExperimentValidationError(
        "expectedVersion must be a positive integer",
      );
    }

    const current = await this.getRun(runId, actor);
    if (action.type === "fork") {
      return this.forkRun(current, expectedVersion, action, actor);
    }

    const timestamp = this.now().toISOString();
    let next: ExperimentRun = {
      ...current,
      version: current.version + 1,
      updatedAt: timestamp,
    };
    let auditAction: ExperimentAuditRecord["action"];
    let detail: Record<string, unknown>;
    let newEvents: DomainEvent[] = [];

    if (action.type === "pause") {
      next = { ...next, status: "paused" };
      auditAction = "run.paused";
      detail = { tick: next.run.world.tick };
    } else if (action.type === "resume") {
      next = { ...next, status: "running" };
      auditAction = "run.resumed";
      detail = { tick: next.run.world.tick };
    } else {
      const nextTick = current.run.world.tick + 1;
      const commands = current.run.operatorCommands.filter(
        (command) => command.tick === nextTick,
      );
      const result = stepSimulation(
        current.run.world,
        commands,
        createContext(current.run),
      );
      newEvents = result.events;
      next = {
        ...next,
        run: {
          ...current.run,
          world: result.state,
          events: [...current.run.events, ...result.events],
        },
      };
      auditAction = "run.stepped";
      detail = {
        fromTick: current.run.world.tick,
        toTick: result.state.tick,
        acceptedCommands: result.acceptedCommands.length,
        rejectedCommands: result.rejectedCommands.length,
        eventCount: result.events.length,
      };
    }

    return this.repository.commitRun({
      run: next,
      expectedVersion,
      newEvents,
      snapshot:
        action.type === "step" &&
        next.run.world.tick % SNAPSHOT_INTERVAL === 0
          ? this.createSnapshot(next, timestamp)
          : undefined,
      audit: this.createAudit(
        next,
        actor,
        auditAction,
        detail,
        timestamp,
      ),
    });
  }

  private async forkRun(
    source: ExperimentRun,
    expectedVersion: number,
    action: Extract<ExperimentRunAction, { type: "fork" }>,
    actor: ExperimentActor,
  ): Promise<ExperimentRun> {
    if (source.version !== expectedVersion) {
      throw new ExperimentConflictError(
        `Run ${source.id} changed; expected version ${expectedVersion}`,
      );
    }
    const targetTick = action.tick ?? source.run.world.tick;
    const availableTicks =
      source.run.world.tick - source.run.initialState.tick;
    const requestedTicks = targetTick - source.run.initialState.tick;
    if (
      !Number.isInteger(targetTick) ||
      requestedTicks < 0 ||
      requestedTicks > availableTicks
    ) {
      throw new ExperimentValidationError(
        `Fork tick must be between ${source.run.initialState.tick} and ${source.run.world.tick}`,
      );
    }

    const commands = source.run.operatorCommands.filter(
      (command) => command.tick <= targetTick,
    );
    const replay = replaySimulation(
      source.run.initialState,
      createContext(source.run),
      requestedTicks,
      commands,
    );
    const timestamp = this.now().toISOString();
    const fork: ExperimentRun = {
      ...source,
      id: `run-${this.id()}`,
      name: normalizeName(action.name, `${source.name} fork @ ${targetTick}`),
      status: "paused",
      version: 1,
      parentRunId: source.id,
      forkedFromTick: targetTick,
      createdBy: actor.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      run: {
        ...source.run,
        world: replay.state,
        events: replay.events,
        operatorCommands: commands,
      },
    };

    return this.repository.createRun({
      run: fork,
      initialEvents: replay.events,
      snapshot: this.createSnapshot(fork, timestamp),
      audit: this.createAudit(
        fork,
        actor,
        "run.forked",
        { parentRunId: source.id, forkedFromTick: targetTick },
        timestamp,
      ),
    });
  }

  async report(
    runId: string,
    actor?: ExperimentActor,
  ): Promise<ExperimentReport> {
    const run = await this.getRun(runId, actor);
    const ticks = run.run.world.tick - run.run.initialState.tick;
    const replay = replaySimulation(
      run.run.initialState,
      createContext(run.run),
      ticks,
      run.run.operatorCommands,
    );
    const traces = buildActionTraces(run.run.events);
    const traceMetrics = calculateActionTraceMetrics(traces);
    const [events, snapshots, audit] = await Promise.all([
      this.repository.listEvents(run.id),
      this.repository.listSnapshots(run.id),
      this.repository.listAudit(run.id),
    ]);

    return {
      schemaVersion: 1,
      generatedAt: this.now().toISOString(),
      backend: this.repository.backend,
      run: {
        id: run.id,
        name: run.name,
        status: run.status,
        version: run.version,
        tick: run.run.world.tick,
        seed: run.run.seed,
        policyVersion: run.run.policyVersion,
        parentRunId: run.parentRunId,
        forkedFromTick: run.forkedFromTick,
      },
      verification: {
        deterministicReplay: isReplayEquivalent(
          run.run.world,
          run.run.events,
          replay,
        ),
        fingerprint: replay.fingerprint,
        verifiedAutonomyLoopRate:
          traceMetrics.verifiedAutonomyLoopRate,
        causalTraceCompleteness: traceMetrics.causalTraceCompleteness,
        evaluationSuccessRate: traceMetrics.successfulEvaluationRate,
        rollbackCoverage: traceMetrics.rollbackCoverage,
        invariantViolations: inspectWorldInvariants(run.run.world),
      },
      storage: {
        eventCount: events.length,
        snapshotCount: snapshots.length,
        auditCount: audit.length,
        latestCursor: events.at(-1)?.cursor ?? 0,
      },
      artifacts: {
        run: run.run,
        events,
        snapshots,
        audit,
      },
    };
  }
}
