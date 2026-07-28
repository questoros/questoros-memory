-- Standalone MemoryOS identity realm.
-- These tables are deliberately separate from QuestorOS application identities.

ALTER TABLE tenants SET (schema_locked = false);
ALTER TABLE workspaces SET (schema_locked = false);
ALTER TABLE actors SET (schema_locked = false);
ALTER TABLE api_keys SET (schema_locked = false);

CREATE TABLE IF NOT EXISTS portal_identities (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  email STRING NOT NULL,
  display_name STRING NULL,
  password_hash STRING NOT NULL,
  status STRING NOT NULL DEFAULT 'ACTIVE',
  email_verified_at TIMESTAMPTZ(6) NULL,
  failed_login_count INT4 NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ(6) NULL,
  password_changed_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ(6) NULL,
  CONSTRAINT portal_identities_pkey PRIMARY KEY (id),
  CONSTRAINT portal_identities_email_unique UNIQUE (email),
  CONSTRAINT portal_identities_status_check CHECK (status IN ('ACTIVE', 'DISABLED', 'PENDING_VERIFICATION')),
  CONSTRAINT portal_identities_failed_login_count_check CHECK (failed_login_count >= 0)
);

CREATE INDEX IF NOT EXISTS portal_identities_status_updated_idx
  ON portal_identities (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS portal_memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  role STRING NOT NULL DEFAULT 'READER',
  status STRING NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  disabled_at TIMESTAMPTZ(6) NULL,
  CONSTRAINT portal_memberships_pkey PRIMARY KEY (id),
  CONSTRAINT portal_memberships_identity_scope_unique UNIQUE (identity_id, tenant_id, workspace_id),
  CONSTRAINT portal_memberships_identity_fkey FOREIGN KEY (identity_id) REFERENCES portal_identities(id),
  CONSTRAINT portal_memberships_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT portal_memberships_workspace_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id),
  CONSTRAINT portal_memberships_actor_fkey FOREIGN KEY (tenant_id, actor_id) REFERENCES actors(tenant_id, id),
  CONSTRAINT portal_memberships_role_check CHECK (role IN ('READER', 'CONTRIBUTOR', 'REVIEWER', 'PUBLISHER', 'AUDITOR', 'ADMINISTRATOR', 'OWNER')),
  CONSTRAINT portal_memberships_status_check CHECK (status IN ('ACTIVE', 'DISABLED'))
);

CREATE INDEX IF NOT EXISTS portal_memberships_scope_status_idx
  ON portal_memberships (tenant_id, workspace_id, status);
CREATE INDEX IF NOT EXISTS portal_memberships_identity_status_idx
  ON portal_memberships (identity_id, status);

CREATE TABLE IF NOT EXISTS portal_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL,
  membership_id UUID NOT NULL,
  api_key_id UUID NOT NULL,
  token_hash STRING NOT NULL,
  csrf_hash STRING NOT NULL,
  user_agent_hash STRING NULL,
  ip_address_hash STRING NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  last_seen_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ(6) NULL,
  revocation_reason STRING NULL,
  CONSTRAINT portal_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT portal_sessions_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT portal_sessions_identity_fkey FOREIGN KEY (identity_id) REFERENCES portal_identities(id),
  CONSTRAINT portal_sessions_membership_fkey FOREIGN KEY (membership_id) REFERENCES portal_memberships(id),
  CONSTRAINT portal_sessions_api_key_fkey FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

CREATE INDEX IF NOT EXISTS portal_sessions_identity_active_idx
  ON portal_sessions (identity_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS portal_sessions_membership_active_idx
  ON portal_sessions (membership_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS portal_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  invited_by_identity_id UUID NOT NULL,
  email STRING NOT NULL,
  role STRING NOT NULL DEFAULT 'READER',
  token_hash STRING NOT NULL,
  status STRING NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ(6) NOT NULL,
  accepted_at TIMESTAMPTZ(6) NULL,
  accepted_by_identity_id UUID NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ(6) NULL,
  CONSTRAINT portal_invitations_pkey PRIMARY KEY (id),
  CONSTRAINT portal_invitations_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT portal_invitations_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT portal_invitations_workspace_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id),
  CONSTRAINT portal_invitations_inviter_fkey FOREIGN KEY (invited_by_identity_id) REFERENCES portal_identities(id),
  CONSTRAINT portal_invitations_accepted_identity_fkey FOREIGN KEY (accepted_by_identity_id) REFERENCES portal_identities(id),
  CONSTRAINT portal_invitations_role_check CHECK (role IN ('READER', 'CONTRIBUTOR', 'REVIEWER', 'PUBLISHER', 'AUDITOR', 'ADMINISTRATOR')),
  CONSTRAINT portal_invitations_status_check CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'))
);

CREATE INDEX IF NOT EXISTS portal_invitations_scope_status_idx
  ON portal_invitations (tenant_id, workspace_id, status, expires_at);
CREATE INDEX IF NOT EXISTS portal_invitations_email_status_idx
  ON portal_invitations (email, status, expires_at);

CREATE TABLE IF NOT EXISTS portal_identity_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL,
  token_type STRING NOT NULL,
  token_hash STRING NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ(6) NULL,
  CONSTRAINT portal_identity_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT portal_identity_tokens_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT portal_identity_tokens_identity_fkey FOREIGN KEY (identity_id) REFERENCES portal_identities(id),
  CONSTRAINT portal_identity_tokens_type_check CHECK (token_type IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET'))
);

CREATE INDEX IF NOT EXISTS portal_identity_tokens_identity_type_idx
  ON portal_identity_tokens (identity_id, token_type, expires_at);

CREATE TABLE IF NOT EXISTS portal_identity_links (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  provider STRING NOT NULL,
  external_subject STRING NOT NULL,
  linked_by_identity_id UUID NOT NULL,
  status STRING NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ(6) NULL,
  CONSTRAINT portal_identity_links_pkey PRIMARY KEY (id),
  CONSTRAINT portal_identity_links_external_scope_unique UNIQUE (provider, external_subject, tenant_id),
  CONSTRAINT portal_identity_links_identity_fkey FOREIGN KEY (identity_id) REFERENCES portal_identities(id),
  CONSTRAINT portal_identity_links_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT portal_identity_links_linker_fkey FOREIGN KEY (linked_by_identity_id) REFERENCES portal_identities(id),
  CONSTRAINT portal_identity_links_status_check CHECK (status IN ('ACTIVE', 'REVOKED'))
);

CREATE INDEX IF NOT EXISTS portal_identity_links_identity_scope_idx
  ON portal_identity_links (identity_id, tenant_id, status);

CREATE TABLE IF NOT EXISTS portal_auth_audit_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  identity_id UUID NULL,
  tenant_id UUID NULL,
  action STRING NOT NULL,
  outcome STRING NOT NULL,
  request_id STRING NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT portal_auth_audit_events_pkey PRIMARY KEY (id),
  CONSTRAINT portal_auth_audit_identity_fkey FOREIGN KEY (identity_id) REFERENCES portal_identities(id),
  CONSTRAINT portal_auth_audit_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS portal_auth_audit_identity_created_idx
  ON portal_auth_audit_events (identity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_auth_audit_tenant_created_idx
  ON portal_auth_audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_auth_audit_action_created_idx
  ON portal_auth_audit_events (action, created_at DESC);
