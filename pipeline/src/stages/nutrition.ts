// Stage 3 - Nährwerte: the LLM lists ingredients and grams per dish; code computes nutrition from
// the USDA table. Official values printed by the restaurant replace the estimate.
import type { Ctx } from '../context.ts';
import type { KiezDef } from '../kiez.ts';
import { computeNutrition } from '../nutrition/calc.ts';
import { foodCatalogText, foodIndex, loadFoods, resolveFood } from '../nutrition/foods.ts';
import { nowIso, type Stmt } from '../store/db.ts';
import type { Confidence, Ingredient, NutritionResult, PrintedNutrition } from '../types.ts';
import { mapPool } from '../util/limiter.ts';

export function recipeSystem(): string {
  return `You estimate recipes for restaurant dishes in Berlin so that code can compute nutrition from a food database. You never output nutrition numbers.

For each dish, list the ingredients of ONE portion as served in a typical Berlin restaurant, with grams:
- Use cooked weights for cooked components (cooked rice, cooked pasta, cooked chicken, boiled lentils).
- Always include the cooking fat (oil or butter used for frying, roasting, sauteing) and every sauce, dressing, dip or spread the description mentions or the dish normally comes with (mayo, aioli, tahini, peanut sauce, teriyaki or poke sauce, dressing: usually 40-80 g in bowls and salads). These carry most of the fat and are the most common source of underestimates.
- Use realistic restaurant amounts, not generous home portions: the meat, fish, tofu or falafel in a bowl, salad or wrap is usually 70-110 g cooked (about 20-30 g protein); in a plated main course 150-200 g; a bowl base is usually 150-250 g cooked rice or grains; a burger bun is about 80 g.
- Count toppings that add fat: avocado, cheese, nuts, seeds, fried onions, crispy toppings.
- Bread, fries or rice served with the dish count only when the menu says they come with it.
- Pick each ingredient's food from the catalog keys below (closest match; a German dish word in the catalog notes tells you which key covers it). Mention anything the key does not capture in note.
recipe_confidence: high only for simple, well-defined dishes with a clear description; medium for most dishes; low when the description is vague, the dish is unusual, or the portion size is unknowable.
Return one entry per dish, using the dish index you were given.

Food catalog (key [group]: German names it covers):
${foodCatalogText()}`;
}

export function recipeSchema(): Record<string, unknown> {
  const keys = loadFoods().foods.map((f) => f.key);
  return {
    type: 'object',
    additionalProperties: false,
    required: ['dishes'],
    properties: {
      dishes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'ingredients', 'recipe_confidence', 'portion_note'],
          properties: {
            index: { type: 'integer' },
            ingredients: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['food', 'grams', 'note'],
                properties: { food: { type: 'string', enum: keys }, grams: { type: 'number' }, note: { type: 'string' } },
              },
            },
            recipe_confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            portion_note: { type: 'string' },
          },
        },
      },
    },
  };
}

export interface RecipeOut { dishes: { index: number; ingredients: Ingredient[]; recipe_confidence: Confidence; portion_note: string }[] }

export interface DishRow { id: string; restaurant_id: string; name: string; description: string; section: string; category: string; price_eur: number | null; printed: string | null }

export function recipePrompt(restaurant: string, cuisine: string, dishes: DishRow[]): string {
  const lines = dishes.map((d, i) => `${i}. ${d.name}${d.description ? ` - ${d.description}` : ''} [section: ${d.section || '-'}; ${d.price_eur != null ? `${d.price_eur.toFixed(2)} EUR` : 'no price'}]`);
  return `Restaurant: ${restaurant} (Berlin)${cuisine ? `, cuisine: ${cuisine}` : ''}\nDishes:\n${lines.join('\n')}`;
}

/** Normalises the model's ingredient list against the food table (unknown keys stay, flagged as unmatched). */
export function cleanIngredients(list: Ingredient[]): Ingredient[] {
  const index = foodIndex();
  return list.filter((i) => i.grams > 0).map((i) => {
    const f = index.has(i.food) ? index.get(i.food)! : resolveFood(i.food, index);
    return { food: f?.key ?? i.food, grams: Math.round(i.grams), ...(i.note ? { note: i.note } : {}) };
  });
}

export function dishUpdate(dishId: string, ingredients: Ingredient[], recipeConfidence: Confidence, n: NutritionResult): Stmt {
  return {
    sql: `UPDATE pipeline_dish SET ingredients = ?, recipe_confidence = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, sugar_g = ?, sat_fat_g = ?, sodium_mg = ?,
            kcal_min = ?, kcal_max = ?, protein_min = ?, protein_max = ?, carbs_min = ?, carbs_max = ?, fat_min = ?, fat_max = ?,
            confidence = ?, nutrition_source = ?, method_note = ?, health_score = ?, protein_per_euro = ?, updated_at = ? WHERE id = ?`,
    params: [JSON.stringify(ingredients), recipeConfidence, n.totals.kcal, n.totals.protein, n.totals.carbs, n.totals.fat, n.totals.fiber, n.totals.sugar, n.totals.satFat, n.totals.sodiumMg,
      n.range.kcal.min, n.range.kcal.max, n.range.protein.min, n.range.protein.max, n.range.carbs.min, n.range.carbs.max, n.range.fat.min, n.range.fat.max,
      n.confidence, n.source, n.methodNote, n.healthScore, n.proteinPerEuro, nowIso(), dishId],
  };
}

const RECIPES_PER_REQUEST = 55;

export async function* estimateRecipeBatches(ctx: Ctx, opts: { model: string; kiez: string; restaurantId: string; restaurant: string; cuisine: string; dishes: DishRow[]; purpose: string; stage: 'nutrition' | 'check' }) {
  for (let start = 0; start < opts.dishes.length; start += RECIPES_PER_REQUEST) {
    const dishes = opts.dishes.slice(start, start + RECIPES_PER_REQUEST);
    const res = await ctx.llm.json<RecipeOut>({
      stage: opts.stage, purpose: opts.purpose, kiez: opts.kiez, restaurantId: opts.restaurantId, model: opts.model,
      system: recipeSystem(), content: [{ type: 'text', text: recipePrompt(opts.restaurant, opts.cuisine, dishes) }],
      schema: recipeSchema(), effort: 'medium', maxTokens: 32000,
      estimate: { inputTokens: 6000 + dishes.length * 40, outputTokens: 1500 + dishes.length * 260 },
    });
    const byIndex = new Map(res.data.dishes.map((d) => [d.index, d]));
    yield dishes.map((d, i) => {
      const r = byIndex.get(i);
      return r ? { dish: d, ingredients: cleanIngredients(r.ingredients), recipeConfidence: r.recipe_confidence } : null;
    });
  }
}

export interface NutritionStats { kiez: string; restaurants: number; dishes: number; official: number; errors: number }

export async function stageNutrition(ctx: Ctx, kiez: KiezDef): Promise<NutritionStats> {
  const queue = await ctx.db.all<{ id: string; name: string; cuisine: string }>(
    "SELECT id, name, cuisine FROM pipeline_restaurant WHERE kiez = ? AND status = 'menu' AND skip_reason IS NULL ORDER BY id", [kiez.slug]);
  const stats: NutritionStats = { kiez: kiez.slug, restaurants: 0, dishes: 0, official: 0, errors: 0 };
  const { errors } = await mapPool(queue, ctx.opts.restaurantConcurrency, async (r) => {
    const dishes = await ctx.db.all<DishRow>('SELECT id, restaurant_id, name, description, section, category, price_eur, printed FROM pipeline_dish WHERE restaurant_id = ? AND kcal IS NULL ORDER BY position', [r.id]);
    const batches = estimateRecipeBatches(ctx, { model: ctx.models.nutrition, kiez: kiez.slug, restaurantId: r.id, restaurant: r.name, cuisine: (JSON.parse(r.cuisine) as string[]).join(', '), dishes, purpose: `nutrition:${r.id}`, stage: 'nutrition' });
    for await (const recipes of batches) {
      const stmts: Stmt[] = [];
      let official = 0;
      for (const rec of recipes) {
        if (!rec) continue;
        const printed = rec.dish.printed ? (JSON.parse(rec.dish.printed) as PrintedNutrition) : null;
        const n = computeNutrition({ ingredients: rec.ingredients, recipeConfidence: rec.recipeConfidence, priceEur: rec.dish.price_eur, printed });
        if (n.source === 'official') official++;
        stmts.push(dishUpdate(rec.dish.id, rec.ingredients, rec.recipeConfidence, n));
      }
      await ctx.db.batch(stmts);
      stats.dishes += stmts.length;
      stats.official += official;
    }
    // Dishes the model skipped are hidden rather than shown without numbers.
    await ctx.db.batch([
      { sql: 'UPDATE pipeline_dish SET hidden = 1 WHERE restaurant_id = ? AND kcal IS NULL', params: [r.id] },
      { sql: "UPDATE pipeline_restaurant SET status = 'nutrition', last_error = NULL, updated_at = ? WHERE id = ?", params: [nowIso(), r.id] },
    ]);
    stats.restaurants++;
  });
  for (const e of errors) {
    stats.errors++;
    await ctx.db.run('UPDATE pipeline_restaurant SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?', [String(e.error).slice(0, 500), nowIso(), e.item.id]);
    ctx.log(`[${kiez.slug}] nutrition error ${e.item.name}: ${String(e.error).slice(0, 200)}`);
  }
  ctx.log(`[${kiez.slug}] nutrition: ${stats.restaurants} restaurants, ${stats.dishes} dishes (${stats.official} official), errors ${stats.errors}`);
  return stats;
}
