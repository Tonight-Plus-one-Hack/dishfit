// Stage 4 - Prüfen: deterministic outlier flags, a second model re-estimates flagged dishes, and one
// "Kiez chief" LLM judgement per Kiez decides per restaurant (ok / needs_review / reject + confidence).
import type { Ctx } from '../context.ts';
import type { KiezDef } from '../kiez.ts';
import { computeNutrition, relDiff } from '../nutrition/calc.ts';
import { foodIndex } from '../nutrition/foods.ts';
import { nowIso, type Stmt } from '../store/db.ts';
import type { Confidence, Ingredient, PrintedNutrition } from '../types.ts';
import { mapPool } from '../util/limiter.ts';
import { type DishRow, estimateRecipeBatches } from './nutrition.ts';

export interface CheckDish {
  id: string;
  restaurant_id: string;
  name: string;
  description: string;
  section: string;
  category: string;
  price_eur: number | null;
  printed: string | null;
  ingredients: string | null;
  recipe_confidence: Confidence | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  kcal_min: number; kcal_max: number; protein_min: number; protein_max: number;
  carbs_min: number; carbs_max: number; fat_min: number; fat_max: number;
  confidence: Confidence;
  nutrition_source: 'official' | 'ai';
}

const LIGHT = new Set(['starter', 'side', 'soup', 'snack', 'dessert']);

/** Deterministic plausibility flags for one dish; `medianKcal` is the Kiez median for its category. */
export function dishFlags(d: CheckDish, medianKcal: number | null): string[] {
  const flags: string[] = [];
  const ings: Ingredient[] = d.ingredients ? JSON.parse(d.ingredients) : [];
  const index = foodIndex();
  const grams = ings.reduce((a, i) => a + i.grams, 0);
  const light = LIGHT.has(d.category);
  if (d.kcal < 120 || (!light && d.kcal < 250)) flags.push('kcal_low');
  if (d.kcal > 1500) flags.push('kcal_high');
  if (!light && grams < 180) flags.push('portion_small');
  if (grams > 1100) flags.push('portion_large');
  if (d.kcal > 0 && (d.protein_g * 4) / d.kcal > 0.45) flags.push('protein_share_high');
  if (ings.some((i) => !index.has(i.food))) flags.push('unmatched_ingredient');
  if (d.price_eur != null && (d.price_eur > 45 || d.price_eur < 3)) flags.push('price_outlier');
  if (medianKcal && (d.kcal > medianKcal * 2.2 || d.kcal < medianKcal * 0.4)) flags.push('kiez_outlier');
  if (d.nutrition_source === 'official' && d.printed && ings.length) {
    const est = computeNutrition({ ingredients: ings, recipeConfidence: 'medium', priceEur: d.price_eur });
    if (relDiff(est.totals.kcal, d.kcal) > 0.4) flags.push('official_vs_estimate');
  }
  return flags;
}

const mean = (a: number, b: number, step: number) => Math.round((a + b) / 2 / step) * step;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.toSorted((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export const CHIEF_SYSTEM = `You are the quality chief for one Berlin neighbourhood (Kiez) in a restaurant nutrition pipeline. Code already extracted each restaurant's menu from its own website, estimated recipes, computed nutrition from USDA data, flagged numeric outliers and had a second model re-estimate flagged dishes.

For every restaurant in the list decide:
- verdict: "ok" (data is usable), "needs_review" (usable but a human should look at it first; it goes to the front of the team review sample), or "reject" (do not publish: the dish list is not a real food menu of this restaurant, it is garbled or unreadable, it is a catering or delivery-only list, or most numbers are implausible).
- confidence: how much you trust this restaurant's nutrition data overall: "high" (clear menu with descriptions, few flags), "medium" (typical), "low" (vague descriptions, many flags, second model disagreed often).
- note: one short sentence a teammate can act on (German or English).
Judge from the evidence given; do not invent facts about the restaurants.`;

const CHIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['restaurants'],
  properties: {
    restaurants: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['restaurant_id', 'verdict', 'confidence', 'note'],
        properties: {
          restaurant_id: { type: 'string' },
          verdict: { type: 'string', enum: ['ok', 'needs_review', 'reject'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          note: { type: 'string' },
        },
      },
    },
  },
};

interface ChiefOut { restaurants: { restaurant_id: string; verdict: 'ok' | 'needs_review' | 'reject'; confidence: Confidence; note: string }[] }

export interface CheckStats { kiez: string; restaurants: number; flagged: number; secondOpinions: number; agreed: number; adjusted: number; ok: number; needsReview: number; rejected: number }

export async function stageCheck(ctx: Ctx, kiez: KiezDef): Promise<CheckStats> {
  const restaurants = await ctx.db.all<{ id: string; name: string; cuisine: string }>(
    "SELECT id, name, cuisine FROM pipeline_restaurant WHERE kiez = ? AND status = 'nutrition' AND skip_reason IS NULL ORDER BY id", [kiez.slug]);
  const stats: CheckStats = { kiez: kiez.slug, restaurants: restaurants.length, flagged: 0, secondOpinions: 0, agreed: 0, adjusted: 0, ok: 0, needsReview: 0, rejected: 0 };
  if (!restaurants.length) return stats;
  const ids = restaurants.map((r) => r.id);
  const dishes = await ctx.db.all<CheckDish>(
    `SELECT * FROM pipeline_dish WHERE hidden = 0 AND kcal IS NOT NULL AND restaurant_id IN (SELECT id FROM pipeline_restaurant WHERE kiez = ? AND status IN ('nutrition', 'checked', 'image', 'approved'))`, [kiez.slug]);
  const medians = new Map<string, number | null>();
  for (const cat of new Set(dishes.map((d) => d.category))) medians.set(cat, median(dishes.filter((d) => d.category === cat).map((d) => d.kcal)));
  const pending = dishes.filter((d) => ids.includes(d.restaurant_id));
  const flags = new Map(pending.map((d) => [d.id, dishFlags(d, medians.get(d.category) ?? null)]));
  stats.flagged = [...flags.values()].filter((f) => f.length).length;

  // Second model on flagged AI estimates, batched per restaurant.
  const secondNotes = new Map<string, string>();
  const byRestaurant = new Map<string, CheckDish[]>();
  for (const d of pending) if (flags.get(d.id)!.length && d.nutrition_source === 'ai') byRestaurant.set(d.restaurant_id, [...(byRestaurant.get(d.restaurant_id) ?? []), d]);
  const updates: Stmt[] = [];
  const { errors } = await mapPool([...byRestaurant.entries()], ctx.opts.restaurantConcurrency, async ([rid, list]) => {
    const r = restaurants.find((x) => x.id === rid)!;
    const batches = estimateRecipeBatches(ctx, { model: ctx.models.second, kiez: kiez.slug, restaurantId: rid, restaurant: r.name, cuisine: (JSON.parse(r.cuisine) as string[]).join(', '), dishes: list as unknown as DishRow[], purpose: `second-opinion:${rid}`, stage: 'check' });
    for await (const recipes of batches) {
      for (const rec of recipes) {
        if (!rec) continue;
        const d = rec.dish as unknown as CheckDish;
        const n2 = computeNutrition({ ingredients: rec.ingredients, recipeConfidence: rec.recipeConfidence, priceEur: d.price_eur });
        stats.secondOpinions++;
        const agree = relDiff(n2.totals.kcal, d.kcal) <= 0.2 && relDiff(n2.totals.protein, d.protein_g) <= 0.25;
        const second = { model: ctx.models.second, kcal: n2.totals.kcal, protein: n2.totals.protein, carbs: n2.totals.carbs, fat: n2.totals.fat, ingredients: rec.ingredients, agree };
        if (agree) {
          stats.agreed++;
          updates.push({ sql: "UPDATE pipeline_dish SET check_flags = ?, second_opinion = ?, check_status = 'ok', updated_at = ? WHERE id = ?", params: [JSON.stringify(flags.get(d.id)), JSON.stringify(second), nowIso(), d.id] });
        } else {
          stats.adjusted++;
          updates.push({
            sql: `UPDATE pipeline_dish SET check_flags = ?, second_opinion = ?, check_status = 'adjusted', confidence = 'low',
                    kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?,
                    kcal_min = ?, kcal_max = ?, protein_min = ?, protein_max = ?, carbs_min = ?, carbs_max = ?, fat_min = ?, fat_max = ?,
                    method_note = method_note || ' Zweitmodell wich ab; Mittelwert beider Schätzungen, Spanne deckt beide ab.', updated_at = ? WHERE id = ?`,
            params: [JSON.stringify(flags.get(d.id)), JSON.stringify(second),
              mean(d.kcal, n2.totals.kcal, 1), mean(d.protein_g, n2.totals.protein, 0.1), mean(d.carbs_g, n2.totals.carbs, 0.1), mean(d.fat_g, n2.totals.fat, 0.1),
              Math.min(d.kcal_min, n2.range.kcal.min), Math.max(d.kcal_max, n2.range.kcal.max), Math.min(d.protein_min, n2.range.protein.min), Math.max(d.protein_max, n2.range.protein.max),
              Math.min(d.carbs_min, n2.range.carbs.min), Math.max(d.carbs_max, n2.range.carbs.max), Math.min(d.fat_min, n2.range.fat.min), Math.max(d.fat_max, n2.range.fat.max), nowIso(), d.id],
          });
        }
      }
    }
    secondNotes.set(rid, `${list.length} flagged, second model checked`);
  });
  for (const e of errors) ctx.log(`[${kiez.slug}] second opinion error ${e.item[0]}: ${String(e.error).slice(0, 200)}`);
  for (const d of pending) {
    if (!flags.get(d.id)!.length || d.nutrition_source === 'official') {
      updates.push({ sql: `UPDATE pipeline_dish SET check_flags = ?, check_status = ?, updated_at = ? WHERE id = ?`, params: [JSON.stringify(flags.get(d.id)), flags.get(d.id)!.length ? 'flagged' : 'ok', nowIso(), d.id] });
    }
  }
  await ctx.db.batch(updates);

  // Kiez chief: one judgement call per Kiez (chunked so each call stays small).
  const fresh = await ctx.db.all<CheckDish & { check_status: string; second_opinion: string | null; check_flags: string | null }>(
    `SELECT * FROM pipeline_dish WHERE hidden = 0 AND restaurant_id IN (${ids.map(() => '?').join(',')}) ORDER BY restaurant_id, position`, ids);
  const sources = new Map((await ctx.db.all<{ restaurant_id: string; kind: string; url: string | null; notes: string | null; menu_language: string | null }>(
    `SELECT restaurant_id, kind, url, notes, menu_language FROM pipeline_menu_source WHERE restaurant_id IN (${ids.map(() => '?').join(',')})`, ids)).map((s) => [s.restaurant_id, s]));
  const summaries = restaurants.map((r) => {
    const ds = fresh.filter((d) => d.restaurant_id === r.id);
    const kcals = ds.map((d) => d.kcal).filter((k) => k != null);
    const src = sources.get(r.id);
    const flagged = ds.filter((d) => d.check_flags && JSON.parse(d.check_flags).length);
    return {
      restaurant_id: r.id, name: r.name, cuisine: JSON.parse(r.cuisine),
      menu: { kind: src?.kind, url: src?.url, language: src?.menu_language, extraction_notes: src?.notes?.slice(0, 300) },
      dishes: ds.length, with_price: ds.filter((d) => d.price_eur != null).length, official: ds.filter((d) => d.nutrition_source === 'official').length,
      kcal_median: median(kcals), kcal_min: kcals.length ? Math.min(...kcals) : null, kcal_max: kcals.length ? Math.max(...kcals) : null,
      sample: ds.slice(0, 6).map((d) => `${d.name} | ${d.price_eur ?? '-'} EUR | ${d.kcal} kcal ${d.protein_g} g protein`),
      flagged: flagged.slice(0, 6).map((d) => ({ dish: d.name, kcal: d.kcal, protein: d.protein_g, flags: JSON.parse(d.check_flags!), second_model: d.second_opinion ? (JSON.parse(d.second_opinion).agree ? 'agreed' : 'disagreed') : 'n/a' })),
      flagged_count: flagged.length,
    };
  });
  const verdicts = new Map<string, ChiefOut['restaurants'][number]>();
  for (let i = 0; i < summaries.length; i += 30) {
    const chunk = summaries.slice(i, i + 30);
    const res = await ctx.llm.json<ChiefOut>({
      stage: 'check', purpose: `kiez-chief:${kiez.slug}:${i / 30}`, kiez: kiez.slug, model: ctx.models.chief, system: CHIEF_SYSTEM,
      content: [{ type: 'text', text: `Kiez: ${kiez.name}\nRestaurants (JSON):\n${JSON.stringify(chunk)}` }],
      schema: CHIEF_SCHEMA, effort: 'medium', maxTokens: 16000,
      estimate: { inputTokens: 800 + JSON.stringify(chunk).length / 3, outputTokens: 400 + chunk.length * 120 },
    });
    for (const v of res.data.restaurants) verdicts.set(v.restaurant_id, v);
  }
  const final: Stmt[] = [];
  for (const r of restaurants) {
    const v = verdicts.get(r.id) ?? { verdict: 'needs_review' as const, confidence: 'low' as const, note: 'Kiez chief returned no verdict' };
    if (v.verdict === 'reject') {
      stats.rejected++;
      final.push({ sql: "UPDATE pipeline_restaurant SET skip_reason = 'rejected_check', check_verdict = 'reject', check_confidence = ?, check_note = ?, updated_at = ? WHERE id = ?", params: [v.confidence, v.note, nowIso(), r.id] });
    } else {
      if (v.verdict === 'ok') stats.ok++; else stats.needsReview++;
      final.push({ sql: "UPDATE pipeline_restaurant SET status = 'checked', check_verdict = ?, check_confidence = ?, check_note = ?, updated_at = ? WHERE id = ?", params: [v.verdict, v.confidence, v.note, nowIso(), r.id] });
    }
  }
  await ctx.db.batch(final);
  ctx.log(`[${kiez.slug}] check: ${stats.flagged} flagged dishes, ${stats.secondOpinions} second opinions (${stats.agreed} agreed, ${stats.adjusted} adjusted); chief: ${stats.ok} ok, ${stats.needsReview} needs review, ${stats.rejected} rejected`);
  return stats;
}

export type { PrintedNutrition };
