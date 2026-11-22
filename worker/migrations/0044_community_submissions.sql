-- Community menu scans: a guest photographs a menu, the review agent (worker/src/community) reads it
-- with the pipeline's stages and publishes it, queues it for the team, or rejects it with a reason.
-- 0044 is the next free number after main's 0043_dish_class and 0043_scans, so it runs after both; it only
-- adds tables, columns and indexes, and touches none of #28's table rebuilds. Timestamps are epoch milliseconds (UTC).

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'review', 'published', 'rejected')),
  -- The restaurant the dishes belong to: an existing one, or the community restaurant this
  -- submission created (unpublished until the team approves it).
  restaurant_id TEXT REFERENCES restaurants (id) ON DELETE SET NULL,
  restaurant_ref TEXT,                       -- the id the app sent (may not exist in D1, e.g. seed data)
  restaurant_name TEXT NOT NULL CHECK (length(restaurant_name) BETWEEN 1 AND 120),
  is_new_restaurant INTEGER NOT NULL DEFAULT 0 CHECK (is_new_restaurant IN (0, 1)),
  new_lat REAL CHECK (new_lat IS NULL OR new_lat BETWEEN -90 AND 90),
  new_lng REAL CHECK (new_lng IS NULL OR new_lng BETWEEN -180 AND 180),
  new_address TEXT CHECK (new_address IS NULL OR length(new_address) <= 200),
  -- The photo stays private in R2 (SUBMISSIONS binding) and is never served publicly.
  photo_key TEXT NOT NULL,
  photo_sha256 TEXT NOT NULL,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('image/jpeg', 'image/png', 'image/webp')),
  photo_bytes INTEGER NOT NULL CHECK (photo_bytes > 0),
  ip_hash TEXT,                              -- daily-salted IP hash (rate limits), never the IP
  device_id TEXT CHECK (device_id IS NULL OR length(device_id) <= 64),
  review_mode TEXT CHECK (review_mode IS NULL OR review_mode IN ('mock', 'anthropic', 'openai', 'none')),
  review TEXT CHECK (review IS NULL OR json_valid(review)),   -- extracted dishes, nutrition, rule results
  confidence TEXT CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
  reason TEXT,                               -- German reason shown to the guest when rejected
  team_note TEXT,                            -- why the agent sent it to the team queue
  dish_count INTEGER NOT NULL DEFAULT 0 CHECK (dish_count >= 0),
  cost_micros INTEGER NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),   -- AI cost of this submission, USD x 1e6
  decided_by TEXT CHECK (decided_by IS NULL OR decided_by IN ('agent', 'team')),
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  decided_at INTEGER
);
CREATE INDEX submissions_ip_idx ON submissions (ip_hash, created_at);
CREATE INDEX submissions_device_idx ON submissions (device_id, created_at);
CREATE INDEX submissions_status_idx ON submissions (status, created_at);
CREATE INDEX submissions_photo_idx ON submissions (photo_sha256);
CREATE INDEX submissions_restaurant_idx ON submissions (restaurant_id, status);

-- A restaurant a guest added; it reaches the map only when published_at is set (team approval).
ALTER TABLE restaurants ADD COLUMN community_submission_id TEXT;
-- A dish read from a guest's menu photo; the app shows a "Community" badge with this date.
ALTER TABLE dishes ADD COLUMN community_submission_id TEXT;
ALTER TABLE dishes ADD COLUMN community_added_at INTEGER;
CREATE INDEX dishes_community_idx ON dishes (community_submission_id);
-- Cost per submission: every AI call of a review carries its submission id.
ALTER TABLE ai_usage ADD COLUMN submission_id TEXT;
