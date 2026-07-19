import { createHash } from "node:crypto";
import type {
  Pool,
  PoolClient,
} from "pg";
import { EXPERIMENT_SCHEMA_SQL } from "@/experiments/postgres-schema";
import { stableStringify } from "@/simulation";
import { SYMBIOSIS_SCHEMA_SQL } from "@/symbiosis/postgres-schema";

const TABLES = [
  {
    name: "nexus_organizations",
    orderBy: "id",
  },
  {
    name: "nexus_workspaces",
    orderBy: "id",
  },
  {
    name: "nexus_workspace_governance",
    orderBy: "workspace_id",
  },
  {
    name: "nexus_workspace_memberships",
    orderBy: "id",
  },
  {
    name: "nexus_service_accounts",
    orderBy: "id",
  },
  {
    name: "nexus_governance_audit",
    orderBy: "audit_cursor",
  },
  {
    name: "nexus_governance_evidence",
    orderBy: "id",
  },
  {
    name: "nexus_release_policies",
    orderBy: "id",
  },
  {
    name: "nexus_delegated_admin_grants",
    orderBy: "id",
  },
  {
    name: "nexus_access_review_campaigns",
    orderBy: "id",
  },
  {
    name: "nexus_access_review_items",
    orderBy: "id",
  },
  {
    name: "nexus_break_glass_requests",
    orderBy: "id",
  },
  {
    name: "nexus_slo_samples",
    orderBy: "id",
  },
  {
    name: "nexus_alert_rules",
    orderBy: "id",
  },
  {
    name: "nexus_operational_incidents",
    orderBy: "id",
  },
  {
    name: "nexus_alert_occurrences",
    orderBy: "id",
  },
  {
    name: "nexus_notification_channels",
    orderBy: "id",
  },
  {
    name: "nexus_notification_deliveries",
    orderBy: "id",
  },
  {
    name: "nexus_maintenance_windows",
    orderBy: "id",
  },
  {
    name: "nexus_alert_suppressions",
    orderBy: "id",
  },
  {
    name: "nexus_notification_escalation_policies",
    orderBy: "id",
  },
  {
    name: "nexus_notification_receipts",
    orderBy: "id",
  },
  {
    name: "nexus_lifecycle_records",
    orderBy: "id",
  },
  {
    name: "nexus_lifecycle_events",
    orderBy: "event_cursor",
  },
  {
    name: "nexus_world_seasons",
    orderBy: "id",
  },
  {
    name: "nexus_world_turns",
    orderBy: "season_id, turn",
  },
  {
    name: "nexus_world_residents",
    orderBy: "season_id, id",
  },
  {
    name: "nexus_world_resident_state_snapshots",
    orderBy: "season_id, turn, resident_id",
  },
  {
    name: "nexus_world_cohort_cells",
    orderBy: "season_id, id",
  },
  {
    name: "nexus_world_resource_ledgers",
    orderBy: "season_id, turn, id",
  },
  {
    name: "nexus_world_events",
    orderBy: "season_id, season_cursor",
  },
  {
    name: "nexus_world_relationships",
    orderBy: "season_id, id",
  },
  {
    name: "nexus_world_relationship_consents",
    orderBy: "season_id, relationship_id, revision, resident_id",
  },
  {
    name: "nexus_world_commitments",
    orderBy: "season_id, id",
  },
  {
    name: "nexus_world_reciprocal_episodes",
    orderBy: "season_id, opened_turn, id",
  },
  {
    name: "nexus_world_model_decisions",
    orderBy: "season_id, turn, id",
  },
  {
    name: "nexus_sessions",
    orderBy: "id",
  },
  {
    name: "nexus_runs",
    orderBy: "id",
  },
  {
    name: "nexus_run_events",
    orderBy: "event_cursor",
  },
  {
    name: "nexus_run_snapshots",
    orderBy: "id",
  },
  {
    name: "nexus_audit_log",
    orderBy: "id",
  },
  {
    name: "nexus_improvement_proposals",
    orderBy: "id",
  },
  {
    name: "nexus_iteration_decisions",
    orderBy: "decision_cursor",
  },
] as const;

type PersistentTable = (typeof TABLES)[number]["name"];
type BackupRows = Record<PersistentTable, Array<Record<string, unknown>>>;
type BackupRowCounts = Record<PersistentTable, number>;

const LEGACY_TABLE_NAMES = [
  "nexus_workspaces",
  "nexus_sessions",
  "nexus_runs",
  "nexus_run_events",
  "nexus_run_snapshots",
  "nexus_audit_log",
  "nexus_improvement_proposals",
  "nexus_iteration_decisions",
] as const satisfies readonly PersistentTable[];

const GOVERNANCE_TABLE_NAMES = [
  "nexus_organizations",
  "nexus_workspace_governance",
  "nexus_workspace_memberships",
  "nexus_service_accounts",
  "nexus_governance_audit",
  "nexus_governance_evidence",
  "nexus_release_policies",
] as const satisfies readonly PersistentTable[];

const OPERATIONAL_TABLE_NAMES = [
  "nexus_slo_samples",
  "nexus_alert_rules",
  "nexus_operational_incidents",
  "nexus_alert_occurrences",
  "nexus_notification_channels",
  "nexus_notification_deliveries",
] as const satisfies readonly PersistentTable[];

const ACCESS_GOVERNANCE_TABLE_NAMES = [
  "nexus_delegated_admin_grants",
  "nexus_access_review_campaigns",
  "nexus_access_review_items",
  "nexus_break_glass_requests",
] as const satisfies readonly PersistentTable[];

const OPERATIONAL_EXTENSION_TABLE_NAMES = [
  "nexus_maintenance_windows",
  "nexus_alert_suppressions",
  "nexus_notification_escalation_policies",
  "nexus_notification_receipts",
] as const satisfies readonly PersistentTable[];

const LIFECYCLE_TABLE_NAMES = [
  "nexus_lifecycle_records",
  "nexus_lifecycle_events",
] as const satisfies readonly PersistentTable[];

const SYMBIOSIS_TABLE_NAMES = [
  "nexus_world_seasons",
  "nexus_world_turns",
  "nexus_world_residents",
  "nexus_world_resident_state_snapshots",
  "nexus_world_cohort_cells",
  "nexus_world_resource_ledgers",
  "nexus_world_events",
  "nexus_world_relationships",
  "nexus_world_relationship_consents",
  "nexus_world_commitments",
  "nexus_world_reciprocal_episodes",
  "nexus_world_model_decisions",
] as const satisfies readonly PersistentTable[];

const DEPRECATED_PARTICIPANT_TABLE_NAMES = [
  "nexus_world_human_intents",
  "nexus_world_private_memory_refs",
] as const;

export interface PostgresBackup {
  schemaVersion: 1;
  createdAt: string;
  tables: BackupRows;
  rowCounts: BackupRowCounts;
  checksum: string;
}

type BackupDocument = {
  schemaVersion: 1;
  createdAt: string;
  tables: Partial<BackupRows>;
  rowCounts: Partial<BackupRowCounts>;
  checksum: string;
};

function backupPayload(
  backup: Omit<BackupDocument, "checksum">,
): Omit<BackupDocument, "checksum"> {
  return {
    schemaVersion: backup.schemaVersion,
    createdAt: backup.createdAt,
    tables: backup.tables,
    rowCounts: backup.rowCounts,
  };
}

function checksum(value: Omit<BackupDocument, "checksum">): string {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

async function readTable(
  client: PoolClient,
  table: (typeof TABLES)[number],
): Promise<Array<Record<string, unknown>>> {
  const result = await client.query<{ row: Record<string, unknown> }>(
    `SELECT to_jsonb(source_row) AS row
     FROM ${table.name} AS source_row
     ORDER BY ${table.orderBy}`,
  );
  return result.rows.map((entry) => entry.row);
}

function isCompleteOrLegacyTableSet(backup: BackupDocument): boolean {
  const tables = backup.tables as Record<string, unknown>;
  const rowCounts = backup.rowCounts as Record<string, unknown>;
  const presentTableNames = Object.keys(tables);
  const presentCountNames = Object.keys(rowCounts);
  const knownTableNames: string[] = [
    ...TABLES.map((table) => table.name),
    ...DEPRECATED_PARTICIPANT_TABLE_NAMES,
  ];
  if (
    presentTableNames.some((name) => !knownTableNames.includes(
      name as PersistentTable,
    )) ||
    presentCountNames.some((name) => !knownTableNames.includes(
      name as PersistentTable,
    ))
  ) {
    return false;
  }
  const hasAllLegacyTables = LEGACY_TABLE_NAMES.every(
    (name) => name in backup.tables && name in backup.rowCounts,
  );
  const groupPresence = (names: readonly PersistentTable[]) =>
    names.map((name) => name in backup.tables && name in backup.rowCounts);
  const governancePresence = groupPresence(GOVERNANCE_TABLE_NAMES);
  const operationalPresence = groupPresence(OPERATIONAL_TABLE_NAMES);
  const accessGovernancePresence = groupPresence(
    ACCESS_GOVERNANCE_TABLE_NAMES,
  );
  const operationalExtensionPresence = groupPresence(
    OPERATIONAL_EXTENSION_TABLE_NAMES,
  );
  const lifecyclePresence = groupPresence(LIFECYCLE_TABLE_NAMES);
  const symbiosisPresence = groupPresence(SYMBIOSIS_TABLE_NAMES);
  const hasNoGovernanceTables = governancePresence.every(
    (present) => !present,
  );
  const hasAllGovernanceTables = governancePresence.every(Boolean);
  const hasNoOperationalTables = operationalPresence.every(
    (present) => !present,
  );
  const hasAllOperationalTables = operationalPresence.every(Boolean);
  const hasNoAccessGovernanceTables =
    accessGovernancePresence.every((present) => !present);
  const hasAllAccessGovernanceTables =
    accessGovernancePresence.every(Boolean);
  const hasNoOperationalExtensionTables =
    operationalExtensionPresence.every((present) => !present);
  const hasAllOperationalExtensionTables =
    operationalExtensionPresence.every(Boolean);
  const hasNoLifecycleTables =
    lifecyclePresence.every((present) => !present);
  const hasAllLifecycleTables = lifecyclePresence.every(Boolean);
  const hasNoSymbiosisTables =
    symbiosisPresence.every((present) => !present);
  const hasAllSymbiosisTables = symbiosisPresence.every(Boolean);
  const deprecatedPresence = DEPRECATED_PARTICIPANT_TABLE_NAMES.map(
    (name) => name in tables && name in rowCounts,
  );
  const hasNoDeprecatedParticipantTables = deprecatedPresence.every(
    (present) => !present,
  );
  const hasAllDeprecatedParticipantTables =
    deprecatedPresence.every(Boolean);
  const deprecatedParticipantTablesAreEmpty =
    DEPRECATED_PARTICIPANT_TABLE_NAMES.every(
      (name) =>
        !(name in tables) ||
        (
          Array.isArray(tables[name]) &&
          tables[name].length === 0 &&
          rowCounts[name] === 0
        ),
    );
  return (
    hasAllLegacyTables &&
    (
      hasNoDeprecatedParticipantTables ||
      hasAllDeprecatedParticipantTables
    ) &&
    deprecatedParticipantTablesAreEmpty &&
    (
      (
        hasNoGovernanceTables &&
        hasNoOperationalTables &&
        hasNoAccessGovernanceTables &&
        hasNoOperationalExtensionTables &&
        hasNoLifecycleTables &&
        hasNoSymbiosisTables
      ) ||
      (
        hasAllGovernanceTables &&
        hasNoOperationalTables &&
        hasNoAccessGovernanceTables &&
        hasNoOperationalExtensionTables &&
        hasNoLifecycleTables &&
        hasNoSymbiosisTables
      ) ||
      (
        hasAllGovernanceTables &&
        hasAllOperationalTables &&
        (
          hasNoAccessGovernanceTables ||
          hasAllAccessGovernanceTables
        ) &&
        (
          hasNoOperationalExtensionTables ||
          hasAllOperationalExtensionTables
        ) &&
        (
          hasNoLifecycleTables ||
          hasAllLifecycleTables
        ) &&
        (
          hasNoSymbiosisTables ||
          hasAllSymbiosisTables
        )
      )
    )
  );
}

function normalizePostgresBackup(backup: BackupDocument): PostgresBackup {
  const tables = {} as BackupRows;
  const rowCounts = {} as BackupRowCounts;
  for (const table of TABLES) {
    tables[table.name] = structuredClone(
      backup.tables[table.name] ?? [],
    );
    rowCounts[table.name] = backup.rowCounts[table.name] ?? 0;
  }
  return {
    schemaVersion: 1,
    createdAt: backup.createdAt,
    tables,
    rowCounts,
    checksum: backup.checksum,
  };
}

export function verifyPostgresBackup(
  backup: PostgresBackup | BackupDocument,
): boolean {
  if (backup.schemaVersion !== 1) {
    return false;
  }
  if (!isCompleteOrLegacyTableSet(backup)) {
    return false;
  }
  const tables = backup.tables as Record<string, unknown>;
  const rowCounts = backup.rowCounts as Record<string, unknown>;
  for (const tableName of Object.keys(tables)) {
    if (
      !Array.isArray(tables[tableName]) ||
      rowCounts[tableName] !== tables[tableName].length
    ) {
      return false;
    }
  }
  return checksum(backupPayload(backup)) === backup.checksum;
}

export async function createPostgresBackup(
  pool: Pool,
  now = new Date(),
): Promise<PostgresBackup> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables = {} as BackupRows;
    for (const table of TABLES) {
      tables[table.name] = await readTable(client, table);
    }
    await client.query("COMMIT");
    const rowCounts = Object.fromEntries(
      TABLES.map((table) => [
        table.name,
        tables[table.name].length,
      ]),
    ) as PostgresBackup["rowCounts"];
    const payload = {
      schemaVersion: 1 as const,
      createdAt: now.toISOString(),
      tables,
      rowCounts,
    };
    return {
      ...payload,
      checksum: checksum(payload),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function databaseHasPersistentData(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ populated: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM nexus_workspaces
       UNION ALL
       SELECT 1 FROM nexus_runs
       UNION ALL
       SELECT 1 FROM nexus_improvement_proposals
       UNION ALL
       SELECT 1 FROM nexus_world_seasons
     ) AS populated`,
  );
  return result.rows[0]?.populated ?? false;
}

async function resetSequences(client: PoolClient): Promise<void> {
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('nexus_run_events', 'event_cursor'),
       COALESCE((SELECT MAX(event_cursor) FROM nexus_run_events), 1),
       EXISTS (SELECT 1 FROM nexus_run_events)
     )`,
  );
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence(
         'nexus_iteration_decisions',
         'decision_cursor'
       ),
       COALESCE(
         (SELECT MAX(decision_cursor) FROM nexus_iteration_decisions),
         1
       ),
       EXISTS (SELECT 1 FROM nexus_iteration_decisions)
     )`,
  );
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('nexus_governance_audit', 'audit_cursor'),
       COALESCE(
         (SELECT MAX(audit_cursor) FROM nexus_governance_audit),
         1
       ),
       EXISTS (SELECT 1 FROM nexus_governance_audit)
     )`,
  );
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('nexus_lifecycle_events', 'event_cursor'),
       COALESCE(
         (SELECT MAX(event_cursor) FROM nexus_lifecycle_events),
         1
       ),
       EXISTS (SELECT 1 FROM nexus_lifecycle_events)
     )`,
  );
}

export async function restorePostgresBackup(
  pool: Pool,
  backup: PostgresBackup | BackupDocument,
  options: { force?: boolean } = {},
): Promise<PostgresBackup["rowCounts"]> {
  if (!verifyPostgresBackup(backup)) {
    throw new Error("Backup checksum or row counts are invalid");
  }
  const normalizedBackup = normalizePostgresBackup(backup);
  const client = await pool.connect();
  let restoreLocked = false;
  let transactionStarted = false;
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext('nexus-postgres-restore'))",
    );
    restoreLocked = true;
    await client.query(EXPERIMENT_SCHEMA_SQL);
    await client.query(SYMBIOSIS_SCHEMA_SQL);
    await client.query("BEGIN");
    transactionStarted = true;
    if (!options.force && (await databaseHasPersistentData(client))) {
      throw new Error(
        "Restore target contains persistent data; pass force only after confirming replacement",
      );
    }
    await client.query(
      `TRUNCATE ${TABLES.map((table) => table.name).join(", ")},
        nexus_worker_leases
       RESTART IDENTITY CASCADE`,
    );
    for (const table of TABLES) {
      for (const row of normalizedBackup.tables[table.name]) {
        await client.query(
          `INSERT INTO ${table.name}
           SELECT *
           FROM jsonb_populate_record(NULL::${table.name}, $1::jsonb)`,
          [JSON.stringify(row)],
        );
      }
    }
    await resetSequences(client);
    await client.query("COMMIT");
    transactionStarted = false;
    return structuredClone(normalizedBackup.rowCounts);
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    if (restoreLocked) {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('nexus-postgres-restore'))",
      );
    }
    client.release();
  }
}
