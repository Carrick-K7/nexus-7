import { createHash } from "node:crypto";
import type {
  Pool,
  PoolClient,
} from "pg";
import { EXPERIMENT_SCHEMA_SQL } from "@/experiments/postgres-schema";
import { stableStringify } from "@/simulation";

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
  const presentTableNames = Object.keys(backup.tables);
  const presentCountNames = Object.keys(backup.rowCounts);
  const knownTableNames = TABLES.map((table) => table.name);
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
  return (
    hasAllLegacyTables &&
    (
      (
        hasNoGovernanceTables &&
        hasNoOperationalTables &&
        hasNoAccessGovernanceTables &&
        hasNoOperationalExtensionTables &&
        hasNoLifecycleTables
      ) ||
      (
        hasAllGovernanceTables &&
        hasNoOperationalTables &&
        hasNoAccessGovernanceTables &&
        hasNoOperationalExtensionTables &&
        hasNoLifecycleTables
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
  for (const tableName of Object.keys(backup.tables) as PersistentTable[]) {
    if (
      !Array.isArray(backup.tables[tableName]) ||
      backup.rowCounts[tableName] !== backup.tables[tableName]?.length
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
