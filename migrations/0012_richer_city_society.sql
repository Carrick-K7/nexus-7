ALTER TABLE nexus_world_events
  DROP CONSTRAINT IF EXISTS nexus_world_events_layer_check;

ALTER TABLE nexus_world_events
  ADD CONSTRAINT nexus_world_events_layer_check
  CHECK (
    layer IN (
      'shared',
      'human',
      'ai-robot',
      'relationship',
      'society'
    )
  );

CREATE TABLE IF NOT EXISTS nexus_world_society_records (
  season_id TEXT NOT NULL
    REFERENCES nexus_world_seasons(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (
    record_type IN (
      'household',
      'work-agreement',
      'asset',
      'exchange',
      'bargain',
      'constitutional-proposal',
      'credit-account',
      'civic-policy'
    )
  ),
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_turn INTEGER NOT NULL CHECK (updated_turn >= 0),
  status TEXT NOT NULL,
  record_json JSONB NOT NULL,
  PRIMARY KEY (season_id, record_type, id)
);

CREATE INDEX IF NOT EXISTS nexus_world_society_records_lookup_idx
  ON nexus_world_society_records(
    season_id,
    record_type,
    status,
    updated_turn DESC
  );
