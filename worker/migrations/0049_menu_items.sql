ALTER TABLE restaurants ADD COLUMN logo_url TEXT;
ALTER TABLE dishes ADD COLUMN menu_item_source_url TEXT;

-- Internal inventory of first-party menu items, including those outside the public healthy catalog.
CREATE TABLE menu_items (
  id TEXT NOT NULL,
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price_cents INTEGER,
  course TEXT,
  dish_type TEXT,
  cuisine TEXT,
  is_vegan INTEGER,
  is_vegetarian INTEGER,
  is_gluten_free INTEGER,
  is_full_meal INTEGER,
  class_confidence TEXT,
  healthy INTEGER NOT NULL CHECK (healthy IN (0, 1)),
  nutrition TEXT CHECK (nutrition IS NULL OR json_valid(nutrition)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (restaurant_id, id)
) WITHOUT ROWID;

CREATE VIEW website_menu_items AS
SELECT d.id, d.restaurant_id, COALESCE(d.menu_item_source_url, m.url),
       d.name, d.description, d.category, d.price_cents, d.course, d.dish_type, d.cuisine,
       d.is_vegan, d.is_vegetarian, d.is_gluten_free, d.is_full_meal, d.class_confidence, COALESCE(d.healthy, 0),
       CASE WHEN d.kcal IS NOT NULL THEN json_object(
         'kcal', json_array(d.kcal, d.kcal_min, d.kcal_max),
         'proteinG', json_array(d.protein_g, d.protein_g_min, d.protein_g_max),
         'carbsG', json_array(d.carbs_g, d.carbs_g_min, d.carbs_g_max),
         'fatG', json_array(d.fat_g, d.fat_g_min, d.fat_g_max),
         'source', d.nutrition_source, 'confidence', d.confidence, 'method', d.method_note
       ) END, d.updated_at
  FROM dishes d JOIN menu_sources m ON m.id = d.menu_source_id
 WHERE m.kind IN ('website_html', 'website_pdf', 'website_image', 'official_nutrition')
   AND COALESCE(d.menu_item_source_url, m.url) IS NOT NULL;

INSERT INTO menu_items SELECT * FROM website_menu_items;

CREATE TRIGGER menu_items_after_insert AFTER INSERT ON dishes BEGIN
  INSERT INTO menu_items SELECT * FROM website_menu_items WHERE id = NEW.id;
END;

CREATE TRIGGER menu_items_after_update AFTER UPDATE ON dishes BEGIN
  DELETE FROM menu_items WHERE restaurant_id = OLD.restaurant_id AND id = OLD.id;
  INSERT INTO menu_items SELECT * FROM website_menu_items WHERE id = NEW.id;
END;

CREATE TRIGGER menu_items_after_delete AFTER DELETE ON dishes BEGIN
  DELETE FROM menu_items WHERE restaurant_id = OLD.restaurant_id AND id = OLD.id;
END;

CREATE TRIGGER menu_items_after_source_update AFTER UPDATE OF url, kind ON menu_sources
WHEN OLD.url IS NOT NEW.url OR OLD.kind IS NOT NEW.kind BEGIN
  DELETE FROM menu_items WHERE restaurant_id = NEW.restaurant_id AND id IN (SELECT id FROM dishes WHERE menu_source_id = NEW.id);
  INSERT INTO menu_items SELECT * FROM website_menu_items WHERE id IN (SELECT id FROM dishes WHERE menu_source_id = NEW.id);
END;
