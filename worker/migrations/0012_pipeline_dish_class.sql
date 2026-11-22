-- Dish classification from the pipeline's classify stage (pipeline/src/stages/classify.ts):
-- JSON DishClass (packages/contract/src/dish-class.ts) and the hash of the dish text it was computed from,
-- so a re-run only classifies new or changed dishes.
ALTER TABLE pipeline_dish ADD COLUMN dish_class TEXT CHECK (dish_class IS NULL OR json_valid(dish_class));
ALTER TABLE pipeline_dish ADD COLUMN dish_class_hash TEXT;
