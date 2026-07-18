import type {
  Pool,
} from "pg";

export const EXPERIMENT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nexus_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS nexus_organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS nexus_workspace_governance (
  workspace_id TEXT PRIMARY KEY REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_workspace_governance_org_idx
  ON nexus_workspace_governance(organization_id, workspace_id);

CREATE TABLE IF NOT EXISTS nexus_workspace_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'operator', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (workspace_id, issuer, subject)
);

CREATE INDEX IF NOT EXISTS nexus_workspace_memberships_scope_idx
  ON nexus_workspace_memberships(workspace_id, status, issuer, subject);

CREATE TABLE IF NOT EXISTS nexus_service_accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'operator', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'revoked')),
  workload_kind TEXT NOT NULL CHECK (
    workload_kind IN ('ci', 'worker', 'deployment-controller', 'development')
  ),
  permission_grants_json JSONB NOT NULL,
  credential_version INTEGER NOT NULL CHECK (credential_version > 0),
  revision INTEGER NOT NULL CHECK (revision > 0),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (workspace_id, issuer, subject)
);

ALTER TABLE nexus_service_accounts
  ADD COLUMN IF NOT EXISTS workload_kind TEXT NOT NULL DEFAULT 'worker';

ALTER TABLE nexus_service_accounts
  ADD COLUMN IF NOT EXISTS permission_grants_json JSONB NOT NULL
  DEFAULT '["workspace:read","runs:write"]'::jsonb;

CREATE INDEX IF NOT EXISTS nexus_service_accounts_scope_idx
  ON nexus_service_accounts(workspace_id, status, issuer, subject);

CREATE TABLE IF NOT EXISTS nexus_governance_audit (
  audit_cursor BIGSERIAL PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_governance_audit_scope_idx
  ON nexus_governance_audit(workspace_id, audit_cursor DESC);

CREATE TABLE IF NOT EXISTS nexus_governance_evidence (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  repository TEXT NOT NULL,
  source_commit_sha TEXT NOT NULL,
  signer_workflow TEXT NOT NULL,
  run_id TEXT NOT NULL,
  subject_path TEXT NOT NULL,
  subject_sha256 TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ingested_by TEXT NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL,
  summary_json JSONB NOT NULL,
  UNIQUE (workspace_id, kind, run_id, subject_sha256)
);

CREATE INDEX IF NOT EXISTS nexus_governance_evidence_scope_idx
  ON nexus_governance_evidence(workspace_id, kind, verified_at DESC);

CREATE TABLE IF NOT EXISTS nexus_release_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  policy_id TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
  bundle_json JSONB NOT NULL,
  activated_by TEXT NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (workspace_id, policy_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS nexus_release_policies_active_idx
  ON nexus_release_policies(workspace_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS nexus_delegated_admin_grants (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  duty TEXT NOT NULL CHECK (
    duty IN ('identity-manager', 'access-reviewer', 'operations-admin')
  ),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  expires_at TIMESTAMPTZ,
  grant_json JSONB NOT NULL,
  UNIQUE (workspace_id, issuer, subject, duty)
);

CREATE INDEX IF NOT EXISTS nexus_delegated_admin_grants_identity_idx
  ON nexus_delegated_admin_grants(workspace_id, issuer, subject, status);

CREATE TABLE IF NOT EXISTS nexus_access_review_campaigns (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (
    status IN ('open', 'completed', 'completed-with-auto-revocations')
  ),
  due_at TIMESTAMPTZ NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  campaign_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_access_review_campaigns_scope_idx
  ON nexus_access_review_campaigns(workspace_id, status, due_at);

CREATE TABLE IF NOT EXISTS nexus_access_review_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES nexus_access_review_campaigns(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (
    target_type IN ('membership', 'service-account', 'delegation')
  ),
  target_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (
    decision IN ('pending', 'retain', 'revoke', 'auto-revoke')
  ),
  revision INTEGER NOT NULL CHECK (revision > 0),
  item_json JSONB NOT NULL,
  UNIQUE (campaign_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS nexus_access_review_items_scope_idx
  ON nexus_access_review_items(workspace_id, campaign_id, decision);

CREATE TABLE IF NOT EXISTS nexus_break_glass_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'pending-approval',
      'active',
      'expired-review-required',
      'revoked-review-required',
      'closed'
    )
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  request_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_break_glass_requests_identity_idx
  ON nexus_break_glass_requests(
    workspace_id,
    issuer,
    subject,
    status,
    expires_at
  );

CREATE TABLE IF NOT EXISTS nexus_slo_samples (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  metric TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  record_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_slo_samples_scope_idx
  ON nexus_slo_samples(workspace_id, source, metric, observed_at DESC);

CREATE TABLE IF NOT EXISTS nexus_alert_rules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  rule_json JSONB NOT NULL,
  UNIQUE (workspace_id, code)
);

CREATE INDEX IF NOT EXISTS nexus_alert_rules_scope_idx
  ON nexus_alert_rules(workspace_id, status, code);

CREATE TABLE IF NOT EXISTS nexus_operational_incidents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL REFERENCES nexus_alert_rules(id) ON DELETE RESTRICT,
  dedupe_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL,
  incident_json JSONB NOT NULL,
  UNIQUE (workspace_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS nexus_operational_incidents_scope_idx
  ON nexus_operational_incidents(workspace_id, status, severity, updated_at DESC);

CREATE TABLE IF NOT EXISTS nexus_alert_occurrences (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL REFERENCES nexus_alert_rules(id) ON DELETE RESTRICT,
  incident_id TEXT REFERENCES nexus_operational_incidents(id) ON DELETE SET NULL,
  sample_id TEXT NOT NULL REFERENCES nexus_slo_samples(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  occurrence_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_alert_occurrences_scope_idx
  ON nexus_alert_occurrences(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nexus_notification_channels (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  channel_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_notification_channels_scope_idx
  ON nexus_notification_channels(workspace_id, status, id);

CREATE TABLE IF NOT EXISTS nexus_notification_deliveries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES nexus_notification_channels(id) ON DELETE RESTRICT,
  incident_id TEXT NOT NULL REFERENCES nexus_operational_incidents(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'retrying', 'delivered', 'cancelled', 'dead-letter')
  ),
  next_attempt_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  delivery_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_notification_deliveries_due_idx
  ON nexus_notification_deliveries(status, next_attempt_at)
  WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS nexus_notification_deliveries_scope_idx
  ON nexus_notification_deliveries(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nexus_maintenance_windows (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  window_json JSONB NOT NULL,
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS nexus_maintenance_windows_scope_idx
  ON nexus_maintenance_windows(workspace_id, status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS nexus_alert_suppressions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  rule_id TEXT REFERENCES nexus_alert_rules(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'expired')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  suppression_json JSONB NOT NULL,
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS nexus_alert_suppressions_scope_idx
  ON nexus_alert_suppressions(workspace_id, status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS nexus_notification_escalation_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  policy_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_notification_escalation_policies_scope_idx
  ON nexus_notification_escalation_policies(workspace_id, status, id);

CREATE TABLE IF NOT EXISTS nexus_notification_receipts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  delivery_id TEXT NOT NULL REFERENCES nexus_notification_deliveries(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES nexus_notification_channels(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL,
  receipt_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_notification_receipts_scope_idx
  ON nexus_notification_receipts(workspace_id, received_at DESC);

CREATE TABLE IF NOT EXISTS nexus_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS nexus_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES nexus_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  parent_run_id TEXT REFERENCES nexus_runs(id) ON DELETE SET NULL,
  forked_from_tick INTEGER,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  run_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS nexus_run_events (
  event_cursor BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES nexus_runs(id) ON DELETE CASCADE,
  tick INTEGER NOT NULL,
  event_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_run_events_run_cursor_idx
  ON nexus_run_events(run_id, event_cursor);

CREATE TABLE IF NOT EXISTS nexus_run_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES nexus_runs(id) ON DELETE CASCADE,
  tick INTEGER NOT NULL,
  version INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  run_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_run_snapshots_run_tick_idx
  ON nexus_run_snapshots(run_id, tick);

CREATE TABLE IF NOT EXISTS nexus_audit_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES nexus_runs(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_audit_log_run_created_idx
  ON nexus_audit_log(run_id, created_at);

CREATE TABLE IF NOT EXISTS nexus_worker_leases (
  name TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  heartbeat_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS nexus_improvement_proposals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  source_run_id TEXT NOT NULL REFERENCES nexus_runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  proposal_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_improvements_workspace_updated_idx
  ON nexus_improvement_proposals(workspace_id, updated_at);

CREATE TABLE IF NOT EXISTS nexus_iteration_decisions (
  decision_cursor BIGSERIAL PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  proposal_id TEXT NOT NULL REFERENCES nexus_improvement_proposals(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  role TEXT NOT NULL,
  detail_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_iteration_decisions_proposal_cursor_idx
  ON nexus_iteration_decisions(proposal_id, decision_cursor);

CREATE TABLE IF NOT EXISTS nexus_lifecycle_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL
    REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL
    REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  record_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_lifecycle_records_scope_idx
  ON nexus_lifecycle_records(
    workspace_id,
    kind,
    status,
    updated_at DESC
  );

CREATE TABLE IF NOT EXISTS nexus_lifecycle_events (
  event_cursor BIGSERIAL PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL
    REFERENCES nexus_organizations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL
    REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  aggregate_id TEXT NOT NULL
    REFERENCES nexus_lifecycle_records(id) ON DELETE CASCADE,
  aggregate_kind TEXT NOT NULL,
  type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  event_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS nexus_lifecycle_events_scope_idx
  ON nexus_lifecycle_events(
    workspace_id,
    aggregate_kind,
    aggregate_id,
    event_cursor
  );

CREATE INDEX IF NOT EXISTS nexus_closed_loop_records_idx
  ON nexus_lifecycle_records(
    workspace_id,
    status,
    updated_at DESC
  )
  WHERE kind = 'closed-loop-case';

CREATE INDEX IF NOT EXISTS nexus_deployment_records_idx
  ON nexus_lifecycle_records(
    workspace_id,
    status,
    updated_at DESC
  )
  WHERE kind = 'deployment-record';

CREATE INDEX IF NOT EXISTS nexus_closed_loop_event_correlation_idx
  ON nexus_lifecycle_events(
    workspace_id,
    ((event_json ->> 'correlationId')),
    event_cursor
  )
  WHERE aggregate_kind IN (
    'closed-loop-case',
    'deployment-record'
  );
`;

export async function initializeExperimentSchema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext('nexus-experiment-schema'))",
    );
    locked = true;
    await client.query(EXPERIMENT_SCHEMA_SQL);
  } finally {
    if (locked) {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('nexus-experiment-schema'))",
      );
    }
    client.release();
  }
}
