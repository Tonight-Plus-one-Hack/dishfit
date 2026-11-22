-- Dish classification (packages/contract/src/dish-class.ts): course, dish type, cuisine, diet flags and
-- whether the dish is a whole meal. The API shows and ranks only healthy dishes (HEALTHY_RULES); the others
-- stay here with healthy = 0 so nothing is deleted. NULL until the dish is classified.
ALTER TABLE dishes ADD COLUMN course TEXT CHECK (course IS NULL OR course IN ('starter', 'main', 'side', 'soup', 'salad', 'dessert', 'drink', 'snack_breakfast'));
ALTER TABLE dishes ADD COLUMN dish_type TEXT;
ALTER TABLE dishes ADD COLUMN cuisine TEXT;
ALTER TABLE dishes ADD COLUMN is_vegan INTEGER CHECK (is_vegan IS NULL OR is_vegan IN (0, 1));
ALTER TABLE dishes ADD COLUMN is_vegetarian INTEGER CHECK (is_vegetarian IS NULL OR is_vegetarian IN (0, 1));
ALTER TABLE dishes ADD COLUMN is_gluten_free INTEGER CHECK (is_gluten_free IS NULL OR is_gluten_free IN (0, 1));
ALTER TABLE dishes ADD COLUMN is_full_meal INTEGER CHECK (is_full_meal IS NULL OR is_full_meal IN (0, 1));
ALTER TABLE dishes ADD COLUMN class_confidence TEXT CHECK (class_confidence IS NULL OR class_confidence IN ('high', 'medium', 'low'));
ALTER TABLE dishes ADD COLUMN healthy INTEGER CHECK (healthy IS NULL OR healthy IN (0, 1));
CREATE INDEX dishes_course_idx ON dishes (published_at, healthy, is_full_meal, course);
