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
