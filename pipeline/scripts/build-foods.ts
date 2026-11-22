// Builds pipeline/data/foods.json: a compact per-100 g nutrient table for common restaurant
// ingredients from USDA FoodData Central "SR Legacy" (public domain, CC0 1.0).
//
// Usage: node scripts/build-foods.ts <path to unzipped FoodData_Central_sr_legacy_food_csv_2018-04>
// Download: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
//
// Each spec row names either an exact FDC id or a query: "&"-separated substrings that must all
// appear in the USDA description; the shortest matching description wins. The build fails when a
// query matches nothing, so the table never silently drifts.
// Composite rows (dressings, doner meat, dough, ...) are fixed recipes over other rows, computed
// here from the USDA values, so every number traces back to USDA.

import { readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FoodGroup, FoodRow } from '../src/nutrition/foods.ts';

type Spec = { key: string; group: FoodGroup; q?: string; fdc?: number; de?: string[]; note?: string };
type Composite = { key: string; group: FoodGroup; de?: string[]; recipe: Record<string, number>; note: string };

const SPEC: Spec[] = [
  // Poultry, meat, fish (cooked weights)
  { key: 'chicken_breast_cooked', group: 'lean_protein', q: 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', de: ['Hähnchenbrust', 'Hühnerbrust'] },
  { key: 'chicken_thigh_cooked', group: 'lean_protein', q: 'Chicken, broilers or fryers, thigh, meat only, cooked, roasted', de: ['Hähnchenschenkel', 'Hähnchen'] },
  { key: 'chicken_breast_fried_battered', group: 'fried', q: 'Chicken, broilers or fryers, breast, meat and skin, cooked, fried, batter', de: ['Backhähnchen', 'Crispy Chicken', 'Chicken Nuggets'] },
  { key: 'chicken_wing_fried', group: 'fried', q: 'Fast Foods, Fried Chicken, Wing, meat and skin and breading', de: ['Chicken Wings'] },
  { key: 'turkey_breast_cooked', group: 'lean_protein', q: 'Turkey, whole, breast, meat only, cooked, roasted', de: ['Putenbrust', 'Pute'] },
  { key: 'duck_cooked', group: 'red_meat', q: 'Duck, domesticated, meat and skin, cooked, roasted', de: ['Ente'] },
  { key: 'beef_ground_cooked', group: 'red_meat', q: 'Beef, ground, 80% lean meat / 20% fat, patty, cooked, pan-broiled', de: ['Rinderhack', 'Burger-Patty', 'Hackfleisch'] },
  { key: 'beef_ground_lean_cooked', group: 'red_meat', q: 'Beef, ground, 85% lean meat / 15% fat, patty, cooked, pan-broiled' },
  { key: 'beef_steak_cooked', group: 'red_meat', fdc: 168635, de: ['Rindersteak', 'Steak', 'Rind'] },
  { key: 'beef_braised', group: 'red_meat', q: 'Beef, chuck for stew, separable lean and fat, all grades, cooked, braised', de: ['Rindergulasch', 'Schmorbraten'] },
  { key: 'pork_cooked', group: 'red_meat', q: 'Pork, fresh, shoulder, whole, separable lean and fat, cooked, roasted', de: ['Schweinefleisch', 'Schweinebraten'] },
  { key: 'lamb_cooked', group: 'red_meat', fdc: 172485, de: ['Lamm', 'Lammfleisch'] },
  { key: 'bacon_cooked', group: 'processed_meat', q: 'Pork, cured, bacon, pre-sliced, cooked, pan-fried', de: ['Speck', 'Bacon'] },
  { key: 'ham_sliced', group: 'processed_meat', q: 'Ham, sliced, regular (approximately 11% fat)', de: ['Schinken', 'Kochschinken'] },
  { key: 'sausage_pork_cooked', group: 'processed_meat', q: 'Pork sausage, link/patty, cooked, pan-fried', de: ['Bratwurst', 'Wurst'] },
  { key: 'frankfurter_beef', group: 'processed_meat', q: 'Frankfurter, beef, heated', de: ['Wiener', 'Currywurst-Wurst'] },
  { key: 'salami', group: 'processed_meat', q: 'Salami, Italian, pork', de: ['Salami', 'Peperoni-Salami'] },
  { key: 'chorizo', group: 'processed_meat', q: 'Sausage, pork, chorizo, link or ground, raw', de: ['Chorizo'] },
  { key: 'salmon_cooked', group: 'fish', q: 'Fish, salmon, Atlantic, farmed, cooked, dry heat', de: ['Lachs'] },
  { key: 'salmon_raw', group: 'fish', q: 'Fish, salmon, Atlantic, wild, raw', de: ['Lachs roh', 'Sashimi-Lachs'] },
  { key: 'salmon_smoked', group: 'fish', q: 'Fish, salmon, chinook, smoked, (lox), regular', de: ['Räucherlachs'] },
  { key: 'tuna_cooked', group: 'fish', q: 'Fish, tuna, yellowfin, fresh, cooked, dry heat', de: ['Thunfisch'] },
  { key: 'tuna_canned', group: 'fish', fdc: 171986, de: ['Thunfisch Dose'] },
  { key: 'white_fish_cooked', group: 'fish', q: 'Fish, cod, Atlantic, cooked, dry heat', de: ['Weißfisch', 'Kabeljau', 'Dorsch', 'Seelachs'] },
  { key: 'tilapia_cooked', group: 'fish', q: 'Fish, tilapia, cooked, dry heat' },
  { key: 'shrimp_cooked', group: 'fish', q: 'Crustaceans, shrimp, cooked', de: ['Garnelen', 'Shrimps', 'Gambas'] },
  { key: 'squid_fried', group: 'fried', q: 'Mollusks, squid, mixed species, cooked, fried', de: ['Calamari fritti'] },
  { key: 'mussels_cooked', group: 'fish', q: 'Mollusks, mussel, blue, cooked, moist heat', de: ['Muscheln'] },
  // Plant protein
  { key: 'tofu_firm', group: 'legume', q: 'Tofu, raw, firm, prepared with calcium sulfate', de: ['Tofu'] },
  { key: 'tempeh', group: 'legume', fdc: 174272, de: ['Tempeh'] },
  { key: 'falafel', group: 'fried', q: 'Falafel, home-prepared', de: ['Falafel'] },
  { key: 'chickpeas_cooked', group: 'legume', q: 'Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt', de: ['Kichererbsen'] },
  { key: 'lentils_cooked', group: 'legume', q: 'Lentils, mature seeds, cooked, boiled, without salt', de: ['Linsen', 'Dal'] },
  { key: 'black_beans_cooked', group: 'legume', q: 'Beans, black, mature seeds, cooked, boiled, without salt', de: ['Schwarze Bohnen'] },
  { key: 'kidney_beans_cooked', group: 'legume', q: 'Beans, kidney, all types, mature seeds, cooked, boiled, without salt', de: ['Kidneybohnen'] },
  { key: 'edamame', group: 'legume', q: 'Edamame, frozen, prepared', de: ['Edamame'] },
  { key: 'hummus', group: 'legume', q: 'Hummus, commercial', de: ['Hummus'] },
  // Dairy, eggs
  { key: 'egg_boiled', group: 'egg', q: 'Egg, whole, cooked, hard-boiled', de: ['Ei', 'gekochtes Ei'] },
  { key: 'egg_fried', group: 'egg', q: 'Egg, whole, cooked, fried', de: ['Spiegelei', 'Rührei'] },
  { key: 'cheese_feta', group: 'cheese', q: 'Cheese, feta', de: ['Feta', 'Schafskäse'] },
  { key: 'cheese_mozzarella', group: 'cheese', q: 'Cheese, mozzarella, whole milk', de: ['Mozzarella', 'Burrata'] },
  { key: 'cheese_halloumi', group: 'cheese', q: 'Cheese, mozzarella, whole milk, low moisture', de: ['Halloumi', 'Grillkäse'], note: 'analog: USDA has no halloumi; low-moisture mozzarella has near-identical macros' },
  { key: 'cheese_parmesan', group: 'cheese', q: 'Cheese, parmesan, grated', de: ['Parmesan', 'Grana Padano'] },
  { key: 'cheese_cheddar', group: 'cheese', q: 'Cheese, cheddar, sharp, sliced', de: ['Käse', 'Cheddar', 'Gouda', 'Bergkäse', 'Emmentaler'] },
  { key: 'cheese_goat', group: 'cheese', q: 'Cheese, goat, soft type', de: ['Ziegenkäse'] },
  { key: 'cheese_ricotta', group: 'cheese', q: 'Cheese, ricotta, whole milk', de: ['Ricotta'] },
  { key: 'cream_cheese', group: 'cheese', q: 'Cheese, cream', de: ['Frischkäse'] },
  { key: 'yogurt_greek', group: 'dairy', q: 'Yogurt, Greek, plain, whole milk', de: ['Griechischer Joghurt'] },
  { key: 'yogurt_plain', group: 'dairy', q: 'Yogurt, plain, whole milk', de: ['Joghurt'] },
  { key: 'sour_cream', group: 'dairy', q: 'Cream, sour, cultured', de: ['Saure Sahne', 'Schmand', 'Crème fraîche'] },
  { key: 'cream_heavy', group: 'dairy', q: 'Cream, fluid, heavy whipping', de: ['Sahne', 'Schlagsahne'] },
  { key: 'milk_whole', group: 'dairy', q: 'Milk, whole, 3.25% milkfat, with added vitamin D', de: ['Milch', 'Vollmilch'] },
  { key: 'butter', group: 'fat_oil', q: 'Butter, salted', de: ['Butter'] },
  // Grains, starches (cooked weights unless noted)
  { key: 'rice_white_cooked', group: 'refined_grain', q: 'Rice, white, long-grain, regular, enriched, cooked', de: ['Reis', 'Basmatireis', 'Jasminreis'] },
  { key: 'rice_sushi_cooked', group: 'refined_grain', q: 'Rice, white, short-grain, enriched, cooked', de: ['Sushireis'] },
  { key: 'rice_brown_cooked', group: 'whole_grain', q: "Rice, brown, long-grain, cooked (Includes foods for USDA's Food Distribution Program)", de: ['Vollkornreis', 'Naturreis'] },
  { key: 'rice_sticky_cooked', group: 'refined_grain', q: 'Rice, white, glutinous, unenriched, cooked', de: ['Klebreis'] },
  { key: 'pasta_cooked', group: 'refined_grain', q: 'Pasta, cooked, enriched, without added salt', de: ['Nudeln', 'Pasta', 'Spaghetti', 'Penne', 'Tagliatelle'] },
  { key: 'egg_noodles_cooked', group: 'refined_grain', q: 'Noodles, egg, enriched, cooked', de: ['Eiernudeln', 'Mie-Nudeln', 'Ramen-Nudeln', 'Spätzle'] },
  { key: 'rice_noodles_cooked', group: 'refined_grain', q: 'Rice noodles, cooked', de: ['Reisnudeln', 'Glasnudeln', 'Pho-Nudeln'] },
  { key: 'soba_cooked', group: 'whole_grain', q: 'Noodles, japanese, soba, cooked', de: ['Soba', 'Udon'] },
  { key: 'quinoa_cooked', group: 'whole_grain', q: 'Quinoa, cooked', de: ['Quinoa'] },
  { key: 'couscous_cooked', group: 'refined_grain', q: 'Couscous, cooked', de: ['Couscous'] },
  { key: 'bulgur_cooked', group: 'whole_grain', q: 'Bulgur, cooked', de: ['Bulgur'] },
  { key: 'oats_dry', group: 'whole_grain', q: 'Cereals, oats, regular and quick, not fortified, dry', de: ['Haferflocken', 'Porridge (trocken)'] },
  { key: 'bread_white', group: 'refined_grain', q: 'Bread, white, commercially prepared (includes soft bread crumbs)', de: ['Brot', 'Weißbrot', 'Toast', 'Baguette', 'Ciabatta'] },
  { key: 'bread_whole_wheat', group: 'whole_grain', q: 'Bread, whole-wheat, commercially prepared', de: ['Vollkornbrot', 'Roggenbrot'] },
  { key: 'bread_pita', group: 'refined_grain', q: 'Bread, pita, white, enriched', de: ['Pita', 'Fladenbrot', 'Döner-Brot'] },
  { key: 'tortilla_flour', group: 'refined_grain', q: 'Tortillas, ready-to-bake or -fry, flour, refrigerated', de: ['Wrap', 'Tortilla', 'Dürüm-Fladen'] },
  { key: 'burger_bun', group: 'refined_grain', q: 'Rolls, hamburger or hotdog, plain', de: ['Burger-Brötchen', 'Brioche-Bun', 'Bun'] },
  { key: 'bagel', group: 'refined_grain', fdc: 174899, de: ['Bagel'] },
  { key: 'croissant', group: 'refined_grain', q: 'Croissants, butter', de: ['Croissant'] },
  { key: 'flour_wheat', group: 'refined_grain', q: 'Wheat flour, white, all-purpose, enriched, bleached', de: ['Mehl', 'Panade', 'Teig'] },
  { key: 'potato_boiled', group: 'potato', q: 'Potatoes, boiled, cooked without skin, flesh, without salt', de: ['Kartoffeln', 'Salzkartoffeln', 'Kartoffelpüree-Basis'] },
  { key: 'fries', group: 'fried', q: 'Fast foods, potato, french fried in vegetable oil', de: ['Pommes', 'Pommes frites', 'Bratkartoffeln'] },
  { key: 'sweet_potato_baked', group: 'veg', q: 'Sweet potato, cooked, baked in skin, flesh, without salt', de: ['Süßkartoffel'] },
  { key: 'potato_dumpling', group: 'refined_grain', q: 'Dumpling, potato- or cheese-filled, frozen', de: ['Teigtaschen', 'Pierogi', 'Gyoza', 'Maultaschen', 'Gnocchi'] },
  { key: 'pizza_cheese', group: 'refined_grain', q: 'Pizza, cheese topping, regular crust, frozen, cooked', de: ['Pizza Margherita (fertig)'] },
  // Vegetables (raw unless noted)
  { key: 'lettuce_romaine', group: 'veg', q: 'Lettuce, cos or romaine, raw', de: ['Blattsalat', 'Salat', 'Römersalat', 'Pflücksalat'] },
  { key: 'lettuce_iceberg', group: 'veg', q: 'Lettuce, iceberg (includes crisphead types), raw', de: ['Eisbergsalat'] },
  { key: 'spinach', group: 'veg', q: 'Spinach, raw', de: ['Spinat', 'Babyspinat'] },
  { key: 'arugula', group: 'veg', q: 'Arugula, raw', de: ['Rucola'] },
  { key: 'kale', group: 'veg', q: 'Kale, raw', de: ['Grünkohl', 'Kale'] },
  { key: 'cabbage', group: 'veg', q: 'Cabbage, raw', de: ['Kohl', 'Weißkohl', 'Krautsalat'] },
  { key: 'cabbage_red', group: 'veg', q: 'Cabbage, red, raw', de: ['Rotkohl'] },
  { key: 'bok_choy', group: 'veg', q: 'Cabbage, chinese (pak-choi), raw', de: ['Pak Choi', 'Chinakohl'] },
  { key: 'tomato', group: 'veg', q: 'Tomatoes, red, ripe, raw, year round average', de: ['Tomate', 'Tomaten', 'Kirschtomaten'] },
  { key: 'cucumber', group: 'veg', q: 'Cucumber, with peel, raw', de: ['Gurke'] },
  { key: 'onion', group: 'veg', q: 'Onions, raw', de: ['Zwiebel', 'rote Zwiebel'] },
  { key: 'spring_onion', group: 'veg', q: 'Onions, spring or scallions (includes tops and bulb), raw', de: ['Frühlingszwiebel', 'Lauchzwiebel'] },
  { key: 'bell_pepper', group: 'veg', q: 'Peppers, sweet, red, raw', de: ['Paprika'] },
  { key: 'carrot', group: 'veg', q: 'Carrots, raw', de: ['Karotte', 'Möhre'] },
  { key: 'broccoli_cooked', group: 'veg', q: 'Broccoli, cooked, boiled, drained, without salt', de: ['Brokkoli'] },
  { key: 'cauliflower_cooked', group: 'veg', q: 'Cauliflower, cooked, boiled, drained, without salt', de: ['Blumenkohl'] },
  { key: 'eggplant_cooked', group: 'veg', q: 'Eggplant, cooked, boiled, drained, without salt', de: ['Aubergine'] },
  { key: 'zucchini', group: 'veg', q: 'Squash, summer, zucchini, includes skin, raw', de: ['Zucchini'] },
  { key: 'mushrooms', group: 'veg', q: 'Mushrooms, white, raw', de: ['Pilze', 'Champignons'] },
  { key: 'mushroom_portobello_grilled', group: 'veg', q: 'Mushrooms, portabella, grilled', de: ['Gegrillte Pilze', 'Portobello', 'Austernpilze', 'Shiitake'] },
  { key: 'corn_cooked', group: 'veg', q: 'Corn, sweet, yellow, cooked, boiled, drained, without salt', de: ['Mais'] },
  { key: 'peas_cooked', group: 'veg', q: 'Peas, green, frozen, cooked, boiled, drained, without salt', de: ['Erbsen'] },
  { key: 'green_beans_cooked', group: 'veg', q: 'Beans, snap, green, cooked, boiled, drained, without salt', de: ['grüne Bohnen'] },
  { key: 'bean_sprouts', group: 'veg', q: 'Mung beans, mature seeds, sprouted, raw', de: ['Sprossen', 'Sojasprossen', 'Mungbohnensprossen'] },
  { key: 'beetroot_cooked', group: 'veg', q: 'Beets, cooked, boiled, drained', de: ['Rote Bete', 'Rote Beete'] },
  { key: 'radish', group: 'veg', q: 'Radishes, raw', de: ['Radieschen', 'Rettich'] },
  { key: 'pickles', group: 'veg', q: 'Pickles, cucumber, dill or kosher dill', de: ['Eingelegtes Gemüse', 'Gewürzgurke', 'Essiggurke'] },
  { key: 'olives', group: 'fat_oil', q: 'Olives, ripe, canned (small-extra large)', de: ['Oliven'] },
  { key: 'wakame', group: 'veg', q: 'Seaweed, wakame, raw', de: ['Wakame', 'Algensalat'] },
  { key: 'nori', group: 'veg', q: 'Seaweed, laver, raw', de: ['Nori'] },
  { key: 'kimchi', group: 'veg', q: 'Cabbage, kimchi', de: ['Kimchi'] },
  { key: 'sauerkraut', group: 'veg', q: 'Sauerkraut, canned, solids and liquids', de: ['Sauerkraut'] },
  { key: 'avocado', group: 'fat_oil', q: 'Avocados, raw, all commercial varieties', de: ['Avocado', 'Guacamole-Basis'] },
  { key: 'garlic', group: 'veg', q: 'Garlic, raw', de: ['Knoblauch'] },
  { key: 'ginger', group: 'veg', q: 'Ginger root, raw', de: ['Ingwer'] },
  { key: 'chili_pepper', group: 'veg', q: 'Peppers, hot chili, red, raw', de: ['Chili', 'Jalapeño'] },
  { key: 'herbs_fresh', group: 'veg', q: 'Parsley, fresh', de: ['Frische Kräuter', 'Petersilie', 'Koriander', 'Basilikum', 'Minze', 'Dill'] },
  { key: 'lemon_juice', group: 'other', q: 'Lemon juice, raw', de: ['Zitronensaft', 'Limettensaft'] },
  // Fruit
  { key: 'apple', group: 'fruit', q: "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)", de: ['Apfel'] },
  { key: 'banana', group: 'fruit', q: 'Bananas, raw', de: ['Banane'] },
  { key: 'mango', group: 'fruit', q: 'Mangos, raw', de: ['Mango'] },
  { key: 'pineapple', group: 'fruit', q: 'Pineapple, raw, all varieties', de: ['Ananas'] },
  { key: 'berries', group: 'fruit', q: 'Blueberries, raw', de: ['Beeren', 'Blaubeeren', 'Heidelbeeren'] },
  { key: 'strawberries', group: 'fruit', q: 'Strawberries, raw', de: ['Erdbeeren'] },
  { key: 'pomegranate', group: 'fruit', q: 'Pomegranates, raw', de: ['Granatapfel', 'Granatapfelkerne'] },
  { key: 'orange', group: 'fruit', q: 'Oranges, raw, all commercial varieties', de: ['Orange'] },
  { key: 'dates', group: 'fruit', q: 'Dates, medjool', de: ['Datteln'] },
  { key: 'raisins', group: 'fruit', q: 'Raisins, golden, seedless', de: ['Rosinen', 'Cranberries getrocknet'] },
  // Nuts, seeds, fats
  { key: 'olive_oil', group: 'fat_oil', q: 'Oil, olive, salad or cooking', de: ['Olivenöl'] },
  { key: 'vegetable_oil', group: 'fat_oil', q: 'Oil, canola', de: ['Öl', 'Pflanzenöl', 'Rapsöl', 'Sonnenblumenöl', 'Bratöl', 'Frittierfett'] },
  { key: 'sesame_oil', group: 'fat_oil', q: 'Oil, sesame, salad or cooking', de: ['Sesamöl'] },
  { key: 'coconut_milk', group: 'fat_oil', q: 'Nuts, coconut milk, canned (liquid expressed from grated meat and water)', de: ['Kokosmilch'] },
  { key: 'tahini', group: 'nuts_seeds', q: 'Seeds, sesame butter, tahini, from roasted and toasted kernels (most common type)', de: ['Tahin', 'Tahini', 'Sesampaste'] },
  { key: 'peanuts', group: 'nuts_seeds', q: 'Peanuts, all types, dry-roasted, without salt', de: ['Erdnüsse'] },
  { key: 'peanut_butter', group: 'nuts_seeds', q: 'Peanut butter, smooth style, without salt', de: ['Erdnussbutter', 'Erdnussmus'] },
  { key: 'cashews', group: 'nuts_seeds', q: 'Nuts, cashew nuts, dry roasted, without salt added', de: ['Cashews'] },
  { key: 'walnuts', group: 'nuts_seeds', q: 'Nuts, walnuts, english', de: ['Walnüsse'] },
  { key: 'almonds', group: 'nuts_seeds', q: 'Nuts, almonds', de: ['Mandeln'] },
  { key: 'pine_nuts', group: 'nuts_seeds', q: 'Nuts, pine nuts, dried', de: ['Pinienkerne'] },
  { key: 'sesame_seeds', group: 'nuts_seeds', q: 'Seeds, sesame seeds, whole, dried', de: ['Sesam'] },
  { key: 'sunflower_seeds', group: 'nuts_seeds', q: 'Seeds, sunflower seed kernels, dried', de: ['Sonnenblumenkerne'] },
  { key: 'pumpkin_seeds', group: 'nuts_seeds', q: 'Seeds, pumpkin and squash seed kernels, dried', de: ['Kürbiskerne'] },
  // Sauces, condiments, sweeteners
  { key: 'mayonnaise', group: 'sauce', q: 'Salad dressing, mayonnaise, regular', de: ['Mayonnaise', 'Mayo', 'Aioli', 'Remoulade'] },
  { key: 'soy_sauce', group: 'sauce', q: 'Soy sauce made from soy and wheat (shoyu)', de: ['Sojasauce', 'Sojasoße'] },
  { key: 'teriyaki_sauce', group: 'sauce', q: 'Sauce, teriyaki, ready-to-serve', de: ['Teriyaki-Sauce'] },
  { key: 'pesto', group: 'sauce', q: 'Sauce, pesto, ready-to-serve, refrigerated', de: ['Pesto'] },
  { key: 'tomato_sauce', group: 'sauce', q: 'Sauce, pasta, spaghetti/marinara, ready-to-serve', de: ['Tomatensauce', 'Tomatensoße', 'Pizzasauce'] },
  { key: 'ketchup', group: 'sauce', q: 'Catsup', de: ['Ketchup', 'Currysauce'] },
  { key: 'bbq_sauce', group: 'sauce', q: 'Sauce, barbecue', de: ['BBQ-Sauce'] },
  { key: 'sweet_sour_sauce', group: 'sauce', q: 'Sauce, sweet and sour, ready-to-serve', de: ['Süß-saure Sauce', 'Sweet Chili Sauce'] },
  { key: 'hoisin_sauce', group: 'sauce', q: 'Sauce, hoisin, ready-to-serve', de: ['Hoisin-Sauce'] },
  { key: 'fish_sauce', group: 'sauce', q: 'Sauce, fish, ready-to-serve', de: ['Fischsauce'] },
  { key: 'sriracha', group: 'sauce', q: 'Sauce, hot chile, sriracha', de: ['Sriracha', 'scharfe Sauce'] },
  { key: 'peanut_sauce', group: 'sauce', q: 'Sauce, peanut, made from peanut butter, water, soy sauce', de: ['Erdnusssauce', 'Satay-Sauce'] },
  { key: 'caesar_dressing', group: 'sauce', q: 'Salad dressing, caesar dressing, regular', de: ['Caesar-Dressing'] },
  { key: 'italian_dressing', group: 'sauce', q: 'Salad dressing, italian dressing, commercial, regular', de: ['Dressing', 'Salatdressing'] },
  { key: 'honey_mustard_dressing', group: 'sauce', q: 'Salad dressing, honey mustard, regular', de: ['Honig-Senf-Dressing'] },
  { key: 'balsamic_vinegar', group: 'sauce', q: 'Vinegar, balsamic', de: ['Balsamico', 'Essig'] },
  { key: 'curry_powder', group: 'other', q: 'Spices, curry powder', de: ['Currypulver', 'Gewürze'] },
  { key: 'sugar', group: 'sugar', q: 'Sugars, granulated', de: ['Zucker'] },
  { key: 'honey', group: 'sugar', q: 'Honey', de: ['Honig'] },
  { key: 'maple_syrup', group: 'sugar', q: 'Syrups, maple', de: ['Ahornsirup', 'Agavendicksaft', 'Sirup'] },
  { key: 'dark_chocolate', group: 'sugar', q: 'Chocolate, dark, 70-85% cacao solids', de: ['Zartbitterschokolade', 'Schokolade'] },
];

// Fixed recipes (grams of each component per 100 g of the composite).
const COMPOSITES: Composite[] = [
  { key: 'doner_meat', group: 'red_meat', de: ['Dönerfleisch', 'Gyros', 'Kebab-Fleisch', 'Shawarma'], recipe: { beef_ground_cooked: 50, lamb_cooked: 35, vegetable_oil: 5, onion: 10 }, note: 'composite: doner/gyros meat cone approximated as ground beef, lamb, oil and onion' },
  { key: 'chicken_doner_meat', group: 'lean_protein', de: ['Hähnchendöner-Fleisch', 'Chicken Shawarma'], recipe: { chicken_thigh_cooked: 88, vegetable_oil: 6, yogurt_plain: 6 }, note: 'composite: chicken doner/shawarma as thigh meat with oil and yogurt marinade' },
  { key: 'schnitzel_breaded_fried', group: 'fried', de: ['Schnitzel', 'Wiener Schnitzel', 'paniertes Schnitzel'], recipe: { pork_cooked: 62, flour_wheat: 6, egg_boiled: 6, bread_white: 12, vegetable_oil: 14 }, note: 'composite: breaded, pan-fried cutlet (meat, flour, egg, crumbs, absorbed oil)' },
  { key: 'tzatziki', group: 'sauce', de: ['Tzatziki', 'Joghurtsauce', 'Knoblauchsauce'], recipe: { yogurt_greek: 75, cucumber: 17, olive_oil: 5, garlic: 3 }, note: 'composite: yogurt, cucumber, olive oil, garlic' },
  { key: 'vinaigrette', group: 'sauce', de: ['Vinaigrette', 'Essig-Öl-Dressing'], recipe: { olive_oil: 60, balsamic_vinegar: 30, honey: 5, lemon_juice: 5 }, note: 'composite: 2:1 oil and vinegar dressing' },
  { key: 'guacamole', group: 'fat_oil', de: ['Guacamole'], recipe: { avocado: 85, onion: 6, tomato: 5, lemon_juice: 4 }, note: 'composite: avocado, onion, tomato, lime' },
  { key: 'pizza_dough_baked', group: 'refined_grain', de: ['Pizzateig', 'Pizzaboden', 'Flammkuchenteig'], recipe: { flour_wheat: 62, olive_oil: 3, sugar: 1 }, note: 'composite: baked pizza base (flour, oil; water baked off ~34 g)' },
  { key: 'curry_sauce_coconut', group: 'sauce', de: ['Currysauce (Kokos)', 'Thai-Curry-Sauce', 'Kokoscurry'], recipe: { coconut_milk: 80, onion: 8, vegetable_oil: 4, sugar: 3, curry_powder: 2, fish_sauce: 3 }, note: 'composite: coconut curry sauce' },
  { key: 'cream_sauce', group: 'sauce', de: ['Sahnesauce', 'Rahmsauce', 'Carbonara-Sauce', 'Hollandaise'], recipe: { cream_heavy: 55, milk_whole: 25, butter: 8, cheese_parmesan: 8, flour_wheat: 4 }, note: 'composite: cream-based sauce' },
  { key: 'gravy_brown', group: 'sauce', de: ['Bratensauce', 'Jus', 'Soße'], recipe: { butter: 6, flour_wheat: 6, soy_sauce: 4, onion: 10, tomato_sauce: 10 }, note: 'composite: thin brown sauce, remainder water' },
  { key: 'broth_soup', group: 'other', de: ['Brühe', 'Pho-Brühe', 'Ramen-Brühe', 'Suppe'], recipe: { beef_braised: 2, onion: 3, soy_sauce: 2, sugar: 0.5, fish_sauce: 1 }, note: 'composite: clear broth (mostly water)' },
  { key: 'miso_paste', group: 'sauce', de: ['Miso'], recipe: { tofu_firm: 40, soy_sauce: 25, rice_white_cooked: 25 }, note: 'composite approximation for miso paste' },
  { key: 'mashed_potatoes', group: 'potato', de: ['Kartoffelpüree', 'Stampf'], recipe: { potato_boiled: 80, milk_whole: 12, butter: 6 }, note: 'composite: potatoes, milk, butter' },
  { key: 'potato_salad', group: 'potato', de: ['Kartoffelsalat'], recipe: { potato_boiled: 75, mayonnaise: 12, onion: 5, pickles: 8 }, note: 'composite: German-style potato salad with mayo' },
  { key: 'granola', group: 'whole_grain', de: ['Granola', 'Müsli'], recipe: { oats_dry: 65, almonds: 10, honey: 12, vegetable_oil: 8, raisins: 5 }, note: 'composite: baked oat granola' },
  { key: 'pancake_batter_cooked', group: 'refined_grain', de: ['Pfannkuchen', 'Pancakes', 'Crêpes'], recipe: { flour_wheat: 32, milk_whole: 45, egg_boiled: 15, butter: 4, sugar: 4 }, note: 'composite: cooked pancake' },
  { key: 'cake_generic', group: 'sugar', de: ['Kuchen', 'Torte', 'Brownie'], recipe: { flour_wheat: 28, sugar: 28, butter: 20, egg_boiled: 16, milk_whole: 8 }, note: 'composite: generic butter cake' },
];

const NUTRIENTS = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004, fiber: 1079, sugar: 2000, satFat: 1258, sodiumMg: 1093 } as const;
type NutrientKey = keyof typeof NUTRIENTS;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: node scripts/build-foods.ts <usda sr legacy csv dir>');
  const foods = readFileSync(join(dir, 'food.csv'), 'utf8').split('\n').slice(1).filter(Boolean).map(parseCsvLine)
    .map((c) => ({ fdc: Number(c[0]), description: c[2]! }));
  const resolved = SPEC.map((s) => {
    let hit;
    if (s.fdc) hit = foods.find((f) => f.fdc === s.fdc);
    else {
      const exact = foods.find((f) => f.description === s.q);
      if (exact) hit = exact;
      else {
        const parts = s.q!.toLowerCase().split('&');
        hit = foods.filter((f) => parts.every((p) => f.description.toLowerCase().includes(p)))
          .toSorted((a, b) => a.description.length - b.description.length)[0];
      }
    }
    if (!hit) throw new Error(`no USDA match for ${s.key}: ${s.q ?? s.fdc}`);
    return { spec: s, fdc: hit.fdc, description: hit.description };
  });
  const wanted = new Set(resolved.map((r) => r.fdc));
  const values = new Map<number, Partial<Record<NutrientKey, number>>>();
  const byId = new Map<number, NutrientKey>(Object.entries(NUTRIENTS).map(([k, v]) => [v, k as NutrientKey]));
  const rl = createInterface({ input: createReadStream(join(dir, 'food_nutrient.csv')) });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    const c = parseCsvLine(line);
    const fdc = Number(c[1]);
    if (!wanted.has(fdc)) continue;
    const key = byId.get(Number(c[2]));
    if (!key) continue;
    const row = values.get(fdc) ?? {};
    row[key] = Number(c[3]);
    values.set(fdc, row);
  }
  const rows: FoodRow[] = resolved.map(({ spec, fdc, description }) => {
    const v = values.get(fdc) ?? {};
    if (v.kcal == null || v.protein == null || v.carbs == null || v.fat == null) throw new Error(`missing macros for ${spec.key} (${fdc})`);
    return {
      key: spec.key, group: spec.group, source: 'usda-sr-legacy', fdcId: fdc, description,
      de: spec.de ?? [], note: spec.note ?? null,
      per100g: { kcal: round(v.kcal), protein: round(v.protein), carbs: round(v.carbs), fat: round(v.fat),
        fiber: round(v.fiber ?? 0), sugar: round(v.sugar ?? 0), satFat: round(v.satFat ?? 0), sodiumMg: round(v.sodiumMg ?? 0) },
    };
  });
  const index = new Map(rows.map((r) => [r.key, r]));
  for (const c of COMPOSITES) {
    const total = Object.values(c.recipe).reduce((a, b) => a + b, 0);
    const per100g = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, satFat: 0, sodiumMg: 0 };
    for (const [k, grams] of Object.entries(c.recipe)) {
      const r = index.get(k);
      if (!r) throw new Error(`composite ${c.key} uses unknown key ${k}`);
      for (const n of Object.keys(per100g) as (keyof typeof per100g)[]) per100g[n] += (r.per100g[n] * grams) / 100;
    }
    // Recipes summing to < 100 g mean "the rest is water" (sauces, broth, baked-off dough).
    const scale = total > 100 ? 100 / total : 1;
    for (const n of Object.keys(per100g) as (keyof typeof per100g)[]) per100g[n] = round(per100g[n] * scale);
    const row: FoodRow = { key: c.key, group: c.group, source: 'composite-usda', fdcId: null, description: c.note, de: c.de ?? [], note: `recipe per 100 g: ${JSON.stringify(c.recipe)}`, per100g };
    rows.push(row);
    index.set(c.key, row);
  }
  const keys = new Set<string>();
  for (const r of rows) { if (keys.has(r.key)) throw new Error(`duplicate key ${r.key}`); keys.add(r.key); }
  const here = dirname(fileURLToPath(import.meta.url));
  const out = {
    source: 'USDA FoodData Central, SR Legacy (April 2018 release), public domain (CC0 1.0). Composite rows are fixed recipes over USDA rows.',
    url: 'https://fdc.nal.usda.gov/',
    nutrientsPer: '100 g edible portion',
    foods: rows,
  };
  writeFileSync(join(here, '..', 'data', 'foods.json'), JSON.stringify(out, null, 1) + '\n');
  for (const r of resolved) console.log(`${r.spec.key.padEnd(30)} ${r.fdc} ${r.description}`);
  console.log(`wrote ${rows.length} foods`);
}

await main();
