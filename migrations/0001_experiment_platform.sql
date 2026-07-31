CREATE TABLE IF NOT EXISTS nexus_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

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
