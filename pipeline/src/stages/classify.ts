// Dish classification: course, dish type, cuisine, diet flags and "whole meal", one cheap structured
// LLM call per batch of dishes. The same classifyDishes() serves the pipeline stage (team scans and
// community submissions run through it), the backfill of committed seeds (scripts/classify-seed.ts)
// and tests. Results are cached by a hash of the dish text, so a re-run only pays for new or changed dishes.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  CLASS_CONFIDENCES, COURSES, CUISINES, DISH_TYPES, parseDishClass, type DishClass,
} from '../../../packages/contract/src/dish-class.ts';
import type { Ctx } from '../context.ts';
import type { KiezDef } from '../kiez.ts';
import type { Llm } from '../llm/llm.ts';
import type { Stmt } from '../store/db.ts';
import { mapPool } from '../util/limiter.ts';

export const CLASSIFY_SYSTEM = `You classify restaurant menu items for a Berlin healthy-eating app.
For every item return:
- course: starter (Vorspeise, small plates, tapas, edamame, dips served as a starter), main (a main dish that is a meal on its own), side (Beilage: fries, rice, bread, extra sauce or topping, side salad), soup, salad (a salad that is a meal or a substantial salad), dessert, drink (any beverage, smoothie, shake), snack_breakfast (breakfast plates, pastries, porridge, small snacks).
- dishType: the kind of dish. bowl (rice/grain/poke/buddha bowls), salad, curry, ramen_noodles (pho, ramen, udon, noodle soups and noodle dishes), stir_fry (wok and fried rice), sushi, soup, wrap (wraps, burritos, dürüm when not döner), sandwich (incl. banh mi, bagels, toast), tacos, pasta, grill_plate (grilled meat or fish plates, schnitzel counts only if not breaded otherwise use fried_snack), dumplings (gyoza, momos, dim sum), dip_spread (hummus, baba ganoush, sauces), breakfast, burger, pizza (incl. flammkuchen), doener_kebab (döner, kebab, shawarma sandwiches, fast-food kebab), fried_snack (fries, nuggets, tempura, spring rolls, falafel balls as a snack, anything deep-fried as the main point), dessert, drink, other.
- cuisine: the dish's cuisine from the enum; use the restaurant's cuisine when the dish has none of its own; international when unclear.
- vegan, vegetarian, glutenFree: true only when the name and description make it clear (no meat or fish for vegetarian; also no dairy, egg or honey for vegan; no wheat, barley, rye, regular soy sauce, breading, bread, pasta or seitan for glutenFree). Vegan implies vegetarian.
- isFullMeal: true when the item alone is a full meal for one adult (a main, a bowl, a meal salad, a hearty soup with protein, a large sandwich or wrap). false for starters, sides, dips, drinks, desserts, small snacks and single pieces.
- fried: deep-fried or breaded is the main point of the dish.
- creamy: built on a cream or cheese sauce (carbonara, alfredo, gratin, mac and cheese, käsespätzle, creamy korma).
- sugary: mostly sugar (sweets, cakes, sweet drinks, lemonade, milkshakes).
- confidence: high when the item is unambiguous, medium when you inferred from little text, low when you guessed.
Answer for every index exactly once.`;

export const CLASSIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'course', 'dishType', 'cuisine', 'vegan', 'vegetarian', 'glutenFree', 'isFullMeal', 'fried', 'creamy', 'sugary', 'confidence'],
        properties: {
          index: { type: 'integer' },
          course: { type: 'string', enum: [...COURSES] },
          dishType: { type: 'string', enum: [...DISH_TYPES] },
          cuisine: { type: 'string', enum: [...CUISINES] },
          vegan: { type: 'boolean' },
          vegetarian: { type: 'boolean' },
          glutenFree: { type: 'boolean' },
          isFullMeal: { type: 'boolean' },
          fried: { type: 'boolean' },
          creamy: { type: 'boolean' },
          sugary: { type: 'boolean' },
          confidence: { type: 'string', enum: [...CLASS_CONFIDENCES] },
        },
      },
    },
  },
};

/** What the classifier sees of one dish. */
export interface ClassifyItem {
  name: string;
  description: string;
  section: string;
  restaurant: string;
  restaurantCuisine: readonly string[];
  kcal?: number | null;
}

/** Cache key: the dish text the classification depends on. */
export function dishHash(i: ClassifyItem): string {
  return createHash('sha1').update(JSON.stringify([i.restaurant, [...i.restaurantCuisine], i.section, i.name, i.description])).digest('hex').slice(0, 16);
}

export interface ClassCache {
  get(hash: string): DishClass | undefined;
  set(hash: string, cls: DishClass): void;
}

/** A JSON file cache {hash: DishClass}; save() writes it back. */
export class FileClassCache implements ClassCache {
  private readonly map: Map<string, DishClass>;
  private readonly path: string;
  constructor(path: string) {
    this.path = path;
    const raw = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>) : {};
    this.map = new Map(Object.entries(raw).flatMap(([k, v]) => {
      const c = parseDishClass(v);
      return c ? [[k, c] as [string, DishClass]] : [];
    }));
  }
  get size(): number { return this.map.size; }
  get(hash: string): DishClass | undefined { return this.map.get(hash); }
  set(hash: string, cls: DishClass): void { this.map.set(hash, cls); }
  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(Object.fromEntries(this.map)));
  }
}

export class MemoryClassCache implements ClassCache {
  readonly map = new Map<string, DishClass>();
  get(hash: string): DishClass | undefined { return this.map.get(hash); }
  set(hash: string, cls: DishClass): void { this.map.set(hash, cls); }
}

interface Out { items: (DishClass & { index: number })[] }

export const CLASSIFY_BATCH = 40;

/**
 * Classifies items (cache first), batching the rest by restaurant so the model sees each menu's context.
 * Returns one DishClass per input item, or null where the model gave nothing usable.
 */
export async function classifyDishes(
  llm: Llm,
  items: ClassifyItem[],
  opts: { model: string; cache: ClassCache; concurrency?: number; kiez?: string | null; onBatch?: (done: number, total: number) => void },
): Promise<(DishClass | null)[]> {
  const hashes = items.map(dishHash);
  const out: (DishClass | null)[] = hashes.map((h) => opts.cache.get(h) ?? null);
  const todo = items.map((it, i) => ({ it, i })).filter(({ i }) => !out[i]);
  // Batches never mix restaurants when a menu fits, so the model reads each item next to its siblings.
  const batches: { it: ClassifyItem; i: number }[][] = [];
  for (const x of todo) {
    const last = batches.at(-1);
    if (last && last.length < CLASSIFY_BATCH && last[0]!.it.restaurant === x.it.restaurant) last.push(x);
    else batches.push([x]);
  }
  // Merge small restaurant batches up to the batch size to keep the call count low.
  const merged: typeof batches = [];
  for (const b of batches) {
    const last = merged.at(-1);
    if (last && last.length + b.length <= CLASSIFY_BATCH) last.push(...b);
    else merged.push([...b]);
  }
  let done = 0;
  const { errors } = await mapPool(merged, opts.concurrency ?? 6, async (batch) => {
    const list = batch.map(({ it }, index) => ({
      index, restaurant: it.restaurant, restaurantCuisine: it.restaurantCuisine.join(', '), section: it.section, name: it.name,
      description: it.description.slice(0, 300), ...(it.kcal ? { kcal: Math.round(it.kcal) } : {}),
    }));
    const text = JSON.stringify(list);
    const res = await llm.json<Out>({
      stage: 'classify', purpose: `classify:${batch.length}`, kiez: opts.kiez ?? null, model: opts.model,
      system: CLASSIFY_SYSTEM, content: [{ type: 'text', text: `Items (JSON):\n${text}` }],
      schema: CLASSIFY_SCHEMA, effort: 'low', maxTokens: 16000,
      estimate: { inputTokens: 1200 + text.length / 3, outputTokens: 100 + batch.length * 70 },
    });
    for (const r of res.data.items ?? []) {
      const slot = batch[r.index];
      const cls = parseDishClass(r);
      if (!slot || !cls) continue;
      out[slot.i] = cls;
      opts.cache.set(hashes[slot.i]!, cls);
    }
    done += batch.length;
    opts.onBatch?.(done, todo.length);
  });
  if (errors.length) throw new AggregateError(errors.map((e) => e.error), `classify: ${errors.length} of ${merged.length} batches failed`);
  return out;
}

export interface ClassifyStats { kiez: string; dishes: number; cached: number }

/** Pipeline cache backed by the dish rows themselves: a dish whose hash is unchanged keeps its class. */
export async function stageClassify(ctx: Ctx, kiez: KiezDef): Promise<ClassifyStats> {
  const rows = await ctx.db.all<{ id: string; name: string; description: string; description_de: string | null; section: string; section_de: string | null; restaurant: string; cuisine: string; kcal: number | null; dish_class: string | null; dish_class_hash: string | null }>(
    `SELECT d.id, d.name, d.description, d.description_de, d.section, d.section_de, r.name AS restaurant, r.cuisine, d.kcal, d.dish_class, d.dish_class_hash
     FROM pipeline_dish d JOIN pipeline_restaurant r ON r.id = d.restaurant_id
     WHERE r.kiez = ? AND r.skip_reason IS NULL AND d.review_status IS NOT 'wrong' ORDER BY r.id, d.position`, [kiez.slug]);
  const items: ClassifyItem[] = rows.map((r) => ({
    name: r.name, description: r.description_de || r.description || '', section: r.section_de || r.section || '',
    restaurant: r.restaurant, restaurantCuisine: JSON.parse(r.cuisine || '[]') as string[], kcal: r.kcal,
  }));
  const cache = new MemoryClassCache();
  rows.forEach((r, i) => {
    const cls = r.dish_class ? parseDishClass(JSON.parse(r.dish_class)) : null;
    if (cls && r.dish_class_hash === dishHash(items[i]!)) cache.set(r.dish_class_hash, cls);
  });
  const cached = cache.map.size;
  const classes = await classifyDishes(ctx.llm, items, { model: ctx.models.translate, cache, concurrency: ctx.opts.restaurantConcurrency, kiez: kiez.slug });
  const stmts: Stmt[] = [];
  rows.forEach((r, i) => {
    const cls = classes[i];
    const hash = dishHash(items[i]!);
    if (cls && hash !== r.dish_class_hash) stmts.push({ sql: 'UPDATE pipeline_dish SET dish_class = ?, dish_class_hash = ? WHERE id = ?', params: [JSON.stringify(cls), hash, r.id] });
  });
  await ctx.db.batch(stmts);
  if (stmts.length) ctx.log(`[${kiez.slug}] classify: ${stmts.length} dishes classified, ${cached} unchanged`);
  return { kiez: kiez.slug, dishes: stmts.length, cached };
}
