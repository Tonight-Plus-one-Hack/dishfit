-- Community profiles on top of #33's submissions: an anonymous device profile (signed device cookie,
-- worker/src/lib/device.ts), "Hat das gestimmt?" confirmations per dish, badges and the Kiez leaderboard.
-- 0045: after main's 0043_dish_class, 0043_scans and 0044_community_submissions (#33, renumbered on merge).
-- Timestamps are epoch milliseconds (UTC).

-- One row per device profile; the id is the one inside the signed `wohin_device` cookie and the
-- value #33 already writes to submissions.device_id.
-- Upgrade hook: a passwordless account (magic link) later adds an `accounts` table and sets account_id
-- here, so every device of one person points at one account. Nothing in this schema changes for that.
CREATE TABLE profiles (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 8 AND 64),
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 2 AND 24),
  nickname_custom INTEGER NOT NULL DEFAULT 0 CHECK (nickname_custom IN (0, 1)),
  nickname_updated_at INTEGER,
  account_id TEXT,
  created_ip_hash TEXT,                       -- daily-salted IP hash, only to cap new profiles per network
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX profiles_ip_idx ON profiles (created_ip_hash, created_at);
CREATE INDEX profiles_account_idx ON profiles (account_id) WHERE account_id IS NOT NULL;

-- "Hat das gestimmt?": one verdict per profile and dish, changeable. dish_ref is the id the app shows
-- (its seed data uses other ids than D1, like submissions.restaurant_ref), so there is no foreign key.
CREATE TABLE dish_confirmations (
  dish_ref TEXT NOT NULL CHECK (length(dish_ref) BETWEEN 1 AND 64),
  profile_id TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('yes', 'no')),
  correction TEXT CHECK (correction IS NULL OR length(correction) <= 200),
  dish_name TEXT CHECK (dish_name IS NULL OR length(dish_name) <= 120),        -- for the profile list
  restaurant_ref TEXT CHECK (restaurant_ref IS NULL OR length(restaurant_ref) <= 64),
  ip_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (dish_ref, profile_id)
);
CREATE INDEX dish_confirmations_profile_idx ON dish_confirmations (profile_id, updated_at);
CREATE INDEX dish_confirmations_ip_idx ON dish_confirmations (ip_hash, created_at);
CREATE INDEX dish_confirmations_verdict_idx ON dish_confirmations (verdict, updated_at);

-- Thank-you moments: earned once, shown once (seen_at).
CREATE TABLE profile_badges (
  profile_id TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  badge TEXT NOT NULL CHECK (badge IN ('first_scan', 'first_restaurant', 'ten_confirmations')),
  earned_at INTEGER NOT NULL,
  seen_at INTEGER,
  PRIMARY KEY (profile_id, badge)
);

-- The Kiez a scan counts for on the leaderboard: the restaurant's Kiez, the new place's Kiez, or the
-- Kiez the app sent for a restaurant D1 does not have yet.
ALTER TABLE submissions ADD COLUMN kiez TEXT;
UPDATE submissions SET kiez = (SELECT r.kiez FROM restaurants r WHERE r.id = submissions.restaurant_id) WHERE restaurant_id IS NOT NULL;
CREATE INDEX submissions_kiez_idx ON submissions (kiez, status, created_at);
