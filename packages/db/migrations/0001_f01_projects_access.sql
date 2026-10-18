-- F01: projects, access, audit. No seed rows: a fresh database has no clients, projects, or accounts.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text,
  -- 'admin' may create clients and projects; project rights always come from memberships.
  global_role   text NOT NULL DEFAULT 'member' CHECK (global_role IN ('admin', 'member')),
  status        text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE activation_tokens (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE TABLE clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  sector      text NOT NULL DEFAULT '',
  contact     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clients_name_key ON clients (lower(name));

CREATE TABLE projects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES clients(id),
  name              text NOT NULL,
  description       text NOT NULL DEFAULT '',
  process_name      text NOT NULL,
  timezone          text NOT NULL DEFAULT 'Asia/Jakarta',
  contract_start    date NOT NULL,
  contract_end      date NOT NULL,
  retention_policy  text NOT NULL,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'suspended', 'ended', 'archived')),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at  timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (contract_end >= contract_start)
);
CREATE UNIQUE INDEX projects_client_name_key ON projects (client_id, lower(name));

CREATE TABLE memberships (
  project_id  uuid NOT NULL REFERENCES projects(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  role        text NOT NULL CHECK (role IN ('administrator', 'analyst', 'process_owner')),
  added_by    uuid REFERENCES users(id),
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
-- authorize() looks memberships up by (user, project); the PK covers (project, user).
CREATE INDEX memberships_user_project_idx ON memberships (user_id, project_id);

CREATE TABLE audit_events (
  id             bigserial PRIMARY KEY,
  project_id     uuid REFERENCES projects(id),
  actor_id       uuid REFERENCES users(id),
  action         text NOT NULL,
  object_type    text NOT NULL,
  object_id      text,
  result         text NOT NULL CHECK (result IN ('success', 'denied', 'failed')),
  correlation_id text NOT NULL,
  metadata_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_project_idx ON audit_events (project_id, created_at DESC);

CREATE FUNCTION audit_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END $$;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
