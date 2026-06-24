-- Jenkins-style bootstrap admin + forced credential change.
--
-- Adds username login (alongside email) and a must_change_credentials flag.
-- On first boot core-api seeds a single admin account (username 'admin',
-- password 'admin', must_change_credentials = true) — see ensureBootstrapAdmin()
-- in src/repositories/users.ts. The user is forced to set a new username +
-- password before any other action is allowed (enforced via the JWT mustChange
-- claim + requireCredentialsChanged middleware).

-- Email becomes optional: the bootstrap admin has no email until the user adds one.
ALTER TABLE core.users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE core.users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE core.users ADD COLUMN IF NOT EXISTS must_change_credentials BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_users_username ON core.users(lower(username)) WHERE username IS NOT NULL;
