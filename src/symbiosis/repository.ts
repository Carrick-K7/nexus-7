import type {
  CohortCell,
  CognitiveDecision,
  Commitment,
  NewWorldEvent,
  ReciprocalEpisode,
  Relationship,
  Resident,
  ResourceLedgerEntry,
  WorldEvent,
  WorldSeason,
  WorldSnapshot,
  WorldTurn,
} from "./contracts";

export type WorldStorageBackend = "memory" | "postgres";

export interface CommitWorldTurnInput {
  expectedTurn: number;
  season: WorldSeason;
  turn: WorldTurn;
  snapshot: WorldSnapshot;
  ledgers: ResourceLedgerEntry[];
  events: NewWorldEvent[];
  relationships: Relationship[];
  commitments: Commitment[];
  reciprocalEpisodes: ReciprocalEpisode[];
  cognitiveDecisions: CognitiveDecision[];
}

export interface WorldRepository {
  readonly backend: WorldStorageBackend;
  initialize(): Promise<void>;
  close(): Promise<void>;
  createSeason(input: {
    season: WorldSeason;
    initialTurn: WorldTurn;
    initialSnapshot: WorldSnapshot;
    residents: Resident[];
    cohorts: CohortCell[];
  }): Promise<WorldSeason>;
  getSeason(
    workspaceId: string,
    seasonId: string,
  ): Promise<WorldSeason | null>;
  getSnapshot(
    workspaceId: string,
    seasonId: string,
    turn?: number,
  ): Promise<WorldSnapshot | null>;
  listResidents(
    workspaceId: string,
    seasonId: string,
  ): Promise<Resident[]>;
  listCohorts(
    workspaceId: string,
    seasonId: string,
  ): Promise<CohortCell[]>;
  getResident(
    workspaceId: string,
    seasonId: string,
    residentId: string,
  ): Promise<Resident | null>;
  listEvents(
    workspaceId: string,
    seasonId: string,
    afterCursor?: number,
    limit?: number,
  ): Promise<WorldEvent[]>;
  listTurns(
    workspaceId: string,
    seasonId: string,
  ): Promise<WorldTurn[]>;
  listRelationships(
    workspaceId: string,
    seasonId: string,
  ): Promise<Relationship[]>;
  listCommitments(
    workspaceId: string,
    seasonId: string,
  ): Promise<Commitment[]>;
  listReciprocalEpisodes(
    workspaceId: string,
    seasonId: string,
  ): Promise<ReciprocalEpisode[]>;
  listCognitiveDecisions(
    workspaceId: string,
    seasonId: string,
  ): Promise<CognitiveDecision[]>;
  commitTurn(input: CommitWorldTurnInput): Promise<WorldTurn>;
}
