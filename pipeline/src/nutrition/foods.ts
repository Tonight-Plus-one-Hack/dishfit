// Compact ingredient nutrient table (USDA FoodData Central SR Legacy subset, see data/foods.json).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type FoodGroup =
  | 'veg' | 'fruit' | 'legume' | 'whole_grain' | 'refined_grain' | 'potato'
  | 'lean_protein' | 'red_meat' | 'processed_meat' | 'fish' | 'egg' | 'dairy' | 'cheese'
  | 'nuts_seeds' | 'fat_oil' | 'sauce' | 'sugar' | 'fried' | 'other';

export interface Per100g {
  kcal: number; protein: number; carbs: number; fat: number;
  fiber: number; sugar: number; satFat: number; sodiumMg: number;
}

export interface FoodRow {
  key: string;
  group: FoodGroup;
  source: 'usda-sr-legacy' | 'composite-usda';
  fdcId: number | null;
  description: string;
  de: string[];
  note: string | null;
  per100g: Per100g;
}

export interface FoodTable {
  source: string;
  url: string;
  foods: FoodRow[];
}

let cached: FoodTable | null = null;

/**
 * Provides the table directly instead of reading data/foods.json from disk. Runtimes without a
 * file system (the Cloudflare Worker's community review, worker/src/community) import the JSON and
 * call this once, so every stage helper below works unchanged there.
 */
export function useFoodTable(table: FoodTable): void {
  cached = table;
}

export function loadFoods(): FoodTable {
  if (!cached) {
    const path = fileURLToPath(new URL('../../data/foods.json', import.meta.url).href);
    cached = JSON.parse(readFileSync(path, 'utf8')) as FoodTable;
  }
  return cached;
}

export function foodIndex(table: FoodTable = loadFoods()): Map<string, FoodRow> {
  return new Map(table.foods.map((f) => [f.key, f]));
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Resolve a key or a free-text ingredient name (English key words or German alias) to a food row. */
export function resolveFood(name: string, index: Map<string, FoodRow> = foodIndex()): FoodRow | null {
  const direct = index.get(name);
  if (direct) return direct;
  const n = norm(name);
  const asKey = n.replace(/ /g, '_');
  if (index.has(asKey)) return index.get(asKey)!;
  for (const f of index.values()) {
    if (f.de.some((d) => norm(d) === n)) return f;
  }
  // Last resort: a food whose key words are all contained in the name ("grilled chicken breast" -> chicken_breast_cooked).
  let best: { f: FoodRow; score: number } | null = null;
  for (const f of index.values()) {
    const words = f.key.split('_').filter((w) => !['cooked', 'raw', 'baked', 'boiled', 'fried', 'dry'].includes(w));
    if (words.length && words.every((w) => n.split(' ').includes(w))) {
      if (!best || words.length > best.score) best = { f, score: words.length };
    }
  }
  return best?.f ?? null;
}

/** Prompt-friendly list of keys: "key (group): de aliases". Stable order for prompt caching. */
export function foodCatalogText(table: FoodTable = loadFoods()): string {
  return table.foods.map((f) => `${f.key} [${f.group}]${f.de.length ? ': ' + f.de.slice(0, 4).join(', ') : ''}`).join('\n');
}
