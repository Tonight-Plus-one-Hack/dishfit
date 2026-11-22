CREATE TABLE numbers_excluded (
  anon_id TEXT NOT NULL PRIMARY KEY,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Replace the original name index to bound daily duplicate checks; created_at serves the public numbers query.
CREATE INDEX events_device_idx ON events (name, anon_id, created_at);
DROP INDEX events_name_idx;
CREATE INDEX events_created_idx ON events (created_at);
