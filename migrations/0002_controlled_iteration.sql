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
