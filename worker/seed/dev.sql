-- Local dev seed: three made-up restaurants and their dishes so the API returns something.
-- Test data only: the names say so and there are no Google place ids. Never apply this to staging or production.
-- Load with: npm run db:migrate:local && npm run db:seed:local

DELETE FROM dishes WHERE restaurant_id LIKE 'dev-%';
DELETE FROM menu_sources WHERE restaurant_id LIKE 'dev-%';
DELETE FROM restaurants WHERE id LIKE 'dev-%';

INSERT INTO restaurants (id, google_place_id, name, kiez, lat, lng, address, website_url, opening_hours, published_at, created_at, updated_at) VALUES
  ('dev-bowl-mitte', NULL, 'Test data: Bowl Bar Mitte', 'mitte', 52.5246, 13.4027, 'Teststraße 1, 10115 Berlin', NULL,
   '{"periods":[{"open":{"day":1,"hour":11,"minute":0},"close":{"day":1,"hour":22,"minute":0}},{"open":{"day":2,"hour":11,"minute":0},"close":{"day":2,"hour":22,"minute":0}},{"open":{"day":3,"hour":11,"minute":0},"close":{"day":3,"hour":22,"minute":0}},{"open":{"day":4,"hour":11,"minute":0},"close":{"day":4,"hour":22,"minute":0}},{"open":{"day":5,"hour":11,"minute":0},"close":{"day":5,"hour":23,"minute":0}},{"open":{"day":6,"hour":12,"minute":0},"close":{"day":6,"hour":23,"minute":0}}]}',
   1795280000000, 1795280000000, 1795280000000),
  ('dev-falafel-xberg', NULL, 'Test data: Falafel Kreuzberg', 'kreuzberg', 52.4986, 13.4189, 'Testweg 2, 10999 Berlin', NULL,
   '{"periods":[{"open":{"day":0,"hour":0,"minute":0}}]}',
   1795280000000, 1795280000000, 1795280000000),
  ('dev-poke-pberg', NULL, 'Test data: Poke Prenzlauer Berg', 'prenzlauer-berg', 52.5389, 13.4245, 'Testallee 3, 10405 Berlin', NULL,
   NULL, 1795280000000, 1795280000000, 1795280000000);

INSERT INTO dishes (id, restaurant_id, name, description, category, price_cents,
  kcal, kcal_min, kcal_max, protein_g, protein_g_min, protein_g_max, carbs_g, carbs_g_min, carbs_g_max, fat_g, fat_g_min, fat_g_max,
  nutrition_source, confidence, method_note, estimated_at, health_score, published_at, created_at, updated_at) VALUES
  ('dev-d1', 'dev-bowl-mitte', 'Chicken teriyaki bowl', 'Rice, grilled chicken, edamame, cucumber', 'Bowls', 1150,
   680, 590, 780, 44, 36, 52, 78, 65, 90, 18, 13, 24, 'ai', 'medium', 'Test data. AI listed ingredients and grams; macros computed from USDA values.', 1795280000000, 72, 1795280000000, 1795280000000, 1795280000000),
  ('dev-d2', 'dev-bowl-mitte', 'Tofu greens bowl', 'Quinoa, tofu, kale, sesame dressing', 'Bowls', 1090,
   560, 480, 650, 27, 21, 33, 58, 48, 68, 22, 16, 29, 'ai', 'medium', 'Test data. AI listed ingredients and grams; macros computed from USDA values.', 1795280000000, 81, 1795280000000, 1795280000000, 1795280000000),
  ('dev-d3', 'dev-falafel-xberg', 'Falafel plate with hummus', 'Six falafel, hummus, salad, bread', 'Plates', 950,
   820, 700, 950, 26, 20, 32, 96, 80, 112, 36, 28, 45, 'ai', 'low', 'Test data. AI listed ingredients and grams; macros computed from USDA values.', 1795280000000, 55, 1795280000000, 1795280000000, 1795280000000),
  ('dev-d4', 'dev-falafel-xberg', 'Halloumi wrap', 'Grilled halloumi, salad, garlic sauce', 'Wraps', 750,
   640, 550, 740, 28, 23, 34, 52, 44, 60, 34, 27, 42, 'ai', 'medium', 'Test data. AI listed ingredients and grams; macros computed from USDA values.', 1795280000000, 48, 1795280000000, 1795280000000, 1795280000000),
  ('dev-d5', 'dev-poke-pberg', 'Salmon poke', 'Sushi rice, salmon, avocado, mango', 'Poke', 1290,
   720, 630, 820, 34, 28, 40, 82, 70, 94, 26, 20, 33, 'ai', 'high', 'Test data. AI listed ingredients and grams; macros computed from USDA values.', 1795280000000, 76, 1795280000000, 1795280000000, 1795280000000);
