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
