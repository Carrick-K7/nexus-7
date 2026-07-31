CREATE TABLE IF NOT EXISTS nexus_world_seasons (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL
    REFERENCES nexus_workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'closed')),
  experiment_version TEXT NOT NULL,
  seed TEXT NOT NULL,
  distribution_version TEXT NOT NULL,
  time_zone TEXT NOT NULL CHECK (time_zone = 'Asia/Shanghai'),
  start_date DATE NOT NULL,
  current_turn INTEGER NOT NULL CHECK (current_turn >= 0),
  data_bundle_id TEXT NOT NULL,
  season_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS nexus_world_seasons_scope_idx
  ON nexus_world_seasons(workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS nexus_world_turns (
  season_id TEXT NOT NULL
    REFERENCES nexus_world_seasons(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL CHECK (turn >= 0),
  simulation_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status = 'settled'),
  fingerprint TEXT NOT NULL,
  previous_fingerprint TEXT NOT NULL,
  turn_json JSONB NOT NULL,
  snapshot_json JSONB NOT NULL,
  settled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (season_id, turn),
  UNIQUE (season_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS nexus_world_turns_date_idx
  ON nexus_world_turns(season_id, simulation_date DESC);

CREATE TABLE IF NOT EXISTS nexus_world_residents (
  season_id TEXT NOT NULL
    REFERENCES nexus_world_seasons(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL
    CONSTRAINT nexus_world_residents_kind_ai_only_check
    CHECK (
      kind IN (
        'human',
        'ai',
        'robot'
      )
  ),
  community_id TEXT NOT NULL,
  resident_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (season_id, id)
);

CREATE INDEX IF NOT EXISTS nexus_world_residents_scope_idx
  ON nexus_world_residents(workspace_id, season_id, community_id, kind);

CREATE TABLE IF NOT EXISTS nexus_world_resident_state_snapshots (
  season_id TEXT NOT NULL
    REFERENCES nexus_world_seasons(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  resident_id TEXT NOT NULL,
  state_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (season_id, turn, resident_id),
  FOREIGN KEY (season_id, turn)
    REFERENCES nexus_world_turns(season_id, turn) ON DELETE CASCADE,
  FOREIGN KEY (season_id, resident_id)
    REFERENCES nexus_world_residents(season_id, id) ON DELETE CASCADE
) PARTITION BY HASH (season_id);

CREATE TABLE IF NOT EXISTS nexus_world_resident_state_snapshots_p0
  PARTITION OF nexus_world_resident_state_snapshots
  FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE IF NOT EXISTS nexus_world_resident_state_snapshots_p1
  PARTITION OF nexus_world_resident_state_snapshots
  FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE IF NOT EXISTS nexus_world_resident_state_snapshots_p2
  PARTITION OF nexus_world_resident_state_snapshots
  FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE IF NOT EXISTS nexus_world_resident_state_snapshots_p3
  PARTITION OF nexus_world_resident_state_snapshots
  FOR VALUES WITH (MODULUS 4, REMAINDER 3);

CREATE INDEX IF NOT EXISTS nexus_world_resident_states_lookup_idx
  ON nexus_world_resident_state_snapshots(
    season_id,
    resident_id,
    turn DESC
  );

CREATE TABLE IF NOT EXISTS nexus_world_cohort_cells (
  season_id TEXT NOT NULL
    REFERENCES nexus_world_seasons(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  district_code TEXT NOT NULL,
  population INTEGER NOT NULL CHECK (population >= 0),
  cohort_json JSONB NOT NULL,
  PRIMARY KEY (season_id, id)
);

CREATE TABLE IF NOT EXISTS nexus_world_resource_ledgers (
  season_id TEXT NOT NULL
    REFERENCES nexus_world_seasons(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  id TEXT NOT NULL,
  community_id TEXT NOT NULL,
  resource_code TEXT NOT NULL,
  conserved BOOLEAN NOT NULL CHECK (conserved),
  ledger_json JSONB NOT NULL,
  PRIMARY KEY (season_id, turn, id),
  FOREIGN KEY (season_id, turn)
    REFERENCES nexus_world_turns(season_id, turn) ON DELETE CASCADE
) PARTITION BY HASH (season_id);

CREATE TABLE IF NOT EXISTS nexus_world_resource_ledgers_p0
  PARTITION OF nexus_world_resource_ledgers
  FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE IF NOT EXISTS nexus_world_resource_ledgers_p1
  PARTITION OF nexus_world_resource_ledgers
  FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE IF NOT EXISTS nexus_world_resource_ledgers_p2
  PARTITION OF nexus_world_resource_ledgers
  FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE IF NOT EXISTS nexus_world_resource_ledgers_p3
  PARTITION OF nexus_world_resource_ledgers
  FOR VALUES WITH (MODULUS 4, REMAINDER 3);

CREATE INDEX IF NOT EXISTS nexus_world_resource_ledgers_lookup_idx
  ON nexus_world_resource_ledgers(
    season_id,
    community_id,
    resource_code,
    turn DESC
  );

CREATE TABLE IF NOT EXISTS nexus_world_events (
  season_id TEXT NOT NULL
    REFERENCES nexus_world_seasons(id) ON DELETE CASCADE,
  season_cursor INTEGER NOT NULL CHECK (season_cursor > 0),
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  turn INTEGER NOT NULL,
  layer TEXT NOT NULL CHECK (
    layer IN ('shared', 'human', 'ai-robot', 'relationship')
  ),
  type TEXT NOT NULL,
  event_json JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (season_id, season_cursor),
  UNIQUE (season_id, id),
  FOREIGN KEY (season_id, turn)
    REFERENCES nexus_world_turns(season_id, turn) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS nexus_world_events_scope_idx
  ON nexus_world_events(workspace_id, season_id, season_cursor);

CREATE TABLE IF NOT EXISTS nexus_world_relationships (
  season_id TEXT NOT NULL
    REFERENCES nexus_world_seasons(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  consent_state TEXT NOT NULL,
  relationship_json JSONB NOT NULL,
  PRIMARY KEY (season_id, id)
);

CREATE TABLE IF NOT EXISTS nexus_world_relationship_consents (
  season_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  resident_id TEXT NOT NULL,
  state TEXT NOT NULL,
  consent_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (season_id, relationship_id, revision, resident_id),
  FOREIGN KEY (season_id, relationship_id)
    REFERENCES nexus_world_relationships(season_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nexus_world_commitments (
  season_id TEXT NOT NULL
    REFERENCES nexus_world_seasons(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  status TEXT NOT NULL,
  commitment_json JSONB NOT NULL,
  PRIMARY KEY (season_id, id)
);

CREATE TABLE IF NOT EXISTS nexus_world_reciprocal_episodes (
  season_id TEXT NOT NULL
    REFERENCES nexus_world_seasons(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  opened_turn INTEGER NOT NULL CHECK (opened_turn > 0),
  resolved_turn INTEGER,
  outcome TEXT NOT NULL,
  forced BOOLEAN NOT NULL,
  episode_json JSONB NOT NULL,
  PRIMARY KEY (season_id, id),
  FOREIGN KEY (season_id, relationship_id)
    REFERENCES nexus_world_relationships(season_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS nexus_world_reciprocal_episode_outcome_idx
  ON nexus_world_reciprocal_episodes(
    season_id,
    outcome,
    opened_turn DESC
  );

CREATE TABLE IF NOT EXISTS nexus_world_model_decisions (
  season_id TEXT NOT NULL
    REFERENCES nexus_world_seasons(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  id TEXT NOT NULL,
  resident_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  reasoning_content_stored BOOLEAN NOT NULL
    CHECK (NOT reasoning_content_stored),
  decision_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (season_id, turn, id)
);
