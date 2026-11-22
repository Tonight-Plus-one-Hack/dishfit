-- Private camera scans (worker/src/routes/scans.ts): a guest photographs a menu or a plate and gets an
-- AI estimate. Only the reading is kept, never the photo. Rows belong to a device cookie, not an account.
CREATE TABLE scans (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('menu', 'plate')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'failed')),
  device_id TEXT NOT NULL CHECK (length(device_id) <= 64),
  ip_hash TEXT,
  mode TEXT NOT NULL,                        -- mock | anthropic | openai
  result TEXT CHECK (result IS NULL OR json_valid(result)),
  error TEXT,
  cost_micros INTEGER NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX scans_device_idx ON scans (device_id, created_at);
CREATE INDEX scans_ip_idx ON scans (ip_hash, created_at);
CREATE INDEX scans_created_idx ON scans (created_at);
