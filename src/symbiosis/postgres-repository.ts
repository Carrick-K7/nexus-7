import {
  Pool,
  type PoolClient,
} from "pg";
import {
  ExperimentConflictError,
} from "@/experiments/errors";
import type {
  CohortCell,
  CognitiveDecision,
  Commitment,
  NeedState,
  ReciprocalEpisode,
  Relationship,
  Resident,
  WorldEvent,
  WorldSeason,
  WorldSnapshot,
  WorldTurn,
} from "./contracts";
import {
  initializeSymbiosisSchema,
} from "./postgres-schema";
import type {
  CommitWorldTurnInput,
  WorldRepository,
} from "./repository";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function insertTurn(
  client: PoolClient,
  turn: WorldTurn,
  snapshot: WorldSnapshot,
): Promise<void> {
  await client.query(
    `INSERT INTO nexus_world_turns
      (season_id, turn, simulation_date, status, fingerprint,
       previous_fingerprint, turn_json, snapshot_json, settled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
    [
      turn.seasonId,
      turn.turn,
      turn.simulationDate,
      turn.status,
      turn.fingerprint,
      turn.previousFingerprint,
      JSON.stringify(turn),
      JSON.stringify(snapshot),
      turn.settledAt,
    ],
  );
}

async function insertResidentStates(
  client: PoolClient,
  states: NeedState[],
): Promise<void> {
  for (const state of states) {
    await client.query(
      `INSERT INTO nexus_world_resident_state_snapshots
        (season_id, turn, resident_id, state_json, recorded_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        state.seasonId,
        state.turn,
        state.residentId,
        JSON.stringify(state),
        state.recordedAt,
      ],
    );
  }
}

export class PostgresWorldRepository implements WorldRepository {
  readonly backend = "postgres" as const;
  private readonly pool: Pool;
  private readonly ownsPool: boolean;

  constructor(connection: string | Pool) {
    this.ownsPool = typeof connection === "string";
    this.pool =
      typeof connection === "string"
        ? new Pool({ connectionString: connection })
        : connection;
  }

  async initialize(): Promise<void> {
    await initializeSymbiosisSchema(this.pool);
  }

  async close(): Promise<void> {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  async createSeason(input: {
    season: WorldSeason;
    initialTurn: WorldTurn;
    initialSnapshot: WorldSnapshot;
    residents: Resident[];
    cohorts: CohortCell[];
  }): Promise<WorldSeason> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO nexus_world_seasons
          (id, organization_id, workspace_id, status, experiment_version,
           seed, distribution_version, time_zone, start_date, current_turn,
           data_bundle_id, season_json, created_at, updated_at)
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
           $13, $14
         )`,
        [
          input.season.id,
          input.season.organizationId,
          input.season.workspaceId,
          input.season.status,
          input.season.experimentVersion,
          input.season.seed,
          input.season.distributionVersion,
          input.season.timeZone,
          input.season.startDate,
          input.season.currentTurn,
          input.season.dataBundle.id,
          JSON.stringify(input.season),
          input.season.createdAt,
          input.season.updatedAt,
        ],
      );
      for (const resident of input.residents) {
        await client.query(
          `INSERT INTO nexus_world_residents
            (season_id, id, workspace_id, kind, community_id,
             resident_json, created_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
          [
            input.season.id,
            resident.id,
            input.season.workspaceId,
            resident.kind,
            resident.communityId,
            JSON.stringify(resident),
            resident.createdAt,
          ],
        );
      }
      for (const cohort of input.cohorts) {
        await client.query(
          `INSERT INTO nexus_world_cohort_cells
            (season_id, id, district_code, population, cohort_json)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [
            cohort.seasonId,
            cohort.id,
            cohort.districtCode,
            cohort.population,
            JSON.stringify(cohort),
          ],
        );
      }
      for (const relationship of input.initialSnapshot.relationships) {
        await client.query(
          `INSERT INTO nexus_world_relationships
            (season_id, id, revision, consent_state, relationship_json)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [
            relationship.seasonId,
            relationship.id,
            relationship.revision,
            relationship.consentState,
            JSON.stringify(relationship),
          ],
        );
      }
      await insertTurn(client, input.initialTurn, input.initialSnapshot);
      await insertResidentStates(
        client,
        input.initialSnapshot.residentStates,
      );
      await client.query("COMMIT");
      return structuredClone(input.season);
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) {
        throw new ExperimentConflictError(
          `World season ${input.season.id} already exists`,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getSeason(
    workspaceId: string,
    seasonId: string,
  ): Promise<WorldSeason | null> {
    const result = await this.pool.query<{ season_json: WorldSeason }>(
      `SELECT season_json
       FROM nexus_world_seasons
       WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, seasonId],
    );
    return result.rows[0]?.season_json ?? null;
  }

  async getSnapshot(
    workspaceId: string,
    seasonId: string,
    turn?: number,
  ): Promise<WorldSnapshot | null> {
    const result = await this.pool.query<{ snapshot_json: WorldSnapshot }>(
      `SELECT world_turn.snapshot_json
       FROM nexus_world_turns AS world_turn
       INNER JOIN nexus_world_seasons AS season
         ON season.id = world_turn.season_id
       WHERE season.workspace_id = $1
         AND world_turn.season_id = $2
         AND ($3::integer IS NULL OR world_turn.turn = $3)
       ORDER BY world_turn.turn DESC
       LIMIT 1`,
      [workspaceId, seasonId, turn ?? null],
    );
    return result.rows[0]?.snapshot_json ?? null;
  }

  async listResidents(
    workspaceId: string,
    seasonId: string,
  ): Promise<Resident[]> {
    const result = await this.pool.query<{ resident_json: Resident }>(
      `SELECT resident_json
       FROM nexus_world_residents
       WHERE workspace_id = $1 AND season_id = $2
       ORDER BY id`,
      [workspaceId, seasonId],
    );
    return result.rows.map((row) => row.resident_json);
  }

  async getResident(
    workspaceId: string,
    seasonId: string,
    residentId: string,
  ): Promise<Resident | null> {
    const result = await this.pool.query<{ resident_json: Resident }>(
      `SELECT resident_json
       FROM nexus_world_residents
       WHERE workspace_id = $1 AND season_id = $2 AND id = $3`,
      [workspaceId, seasonId, residentId],
    );
    return result.rows[0]?.resident_json ?? null;
  }

  async listCohorts(
    workspaceId: string,
    seasonId: string,
  ): Promise<CohortCell[]> {
    const result = await this.pool.query<{ cohort_json: CohortCell }>(
      `SELECT cohort.cohort_json
       FROM nexus_world_cohort_cells AS cohort
       INNER JOIN nexus_world_seasons AS season
         ON season.id = cohort.season_id
       WHERE season.workspace_id = $1 AND cohort.season_id = $2
       ORDER BY cohort.id`,
      [workspaceId, seasonId],
    );
    return result.rows.map((row) => row.cohort_json);
  }

  async listEvents(
    workspaceId: string,
    seasonId: string,
    afterCursor = 0,
    limit = 1_000,
  ): Promise<WorldEvent[]> {
    const result = await this.pool.query<{
      season_cursor: number;
      event_json: Omit<WorldEvent, "cursor">;
    }>(
      `SELECT season_cursor, event_json
       FROM nexus_world_events
       WHERE workspace_id = $1
         AND season_id = $2
         AND season_cursor > $3
       ORDER BY season_cursor
       LIMIT $4`,
      [workspaceId, seasonId, afterCursor, Math.max(1, limit)],
    );
    return result.rows.map((row) => ({
      ...row.event_json,
      cursor: Number(row.season_cursor),
    }));
  }

  async listTurns(
    workspaceId: string,
    seasonId: string,
  ): Promise<WorldTurn[]> {
    const result = await this.pool.query<{ turn_json: WorldTurn }>(
      `SELECT world_turn.turn_json
       FROM nexus_world_turns AS world_turn
       INNER JOIN nexus_world_seasons AS season
         ON season.id = world_turn.season_id
       WHERE season.workspace_id = $1 AND world_turn.season_id = $2
       ORDER BY world_turn.turn`,
      [workspaceId, seasonId],
    );
    return result.rows.map((row) => row.turn_json);
  }

  async listRelationships(
    workspaceId: string,
    seasonId: string,
  ): Promise<Relationship[]> {
    const result = await this.pool.query<{
      relationship_json: Relationship;
    }>(
      `SELECT relationship.relationship_json
       FROM nexus_world_relationships AS relationship
       INNER JOIN nexus_world_seasons AS season
         ON season.id = relationship.season_id
       WHERE season.workspace_id = $1 AND relationship.season_id = $2
       ORDER BY relationship.id`,
      [workspaceId, seasonId],
    );
    return result.rows.map((row) => row.relationship_json);
  }

  async listCommitments(
    workspaceId: string,
    seasonId: string,
  ): Promise<Commitment[]> {
    const result = await this.pool.query<{
      commitment_json: Commitment;
    }>(
      `SELECT commitment.commitment_json
       FROM nexus_world_commitments AS commitment
       INNER JOIN nexus_world_seasons AS season
         ON season.id = commitment.season_id
       WHERE season.workspace_id = $1 AND commitment.season_id = $2
       ORDER BY commitment.id`,
      [workspaceId, seasonId],
    );
    return result.rows.map((row) => row.commitment_json);
  }

  async listReciprocalEpisodes(
    workspaceId: string,
    seasonId: string,
  ): Promise<ReciprocalEpisode[]> {
    const result = await this.pool.query<{
      episode_json: ReciprocalEpisode;
    }>(
      `SELECT episode.episode_json
       FROM nexus_world_reciprocal_episodes AS episode
       INNER JOIN nexus_world_seasons AS season
         ON season.id = episode.season_id
       WHERE season.workspace_id = $1 AND episode.season_id = $2
       ORDER BY episode.opened_turn, episode.id`,
      [workspaceId, seasonId],
    );
    return result.rows.map((row) => row.episode_json);
  }

  async listCognitiveDecisions(
    workspaceId: string,
    seasonId: string,
  ): Promise<CognitiveDecision[]> {
    const result = await this.pool.query<{
      decision_json: CognitiveDecision;
    }>(
      `SELECT decision.decision_json
       FROM nexus_world_model_decisions AS decision
       INNER JOIN nexus_world_seasons AS season
         ON season.id = decision.season_id
       WHERE season.workspace_id = $1 AND decision.season_id = $2
       ORDER BY decision.turn, decision.id`,
      [workspaceId, seasonId],
    );
    return result.rows.map((row) => row.decision_json);
  }

  async commitTurn(input: CommitWorldTurnInput): Promise<WorldTurn> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE nexus_world_seasons
         SET status = $1,
             current_turn = $2,
             season_json = $3::jsonb,
             updated_at = $4
         WHERE id = $5
           AND workspace_id = $6
           AND current_turn = $7`,
        [
          input.season.status,
          input.season.currentTurn,
          JSON.stringify(input.season),
          input.season.updatedAt,
          input.season.id,
          input.season.workspaceId,
          input.expectedTurn,
        ],
      );
      if (
        updated.rowCount !== 1 ||
        input.turn.turn !== input.expectedTurn + 1
      ) {
        throw new ExperimentConflictError(
          `World season ${input.season.id} turn conflict`,
        );
      }
      await insertTurn(client, input.turn, input.snapshot);
      await insertResidentStates(client, input.snapshot.residentStates);
      for (const ledger of input.ledgers) {
        await client.query(
          `INSERT INTO nexus_world_resource_ledgers
            (season_id, turn, id, community_id, resource_code, conserved,
             ledger_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            ledger.seasonId,
            ledger.turn,
            ledger.id,
            ledger.communityId,
            ledger.resource,
            ledger.conserved,
            JSON.stringify(ledger),
          ],
        );
      }
      for (let index = 0; index < input.events.length; index += 1) {
        const event = input.events[index];
        const seasonCursor = input.snapshot.eventCursor -
          input.events.length + index + 1;
        await client.query(
          `INSERT INTO nexus_world_events
            (season_id, season_cursor, id, workspace_id, turn, layer, type,
             event_json, occurred_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
          [
            event.seasonId,
            seasonCursor,
            event.id,
            event.workspaceId,
            event.turn,
            event.layer,
            event.type,
            JSON.stringify(event),
            event.occurredAt,
          ],
        );
      }
      for (const relationship of input.relationships) {
        await client.query(
          `INSERT INTO nexus_world_relationships
            (season_id, id, revision, consent_state, relationship_json)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (season_id, id) DO UPDATE
           SET revision = EXCLUDED.revision,
               consent_state = EXCLUDED.consent_state,
               relationship_json = EXCLUDED.relationship_json`,
          [
            relationship.seasonId,
            relationship.id,
            relationship.revision,
            relationship.consentState,
            JSON.stringify(relationship),
          ],
        );
      }
      for (const commitment of input.commitments) {
        await client.query(
          `INSERT INTO nexus_world_commitments
            (season_id, id, revision, status, commitment_json)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (season_id, id) DO UPDATE
           SET revision = EXCLUDED.revision,
               status = EXCLUDED.status,
               commitment_json = EXCLUDED.commitment_json`,
          [
            commitment.seasonId,
            commitment.id,
            commitment.revision,
            commitment.status,
            JSON.stringify(commitment),
          ],
        );
      }
      for (const episode of input.reciprocalEpisodes) {
        await client.query(
          `INSERT INTO nexus_world_reciprocal_episodes
            (season_id, id, relationship_id, opened_turn, resolved_turn,
             outcome, forced, episode_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
           ON CONFLICT (season_id, id) DO UPDATE
           SET resolved_turn = EXCLUDED.resolved_turn,
               outcome = EXCLUDED.outcome,
               forced = EXCLUDED.forced,
               episode_json = EXCLUDED.episode_json`,
          [
            episode.seasonId,
            episode.id,
            episode.relationshipId,
            episode.openedTurn,
            episode.resolvedTurn ?? null,
            episode.outcome,
            episode.forced,
            JSON.stringify(episode),
          ],
        );
      }
      for (const decision of input.cognitiveDecisions) {
        await client.query(
          `INSERT INTO nexus_world_model_decisions
            (season_id, turn, id, resident_id, provider, model,
             reasoning_content_stored, decision_json, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7::jsonb, $8)`,
          [
            decision.seasonId,
            decision.turn,
            decision.id,
            decision.residentId,
            decision.provider,
            decision.model,
            JSON.stringify(decision),
            input.turn.settledAt,
          ],
        );
      }
      await client.query("COMMIT");
      return structuredClone(input.turn);
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) {
        throw new ExperimentConflictError(
          `World season ${input.season.id} turn already exists`,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
