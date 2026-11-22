-- Photo storage in Workers KV (worker/src/lib/photo-store.ts, binding PHOTOS). Timestamps are epoch milliseconds (UTC).

-- Private camera scans keep their photo for 30 days (KV expirationTtl), for the device that took it only.
-- photo_key is cleared when the guest deletes the photo or the scan; photo_expires_at mirrors the KV expiry.
ALTER TABLE scans ADD COLUMN photo_key TEXT;
ALTER TABLE scans ADD COLUMN photo_type TEXT CHECK (photo_type IS NULL OR photo_type IN ('image/jpeg', 'image/png', 'image/webp'));
ALTER TABLE scans ADD COLUMN photo_expires_at INTEGER;

-- KV operations per UTC day, for the soft guard below the Workers Free limits (1,000 writes and 1,000 deletes a day).
CREATE TABLE storage_ops (
  day TEXT NOT NULL,                         -- YYYY-MM-DD (UTC), when KV's daily limits reset
  op TEXT NOT NULL CHECK (op IN ('write', 'delete')),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, op)
);
