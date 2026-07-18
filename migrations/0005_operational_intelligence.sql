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
