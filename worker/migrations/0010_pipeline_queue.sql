-- Pipeline queue and working tables (owned by pipeline/; migrations 0010-0029 are reserved for it).
-- Google policy: the only value stored from the Places API is google_place_id. Ratings, photos,
-- opening hours, names and addresses from Places are never written here; the restaurant base comes
-- from OpenStreetMap (ODbL) and menus from the restaurant's own website.

CREATE TABLE IF NOT EXISTS pipeline_restaurant (
  id TEXT PRIMARY KEY,                    -- "osm:node/123"
  kiez TEXT NOT NULL,
  osm_id TEXT NOT NULL UNIQUE,            -- "node/123"
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  street TEXT,
  housenumber TEXT,
  postcode TEXT,
  cuisine TEXT NOT NULL DEFAULT '[]',     -- JSON array of OSM cuisine values
  opening_hours TEXT,                     -- raw OSM opening_hours
  website TEXT,                           -- OSM website tag
  amenity TEXT NOT NULL,
  diet_vegan TEXT,
  diet_vegetarian TEXT,
  osm_fetched_at TEXT NOT NULL,
  google_place_id TEXT UNIQUE,
  places_checked_at TEXT,
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'found', 'menu', 'nutrition', 'checked', 'image', 'approved')),
  skip_reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  check_verdict TEXT CHECK (check_verdict IN ('ok', 'needs_review', 'reject')),
  check_confidence TEXT CHECK (check_confidence IN ('high', 'medium', 'low')),
  check_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS pipeline_restaurant_queue ON pipeline_restaurant (kiez, status, skip_reason);

-- Stage 1 search tiles per Kiez (resumable adaptive quadtree).
CREATE TABLE IF NOT EXISTS pipeline_tile (
  kiez TEXT NOT NULL,
  tile_id TEXT NOT NULL,
  south REAL NOT NULL,
  west REAL NOT NULL,
  north REAL NOT NULL,
  east REAL NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'split', 'done')),
  hits INTEGER,
  matched INTEGER,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (kiez, tile_id)
);

-- Where a restaurant's menu came from (stage 2).
CREATE TABLE IF NOT EXISTS pipeline_menu_source (
  restaurant_id TEXT PRIMARY KEY REFERENCES pipeline_restaurant (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                     -- website-html | website-pdf | website-image | snap | fixture
  url TEXT,
  fetched_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  menu_language TEXT,
  notes TEXT,
  model TEXT,
  dish_count INTEGER NOT NULL DEFAULT 0,
  has_official_nutrition INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pipeline_dish (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES pipeline_restaurant (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  section TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  price_eur REAL,
  printed TEXT,                           -- JSON {kcal, protein, carbs, fat} printed by the restaurant
  ingredients TEXT,                       -- JSON [{food, grams, note}] (stage 3, LLM)
  recipe_confidence TEXT,
  kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL,
  fiber_g REAL, sugar_g REAL, sat_fat_g REAL, sodium_mg REAL,
  kcal_min REAL, kcal_max REAL, protein_min REAL, protein_max REAL,
  carbs_min REAL, carbs_max REAL, fat_min REAL, fat_max REAL,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  nutrition_source TEXT CHECK (nutrition_source IN ('official', 'ai')),
  method_note TEXT,
  health_score INTEGER,
  protein_per_euro REAL,
  check_flags TEXT,                       -- JSON array of deterministic outlier flags (stage 4)
  second_opinion TEXT,                    -- JSON second-model result (stage 4)
  check_status TEXT CHECK (check_status IN ('ok', 'adjusted', 'flagged')),
  image_kind TEXT CHECK (image_kind IN ('ai')),
  image_ref TEXT,
  review_status TEXT CHECK (review_status IN ('correct', 'wrong')),
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS pipeline_dish_restaurant ON pipeline_dish (restaurant_id, position);

-- AI dish images, deduplicated by a normalised dish key so generic dishes share one image.
CREATE TABLE IF NOT EXISTS pipeline_image (
  key TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Every paid call (LLM, image, Places) with its cost; mirrors the JSONL ledger.
CREATE TABLE IF NOT EXISTS pipeline_cost (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  kiez TEXT,
  restaurant_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  usd REAL NOT NULL,
  estimated INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER,
  output_tokens INTEGER,
  purpose TEXT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS pipeline_cost_stage ON pipeline_cost (stage, kiez);
CREATE INDEX IF NOT EXISTS pipeline_cost_run ON pipeline_cost (run_id);

-- Stage 6 team review sample (exported as CSV, verdicts imported back).
CREATE TABLE IF NOT EXISTS pipeline_review (
  id TEXT PRIMARY KEY,
  kiez TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  restaurant_id TEXT NOT NULL REFERENCES pipeline_restaurant (id) ON DELETE CASCADE,
  dish_id TEXT NOT NULL REFERENCES pipeline_dish (id) ON DELETE CASCADE,
  exported_at TEXT NOT NULL,
  verdict TEXT CHECK (verdict IN ('passt', 'falsch')),
  note TEXT,
  imported_at TEXT
);
CREATE INDEX IF NOT EXISTS pipeline_review_kiez ON pipeline_review (kiez, verdict);
