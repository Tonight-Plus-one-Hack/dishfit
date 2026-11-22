// German user-facing text: fills description_de / section_de for dishes that have none (menus read
// before stage 2 returned German itself). Dish names stay exactly as printed. No-op when all are set.
import type { Ctx } from '../context.ts';
import type { KiezDef } from '../kiez.ts';
import type { Stmt } from '../store/db.ts';
import { mapPool } from '../util/limiter.ts';

export const TRANSLATE_SYSTEM = `You prepare restaurant menu text for a German-language app in Berlin.
For each item return description_de and section_de: the description and the menu section heading in natural, concise German.
If a text is already German, return it unchanged. Keep proper names, brand names, dish names and transliterated dish words (Pho, Bibimbap, Banh Mi, Shawarma, ...) as they are; translate only the descriptive words.
Fix all-caps to normal German capitalisation only for descriptions, not for names. Never add information that is not in the source. Empty input gives an empty string.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'description_de', 'section_de'],
        properties: { index: { type: 'integer' }, description_de: { type: 'string' }, section_de: { type: 'string' } },
      },
    },
  },
};

interface Out { items: { index: number; description_de: string; section_de: string }[] }

export interface TranslateStats { kiez: string; restaurants: number; dishes: number }

export async function stageTranslate(ctx: Ctx, kiez: KiezDef): Promise<TranslateStats> {
  const restaurants = await ctx.db.all<{ id: string; name: string }>(
    `SELECT DISTINCT r.id, r.name FROM pipeline_restaurant r JOIN pipeline_dish d ON d.restaurant_id = r.id
     WHERE r.kiez = ? AND r.skip_reason IS NULL AND d.description_de IS NULL ORDER BY r.id`, [kiez.slug]);
  const stats: TranslateStats = { kiez: kiez.slug, restaurants: 0, dishes: 0 };
  const { errors } = await mapPool(restaurants, ctx.opts.restaurantConcurrency, async (r) => {
    const dishes = await ctx.db.all<{ id: string; description: string; section: string }>(
      'SELECT id, description, section FROM pipeline_dish WHERE restaurant_id = ? AND description_de IS NULL ORDER BY position', [r.id]);
    const list = dishes.map((d, i) => ({ index: i, description: d.description, section: d.section }));
    const res = await ctx.llm.json<Out>({
      stage: 'menu', purpose: `translate:${r.id}`, kiez: kiez.slug, restaurantId: r.id, model: ctx.models.translate,
      system: TRANSLATE_SYSTEM, content: [{ type: 'text', text: `Restaurant: ${r.name}\nItems (JSON):\n${JSON.stringify(list)}` }],
      schema: SCHEMA, effort: 'low', maxTokens: 16000,
      estimate: { inputTokens: 400 + JSON.stringify(list).length / 3, outputTokens: 200 + dishes.length * 60 },
    });
    const byIndex = new Map(res.data.items.map((x) => [x.index, x]));
    const stmts: Stmt[] = [];
    dishes.forEach((d, i) => {
      const t = byIndex.get(i);
      if (!t) return;
      stmts.push({ sql: 'UPDATE pipeline_dish SET description_de = ?, section_de = ? WHERE id = ?', params: [d.description ? t.description_de.trim() : '', d.section ? t.section_de.trim() : '', d.id] });
    });
    await ctx.db.batch(stmts);
    stats.restaurants++;
    stats.dishes += stmts.length;
  });
  for (const e of errors) ctx.log(`[${kiez.slug}] translate error ${e.item.name}: ${String(e.error).slice(0, 200)}`);
  if (restaurants.length) ctx.log(`[${kiez.slug}] translate: ${stats.dishes} dishes in ${stats.restaurants} restaurants`);
  return stats;
}
