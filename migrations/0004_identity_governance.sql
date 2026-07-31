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
