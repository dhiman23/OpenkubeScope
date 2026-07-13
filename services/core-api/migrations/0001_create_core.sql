-- core-api owns this schema. Same RDS instance as the other services, logically
-- separated. Replaces the monolith's Supabase Auth (now core.users + JWT) and
-- the workspaces/clusters/user_settings/subscriptions tables (no Supabase RLS —
-- access control is enforced in core-api application code via the auth user id).

CREATE SCHEMA IF NOT EXISTS core;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Replaces Supabase auth.users.
CREATE TABLE IF NOT EXISTS core.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_core_workspaces_user ON core.workspaces(user_id);

CREATE TABLE IF NOT EXISTS core.clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES core.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kubeconfig TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);
CREATE INDEX IF NOT EXISTS idx_core_clusters_workspace ON core.clusters(workspace_id);

CREATE TABLE IF NOT EXISTS core.user_settings (
  user_id UUID PRIMARY KEY REFERENCES core.users(id) ON DELETE CASCADE,
  active_workspace_id UUID REFERENCES core.workspaces(id) ON DELETE SET NULL,
  workspace_mode TEXT NOT NULL DEFAULT 'demo' CHECK (workspace_mode IN ('demo', 'real')),
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The stripe_* columns this table originally had (stripe_customer_id,
-- stripe_subscription_id, current_period_end, cancel_at_period_end) and their
-- index are dropped by 0003_drop_stripe.sql, which always runs immediately
-- after this file on every boot (migrations re-run idempotently on every
-- startup, not just once) — so they're omitted here entirely rather than
-- created and torn down again on every restart.
CREATE TABLE IF NOT EXISTS core.subscriptions (
  workspace_id UUID PRIMARY KEY REFERENCES core.workspaces(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'unlimited')),
  status TEXT NOT NULL DEFAULT 'inactive',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracks scan count per workspace for free-tier quota enforcement. The scans
-- themselves live in rbac-scanner-service's schema; quota/usage is core-api's
-- (billing) concern, so the counter lives here. Kept in sync by the scan
-- upload/delete routes.
CREATE TABLE IF NOT EXISTS core.scan_usage (
  workspace_id UUID PRIMARY KEY REFERENCES core.workspaces(id) ON DELETE CASCADE,
  scan_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION core.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'workspaces', 'clusters', 'user_settings', 'subscriptions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_%s_updated_at ON core.%I', t, t);
    EXECUTE format('CREATE TRIGGER set_%s_updated_at BEFORE UPDATE ON core.%I FOR EACH ROW EXECUTE FUNCTION core.set_updated_at()', t, t);
  END LOOP;
END $$;
