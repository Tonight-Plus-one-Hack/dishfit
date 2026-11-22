-- App data the Worker serves. The pipeline fills these tables and keeps its own
-- queue and status tables in migrations 0010-0029; 0001-0009 belong to the Worker.
-- Timestamps are epoch milliseconds (UTC). Ids are random UUIDs, never auto-increment.

-- One restaurant. google_place_id is the only value from Google we store: the
-- Places API terms allow keeping place ids, not names, addresses, ratings,
-- photos or photo references (docs/plan.md, "Google Places compliance").
-- Everything else here is our own data: name, address and opening hours from the
-- restaurant's own website, coordinates from our own geocoding. Ratings, photos
-- and live hours come from Google's own components in the browser, by place id.
CREATE TABLE restaurants (
  id TEXT PRIMARY KEY,                      -- created by the pipeline, stable across re-scans
  google_place_id TEXT UNIQUE,
  name TEXT NOT NULL,
  kiez TEXT NOT NULL,                       -- slug from packages/contract KIEZE
  lat REAL CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),      -- NULL: not on the map, still in Kiez lists
  lng REAL CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  address TEXT,
  website_url TEXT,
  opening_hours TEXT CHECK (opening_hours IS NULL OR json_valid(opening_hours)),   -- {"periods": [...]}, see packages/contract OpeningHours
  published_at INTEGER,                     -- NULL: not visible in the app (the release gate sets it)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX restaurants_kiez_idx ON restaurants (kiez, published_at);
CREATE INDEX restaurants_location_idx ON restaurants (lat, lng);

-- Where a menu came from: the restaurant's own website or its official nutrition table.
CREATE TABLE menu_sources (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('website_html', 'website_pdf', 'website_image', 'official_nutrition', 'manual')),
  url TEXT,                                 -- page or file URL
  content_sha256 TEXT,                      -- detects an unchanged menu on the next run
  fetched_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX menu_sources_restaurant_idx ON menu_sources (restaurant_id, fetched_at);

-- One dish with its price and nutrition. Nutrition is an AI estimate (range and
-- confidence) unless the restaurant publishes official values.
CREATE TABLE dishes (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  menu_source_id TEXT REFERENCES menu_sources (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  kcal REAL, kcal_min REAL, kcal_max REAL,
  protein_g REAL, protein_g_min REAL, protein_g_max REAL,
  carbs_g REAL, carbs_g_min REAL, carbs_g_max REAL,
  fat_g REAL, fat_g_min REAL, fat_g_max REAL,
  nutrition_source TEXT CHECK (nutrition_source IS NULL OR nutrition_source IN ('ai', 'official')),
  confidence TEXT CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
  method_note TEXT,                         -- the "How is this calculated?" text
  ingredients TEXT CHECK (ingredients IS NULL OR json_valid(ingredients)),   -- [{name, grams, foodId}] the estimate was computed from
  estimated_at INTEGER,
  health_score INTEGER CHECK (health_score IS NULL OR health_score BETWEEN 0 AND 100),
  protein_per_euro REAL GENERATED ALWAYS AS (
    CASE WHEN price_cents > 0 AND protein_g IS NOT NULL THEN round(protein_g * 100.0 / price_cents, 1) END
  ) VIRTUAL,
  ai_image_key TEXT,                        -- R2 key of an AI dish image (always labeled "AI image" in the app)
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (kcal IS NULL OR (kcal_min <= kcal AND kcal <= kcal_max)),
  CHECK (protein_g IS NULL OR (protein_g_min <= protein_g AND protein_g <= protein_g_max)),
  CHECK (carbs_g IS NULL OR (carbs_g_min <= carbs_g AND carbs_g <= carbs_g_max)),
  CHECK (fat_g IS NULL OR (fat_g_min <= fat_g AND fat_g <= fat_g_max)),
  -- Only a dish with a complete estimate can be shown.
  CHECK (published_at IS NULL OR (
    kcal IS NOT NULL AND protein_g IS NOT NULL AND carbs_g IS NOT NULL AND fat_g IS NOT NULL
    AND nutrition_source IS NOT NULL AND confidence IS NOT NULL AND method_note IS NOT NULL AND estimated_at IS NOT NULL
  ))
);
CREATE INDEX dishes_restaurant_idx ON dishes (restaurant_id, published_at);
CREATE INDEX dishes_protein_idx ON dishes (published_at, protein_g);
CREATE INDEX dishes_price_idx ON dishes (published_at, price_cents);

-- Cost of every paid call (AI, image generation, Google Places), from the Worker or the pipeline.
CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  purpose TEXT NOT NULL,                    -- e.g. menu_extract, nutrition, nutrition_check, image_match, image_generate, places_search, places_photo
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'google_places', 'cloudflare')),
  route TEXT NOT NULL DEFAULT 'direct' CHECK (route IN ('ai-gateway', 'direct')),
  model TEXT NOT NULL,                      -- model id or API SKU
  status INTEGER NOT NULL,                  -- HTTP status, 0 when there was no response
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cache_read_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cache_read_tokens >= 0),
  cache_write_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
  units INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),   -- billed requests or images for per-request SKUs
  cost_micros INTEGER CHECK (cost_micros IS NULL OR cost_micros >= 0),   -- USD x 1e6; NULL when no price is known
  kiez TEXT,                                -- for cost per Kiez
  restaurant_id TEXT
);
CREATE INDEX ai_usage_created_idx ON ai_usage (created_at);
CREATE INDEX ai_usage_model_idx ON ai_usage (provider, model, created_at);

-- Product analytics. No IPs, no accounts: anon_id is a random id kept on the device.
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  anon_id TEXT CHECK (anon_id IS NULL OR length(anon_id) <= 64),
  client_at INTEGER,
  props TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(props) AND length(props) <= 1000),
  created_at INTEGER NOT NULL
);
CREATE INDEX events_name_idx ON events (name, created_at);

-- Today's random salt for IP hashes (rate limits). Only today's row is kept,
-- so an old hash can never be linked back to an IP.
CREATE TABLE ip_salts (
  day TEXT PRIMARY KEY,                     -- YYYY-MM-DD (UTC)
  salt TEXT NOT NULL
);
