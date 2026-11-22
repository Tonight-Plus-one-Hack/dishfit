// Stage 2 - Speisekarte: menu from the restaurant's own website, read by Claude into dishes and prices.
import { createHash } from 'node:crypto';
import { isPriorityCuisine } from '../../../packages/contract/src/dish-class.ts';
import type { Ctx } from '../context.ts';
import type { KiezDef } from '../kiez.ts';
import type { ContentBlock } from '../llm/llm.ts';
import type { MenuDocument } from '../sources/website.ts';
import { nowIso } from '../store/db.ts';
import { DISH_CATEGORIES, type DishCategory, type ExtractedDish, type SkipReason } from '../types.ts';
import { mapPool } from '../util/limiter.ts';

export const MENU_SYSTEM = `You read a restaurant's own published menu (web page text, PDF or photo) for a Berlin app that shows healthy dishes with price and nutrition.

First decide whether the documents contain the restaurant's food menu. Set is_menu false for anything else (legal notices, investment documents, job ads, drinks-only lists, a page without dishes) and explain in reason.

Extract food dishes only: mains, bowls, salads, soups, wraps, sandwiches, burgers, pizza, pasta, breakfast plates and starters. Skip drinks, sauces, dips, extras and add-on toppings, and sides or desserts under 5 EUR. At most 40 dishes; if there are more, prefer mains, bowls, salads and wraps.
Copy dish names exactly as printed, keep the original language. description: the printed description or listed components (empty string if none). section: the menu section heading as printed.
description_de and section_de: the description and the section heading in natural German for a German app (copy them unchanged when they are already German; keep proper names, brand names and dish names untranslated).
price_eur: the price as a number in EUR (7.9 for "7,90 €" or "7.9"). If a dish has several sizes, use the regular/main size and say so in notes. Use null when no price is printed.
If the same dish appears in two sections (e.g. starter and main size), keep both only if the prices differ.
printed_*: only values the restaurant itself prints for that dish (on the menu or an official nutrition sheet), per serving as served. If a nutrition sheet lists values per 100 g and a serving weight, convert to per serving. Otherwise null. Never estimate these.
category: the best fitting category from the list.`;

export const MENU_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_menu', 'reason', 'menu_language', 'notes', 'dishes'],
  properties: {
    is_menu: { type: 'boolean' },
    reason: { type: 'string' },
    menu_language: { type: 'string' },
    notes: { type: 'string' },
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'section', 'description_de', 'section_de', 'category', 'price_eur', 'printed_kcal', 'printed_protein_g', 'printed_carbs_g', 'printed_fat_g'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          section: { type: 'string' },
          description_de: { type: 'string' },
          section_de: { type: 'string' },
          category: { type: 'string', enum: [...DISH_CATEGORIES] },
          price_eur: { type: ['number', 'null'] },
          printed_kcal: { type: ['number', 'null'] },
          printed_protein_g: { type: ['number', 'null'] },
          printed_carbs_g: { type: ['number', 'null'] },
          printed_fat_g: { type: ['number', 'null'] },
        },
      },
    },
  },
} as const;

const WEBSITE_MENU_SYSTEM = `You read a restaurant's own published food menu. Return is_menu false for unrelated material or drinks-only lists.
Extract every food dish, including starters, sides, sauces offered on their own, snacks, and desserts at any price. Include each separately listed price or size variant. Do not include beverages or invent dishes.
Copy the name, description and section as printed. Give the German description and section separately. Use null for absent prices, and report the document number where each dish is actually listed. Merge repetitions of the same name, section and price across documents.
Choose the best category from the list. Printed nutrition comes only from the restaurant's documents and is per serving. Convert per-100-g figures only when the serving weight is printed.`;

const itemSchema = MENU_SCHEMA.properties.dishes.items;
const WEBSITE_MENU_SCHEMA = {
  ...MENU_SCHEMA,
  properties: {
    ...MENU_SCHEMA.properties,
    dishes: { type: 'array', items: {
      ...itemSchema,
      required: [...itemSchema.required, 'source_index'],
      properties: { ...itemSchema.properties, source_index: { type: 'integer' } },
    } },
  },
};

interface MenuOut {
  is_menu: boolean;
  reason: string;
  menu_language: string;
  notes: string;
  dishes: { name: string; description: string; section: string; description_de: string; section_de: string; category: DishCategory; price_eur: number | null; printed_kcal: number | null; printed_protein_g: number | null; printed_carbs_g: number | null; printed_fat_g: number | null; source_index?: number }[];
}

export function dishId(restaurantId: string, d: { name: string; section: string; priceEur: number | null }): string {
  const key = `${restaurantId}|${d.section.trim().toLowerCase()}|${d.name.trim().toLowerCase()}|${d.priceEur ?? ''}`;
  return 'd_' + createHash('sha1').update(key).digest('hex').slice(0, 16);
}

export function menuContent(docs: MenuDocument[], restaurantName: string): { content: ContentBlock[]; inputTokens: number } {
  const content: ContentBlock[] = [];
  let tokens = 1500;
  for (const [index, d] of docs.entries()) {
    content.push({ type: 'text', text: `Document ${index + 1}: ${d.url}` });
    if (d.kind === 'html' && d.text) {
      content.push({ type: 'text', text: `<menu_page url="${d.url}">\n${d.text}\n</menu_page>` });
      tokens += Math.ceil(d.text.length / 3.2);
    } else if (d.kind === 'pdf' && d.bytes) {
      content.push({ type: 'pdf', title: d.url, data: Buffer.from(d.bytes).toString('base64') });
      tokens += Math.min(80000, Math.ceil(d.bytes.byteLength / 60));
    } else if (d.kind === 'pdf' && d.text) {
      content.push({ type: 'text', text: `<menu_pdf_text url="${d.url}">\n${d.text}\n</menu_pdf_text>` });
      tokens += Math.ceil(d.text.length / 3.2);
    } else if (d.kind === 'image' && d.bytes) {
      content.push({ type: 'image', mediaType: d.mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: Buffer.from(d.bytes).toString('base64') });
      tokens += 2500;
    }
  }
  content.push({ type: 'text', text: `Restaurant: ${restaurantName} (Berlin). Extract the dishes.` });
  return { content, inputTokens: tokens };
}

export function toExtracted(out: MenuOut): ExtractedDish[] {
  return out.dishes.map((d) => ({
    name: d.name.trim(),
    description: d.description.trim(),
    section: d.section.trim(),
    descriptionDe: typeof d.description_de === 'string' ? d.description_de.trim() : null,
    sectionDe: typeof d.section_de === 'string' ? d.section_de.trim() : null,
    category: d.category,
    sourceIndex: d.source_index,
    priceEur: d.price_eur != null && Number.isFinite(d.price_eur) && d.price_eur >= 0 ? Math.round(d.price_eur * 100) / 100 : null,
    printed: d.printed_kcal != null && d.printed_kcal > 0 ? { kcal: d.printed_kcal, protein: d.printed_protein_g, carbs: d.printed_carbs_g, fat: d.printed_fat_g } : null,
  })).filter((d) => d.name);
}

/** Fast-food cuisines whose menus are mostly hidden by the healthy rule: scanned last. */
const FAST_FOOD_CUISINE = /pizza|burger|kebab|doner|döner|fried|chicken|fast_food|friture/;

/** Healthy cuisines first (HEALTHY_RULES.priorityCuisines), fast food last; the same order for team scans and community submissions. */
export const scanPriority = (r: { cuisine: string; diet_vegan: string | null; website: string | null }) => {
  const tags = JSON.parse(r.cuisine || '[]') as string[];
  return (isPriorityCuisine(tags) ? 3 : 0) - (FAST_FOOD_CUISINE.test(r.cuisine) ? 3 : 0) + (r.diet_vegan ? 1 : 0) + (r.website ? 1 : 0);
};

/** Restaurants waiting for stage 2, healthy-leaning cuisines first (no Places data is used for ordering). */
export async function menuQueue(ctx: Ctx, kiez: string): Promise<{ id: string; name: string; website: string | null; google_place_id: string | null }[]> {
  // Leave rows without their own website eligible for a later Places-enabled run.
  const rows = await ctx.db.all<{ id: string; name: string; website: string | null; google_place_id: string | null; cuisine: string; diet_vegan: string | null }>(
    `SELECT id, name, website, google_place_id, cuisine, diet_vegan FROM pipeline_restaurant
      WHERE kiez = ? AND status = 'found' AND skip_reason IS NULL AND attempts < 3
        AND (? OR NULLIF(website, '') IS NOT NULL) ORDER BY id`, [kiez, Number(ctx.opts.usePlacesWebsite)]);
  rows.sort((a, b) => scanPriority(b) - scanPriority(a) || a.id.localeCompare(b.id));
  const cap = ctx.opts.maxRestaurantsPerKiez;
  if (cap == null) return rows;
  const started = await ctx.db.first<{ n: number }>(
    "SELECT COUNT(*) AS n FROM pipeline_restaurant WHERE kiez = ? AND (status NOT IN ('candidate', 'found') OR (status = 'found' AND skip_reason IS NOT NULL AND skip_reason NOT IN ('no_places_match', 'below_rating', 'not_operational')))", [kiez]);
  return rows.slice(0, Math.max(0, cap - (started?.n ?? 0)));
}

async function park(ctx: Ctx, id: string, reason: SkipReason, detail: string) {
  await ctx.db.run('UPDATE pipeline_restaurant SET skip_reason = ?, last_error = ?, updated_at = ? WHERE id = ?', [reason, detail.slice(0, 500), nowIso(), id]);
}

export interface MenuStats { kiez: string; processed: number; menus: number; dishes: number; skipped: Record<string, number>; errors: number }

export async function stageMenu(ctx: Ctx, kiez: KiezDef): Promise<MenuStats> {
  const queue = await menuQueue(ctx, kiez.slug);
  const stats: MenuStats = { kiez: kiez.slug, processed: 0, menus: 0, dishes: 0, skipped: {}, errors: 0 };
  const skip = async (id: string, reason: SkipReason, detail: string) => {
    stats.skipped[reason] = (stats.skipped[reason] ?? 0) + 1;
    await park(ctx, id, reason, detail);
  };
  const { errors } = await mapPool(queue, ctx.opts.restaurantConcurrency, async (r) => {
    stats.processed++;
    let website = r.website;
    if (!website && ctx.opts.usePlacesWebsite && r.google_place_id && ctx.places.website) {
      website = await ctx.places.website(r.google_place_id, kiez.slug); // transient, never stored
    }
    if (!website) return skip(r.id, 'no_website', 'no website in OSM or Places');
    const fetched = await ctx.menus.fetchMenu({ id: r.id, name: r.name, website });
    if ('skip' in fetched) return skip(r.id, fetched.skip, fetched.detail);
    const { content, inputTokens } = menuContent(fetched.docs, r.name);
    const res = await ctx.llm.json<MenuOut>({
      stage: 'menu', purpose: `menu:${r.id}`, kiez: kiez.slug, restaurantId: r.id, model: ctx.models.menu,
      system: WEBSITE_MENU_SYSTEM, content, schema: WEBSITE_MENU_SCHEMA, effort: 'medium', maxTokens: 32000,
      estimate: { inputTokens, outputTokens: 9000 },
    });
    const dishes = toExtracted(res.data);
    if (!res.data.is_menu || dishes.length === 0) return skip(r.id, 'menu_unreadable', res.data.reason || 'no dishes');
    const seen = new Set<string>();
    const unique = dishes.filter((d) => { const id = dishId(r.id, d); if (seen.has(id)) return false; seen.add(id); return true; });
    const now = nowIso();
    const hash = createHash('sha1').update(fetched.docs.map((d) => d.url + (d.text ?? '') + (d.bytes ? Buffer.from(d.bytes).toString('base64') : '')).join('|')).digest('hex');
    const primary = fetched.docs[0]!;
    await ctx.db.batch([
      { sql: 'DELETE FROM pipeline_dish WHERE restaurant_id = ?', params: [r.id] },
      {
        sql: `INSERT INTO pipeline_menu_source (restaurant_id, kind, url, fetched_at, content_hash, menu_language, notes, model, dish_count, has_official_nutrition)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (restaurant_id) DO UPDATE SET kind = excluded.kind, url = excluded.url, fetched_at = excluded.fetched_at, content_hash = excluded.content_hash,
                menu_language = excluded.menu_language, notes = excluded.notes, model = excluded.model, dish_count = excluded.dish_count, has_official_nutrition = excluded.has_official_nutrition`,
        params: [r.id, `website-${primary.kind}`, primary.url, now, hash, res.data.menu_language, res.data.notes, res.model, unique.length, unique.some((d) => d.printed) ? 1 : 0],
      },
      ...unique.map((d, i) => ({
        sql: `INSERT INTO pipeline_dish (id, restaurant_id, position, name, description, section, description_de, section_de, category, price_eur, printed, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [dishId(r.id, d), r.id, i, d.name, d.description, d.section, d.descriptionDe, d.sectionDe, d.category, d.priceEur, d.printed ? JSON.stringify(d.printed) : null,
          (fetched.docs[(d.sourceIndex ?? 0) - 1] ?? primary).url],
      })),
      { sql: "UPDATE pipeline_restaurant SET status = 'menu', skip_reason = NULL, last_error = NULL, attempts = attempts + 1, updated_at = ? WHERE id = ?", params: [now, r.id] },
    ]);
    stats.menus++;
    stats.dishes += unique.length;
  });
  for (const e of errors) {
    stats.errors++;
    await ctx.db.run('UPDATE pipeline_restaurant SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?', [String(e.error).slice(0, 500), nowIso(), e.item.id]);
    ctx.log(`[${kiez.slug}] menu error ${e.item.name}: ${String(e.error).slice(0, 200)}`);
  }
  ctx.log(`[${kiez.slug}] menu: ${stats.menus}/${stats.processed} menus, ${stats.dishes} dishes, skipped ${JSON.stringify(stats.skipped)}, errors ${stats.errors}`);
  return stats;
}
