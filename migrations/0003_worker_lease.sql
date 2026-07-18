CREATE TABLE IF NOT EXISTS nexus_worker_leases (
  name TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  heartbeat_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
