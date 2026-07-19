import {
  ExperimentConflictError,
} from "@/experiments/errors";
import type {
  CohortCell,
  CognitiveDecision,
  Commitment,
  ReciprocalEpisode,
  Relationship,
  Resident,
  WorldEvent,
  WorldSeason,
  WorldSnapshot,
  WorldTurn,
} from "./contracts";
import type {
  CommitWorldTurnInput,
  WorldRepository,
} from "./repository";

function key(workspaceId: string, seasonId: string): string {
  return `${workspaceId}:${seasonId}`;
}

export class InMemoryWorldRepository implements WorldRepository {
  readonly backend = "memory" as const;
  private readonly seasons = new Map<string, WorldSeason>();
  private readonly residents = new Map<string, Resident[]>();
  private readonly cohorts = new Map<string, CohortCell[]>();
  private readonly snapshots = new Map<string, Map<number, WorldSnapshot>>();
  private readonly turns = new Map<string, WorldTurn[]>();
  private readonly events = new Map<string, WorldEvent[]>();
  private readonly relationships = new Map<string, Relationship[]>();
  private readonly commitments = new Map<string, Commitment[]>();
  private readonly episodes = new Map<string, ReciprocalEpisode[]>();
  private readonly decisions = new Map<string, CognitiveDecision[]>();

  async initialize(): Promise<void> {}

  async close(): Promise<void> {}

  async createSeason(input: {
    season: WorldSeason;
    initialTurn: WorldTurn;
    initialSnapshot: WorldSnapshot;
    residents: Resident[];
    cohorts: CohortCell[];
  }): Promise<WorldSeason> {
    const scope = key(input.season.workspaceId, input.season.id);
    if (this.seasons.has(scope)) {
      throw new ExperimentConflictError(
        `World season ${input.season.id} already exists`,
      );
    }
    this.seasons.set(scope, structuredClone(input.season));
    this.residents.set(scope, structuredClone(input.residents));
    this.cohorts.set(scope, structuredClone(input.cohorts));
    this.snapshots.set(
      scope,
      new Map([[input.initialSnapshot.turn, structuredClone(input.initialSnapshot)]]),
    );
    this.turns.set(scope, [structuredClone(input.initialTurn)]);
    this.events.set(scope, []);
    this.relationships.set(
      scope,
      structuredClone(input.initialSnapshot.relationships),
    );
    this.commitments.set(
      scope,
      structuredClone(input.initialSnapshot.commitments),
    );
    this.episodes.set(
      scope,
      structuredClone(input.initialSnapshot.reciprocalEpisodes),
    );
    this.decisions.set(scope, []);
    return structuredClone(input.season);
  }

  async getSeason(
    workspaceId: string,
    seasonId: string,
  ): Promise<WorldSeason | null> {
    const season = this.seasons.get(key(workspaceId, seasonId));
    return season ? structuredClone(season) : null;
  }

  async getSnapshot(
    workspaceId: string,
    seasonId: string,
    turn?: number,
  ): Promise<WorldSnapshot | null> {
    const scope = key(workspaceId, seasonId);
    const season = this.seasons.get(scope);
    const targetTurn = turn ?? season?.currentTurn;
    if (targetTurn === undefined) return null;
    const snapshot = this.snapshots.get(scope)?.get(targetTurn);
    return snapshot ? structuredClone(snapshot) : null;
  }

  async listResidents(
    workspaceId: string,
    seasonId: string,
  ): Promise<Resident[]> {
    return structuredClone(
      this.residents.get(key(workspaceId, seasonId)) ?? [],
    );
  }

  async getResident(
    workspaceId: string,
    seasonId: string,
    residentId: string,
  ): Promise<Resident | null> {
    const resident = this.residents
      .get(key(workspaceId, seasonId))
      ?.find((candidate) => candidate.id === residentId);
    return resident ? structuredClone(resident) : null;
  }

  async listCohorts(
    workspaceId: string,
    seasonId: string,
  ): Promise<CohortCell[]> {
    return structuredClone(
      this.cohorts.get(key(workspaceId, seasonId)) ?? [],
    );
  }

  async listEvents(
    workspaceId: string,
    seasonId: string,
    afterCursor = 0,
    limit = 1_000,
  ): Promise<WorldEvent[]> {
    return structuredClone(
      (this.events.get(key(workspaceId, seasonId)) ?? [])
        .filter((event) => event.cursor > afterCursor)
        .slice(0, Math.max(1, limit)),
    );
  }

  async listTurns(
    workspaceId: string,
    seasonId: string,
  ): Promise<WorldTurn[]> {
    return structuredClone(
      this.turns.get(key(workspaceId, seasonId)) ?? [],
    );
  }

  async listRelationships(
    workspaceId: string,
    seasonId: string,
  ): Promise<Relationship[]> {
    return structuredClone(
      this.relationships.get(key(workspaceId, seasonId)) ?? [],
    );
  }

  async listCommitments(
    workspaceId: string,
    seasonId: string,
  ): Promise<Commitment[]> {
    return structuredClone(
      this.commitments.get(key(workspaceId, seasonId)) ?? [],
    );
  }

  async listReciprocalEpisodes(
    workspaceId: string,
    seasonId: string,
  ): Promise<ReciprocalEpisode[]> {
    return structuredClone(
      this.episodes.get(key(workspaceId, seasonId)) ?? [],
    );
  }

  async listCognitiveDecisions(
    workspaceId: string,
    seasonId: string,
  ): Promise<CognitiveDecision[]> {
    return structuredClone(
      this.decisions.get(key(workspaceId, seasonId)) ?? [],
    );
  }

  async commitTurn(input: CommitWorldTurnInput): Promise<WorldTurn> {
    const scope = key(input.season.workspaceId, input.season.id);
    const current = this.seasons.get(scope);
    const existingTurns = this.turns.get(scope);
    const snapshots = this.snapshots.get(scope);
    const existingEvents = this.events.get(scope);
    if (
      !current ||
      !existingTurns ||
      !snapshots ||
      !existingEvents ||
      current.currentTurn !== input.expectedTurn ||
      input.turn.turn !== input.expectedTurn + 1 ||
      input.season.currentTurn !== input.turn.turn ||
      snapshots.has(input.turn.turn)
    ) {
      throw new ExperimentConflictError(
        `World season ${input.season.id} turn conflict`,
      );
    }
    const eventIds = new Set(existingEvents.map((event) => event.id));
    if (input.events.some((event) => eventIds.has(event.id))) {
      throw new ExperimentConflictError("World event id already exists");
    }
    const cursor = existingEvents.at(-1)?.cursor ?? 0;
    const committedEvents = input.events.map((event, index) => ({
      ...structuredClone(event),
      cursor: cursor + index + 1,
    }));
    const committedSnapshot = {
      ...structuredClone(input.snapshot),
      eventCursor: cursor + committedEvents.length,
    };
    this.seasons.set(scope, structuredClone(input.season));
    existingTurns.push(structuredClone(input.turn));
    snapshots.set(input.turn.turn, committedSnapshot);
    existingEvents.push(...committedEvents);
    this.relationships.set(
      scope,
      structuredClone(input.relationships),
    );
    this.commitments.set(scope, structuredClone(input.commitments));
    this.episodes.set(
      scope,
      structuredClone(input.reciprocalEpisodes),
    );
    this.decisions
      .get(scope)
      ?.push(...structuredClone(input.cognitiveDecisions));
    return structuredClone(input.turn);
  }
}
