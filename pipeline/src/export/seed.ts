// Exports pipeline results as seed JSON in the web app contract shape (apps/web/src/data/contract.ts):
// { restaurants: Restaurant[], dishes: Dish[] }. Only google_place_id comes from Google.
import { parseDishClass, type DishClass } from '../../../packages/contract/src/dish-class.ts';
import { assertPublishableKiez, KIEZE } from '../kiez.ts';
import { proteinPerEuro } from '../nutrition/calc.ts';
import { foodIndex } from '../nutrition/foods.ts';
import { OSM_ATTRIBUTION } from '../sources/osm.ts';
import type { Db } from '../store/db.ts';
import { STATUSES, type Confidence, type Ingredient, type RestaurantStatus } from '../types.ts';
import { type OpeningHours, parseOsmHours } from './hours.ts';
import { webRestaurantId } from './web.ts';
import { isDeliveryPlatform } from '../sources/delivery.ts';

export interface SeedRange { value: number; min: number; max: number }
export interface SeedMenuSource { url: string; fetchedAt: string; kind: 'website' | 'user_snap' }

export interface SeedRestaurant {
  id: string;
  placeId: string | null;
  osmId: string | null;
  name: string;
  kiez: string;
  address: string;
  lat: number;
  lng: number;
  cuisine: string[];
  openingHours: OpeningHours | null;
  baseSource: 'osm';
  website: string | null;
  menu: SeedMenuSource | null;
  isTestData: false;
}

/** apps/web/src/data/contract.ts Ingredient. */
export interface SeedIngredient { name: string; amount: number | null; unit: 'g' | 'ml' }

export interface SeedDish {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  price: number | null;
  category: string;
  nutrition: { kcal: SeedRange; protein: SeedRange; carbs: SeedRange; fat: SeedRange; confidence: Confidence; source: 'official' | 'ai'; method: string; model?: string; ingredients?: SeedIngredient[] };
  healthScore: number;
  proteinPerEuro: number | null;
  diet: ('vegan' | 'vegetarian')[];
  menuSource: SeedMenuSource;
  image: { kind: 'ai'; ref: string; alt: string } | null;
  isTestData: false;
  /** From the classify stage; null until the dish is classified. */
  dishClass: DishClass | null;
  sourceUrl?: string;
}

export interface Seed {
  generatedAt: string;
  attribution: string[];
  note: string;
  restaurants: SeedRestaurant[];
  dishes: SeedDish[];
}

const MEAT = /^(chicken|turkey|duck|beef|pork|lamb|bacon|ham|sausage|frankfurter|salami|chorizo|doner|chicken_doner|schnitzel|broth|gravy)/;
const FISH = /^(salmon|tuna|white_fish|tilapia|shrimp|squid|mussels|fish_sauce|curry_sauce_coconut)/;
const ANIMAL = /^(egg|cheese|cream|yogurt|sour_cream|milk|butter|mayonnaise|honey|tzatziki|caesar|cream_sauce|mashed|pancake|cake|croissant|pesto|potato_salad|honey_mustard|granola|pizza_cheese|potato_dumpling)/;

/** German fallback when the menu prints no section heading. */
export const CATEGORY_DE: Record<string, string> = {
  bowl: 'Bowls', salad: 'Salate', main: 'Hauptgerichte', soup: 'Suppen', wrap: 'Wraps', sandwich: 'Sandwiches', burger: 'Burger',
  pizza: 'Pizza', pasta: 'Pasta', starter: 'Vorspeisen', side: 'Beilagen', breakfast: 'Frühstück', dessert: 'Desserts', snack: 'Snacks',
};

/** Readable German ingredient name for the "How is this calculated?" sheet. */
export function ingredientName(i: Ingredient): string {
  const f = foodIndex().get(i.food);
  // The model's notes are English working notes; the app shows the German food name only.
  return f?.de[0] ?? f?.description ?? i.food.replace(/_/g, ' ');
}

/** Diet from the ingredient list; an OSM diet:vegan=only restaurant is vegan throughout. */
export function dietOf(ings: Ingredient[], dietVegan: string | null, dietVegetarian: string | null): ('vegan' | 'vegetarian')[] {
  if (dietVegan === 'only') return ['vegan', 'vegetarian'];
  const keys = ings.map((i) => i.food);
  if (keys.some((k) => MEAT.test(k) || FISH.test(k))) return [];
  if (dietVegetarian === 'only') return keys.some((k) => ANIMAL.test(k)) ? ['vegetarian'] : ['vegan', 'vegetarian'];
  return keys.some((k) => ANIMAL.test(k)) ? ['vegetarian'] : ['vegan', 'vegetarian'];
}

/** `placeIds` (web restaurant id to place id) overrides the queue's place id, e.g. with the ids committed in the Kiez seeds. */
export async function buildSeed(db: Db, opts: { minStatus: RestaurantStatus; kieze?: string[]; placeIds?: Map<string, string> }): Promise<Seed> {
  const statuses = STATUSES.slice(STATUSES.indexOf(opts.minStatus));
  const where = [`status IN (${statuses.map(() => '?').join(',')})`, 'skip_reason IS NULL'];
  const params: string[] = [...statuses];
  if (opts.kieze?.length) { where.push(`kiez IN (${opts.kieze.map(() => '?').join(',')})`); params.push(...opts.kieze); }
  const rows = await db.all<{ id: string; kiez: string; osm_id: string; name: string; lat: number; lng: number; street: string | null; housenumber: string | null; postcode: string | null; cuisine: string; opening_hours: string | null; website: string | null; diet_vegan: string | null; diet_vegetarian: string | null; google_place_id: string | null; status: string; check_confidence: Confidence | null }>(
    `SELECT * FROM pipeline_restaurant WHERE ${where.join(' AND ')} ORDER BY kiez, name`, params);
  const restaurants: SeedRestaurant[] = [];
  const dishes: SeedDish[] = [];
  for (const r of rows) {
    const src = await db.first<{ url: string | null; fetched_at: string; model: string | null }>('SELECT url, fetched_at, model FROM pipeline_menu_source WHERE restaurant_id = ?', [r.id]);
    const menu: SeedMenuSource | null = src ? { url: src.url ?? r.website ?? '', fetchedAt: src.fetched_at, kind: 'website' } : null;
    const ds = await db.all<{ id: string; name: string; description: string; section: string; description_de: string | null; section_de: string | null; source_url: string | null; category: string; price_eur: number | null; ingredients: string | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number; kcal_min: number; kcal_max: number; protein_min: number; protein_max: number; carbs_min: number; carbs_max: number; fat_min: number; fat_max: number; confidence: Confidence; nutrition_source: 'official' | 'ai'; method_note: string; health_score: number; image_ref: string | null; dish_class: string | null }>(
      'SELECT * FROM pipeline_dish WHERE restaurant_id = ? AND hidden = 0 AND kcal IS NOT NULL ORDER BY position', [r.id]);
    if (!ds.length || !menu || isDeliveryPlatform(menu.url)) continue;
    assertPublishableKiez(r.kiez);
    const street = [r.street, r.housenumber].filter(Boolean).join(' ');
    const kiezName = KIEZE.find((k) => k.slug === r.kiez)?.name ?? r.kiez;
    restaurants.push({
      id: r.id, placeId: opts.placeIds?.get(webRestaurantId(r.id)) ?? (r.google_place_id?.startsWith('fixture-') ? null : r.google_place_id), osmId: r.osm_id, name: r.name, kiez: kiezName,
      address: [street, [r.postcode, 'Berlin'].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      lat: r.lat, lng: r.lng, cuisine: JSON.parse(r.cuisine), openingHours: parseOsmHours(r.opening_hours), baseSource: 'osm',
      website: r.website, menu, isTestData: false,
    });
    for (const d of ds) {
      const ings: Ingredient[] = d.ingredients ? JSON.parse(d.ingredients) : [];
      dishes.push({
        // German text for the app; the dish name stays exactly as printed on the menu.
        id: d.id, restaurantId: r.id, name: d.name, description: d.description_de || d.description, price: d.price_eur,
        category: d.section_de || d.section || CATEGORY_DE[d.category] || d.category,
        nutrition: {
          kcal: { value: Math.round(d.kcal), min: Math.round(d.kcal_min), max: Math.round(d.kcal_max) },
          protein: { value: Math.round(d.protein_g), min: Math.round(d.protein_min), max: Math.round(d.protein_max) },
          carbs: { value: Math.round(d.carbs_g), min: Math.round(d.carbs_min), max: Math.round(d.carbs_max) },
          fat: { value: Math.round(d.fat_g), min: Math.round(d.fat_min), max: Math.round(d.fat_max) },
          confidence: d.confidence, source: d.nutrition_source, method: d.method_note, ...(d.nutrition_source === 'ai' && src?.model ? { model: src.model } : {}),
          ingredients: ings.map((i) => ({ name: ingredientName(i), amount: i.grams, unit: 'g' as const })),
        },
        healthScore: d.health_score,
        proteinPerEuro: proteinPerEuro(d.protein_min, d.price_eur),
        diet: dietOf(ings, r.diet_vegan, r.diet_vegetarian),
        menuSource: menu,
        image: d.image_ref ? { kind: 'ai', ref: d.image_ref, alt: `KI-Bild: ${d.name}` } : null,
        isTestData: false,
        dishClass: d.dish_class ? parseDishClass(JSON.parse(d.dish_class)) : null,
        ...(d.source_url ? { sourceUrl: d.source_url } : {}),
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    attribution: [OSM_ATTRIBUTION, 'Nährwerte berechnet mit USDA FoodData Central (public domain)', 'Speisekarten von den Websites der Restaurants', 'Gerichtsbilder: KI-Bild (gpt-image)'],
    note: 'Nutrition values are estimates unless source is "official". Google Places content is never stored; only placeId.',
    restaurants,
    dishes,
  };
}
