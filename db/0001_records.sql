CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  access_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  vehicle_json TEXT NOT NULL,
  transport_json TEXT NOT NULL,
  damage_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  finalized_at TEXT,
  stripe_session_id TEXT UNIQUE,
  manifest_json TEXT,
  manifest_sha256 TEXT
);
CREATE TABLE IF NOT EXISTS photos (
  record_id TEXT NOT NULL,
  photo_key TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (record_id, photo_key),
  FOREIGN KEY (record_id) REFERENCES records(id)
);
CREATE INDEX IF NOT EXISTS idx_records_status_created ON records(status, created_at);
