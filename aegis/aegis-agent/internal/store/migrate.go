// internal/store/migrate.go — schema bootstrap. Idempotent.
package store

import "context"

const schema = `
CREATE TABLE IF NOT EXISTS operators (
  id              TEXT PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('owner','admin','operator','readonly')),
  totp_secret_enc BLOB,
  recovery_hashes TEXT NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  disabled_at     INTEGER
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id           TEXT PRIMARY KEY,
  operator_id  TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  public_key   BLOB NOT NULL,
  attestation  BLOB,
  sign_count   INTEGER NOT NULL DEFAULT 0,
  transports   TEXT NOT NULL DEFAULT '[]',
  nickname     TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_used    INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  operator_id  TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  ip           TEXT NOT NULL,
  user_agent   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  revoked_at   INTEGER
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id           TEXT PRIMARY KEY,
  operator_id  TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  hash         BLOB NOT NULL,
  scopes       TEXT NOT NULL,
  ip_cidr      TEXT,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER,
  last_used_at INTEGER,
  revoked_at   INTEGER
);

CREATE TABLE IF NOT EXISTS audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  actor       TEXT NOT NULL,
  actor_kind  TEXT NOT NULL CHECK(actor_kind IN ('operator','token','system')),
  source_ip   TEXT,
  action      TEXT NOT NULL,
  resource    TEXT,
  before      TEXT,
  after       TEXT,
  job_id      TEXT,
  result      TEXT NOT NULL CHECK(result IN ('ok','denied','error')),
  prev_hmac   BLOB NOT NULL,
  hmac        BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_ts ON audit(ts);
CREATE INDEX IF NOT EXISTS audit_actor ON audit(actor);

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  params      TEXT NOT NULL,
  status      TEXT NOT NULL,
  progress    INTEGER NOT NULL DEFAULT 0,
  log         TEXT NOT NULL DEFAULT '',
  error       TEXT,
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  started_at  INTEGER,
  ended_at    INTEGER
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  metric      TEXT NOT NULL,
  comparator  TEXT NOT NULL,
  threshold   REAL NOT NULL,
  duration_s  INTEGER NOT NULL,
  severity    TEXT NOT NULL,
  channels    TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id    TEXT,
  fired_at   INTEGER NOT NULL,
  resolved_at INTEGER,
  ack_at     INTEGER,
  ack_by     TEXT,
  severity   TEXT NOT NULL,
  message    TEXT NOT NULL,
  details    TEXT
);

CREATE TABLE IF NOT EXISTS notification_channels (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL,
  name      TEXT NOT NULL,
  config_enc BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS secrets (
  id        TEXT PRIMARY KEY,
  scope     TEXT NOT NULL,
  name      TEXT NOT NULL,
  value_enc BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(scope, name)
);

CREATE TABLE IF NOT EXISTS apps (
  id          TEXT PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  source      TEXT NOT NULL,
  runtime     TEXT NOT NULL,
  config      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_releases (
  id          TEXT PRIMARY KEY,
  app_id      TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  ref         TEXT NOT NULL,
  status      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_repos (
  id        TEXT PRIMARY KEY,
  name      TEXT UNIQUE NOT NULL,
  config_enc BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_jobs (
  id        TEXT PRIMARY KEY,
  repo_id   TEXT NOT NULL REFERENCES backup_repos(id),
  name      TEXT NOT NULL,
  config    TEXT NOT NULL,
  schedule  TEXT,
  last_run  INTEGER,
  last_status TEXT
);

CREATE TABLE IF NOT EXISTS terminal_recordings (
  id          TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  path        TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS undo_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  description TEXT NOT NULL,
  payload_enc BLOB NOT NULL,
  expires_at  INTEGER NOT NULL
);
`

func Migrate(ctx context.Context, db *DB) error {
	_, err := db.ExecContext(ctx, schema)
	return err
}
