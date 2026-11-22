-- Cloudflare D1 schema for opt-in Garmin integration; no raw Garmin tokens.
CREATE TABLE IF NOT EXISTS garmin_oauth_flows (
  state TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  verifier_ciphertext TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  result TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS garmin_oauth_device_idx ON garmin_oauth_flows (device_hash, expires_at);

CREATE TABLE IF NOT EXISTS garmin_connections (
  device_hash TEXT PRIMARY KEY,
  garmin_user_id TEXT NOT NULL,
  access_ciphertext TEXT NOT NULL,
  refresh_ciphertext TEXT NOT NULL,
  access_expires_at INTEGER NOT NULL,
  refresh_expires_at INTEGER,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS garmin_user_connections_idx ON garmin_connections(garmin_user_id);

CREATE TABLE IF NOT EXISTS garmin_activities (
  garmin_user_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  duration_seconds INTEGER,
  sport TEXT NOT NULL,
  distance_meters REAL,
  mean_hr INTEGER,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (garmin_user_id, external_id)
);
CREATE INDEX IF NOT EXISTS garmin_activities_started_idx ON garmin_activities (garmin_user_id, started_at);

CREATE TABLE IF NOT EXISTS garmin_health (
  garmin_user_id TEXT NOT NULL,
  event_kind TEXT NOT NULL,
  observed_date TEXT NOT NULL,
  sleep_seconds INTEGER,
  resting_hr INTEGER,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (garmin_user_id, event_kind, observed_date)
);
CREATE INDEX IF NOT EXISTS garmin_health_observed_idx ON garmin_health (garmin_user_id, observed_date);
