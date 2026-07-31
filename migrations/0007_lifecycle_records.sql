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
