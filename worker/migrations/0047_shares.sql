-- Shared dish cards and the visits they bring (worker/src/share/routes.ts). No IPs, no accounts.
-- Every shared link carries ?ref=<channel>&s=<share id>, so a landing can be tied back to its share.

-- One tap on a share action: native share sheet, WhatsApp, copy link or story download.
CREATE TABLE shares (
  id TEXT PRIMARY KEY,                      -- short random id, the s= of the link
  dish_id TEXT NOT NULL,                    -- the app's dish id (share/dishes.json)
  channel TEXT NOT NULL CHECK (channel IN ('native', 'whatsapp', 'copy', 'story')),
  anon_id TEXT CHECK (anon_id IS NULL OR length(anon_id) <= 64),
  created_at INTEGER NOT NULL
);
CREATE INDEX shares_created_idx ON shares (created_at);
CREATE INDEX shares_dish_idx ON shares (dish_id, created_at);

-- One opened shared link. preview marks link-preview crawlers (WhatsApp, iMessage, Telegram), which
-- fetch the page to draw the preview card and are counted apart from people.
CREATE TABLE share_landings (
  id TEXT PRIMARY KEY,
  share_id TEXT CHECK (share_id IS NULL OR length(share_id) <= 32),
  dish_id TEXT NOT NULL,
  ref TEXT CHECK (ref IS NULL OR length(ref) <= 16),
  preview INTEGER NOT NULL DEFAULT 0 CHECK (preview IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX share_landings_created_idx ON share_landings (created_at);
CREATE INDEX share_landings_share_idx ON share_landings (share_id);
