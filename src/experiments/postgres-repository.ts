import {
  Pool,
  type PoolClient,
  type QueryResultRow,
} from "pg";
import {
  ExperimentConflictError,
} from "./errors";
import {
  initializeExperimentSchema,
} from "./postgres-schema";
import type {
  CommitRunRecord,
  CreateRunRecord,
  ExperimentRepository,
} from "./repository";
import type {
  ExperimentAuditRecord,
  ExperimentEventRecord,
  ExperimentRun,
  ExperimentSession,
  ExperimentSnapshot,
  ExperimentWorkerLease,
  ExperimentWorkspace,
} from "./types";
import type {
  ImprovementProposal,
  IterationDecisionRecord,
} from "@/iteration/types";
import type {
  AccessReviewCampaign,
  AccessReviewItem,
  BreakGlassRequest,
  DelegatedAdministrationGrant,
  GovernanceAuditRecord,
  GovernanceEvidenceRecord,
  GovernanceOrganization,
  GovernedWorkspace,
  ReleasePolicyRecord,
  ServiceAccount,
  WorkspaceMembership,
} from "@/governance/types";
import type {
  AlertSuppression,
  AlertOccurrence,
  AlertRule,
  MaintenanceWindow,
  NotificationChannel,
  NotificationDelivery,
  NotificationEscalationPolicy,
  NotificationReceipt,
  OperationalIncident,
  OperationsListQuery,
  SloSample,
  SloSampleQuery,
} from "@/operations/intelligence-types";
import {
  LIFECYCLE_EVENT_SCHEMA_VERSION,
  type CommitLifecycleRecordInput,
  type CreateLifecycleRecordInput,
  type LifecycleEvent,
  type LifecycleEventQuery,
  type LifecycleRecord,
  type LifecycleRecordQuery,
  type NewLifecycleEvent,
} from "@/lifecycle";

function assertLifecycleInput(
  record: LifecycleRecord,
  event: NewLifecycleEvent,
  expectedRevision?: number,
): void {
  if (
    event.aggregateId !== record.id ||
    event.organizationId !== record.organizationId ||
    event.workspaceId !== record.workspaceId ||
    event.aggregateKind !== record.kind ||
    event.schemaVersion !== LIFECYCLE_EVENT_SCHEMA_VERSION ||
    (
      expectedRevision === undefined
        ? record.revision !== 1
        : record.revision !== expectedRevision + 1
    )
  ) {
    throw new ExperimentConflictError(
      `Lifecycle record ${record.id} envelope is inconsistent`,
    );
  }
}

interface RunRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  session_id: string;
  name: string;
  status: ExperimentRun["status"];
  version: number;
  parent_run_id: string | null;
  forked_from_tick: number | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  run_json: ExperimentRun["run"];
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function optionalTimestamp(
  value: Date | string | null,
): string | undefined {
  return value === null ? undefined : timestamp(value);
}

function mapRun(row: RunRow): ExperimentRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    name: row.name,
    status: row.status,
    version: row.version,
    parentRunId: row.parent_run_id ?? undefined,
    forkedFromTick: row.forked_from_tick ?? undefined,
    createdBy: row.created_by,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    run: row.run_json,
  };
}

async function insertSnapshot(
  client: PoolClient,
  snapshot: ExperimentSnapshot,
): Promise<void> {
  await client.query(
    `INSERT INTO nexus_run_snapshots
      (id, run_id, tick, version, fingerprint, run_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      snapshot.id,
      snapshot.runId,
      snapshot.tick,
      snapshot.version,
      snapshot.fingerprint,
      JSON.stringify(snapshot.run),
      snapshot.createdAt,
    ],
  );
}

async function insertAudit(
  client: PoolClient,
  audit: ExperimentAuditRecord,
): Promise<void> {
  await client.query(
    `INSERT INTO nexus_audit_log
      (id, workspace_id, run_id, actor_id, role, action, detail_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      audit.id,
      audit.workspaceId,
      audit.runId ?? null,
      audit.actorId,
      audit.role,
      audit.action,
      JSON.stringify(audit.detail),
      audit.createdAt,
    ],
  );
}

async function insertIterationDecision(
  client: PoolClient,
  decision: Omit<IterationDecisionRecord, "cursor">,
): Promise<void> {
  await client.query(
    `INSERT INTO nexus_iteration_decisions
      (id, proposal_id, type, actor_id, role, detail_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      decision.id,
      decision.proposalId,
      decision.type,
      decision.actorId,
      decision.role,
      JSON.stringify(decision.detail),
      decision.createdAt,
    ],
  );
}

export class PostgresExperimentRepository implements ExperimentRepository {
  readonly backend = "postgres" as const;
  private readonly pool: Pool;

  constructor(connection: string | Pool) {
    this.pool =
      typeof connection === "string"
        ? new Pool({ connectionString: connection })
        : connection;
  }

  async initialize(): Promise<void> {
    await initializeExperimentSchema(this.pool);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ensureWorkspace(
    workspace: ExperimentWorkspace,
  ): Promise<ExperimentWorkspace> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      created_at: Date | string;
    }>(
      `INSERT INTO nexus_workspaces (id, name, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, created_at`,
      [workspace.id, workspace.name, workspace.createdAt],
    );
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      createdAt: timestamp(row.created_at),
    };
  }

  async ensureSession(
    session: ExperimentSession,
  ): Promise<ExperimentSession> {
    const result = await this.pool.query<{
      id: string;
      workspace_id: string;
      name: string;
      created_by: string;
      created_at: Date | string;
    }>(
      `INSERT INTO nexus_sessions
        (id, workspace_id, name, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, workspace_id, name, created_by, created_at`,
      [
        session.id,
        session.workspaceId,
        session.name,
        session.createdBy,
        session.createdAt,
      ],
    );
    const row = result.rows[0];
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: timestamp(row.created_at),
    };
  }

  async createRun(record: CreateRunRecord): Promise<ExperimentRun> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO nexus_runs
          (id, workspace_id, session_id, name, status, version, parent_run_id,
           forked_from_tick, created_by, created_at, updated_at, run_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
        [
          record.run.id,
          record.run.workspaceId,
          record.run.sessionId,
          record.run.name,
          record.run.status,
          record.run.version,
          record.run.parentRunId ?? null,
          record.run.forkedFromTick ?? null,
          record.run.createdBy,
          record.run.createdAt,
          record.run.updatedAt,
          JSON.stringify(record.run.run),
        ],
      );

      for (const event of record.initialEvents ?? []) {
        await client.query(
          `INSERT INTO nexus_run_events
            (run_id, tick, event_json, recorded_at)
           VALUES ($1, $2, $3::jsonb, $4)`,
          [
            record.run.id,
            event.tick,
            JSON.stringify(event),
            record.run.createdAt,
          ],
        );
      }
      await insertSnapshot(client, record.snapshot);
      await insertAudit(client, record.audit);
      await client.query("COMMIT");
      return structuredClone(record.run);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async commitRun(record: CommitRunRecord): Promise<ExperimentRun> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const update = await client.query(
        `UPDATE nexus_runs
         SET name = $1, status = $2, version = $3, parent_run_id = $4,
             forked_from_tick = $5, updated_at = $6, run_json = $7::jsonb
         WHERE id = $8 AND version = $9`,
        [
          record.run.name,
          record.run.status,
          record.run.version,
          record.run.parentRunId ?? null,
          record.run.forkedFromTick ?? null,
          record.run.updatedAt,
          JSON.stringify(record.run.run),
          record.run.id,
          record.expectedVersion,
        ],
      );
      if (update.rowCount !== 1) {
        throw new ExperimentConflictError(
          `Run ${record.run.id} changed; expected version ${record.expectedVersion}`,
        );
      }

      for (const event of record.newEvents) {
        await client.query(
          `INSERT INTO nexus_run_events
            (run_id, tick, event_json, recorded_at)
           VALUES ($1, $2, $3::jsonb, $4)`,
          [
            record.run.id,
            event.tick,
            JSON.stringify(event),
            record.run.updatedAt,
          ],
        );
      }
      if (record.snapshot) {
        await insertSnapshot(client, record.snapshot);
      }
      await insertAudit(client, record.audit);
      await client.query("COMMIT");
      return structuredClone(record.run);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getRun(runId: string): Promise<ExperimentRun | null> {
    const result = await this.pool.query<RunRow>(
      "SELECT * FROM nexus_runs WHERE id = $1",
      [runId],
    );
    return result.rows[0] ? mapRun(result.rows[0]) : null;
  }

  async listRuns(workspaceId: string): Promise<ExperimentRun[]> {
    const result = await this.pool.query<RunRow>(
      `SELECT * FROM nexus_runs
       WHERE workspace_id = $1
       ORDER BY updated_at DESC, id DESC`,
      [workspaceId],
    );
    return result.rows.map(mapRun);
  }

  async listRunningRuns(): Promise<ExperimentRun[]> {
    const result = await this.pool.query<RunRow>(
      `SELECT * FROM nexus_runs
       WHERE status = 'running'
       ORDER BY id ASC`,
    );
    return result.rows.map(mapRun);
  }

  async listEvents(
    runId: string,
    afterCursor = 0,
  ): Promise<ExperimentEventRecord[]> {
    const result = await this.pool.query<{
      event_cursor: string | number;
      run_id: string;
      tick: number;
      event_json: ExperimentEventRecord["event"];
      recorded_at: Date | string;
    }>(
      `SELECT event_cursor, run_id, tick, event_json, recorded_at
       FROM nexus_run_events
       WHERE run_id = $1 AND event_cursor > $2
       ORDER BY event_cursor ASC`,
      [runId, afterCursor],
    );
    return result.rows.map((row) => ({
      cursor: Number(row.event_cursor),
      runId: row.run_id,
      tick: row.tick,
      event: row.event_json,
      recordedAt: timestamp(row.recorded_at),
    }));
  }

  async listSnapshots(runId: string): Promise<ExperimentSnapshot[]> {
    const result = await this.pool.query<{
      id: string;
      run_id: string;
      tick: number;
      version: number;
      fingerprint: string;
      run_json: ExperimentSnapshot["run"];
      created_at: Date | string;
    }>(
      `SELECT id, run_id, tick, version, fingerprint, run_json, created_at
       FROM nexus_run_snapshots
       WHERE run_id = $1
       ORDER BY tick ASC, version ASC`,
      [runId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      tick: row.tick,
      version: row.version,
      fingerprint: row.fingerprint,
      run: row.run_json,
      createdAt: timestamp(row.created_at),
    }));
  }

  async listAudit(runId: string): Promise<ExperimentAuditRecord[]> {
    const result = await this.pool.query<{
      id: string;
      workspace_id: string;
      run_id: string | null;
      actor_id: string;
      role: ExperimentAuditRecord["role"];
      action: ExperimentAuditRecord["action"];
      detail_json: Record<string, unknown>;
      created_at: Date | string;
    }>(
      `SELECT id, workspace_id, run_id, actor_id, role, action, detail_json,
              created_at
       FROM nexus_audit_log
       WHERE run_id = $1
       ORDER BY created_at ASC, id ASC`,
      [runId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      runId: row.run_id ?? undefined,
      actorId: row.actor_id,
      role: row.role,
      action: row.action,
      detail: row.detail_json,
      createdAt: timestamp(row.created_at),
    }));
  }

  async acquireWorkerLease(
    name: string,
    ownerId: string,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.pool.query<{ name: string }>(
      `INSERT INTO nexus_worker_leases
        (name, owner_id, heartbeat_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + ($3 * INTERVAL '1 millisecond'))
       ON CONFLICT (name) DO UPDATE
       SET owner_id = EXCLUDED.owner_id,
           heartbeat_at = EXCLUDED.heartbeat_at,
           expires_at = EXCLUDED.expires_at
       WHERE nexus_worker_leases.owner_id = EXCLUDED.owner_id
          OR nexus_worker_leases.expires_at <= NOW()
       RETURNING name`,
      [name, ownerId, ttlMs],
    );
    return result.rowCount === 1;
  }

  async releaseWorkerLease(name: string, ownerId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM nexus_worker_leases
       WHERE name = $1 AND owner_id = $2`,
      [name, ownerId],
    );
  }

  async getWorkerLease(
    name: string,
  ): Promise<ExperimentWorkerLease | null> {
    const result = await this.pool.query<{
      name: string;
      owner_id: string;
      heartbeat_at: Date | string;
      expires_at: Date | string;
    }>(
      `SELECT name, owner_id, heartbeat_at, expires_at
       FROM nexus_worker_leases
       WHERE name = $1`,
      [name],
    );
    const row = result.rows[0];
    return row
      ? {
          name: row.name,
          ownerId: row.owner_id,
          heartbeatAt: timestamp(row.heartbeat_at),
          expiresAt: timestamp(row.expires_at),
        }
      : null;
  }

  async createImprovement(
    proposal: ImprovementProposal,
    decision: Omit<IterationDecisionRecord, "cursor">,
  ): Promise<ImprovementProposal> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO nexus_improvement_proposals
          (id, workspace_id, source_run_id, status, revision, proposal_json,
           created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [
          proposal.id,
          proposal.workspaceId,
          proposal.sourceRunId,
          proposal.status,
          proposal.revision,
          JSON.stringify(proposal),
          proposal.createdAt,
          proposal.updatedAt,
        ],
      );
      await insertIterationDecision(client, decision);
      await client.query("COMMIT");
      return structuredClone(proposal);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async commitImprovement(
    proposal: ImprovementProposal,
    expectedRevision: number,
    decision: Omit<IterationDecisionRecord, "cursor">,
  ): Promise<ImprovementProposal> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const update = await client.query(
        `UPDATE nexus_improvement_proposals
         SET status = $1, revision = $2, proposal_json = $3::jsonb,
             updated_at = $4
         WHERE id = $5 AND revision = $6`,
        [
          proposal.status,
          proposal.revision,
          JSON.stringify(proposal),
          proposal.updatedAt,
          proposal.id,
          expectedRevision,
        ],
      );
      if (update.rowCount !== 1) {
        throw new ExperimentConflictError(
          `Improvement ${proposal.id} changed; expected revision ${expectedRevision}`,
        );
      }
      await insertIterationDecision(client, decision);
      await client.query("COMMIT");
      return structuredClone(proposal);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getImprovement(
    proposalId: string,
  ): Promise<ImprovementProposal | null> {
    const result = await this.pool.query<{
      proposal_json: ImprovementProposal;
    }>(
      `SELECT proposal_json
       FROM nexus_improvement_proposals
       WHERE id = $1`,
      [proposalId],
    );
    return result.rows[0]?.proposal_json ?? null;
  }

  async listImprovements(
    workspaceId: string,
  ): Promise<ImprovementProposal[]> {
    const result = await this.pool.query<{
      proposal_json: ImprovementProposal;
    }>(
      `SELECT proposal_json
       FROM nexus_improvement_proposals
       WHERE workspace_id = $1
       ORDER BY updated_at DESC, id DESC`,
      [workspaceId],
    );
    return result.rows.map((row) => row.proposal_json);
  }

  async listIterationDecisions(
    proposalId: string,
  ): Promise<IterationDecisionRecord[]> {
    const result = await this.pool.query<{
      decision_cursor: string | number;
      id: string;
      proposal_id: string;
      type: IterationDecisionRecord["type"];
      actor_id: string;
      role: IterationDecisionRecord["role"];
      detail_json: Record<string, unknown>;
      created_at: Date | string;
    }>(
      `SELECT decision_cursor, id, proposal_id, type, actor_id, role,
              detail_json, created_at
       FROM nexus_iteration_decisions
       WHERE proposal_id = $1
       ORDER BY decision_cursor ASC`,
      [proposalId],
    );
    return result.rows.map((row) => ({
      cursor: Number(row.decision_cursor),
      id: row.id,
      proposalId: row.proposal_id,
      type: row.type,
      actorId: row.actor_id,
      role: row.role,
      detail: row.detail_json,
      createdAt: timestamp(row.created_at),
    }));
  }

  async ensureOrganization(
    organization: GovernanceOrganization,
  ): Promise<GovernanceOrganization> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `INSERT INTO nexus_organizations
        (id, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at
       RETURNING id, name, created_at, updated_at`,
      [
        organization.id,
        organization.name,
        organization.createdAt,
        organization.updatedAt,
      ],
    );
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      createdAt: timestamp(row.created_at),
      updatedAt: timestamp(row.updated_at),
    };
  }

  async ensureGovernedWorkspace(
    workspace: GovernedWorkspace,
  ): Promise<GovernedWorkspace> {
    const result = await this.pool.query<{
      organization_id: string;
      workspace_id: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `INSERT INTO nexus_workspace_governance
        (organization_id, workspace_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id) DO UPDATE
       SET organization_id = EXCLUDED.organization_id,
           updated_at = EXCLUDED.updated_at
       RETURNING organization_id, workspace_id, created_at, updated_at`,
      [
        workspace.organizationId,
        workspace.workspaceId,
        workspace.createdAt,
        workspace.updatedAt,
      ],
    );
    const row = result.rows[0];
    return {
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      createdAt: timestamp(row.created_at),
      updatedAt: timestamp(row.updated_at),
    };
  }

  async getOrganization(
    organizationId: string,
  ): Promise<GovernanceOrganization | null> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT id, name, created_at, updated_at
       FROM nexus_organizations
       WHERE id = $1`,
      [organizationId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          name: row.name,
          createdAt: timestamp(row.created_at),
          updatedAt: timestamp(row.updated_at),
        }
      : null;
  }

  async getGovernedWorkspace(
    workspaceId: string,
  ): Promise<GovernedWorkspace | null> {
    const result = await this.pool.query<{
      organization_id: string;
      workspace_id: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT organization_id, workspace_id, created_at, updated_at
       FROM nexus_workspace_governance
       WHERE workspace_id = $1`,
      [workspaceId],
    );
    const row = result.rows[0];
    return row
      ? {
          organizationId: row.organization_id,
          workspaceId: row.workspace_id,
          createdAt: timestamp(row.created_at),
          updatedAt: timestamp(row.updated_at),
        }
      : null;
  }

  async upsertWorkspaceMembership(
    membership: WorkspaceMembership,
  ): Promise<WorkspaceMembership> {
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      workspace_id: string;
      issuer: string;
      subject: string;
      role: WorkspaceMembership["role"];
      status: WorkspaceMembership["status"];
      created_by: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `INSERT INTO nexus_workspace_memberships
        (id, organization_id, workspace_id, issuer, subject, role, status,
         created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (workspace_id, issuer, subject) DO UPDATE
       SET organization_id = EXCLUDED.organization_id,
           role = EXCLUDED.role,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at
       RETURNING id, organization_id, workspace_id, issuer, subject, role, status,
                 created_by, created_at, updated_at`,
      [
        membership.id,
        membership.organizationId,
        membership.workspaceId,
        membership.issuer,
        membership.subject,
        membership.role,
        membership.status,
        membership.createdBy,
        membership.createdAt,
        membership.updatedAt,
      ],
    );
    const row = result.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      issuer: row.issuer,
      subject: row.subject,
      role: row.role,
      status: row.status,
      createdBy: row.created_by,
      createdAt: timestamp(row.created_at),
      updatedAt: timestamp(row.updated_at),
    };
  }

  async getWorkspaceMembership(
    workspaceId: string,
    issuer: string,
    subject: string,
  ): Promise<WorkspaceMembership | null> {
    const memberships = await this.readWorkspaceMemberships(
      `WHERE workspace_id = $1 AND issuer = $2 AND subject = $3`,
      [workspaceId, issuer, subject],
    );
    return memberships[0] ?? null;
  }

  async listWorkspaceMemberships(
    workspaceId: string,
  ): Promise<WorkspaceMembership[]> {
    return this.readWorkspaceMemberships(
      `WHERE workspace_id = $1 ORDER BY subject ASC`,
      [workspaceId],
    );
  }

  private async readWorkspaceMemberships(
    suffix: string,
    parameters: unknown[],
  ): Promise<WorkspaceMembership[]> {
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      workspace_id: string;
      issuer: string;
      subject: string;
      role: WorkspaceMembership["role"];
      status: WorkspaceMembership["status"];
      created_by: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT id, organization_id, workspace_id, issuer, subject, role, status,
              created_by, created_at, updated_at
       FROM nexus_workspace_memberships
       ${suffix}`,
      parameters,
    );
    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      issuer: row.issuer,
      subject: row.subject,
      role: row.role,
      status: row.status,
      createdBy: row.created_by,
      createdAt: timestamp(row.created_at),
      updatedAt: timestamp(row.updated_at),
    }));
  }

  async createServiceAccount(
    account: ServiceAccount,
  ): Promise<ServiceAccount> {
    await this.pool.query(
      `INSERT INTO nexus_service_accounts
        (id, organization_id, workspace_id, name, issuer, subject, role, status,
         workload_kind, permission_grants_json, credential_version, revision,
         expires_at, last_used_at, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12,
               $13, $14, $15, $16, $17)`,
      [
        account.id,
        account.organizationId,
        account.workspaceId,
        account.name,
        account.issuer,
        account.subject,
        account.role,
        account.status,
        account.workloadKind,
        JSON.stringify(account.permissionGrants),
        account.credentialVersion,
        account.revision,
        account.expiresAt ?? null,
        account.lastUsedAt ?? null,
        account.createdBy,
        account.createdAt,
        account.updatedAt,
      ],
    );
    return structuredClone(account);
  }

  async updateServiceAccount(
    account: ServiceAccount,
    expectedRevision: number,
  ): Promise<ServiceAccount> {
    const result = await this.pool.query(
      `UPDATE nexus_service_accounts
       SET name = $1, role = $2, status = $3, workload_kind = $4,
           permission_grants_json = $5::jsonb, credential_version = $6,
           revision = $7, expires_at = $8, last_used_at = $9,
           updated_at = $10
       WHERE id = $11 AND revision = $12`,
      [
        account.name,
        account.role,
        account.status,
        account.workloadKind,
        JSON.stringify(account.permissionGrants),
        account.credentialVersion,
        account.revision,
        account.expiresAt ?? null,
        account.lastUsedAt ?? null,
        account.updatedAt,
        account.id,
        expectedRevision,
      ],
    );
    if (result.rowCount !== 1) {
      throw new ExperimentConflictError(
        `Service account ${account.id} changed; expected revision ${expectedRevision}`,
      );
    }
    return structuredClone(account);
  }

  async touchServiceAccount(
    accountId: string,
    lastUsedAt: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE nexus_service_accounts
       SET last_used_at = $1
       WHERE id = $2`,
      [lastUsedAt, accountId],
    );
  }

  async getServiceAccount(
    accountId: string,
  ): Promise<ServiceAccount | null> {
    const accounts = await this.readServiceAccounts(
      `WHERE id = $1`,
      [accountId],
    );
    return accounts[0] ?? null;
  }

  async getServiceAccountBySubject(
    workspaceId: string,
    issuer: string,
    subject: string,
  ): Promise<ServiceAccount | null> {
    const accounts = await this.readServiceAccounts(
      `WHERE workspace_id = $1 AND issuer = $2 AND subject = $3`,
      [workspaceId, issuer, subject],
    );
    return accounts[0] ?? null;
  }

  async listServiceAccounts(
    workspaceId: string,
  ): Promise<ServiceAccount[]> {
    return this.readServiceAccounts(
      `WHERE workspace_id = $1 ORDER BY name ASC, id ASC`,
      [workspaceId],
    );
  }

  private async readServiceAccounts(
    suffix: string,
    parameters: unknown[],
  ): Promise<ServiceAccount[]> {
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      workspace_id: string;
      name: string;
      issuer: string;
      subject: string;
      role: ServiceAccount["role"];
      status: ServiceAccount["status"];
      workload_kind: ServiceAccount["workloadKind"];
      permission_grants_json: ServiceAccount["permissionGrants"];
      credential_version: number;
      revision: number;
      expires_at: Date | string | null;
      last_used_at: Date | string | null;
      created_by: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT id, organization_id, workspace_id, name, issuer, subject, role, status,
              workload_kind, permission_grants_json, credential_version,
              revision, expires_at, last_used_at, created_by, created_at,
              updated_at
       FROM nexus_service_accounts
       ${suffix}`,
      parameters,
    );
    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      name: row.name,
      issuer: row.issuer,
      subject: row.subject,
      role: row.role,
      status: row.status,
      workloadKind: row.workload_kind,
      permissionGrants: row.permission_grants_json,
      credentialVersion: row.credential_version,
      revision: row.revision,
      expiresAt: optionalTimestamp(row.expires_at),
      lastUsedAt: optionalTimestamp(row.last_used_at),
      createdBy: row.created_by,
      createdAt: timestamp(row.created_at),
      updatedAt: timestamp(row.updated_at),
    }));
  }

  async appendGovernanceAudit(
    record: GovernanceAuditRecord,
  ): Promise<GovernanceAuditRecord> {
    const result = await this.pool.query<{
      audit_cursor: string | number;
    }>(
      `INSERT INTO nexus_governance_audit
        (id, organization_id, workspace_id, actor_id, principal_type, action,
         target_id, detail_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       RETURNING audit_cursor`,
      [
        record.id,
        record.organizationId,
        record.workspaceId,
        record.actorId,
        record.principalType,
        record.action,
        record.targetId,
        JSON.stringify(record.detail),
        record.createdAt,
      ],
    );
    return {
      ...structuredClone(record),
      cursor: Number(result.rows[0].audit_cursor),
    };
  }

  async listGovernanceAudit(
    workspaceId: string,
    limit = 100,
  ): Promise<GovernanceAuditRecord[]> {
    const result = await this.pool.query<{
      audit_cursor: string | number;
      id: string;
      organization_id: string;
      workspace_id: string;
      actor_id: string;
      principal_type: GovernanceAuditRecord["principalType"];
      action: GovernanceAuditRecord["action"];
      target_id: string;
      detail_json: Record<string, unknown>;
      created_at: Date | string;
    }>(
      `SELECT audit_cursor, id, organization_id, workspace_id, actor_id,
              principal_type, action, target_id, detail_json, created_at
       FROM nexus_governance_audit
       WHERE workspace_id = $1
       ORDER BY audit_cursor DESC
       LIMIT $2`,
      [workspaceId, Math.max(1, limit)],
    );
    return result.rows.map((row) => ({
      cursor: Number(row.audit_cursor),
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      actorId: row.actor_id,
      principalType: row.principal_type,
      action: row.action,
      targetId: row.target_id,
      detail: row.detail_json,
      createdAt: timestamp(row.created_at),
    }));
  }

  async storeGovernanceEvidence(
    record: GovernanceEvidenceRecord,
  ): Promise<GovernanceEvidenceRecord> {
    const result = await this.pool.query<{
      id: string;
    }>(
      `INSERT INTO nexus_governance_evidence
        (id, organization_id, workspace_id, kind, provider, repository,
         source_commit_sha, signer_workflow, run_id, subject_path,
         subject_sha256, passed, generated_at, verified_at, expires_at,
         ingested_by, ingested_at, summary_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               $14, $15, $16, $17, $18::jsonb)
       ON CONFLICT (workspace_id, kind, run_id, subject_sha256)
       DO UPDATE SET id = nexus_governance_evidence.id
       RETURNING id`,
      [
        record.id,
        record.organizationId,
        record.workspaceId,
        record.kind,
        record.provider,
        record.repository,
        record.sourceCommitSha,
        record.signerWorkflow,
        record.runId,
        record.subjectPath,
        record.subjectSha256,
        record.passed,
        record.generatedAt,
        record.verifiedAt,
        record.expiresAt,
        record.ingestedBy,
        record.ingestedAt,
        JSON.stringify(record.summary),
      ],
    );
    return (
      (await this.getGovernanceEvidence(result.rows[0].id)) ??
      structuredClone(record)
    );
  }

  async listGovernanceEvidence(
    workspaceId: string,
    limit = 100,
  ): Promise<GovernanceEvidenceRecord[]> {
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      workspace_id: string;
      kind: GovernanceEvidenceRecord["kind"];
      provider: GovernanceEvidenceRecord["provider"];
      repository: string;
      source_commit_sha: string;
      signer_workflow: string;
      run_id: string;
      subject_path: string;
      subject_sha256: string;
      passed: boolean;
      generated_at: Date | string;
      verified_at: Date | string;
      expires_at: Date | string;
      ingested_by: string;
      ingested_at: Date | string;
      summary_json: Record<string, unknown>;
    }>(
      `SELECT id, organization_id, workspace_id, kind, provider, repository,
              source_commit_sha, signer_workflow, run_id, subject_path,
              subject_sha256, passed, generated_at, verified_at, expires_at,
              ingested_by, ingested_at, summary_json
       FROM nexus_governance_evidence
       WHERE workspace_id = $1
       ORDER BY verified_at DESC, id DESC
       LIMIT $2`,
      [workspaceId, Math.max(1, limit)],
    );
    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      kind: row.kind,
      provider: row.provider,
      repository: row.repository,
      sourceCommitSha: row.source_commit_sha,
      signerWorkflow: row.signer_workflow,
      runId: row.run_id,
      subjectPath: row.subject_path,
      subjectSha256: row.subject_sha256,
      passed: row.passed,
      generatedAt: timestamp(row.generated_at),
      verifiedAt: timestamp(row.verified_at),
      expiresAt: timestamp(row.expires_at),
      ingestedBy: row.ingested_by,
      ingestedAt: timestamp(row.ingested_at),
      summary: row.summary_json,
    }));
  }

  private async getGovernanceEvidence(
    recordId: string,
  ): Promise<GovernanceEvidenceRecord | null> {
    const records = await this.pool.query<{
      workspace_id: string;
    }>(
      `SELECT workspace_id
       FROM nexus_governance_evidence
       WHERE id = $1`,
      [recordId],
    );
    const workspaceId = records.rows[0]?.workspace_id;
    if (!workspaceId) {
      return null;
    }
    return (
      (await this.listGovernanceEvidence(workspaceId, 1_000)).find(
        (record) => record.id === recordId,
      ) ?? null
    );
  }

  async activateReleasePolicy(
    record: ReleasePolicyRecord,
  ): Promise<ReleasePolicyRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE nexus_release_policies
         SET status = 'superseded'
         WHERE workspace_id = $1 AND status = 'active'`,
        [record.workspaceId],
      );
      const result = await client.query<{ id: string }>(
        `INSERT INTO nexus_release_policies
          (id, organization_id, workspace_id, policy_id, version, status,
           bundle_json, activated_by, activated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', $6::jsonb, $7, $8)
         ON CONFLICT (workspace_id, policy_id, version) DO UPDATE
         SET status = 'active',
             bundle_json = EXCLUDED.bundle_json,
             activated_by = EXCLUDED.activated_by,
             activated_at = EXCLUDED.activated_at
         RETURNING id`,
        [
          record.id,
          record.organizationId,
          record.workspaceId,
          record.bundle.payload.policyId,
          record.bundle.payload.version,
          JSON.stringify(record.bundle),
          record.activatedBy,
          record.activatedAt,
        ],
      );
      await client.query("COMMIT");
      return {
        ...structuredClone(record),
        id: result.rows[0].id,
        status: "active",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getActiveReleasePolicy(
    workspaceId: string,
  ): Promise<ReleasePolicyRecord | null> {
    const policies = await this.readReleasePolicies(
      `WHERE workspace_id = $1 AND status = 'active'
       ORDER BY activated_at DESC
       LIMIT 1`,
      [workspaceId],
    );
    return policies[0] ?? null;
  }

  async listReleasePolicies(
    workspaceId: string,
  ): Promise<ReleasePolicyRecord[]> {
    return this.readReleasePolicies(
      `WHERE workspace_id = $1
       ORDER BY activated_at DESC, id DESC`,
      [workspaceId],
    );
  }

  private async readReleasePolicies(
    suffix: string,
    parameters: unknown[],
  ): Promise<ReleasePolicyRecord[]> {
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      workspace_id: string;
      status: ReleasePolicyRecord["status"];
      bundle_json: ReleasePolicyRecord["bundle"];
      activated_by: string;
      activated_at: Date | string;
    }>(
      `SELECT id, organization_id, workspace_id, status, bundle_json,
              activated_by, activated_at
       FROM nexus_release_policies
       ${suffix}`,
      parameters,
    );
    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      status: row.status,
      bundle: row.bundle_json,
      activatedBy: row.activated_by,
      activatedAt: timestamp(row.activated_at),
    }));
  }

  async createDelegatedAdministrationGrant(
    grant: DelegatedAdministrationGrant,
  ): Promise<DelegatedAdministrationGrant> {
    await this.pool.query(
      `INSERT INTO nexus_delegated_admin_grants
        (id, organization_id, workspace_id, issuer, subject, duty, status,
         revision, expires_at, grant_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        grant.id,
        grant.organizationId,
        grant.workspaceId,
        grant.issuer,
        grant.subject,
        grant.duty,
        grant.status,
        grant.revision,
        grant.expiresAt ?? null,
        JSON.stringify(grant),
      ],
    );
    return structuredClone(grant);
  }

  async updateDelegatedAdministrationGrant(
    grant: DelegatedAdministrationGrant,
    expectedRevision: number,
  ): Promise<DelegatedAdministrationGrant> {
    const result = await this.pool.query(
      `UPDATE nexus_delegated_admin_grants
       SET status = $1, revision = $2, expires_at = $3,
           grant_json = $4::jsonb
       WHERE id = $5 AND revision = $6`,
      [
        grant.status,
        grant.revision,
        grant.expiresAt ?? null,
        JSON.stringify(grant),
        grant.id,
        expectedRevision,
      ],
    );
    if (result.rowCount !== 1) {
      throw new ExperimentConflictError(
        `Delegated administration grant ${grant.id} changed; expected revision ${expectedRevision}`,
      );
    }
    return structuredClone(grant);
  }

  async getDelegatedAdministrationGrant(
    grantId: string,
  ): Promise<DelegatedAdministrationGrant | null> {
    const result = await this.pool.query<{
      grant_json: DelegatedAdministrationGrant;
    }>(
      `SELECT grant_json
       FROM nexus_delegated_admin_grants
       WHERE id = $1`,
      [grantId],
    );
    return result.rows[0]?.grant_json ?? null;
  }

  async listDelegatedAdministrationGrants(
    workspaceId: string,
  ): Promise<DelegatedAdministrationGrant[]> {
    const result = await this.pool.query<{
      grant_json: DelegatedAdministrationGrant;
    }>(
      `SELECT grant_json
       FROM nexus_delegated_admin_grants
       WHERE workspace_id = $1
       ORDER BY id ASC`,
      [workspaceId],
    );
    return result.rows.map((row) => row.grant_json);
  }

  async createAccessReviewCampaign(
    campaign: AccessReviewCampaign,
    items: AccessReviewItem[],
  ): Promise<AccessReviewCampaign> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO nexus_access_review_campaigns
          (id, organization_id, workspace_id, status, due_at, revision,
           campaign_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          campaign.id,
          campaign.organizationId,
          campaign.workspaceId,
          campaign.status,
          campaign.dueAt,
          campaign.revision,
          JSON.stringify(campaign),
        ],
      );
      for (const item of items) {
        await client.query(
          `INSERT INTO nexus_access_review_items
            (id, organization_id, workspace_id, campaign_id, target_type,
             target_id, decision, revision, item_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
          [
            item.id,
            item.organizationId,
            item.workspaceId,
            item.campaignId,
            item.targetType,
            item.targetId,
            item.decision,
            item.revision,
            JSON.stringify(item),
          ],
        );
      }
      await client.query("COMMIT");
      return structuredClone(campaign);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAccessReviewCampaign(
    campaign: AccessReviewCampaign,
    expectedRevision: number,
  ): Promise<AccessReviewCampaign> {
    const result = await this.pool.query(
      `UPDATE nexus_access_review_campaigns
       SET status = $1, due_at = $2, revision = $3,
           campaign_json = $4::jsonb
       WHERE id = $5 AND revision = $6`,
      [
        campaign.status,
        campaign.dueAt,
        campaign.revision,
        JSON.stringify(campaign),
        campaign.id,
        expectedRevision,
      ],
    );
    if (result.rowCount !== 1) {
      throw new ExperimentConflictError(
        `Access review campaign ${campaign.id} changed; expected revision ${expectedRevision}`,
      );
    }
    return structuredClone(campaign);
  }

  async getAccessReviewCampaign(
    campaignId: string,
  ): Promise<AccessReviewCampaign | null> {
    const result = await this.pool.query<{
      campaign_json: AccessReviewCampaign;
    }>(
      `SELECT campaign_json
       FROM nexus_access_review_campaigns
       WHERE id = $1`,
      [campaignId],
    );
    return result.rows[0]?.campaign_json ?? null;
  }

  async listAccessReviewCampaigns(
    workspaceId: string,
  ): Promise<AccessReviewCampaign[]> {
    const result = await this.pool.query<{
      campaign_json: AccessReviewCampaign;
    }>(
      `SELECT campaign_json
       FROM nexus_access_review_campaigns
       WHERE workspace_id = $1
       ORDER BY due_at DESC, id DESC`,
      [workspaceId],
    );
    return result.rows.map((row) => row.campaign_json);
  }

  async updateAccessReviewItem(
    item: AccessReviewItem,
    expectedRevision: number,
  ): Promise<AccessReviewItem> {
    const result = await this.pool.query(
      `UPDATE nexus_access_review_items
       SET decision = $1, revision = $2, item_json = $3::jsonb
       WHERE id = $4 AND revision = $5`,
      [
        item.decision,
        item.revision,
        JSON.stringify(item),
        item.id,
        expectedRevision,
      ],
    );
    if (result.rowCount !== 1) {
      throw new ExperimentConflictError(
        `Access review item ${item.id} changed; expected revision ${expectedRevision}`,
      );
    }
    return structuredClone(item);
  }

  async listAccessReviewItems(
    workspaceId: string,
    campaignId?: string,
  ): Promise<AccessReviewItem[]> {
    const result = await this.pool.query<{
      item_json: AccessReviewItem;
    }>(
      `SELECT item_json
       FROM nexus_access_review_items
       WHERE workspace_id = $1
         AND ($2::text IS NULL OR campaign_id = $2)
       ORDER BY id ASC`,
      [workspaceId, campaignId ?? null],
    );
    return result.rows.map((row) => row.item_json);
  }

  async createBreakGlassRequest(
    request: BreakGlassRequest,
  ): Promise<BreakGlassRequest> {
    await this.pool.query(
      `INSERT INTO nexus_break_glass_requests
        (id, organization_id, workspace_id, issuer, subject, status,
         expires_at, revision, request_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        request.id,
        request.organizationId,
        request.workspaceId,
        request.issuer,
        request.subject,
        request.status,
        request.expiresAt,
        request.revision,
        JSON.stringify(request),
      ],
    );
    return structuredClone(request);
  }

  async updateBreakGlassRequest(
    request: BreakGlassRequest,
    expectedRevision: number,
  ): Promise<BreakGlassRequest> {
    const result = await this.pool.query(
      `UPDATE nexus_break_glass_requests
       SET status = $1, expires_at = $2, revision = $3,
           request_json = $4::jsonb
       WHERE id = $5 AND revision = $6`,
      [
        request.status,
        request.expiresAt,
        request.revision,
        JSON.stringify(request),
        request.id,
        expectedRevision,
      ],
    );
    if (result.rowCount !== 1) {
      throw new ExperimentConflictError(
        `Break-glass request ${request.id} changed; expected revision ${expectedRevision}`,
      );
    }
    return structuredClone(request);
  }

  async getBreakGlassRequest(
    requestId: string,
  ): Promise<BreakGlassRequest | null> {
    const result = await this.pool.query<{
      request_json: BreakGlassRequest;
    }>(
      `SELECT request_json
       FROM nexus_break_glass_requests
       WHERE id = $1`,
      [requestId],
    );
    return result.rows[0]?.request_json ?? null;
  }

  async listBreakGlassRequests(
    workspaceId: string,
  ): Promise<BreakGlassRequest[]> {
    const result = await this.pool.query<{
      request_json: BreakGlassRequest;
    }>(
      `SELECT request_json
       FROM nexus_break_glass_requests
       WHERE workspace_id = $1
       ORDER BY expires_at DESC, id DESC`,
      [workspaceId],
    );
    return result.rows.map((row) => row.request_json);
  }

  async storeSloSample(sample: SloSample): Promise<{
    sample: SloSample;
    created: boolean;
  }> {
    const result = await this.pool.query<{ record_json: SloSample }>(
      `INSERT INTO nexus_slo_samples
        (id, organization_id, workspace_id, source, metric, observed_at,
         record_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (id) DO NOTHING
       RETURNING record_json`,
      [
        sample.id,
        sample.organizationId,
        sample.workspaceId,
        sample.source,
        sample.metric,
        sample.observedAt,
        JSON.stringify(sample),
      ],
    );
    if (result.rows[0]) {
      return {
        sample: result.rows[0].record_json,
        created: true,
      };
    }
    const existing = await this.getSloSample(sample.id);
    if (!existing) {
      throw new ExperimentConflictError(
        `SLO sample ${sample.id} conflicted but could not be read`,
      );
    }
    return {
      sample: existing,
      created: false,
    };
  }

  async getSloSample(sampleId: string): Promise<SloSample | null> {
    const result = await this.pool.query<{ record_json: SloSample }>(
      `SELECT record_json
       FROM nexus_slo_samples
       WHERE id = $1`,
      [sampleId],
    );
    return result.rows[0]?.record_json ?? null;
  }

  async listSloSamples(
    workspaceId: string,
    query: SloSampleQuery = {},
  ): Promise<SloSample[]> {
    const result = await this.pool.query<{
      record_json: SloSample;
    }>(
      `SELECT record_json
       FROM nexus_slo_samples
       WHERE workspace_id = $1
         AND ($2::text IS NULL OR source = $2)
         AND ($3::text IS NULL OR metric = $3)
         AND ($4::timestamptz IS NULL OR observed_at >= $4)
         AND ($5::timestamptz IS NULL OR observed_at <= $5)
       ORDER BY observed_at DESC, id DESC
       LIMIT $6`,
      [
        workspaceId,
        query.source ?? null,
        query.metric ?? null,
        query.from ?? null,
        query.to ?? null,
        Math.max(1, query.limit ?? 1_000),
      ],
    );
    return result.rows.map((row) => row.record_json);
  }

  async deleteSloSamplesBefore(
    workspaceId: string,
    before: string,
  ): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM nexus_slo_samples
       WHERE workspace_id = $1
         AND observed_at < $2::timestamptz`,
      [workspaceId, before],
    );
    return result.rowCount ?? 0;
  }

  async createAlertRule(rule: AlertRule): Promise<AlertRule> {
    await this.pool.query(
      `INSERT INTO nexus_alert_rules
        (id, organization_id, workspace_id, code, status, revision, rule_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        rule.id,
        rule.organizationId,
        rule.workspaceId,
        rule.code,
        rule.status,
        rule.revision,
        JSON.stringify(rule),
      ],
    );
    return structuredClone(rule);
  }

  async updateAlertRule(
    rule: AlertRule,
    expectedRevision: number,
  ): Promise<AlertRule> {
    const result = await this.pool.query(
      `UPDATE nexus_alert_rules
       SET code = $1, status = $2, revision = $3, rule_json = $4::jsonb
       WHERE id = $5 AND revision = $6`,
      [
        rule.code,
        rule.status,
        rule.revision,
        JSON.stringify(rule),
        rule.id,
        expectedRevision,
      ],
    );
    if (result.rowCount !== 1) {
      throw new ExperimentConflictError(
        `Alert rule ${rule.id} changed; expected revision ${expectedRevision}`,
      );
    }
    return structuredClone(rule);
  }

  async listAlertRules(workspaceId: string): Promise<AlertRule[]> {
    const result = await this.pool.query<{ rule_json: AlertRule }>(
      `SELECT rule_json
       FROM nexus_alert_rules
       WHERE workspace_id = $1
       ORDER BY code ASC`,
      [workspaceId],
    );
    return result.rows.map((row) => row.rule_json);
  }

  async getOperationalIncident(
    incidentId: string,
  ): Promise<OperationalIncident | null> {
    const result = await this.pool.query<{
      incident_json: OperationalIncident;
    }>(
      `SELECT incident_json
       FROM nexus_operational_incidents
       WHERE id = $1`,
      [incidentId],
    );
    return result.rows[0]?.incident_json ?? null;
  }

  async getOperationalIncidentByDedupeKey(
    workspaceId: string,
    dedupeKey: string,
  ): Promise<OperationalIncident | null> {
    const result = await this.pool.query<{
      incident_json: OperationalIncident;
    }>(
      `SELECT incident_json
       FROM nexus_operational_incidents
       WHERE workspace_id = $1 AND dedupe_key = $2`,
      [workspaceId, dedupeKey],
    );
    return result.rows[0]?.incident_json ?? null;
  }

  async createOperationalIncident(
    incident: OperationalIncident,
  ): Promise<OperationalIncident> {
    await this.pool.query(
      `INSERT INTO nexus_operational_incidents
        (id, organization_id, workspace_id, rule_id, dedupe_key, status,
         severity, revision, updated_at, incident_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        incident.id,
        incident.organizationId,
        incident.workspaceId,
        incident.ruleId,
        incident.dedupeKey,
        incident.status,
        incident.severity,
        incident.revision,
        incident.updatedAt,
        JSON.stringify(incident),
      ],
    );
    return structuredClone(incident);
  }

  async updateOperationalIncident(
    incident: OperationalIncident,
    expectedRevision: number,
  ): Promise<OperationalIncident> {
    const result = await this.pool.query(
      `UPDATE nexus_operational_incidents
       SET status = $1, severity = $2, revision = $3, updated_at = $4,
           incident_json = $5::jsonb
       WHERE id = $6 AND revision = $7`,
      [
        incident.status,
        incident.severity,
        incident.revision,
        incident.updatedAt,
        JSON.stringify(incident),
        incident.id,
        expectedRevision,
      ],
    );
    if (result.rowCount !== 1) {
      throw new ExperimentConflictError(
        `Operational incident ${incident.id} changed; expected revision ${expectedRevision}`,
      );
    }
    return structuredClone(incident);
  }

  async listOperationalIncidents(
    workspaceId: string,
    query: OperationsListQuery = {},
  ): Promise<OperationalIncident[]> {
    const result = await this.pool.query<{
      incident_json: OperationalIncident;
    }>(
      `SELECT incident_json
       FROM nexus_operational_incidents
       WHERE workspace_id = $1
       ORDER BY updated_at DESC, id DESC
       LIMIT $2`,
      [workspaceId, Math.max(1, query.limit ?? 100)],
    );
    return result.rows.map((row) => row.incident_json);
  }

  async appendAlertOccurrence(
    occurrence: AlertOccurrence,
  ): Promise<AlertOccurrence> {
    await this.pool.query(
      `INSERT INTO nexus_alert_occurrences
        (id, organization_id, workspace_id, rule_id, incident_id, sample_id,
         created_at, occurrence_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        occurrence.id,
        occurrence.organizationId,
        occurrence.workspaceId,
        occurrence.ruleId,
        occurrence.incidentId ?? null,
        occurrence.sampleId,
        occurrence.createdAt,
        JSON.stringify(occurrence),
      ],
    );
    return structuredClone(occurrence);
  }

  async listAlertOccurrences(
    workspaceId: string,
    query: OperationsListQuery = {},
  ): Promise<AlertOccurrence[]> {
    const result = await this.pool.query<{
      occurrence_json: AlertOccurrence;
    }>(
      `SELECT occurrence_json
       FROM nexus_alert_occurrences
       WHERE workspace_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [workspaceId, Math.max(1, query.limit ?? 100)],
    );
    return result.rows.map((row) => row.occurrence_json);
  }

  async createNotificationChannel(
    channel: NotificationChannel,
  ): Promise<NotificationChannel> {
    await this.pool.query(
      `INSERT INTO nexus_notification_channels
        (id, organization_id, workspace_id, status, revision, channel_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        channel.id,
        channel.organizationId,
        channel.workspaceId,
        channel.status,
        channel.revision,
        JSON.stringify(channel),
      ],
    );
    return structuredClone(channel);
  }

  async updateNotificationChannel(
    channel: NotificationChannel,
    expectedRevision: number,
  ): Promise<NotificationChannel> {
    const result = await this.pool.query(
      `UPDATE nexus_notification_channels
       SET status = $1, revision = $2, channel_json = $3::jsonb
       WHERE id = $4 AND revision = $5`,
      [
        channel.status,
        channel.revision,
        JSON.stringify(channel),
        channel.id,
        expectedRevision,
      ],
    );
    if (result.rowCount !== 1) {
      throw new ExperimentConflictError(
        `Notification channel ${channel.id} changed; expected revision ${expectedRevision}`,
      );
    }
    return structuredClone(channel);
  }

  async getNotificationChannel(
    channelId: string,
  ): Promise<NotificationChannel | null> {
    const result = await this.pool.query<{
      channel_json: NotificationChannel;
    }>(
      `SELECT channel_json
       FROM nexus_notification_channels
       WHERE id = $1`,
      [channelId],
    );
    return result.rows[0]?.channel_json ?? null;
  }

  async listNotificationChannels(
    workspaceId: string,
  ): Promise<NotificationChannel[]> {
    const result = await this.pool.query<{
      channel_json: NotificationChannel;
    }>(
      `SELECT channel_json
       FROM nexus_notification_channels
       WHERE workspace_id = $1
       ORDER BY id ASC`,
      [workspaceId],
    );
    return result.rows.map((row) => row.channel_json);
  }

  async enqueueNotificationDelivery(
    delivery: NotificationDelivery,
  ): Promise<NotificationDelivery> {
    const result = await this.pool.query<{
      delivery_json: NotificationDelivery;
    }>(
      `INSERT INTO nexus_notification_deliveries
        (id, organization_id, workspace_id, channel_id, incident_id,
         idempotency_key, status, next_attempt_at, created_at, delivery_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT (idempotency_key) DO UPDATE
       SET idempotency_key = EXCLUDED.idempotency_key
       RETURNING delivery_json`,
      [
        delivery.id,
        delivery.organizationId,
        delivery.workspaceId,
        delivery.channelId,
        delivery.incidentId,
        delivery.idempotencyKey,
        delivery.status,
        delivery.nextAttemptAt,
        delivery.createdAt,
        JSON.stringify(delivery),
      ],
    );
    return result.rows[0].delivery_json;
  }

  async updateNotificationDelivery(
    delivery: NotificationDelivery,
  ): Promise<NotificationDelivery> {
    const result = await this.pool.query(
      `UPDATE nexus_notification_deliveries
       SET status = $1, next_attempt_at = $2, delivery_json = $3::jsonb
       WHERE id = $4`,
      [
        delivery.status,
        delivery.nextAttemptAt,
        JSON.stringify(delivery),
        delivery.id,
      ],
    );
    if (result.rowCount !== 1) {
      throw new ExperimentConflictError(
        `Notification delivery ${delivery.id} does not exist`,
      );
    }
    return structuredClone(delivery);
  }

  async listNotificationDeliveries(
    workspaceId: string,
    query: OperationsListQuery = {},
  ): Promise<NotificationDelivery[]> {
    const result = await this.pool.query<{
      delivery_json: NotificationDelivery;
    }>(
      `SELECT delivery_json
       FROM nexus_notification_deliveries
       WHERE workspace_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [workspaceId, Math.max(1, query.limit ?? 100)],
    );
    return result.rows.map((row) => row.delivery_json);
  }

  async listDueNotificationDeliveries(
    now: string,
    limit: number,
  ): Promise<NotificationDelivery[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<{
        id: string;
        delivery_json: NotificationDelivery;
      }>(
        `SELECT id, delivery_json
         FROM nexus_notification_deliveries
         WHERE status IN ('pending', 'retrying')
           AND next_attempt_at <= $1
         ORDER BY next_attempt_at ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $2`,
        [now, Math.max(1, limit)],
      );
      const claimUntil = new Date(Date.parse(now) + 5 * 60_000).toISOString();
      const claimed: NotificationDelivery[] = [];
      for (const row of selected.rows) {
        const delivery = {
          ...row.delivery_json,
          nextAttemptAt: claimUntil,
          updatedAt: now,
        };
        await client.query(
          `UPDATE nexus_notification_deliveries
           SET next_attempt_at = $1, delivery_json = $2::jsonb
           WHERE id = $3`,
          [claimUntil, JSON.stringify(delivery), row.id],
        );
        claimed.push(delivery);
      }
      await client.query("COMMIT");
      return claimed;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createMaintenanceWindow(
    window: MaintenanceWindow,
  ): Promise<MaintenanceWindow> {
    await this.pool.query(
      `INSERT INTO nexus_maintenance_windows
        (id, organization_id, workspace_id, status, starts_at, ends_at,
         revision, window_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        window.id,
        window.organizationId,
        window.workspaceId,
        window.status,
        window.startsAt,
        window.endsAt,
        window.revision,
        JSON.stringify(window),
      ],
    );
    return structuredClone(window);
  }

  async updateMaintenanceWindow(
    window: MaintenanceWindow,
    expectedRevision: number,
  ): Promise<MaintenanceWindow> {
    const result = await this.pool.query(
      `UPDATE nexus_maintenance_windows
       SET status = $1, starts_at = $2, ends_at = $3, revision = $4,
           window_json = $5::jsonb
       WHERE id = $6 AND revision = $7`,
      [
        window.status,
        window.startsAt,
        window.endsAt,
        window.revision,
        JSON.stringify(window),
        window.id,
        expectedRevision,
      ],
    );
    if (result.rowCount !== 1) {
      throw new ExperimentConflictError(
        `Maintenance window ${window.id} changed; expected revision ${expectedRevision}`,
      );
    }
    return structuredClone(window);
  }

  async listMaintenanceWindows(
    workspaceId: string,
  ): Promise<MaintenanceWindow[]> {
    const result = await this.pool.query<{
      window_json: MaintenanceWindow;
    }>(
      `SELECT window_json
       FROM nexus_maintenance_windows
       WHERE workspace_id = $1
       ORDER BY starts_at DESC, id DESC`,
      [workspaceId],
    );
    return result.rows.map((row) => row.window_json);
  }

  async createAlertSuppression(
    suppression: AlertSuppression,
  ): Promise<AlertSuppression> {
    await this.pool.query(
      `INSERT INTO nexus_alert_suppressions
        (id, organization_id, workspace_id, rule_id, status, starts_at,
         ends_at, revision, suppression_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        suppression.id,
        suppression.organizationId,
        suppression.workspaceId,
        suppression.ruleId ?? null,
        suppression.status,
        suppression.startsAt,
        suppression.endsAt,
        suppression.revision,
        JSON.stringify(suppression),
      ],
    );
    return structuredClone(suppression);
  }

  async updateAlertSuppression(
    suppression: AlertSuppression,
    expectedRevision: number,
  ): Promise<AlertSuppression> {
    const result = await this.pool.query(
      `UPDATE nexus_alert_suppressions
       SET rule_id = $1, status = $2, starts_at = $3, ends_at = $4,
           revision = $5, suppression_json = $6::jsonb
       WHERE id = $7 AND revision = $8`,
      [
        suppression.ruleId ?? null,
        suppression.status,
        suppression.startsAt,
        suppression.endsAt,
        suppression.revision,
        JSON.stringify(suppression),
        suppression.id,
        expectedRevision,
      ],
    );
    if (result.rowCount !== 1) {
      throw new ExperimentConflictError(
        `Alert suppression ${suppression.id} changed; expected revision ${expectedRevision}`,
      );
    }
    return structuredClone(suppression);
  }

  async listAlertSuppressions(
    workspaceId: string,
  ): Promise<AlertSuppression[]> {
    const result = await this.pool.query<{
      suppression_json: AlertSuppression;
    }>(
      `SELECT suppression_json
       FROM nexus_alert_suppressions
       WHERE workspace_id = $1
       ORDER BY starts_at DESC, id DESC`,
      [workspaceId],
    );
    return result.rows.map((row) => row.suppression_json);
  }

  async createNotificationEscalationPolicy(
    policy: NotificationEscalationPolicy,
  ): Promise<NotificationEscalationPolicy> {
    await this.pool.query(
      `INSERT INTO nexus_notification_escalation_policies
        (id, organization_id, workspace_id, status, revision, policy_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        policy.id,
        policy.organizationId,
        policy.workspaceId,
        policy.status,
        policy.revision,
        JSON.stringify(policy),
      ],
    );
    return structuredClone(policy);
  }

  async updateNotificationEscalationPolicy(
    policy: NotificationEscalationPolicy,
    expectedRevision: number,
  ): Promise<NotificationEscalationPolicy> {
    const result = await this.pool.query(
      `UPDATE nexus_notification_escalation_policies
       SET status = $1, revision = $2, policy_json = $3::jsonb
       WHERE id = $4 AND revision = $5`,
      [
        policy.status,
        policy.revision,
        JSON.stringify(policy),
        policy.id,
        expectedRevision,
      ],
    );
    if (result.rowCount !== 1) {
      throw new ExperimentConflictError(
        `Notification escalation policy ${policy.id} changed; expected revision ${expectedRevision}`,
      );
    }
    return structuredClone(policy);
  }

  async listNotificationEscalationPolicies(
    workspaceId: string,
  ): Promise<NotificationEscalationPolicy[]> {
    const result = await this.pool.query<{
      policy_json: NotificationEscalationPolicy;
    }>(
      `SELECT policy_json
       FROM nexus_notification_escalation_policies
       WHERE workspace_id = $1
       ORDER BY id ASC`,
      [workspaceId],
    );
    return result.rows.map((row) => row.policy_json);
  }

  async appendNotificationReceipt(
    receipt: NotificationReceipt,
  ): Promise<NotificationReceipt> {
    await this.pool.query(
      `INSERT INTO nexus_notification_receipts
        (id, organization_id, workspace_id, delivery_id, channel_id,
         received_at, receipt_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        receipt.id,
        receipt.organizationId,
        receipt.workspaceId,
        receipt.deliveryId,
        receipt.channelId,
        receipt.receivedAt,
        JSON.stringify(receipt),
      ],
    );
    return structuredClone(receipt);
  }

  async listNotificationReceipts(
    workspaceId: string,
    query: OperationsListQuery = {},
  ): Promise<NotificationReceipt[]> {
    const result = await this.pool.query<{
      receipt_json: NotificationReceipt;
    }>(
      `SELECT receipt_json
       FROM nexus_notification_receipts
       WHERE workspace_id = $1
       ORDER BY received_at DESC, id DESC
       LIMIT $2`,
      [workspaceId, Math.max(1, query.limit ?? 100)],
    );
    return result.rows.map((row) => row.receipt_json);
  }

  async createLifecycleRecord(
    input: CreateLifecycleRecordInput,
  ): Promise<LifecycleRecord> {
    assertLifecycleInput(input.record, input.event);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO nexus_lifecycle_records
          (id, organization_id, workspace_id, kind, status, revision,
           created_at, updated_at, record_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          input.record.id,
          input.record.organizationId,
          input.record.workspaceId,
          input.record.kind,
          input.record.status,
          input.record.revision,
          input.record.createdAt,
          input.record.updatedAt,
          JSON.stringify(input.record),
        ],
      );
      await this.insertLifecycleEvent(client, input.event);
      await client.query("COMMIT");
      return structuredClone(input.record);
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new ExperimentConflictError(
          `Lifecycle record ${input.record.id} already exists`,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async commitLifecycleRecord(
    input: CommitLifecycleRecordInput,
  ): Promise<LifecycleRecord> {
    assertLifecycleInput(
      input.record,
      input.event,
      input.expectedRevision,
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE nexus_lifecycle_records
         SET status = $1,
             revision = $2,
             updated_at = $3,
             record_json = $4::jsonb
         WHERE id = $5
           AND workspace_id = $6
           AND revision = $7`,
        [
          input.record.status,
          input.record.revision,
          input.record.updatedAt,
          JSON.stringify(input.record),
          input.record.id,
          input.record.workspaceId,
          input.expectedRevision,
        ],
      );
      if (
        updated.rowCount !== 1 ||
        input.record.revision !== input.expectedRevision + 1
      ) {
        throw new ExperimentConflictError(
          `Lifecycle record ${input.record.id} revision conflict`,
        );
      }
      await this.insertLifecycleEvent(client, input.event);
      await client.query("COMMIT");
      return structuredClone(input.record);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getLifecycleRecord(
    recordId: string,
  ): Promise<LifecycleRecord | null> {
    const result = await this.pool.query<{
      record_json: LifecycleRecord;
    }>(
      `SELECT record_json
       FROM nexus_lifecycle_records
       WHERE id = $1`,
      [recordId],
    );
    return result.rows[0]?.record_json ?? null;
  }

  async listLifecycleRecords(
    workspaceId: string,
    query: LifecycleRecordQuery = {},
  ): Promise<LifecycleRecord[]> {
    const result = await this.pool.query<{
      record_json: LifecycleRecord;
    }>(
      `SELECT record_json
       FROM nexus_lifecycle_records
       WHERE workspace_id = $1
         AND ($2::text IS NULL OR kind = $2)
         AND ($3::text IS NULL OR status = $3)
       ORDER BY updated_at DESC, id
       LIMIT $4`,
      [
        workspaceId,
        query.kind ?? null,
        query.status ?? null,
        Math.max(1, query.limit ?? 1_000),
      ],
    );
    return result.rows.map((row) => row.record_json);
  }

  async appendLifecycleEvent(
    event: NewLifecycleEvent,
  ): Promise<LifecycleEvent> {
    const client = await this.pool.connect();
    try {
      return await this.insertLifecycleEvent(client, event);
    } finally {
      client.release();
    }
  }

  async listLifecycleEvents(
    workspaceId: string,
    query: LifecycleEventQuery = {},
  ): Promise<LifecycleEvent[]> {
    const result = await this.pool.query<{
      event_cursor: string | number;
      event_json: NewLifecycleEvent;
    }>(
      `SELECT event_cursor, event_json
       FROM nexus_lifecycle_events
       WHERE workspace_id = $1
         AND ($2::text IS NULL OR aggregate_id = $2)
         AND ($3::text IS NULL OR aggregate_kind = $3)
         AND event_cursor > $4
       ORDER BY event_cursor
       LIMIT $5`,
      [
        workspaceId,
        query.aggregateId ?? null,
        query.aggregateKind ?? null,
        query.afterCursor ?? 0,
        Math.max(1, query.limit ?? 1_000),
      ],
    );
    return result.rows.map((row) => ({
      ...row.event_json,
      cursor: Number(row.event_cursor),
    }));
  }

  private async insertLifecycleEvent(
    client: PoolClient,
    event: NewLifecycleEvent,
  ): Promise<LifecycleEvent> {
    const result = await client.query<{
      event_cursor: string | number;
    }>(
      `INSERT INTO nexus_lifecycle_events
        (id, organization_id, workspace_id, aggregate_id, aggregate_kind,
         type, occurred_at, event_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING event_cursor`,
      [
        event.id,
        event.organizationId,
        event.workspaceId,
        event.aggregateId,
        event.aggregateKind,
        event.type,
        event.occurredAt,
        JSON.stringify(event),
      ],
    );
    return {
      ...event,
      cursor: Number(result.rows[0].event_cursor),
    };
  }
}
