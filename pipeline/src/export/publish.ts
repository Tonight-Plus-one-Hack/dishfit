// Publishes pipeline results into the Worker's app tables (worker/migrations/0001_init.sql:
// restaurants, menu_sources, dishes, ai_usage) as idempotent upserts. Output is a SQL file for
// `wrangler d1 execute <db> --file <file>` or statements applied directly to a D1 database.
// Only restaurants at the release status get published_at; the rest are written unpublished.
import { createHash } from 'node:crypto';
import { HEALTHY_RULES, isHealthy, parseDishClass, type DishClass } from '../../../packages/contract/src/dish-class.ts';
import { isKiezSlug } from '../../../packages/contract/src/kieze.ts';
import { foodIndex } from '../nutrition/foods.ts';
import type { Db, SqlValue, Stmt } from '../store/db.ts';
import { STATUSES, type Ingredient, type RestaurantStatus } from '../types.ts';
import { parseOsmHours } from './hours.ts';
import { webRestaurantId } from './web.ts';
import { isDeliveryPlatform } from '../sources/delivery.ts';

/** Deterministic UUID (v5 layout) so ids stay stable across re-scans. */
export function stableUuid(name: string): string {
  const h = createHash('sha1').update(`menu-pipeline:${name}`).digest('hex');
  const v = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Date.now());

function lit(v: SqlValue): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${v.replace(/'/g, "''")}'`;
}

/** Renders statements with inlined literals (wrangler d1 execute --file takes plain SQL). */
export function toSqlScript(stmts: Stmt[]): string {
  return stmts.map((s) => {
    let i = 0;
    return s.sql.replace(/\?/g, () => lit((s.params ?? [])[i++] ?? null)) + ';';
  }).join('\n') + '\n';
}

function clampRange(v: number | null, min: number | null, max: number | null): [number, number, number] | [null, null, null] {
  return v === null ? [null, null, null] : [v, Math.min(min ?? v, v), Math.max(max ?? v, v)];
}

export async function buildPublish(db: Db, opts: { releaseStatus: RestaurantStatus; minStatus: RestaurantStatus; kieze?: string[]; placeIds?: Map<string, string> }): Promise<{ stmts: Stmt[]; restaurants: number; dishes: number; healthy: number; published: number }> {
  const statuses = STATUSES.slice(STATUSES.indexOf(opts.minStatus));
  const release = new Set(STATUSES.slice(STATUSES.indexOf(opts.releaseStatus)));
  const where = [`status IN (${statuses.map(() => '?').join(',')})`];
  const params: string[] = [...statuses];
  if (opts.kieze?.length) { where.push(`kiez IN (${opts.kieze.map(() => '?').join(',')})`); params.push(...opts.kieze); }
  const rows = await db.all<{ id: string; kiez: string; name: string; lat: number; lng: number; street: string | null; housenumber: string | null; postcode: string | null; opening_hours: string | null; website: string | null; google_place_id: string | null; status: string; skip_reason: string | null; created_at: string; updated_at: string }>(
    `SELECT * FROM pipeline_restaurant WHERE ${where.join(' AND ')} ORDER BY kiez, name`, params);
  const foods = foodIndex();
  const stmts: Stmt[] = [];
  let dishCount = 0;
  let healthyCount = 0;
  let published = 0;
  let restaurantCount = 0;
  const now = Date.now();
  for (const r of rows) {
    const src = await db.first<{ kind: string; url: string | null; content_hash: string; fetched_at: string; has_official_nutrition: number }>('SELECT * FROM pipeline_menu_source WHERE restaurant_id = ?', [r.id]);
    const dishes = await db.all<{ id: string; name: string; description: string; section: string; description_de: string | null; section_de: string | null; source_url: string | null; price_eur: number | null; ingredients: string | null; kcal: number | null; kcal_min: number | null; kcal_max: number | null; protein_g: number | null; protein_min: number | null; protein_max: number | null; carbs_g: number | null; carbs_min: number | null; carbs_max: number | null; fat_g: number | null; fat_min: number | null; fat_max: number | null; confidence: string | null; nutrition_source: string | null; method_note: string | null; health_score: number | null; image_ref: string | null; hidden: number; updated_at: string; dish_class: string | null }>(
      'SELECT * FROM pipeline_dish WHERE restaurant_id = ? ORDER BY position', [r.id]);
    if (!src || !dishes.length || (src.url && isDeliveryPlatform(src.url))) continue;
    restaurantCount++;
    const rid = stableUuid(r.id);
    const placeId = opts.placeIds?.get(webRestaurantId(r.id)) ?? (r.google_place_id?.startsWith('fixture-') ? null : r.google_place_id);
    const classified = dishes.map((dish) => ({
      dish,
      columns: classColumns(dish.dish_class ? parseDishClass(JSON.parse(dish.dish_class)) : null, dish.kcal, dish.protein_g),
    }));
    const healthyDishes = classified.filter(({ dish, columns }) => !dish.hidden && columns[8] === 1).length;
    const isReleased = placeId !== null && r.skip_reason === null && isKiezSlug(r.kiez)
      && release.has(r.status as RestaurantStatus) && healthyDishes >= HEALTHY_RULES.minDishesPerRestaurant;
    const pub = isReleased ? now : null;
    if (isReleased) published++;
    const hours = parseOsmHours(r.opening_hours);
    const address = [[r.street, r.housenumber].filter(Boolean).join(' '), [r.postcode, 'Berlin'].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;
    stmts.push({
      sql: `INSERT INTO restaurants (id, google_place_id, name, kiez, lat, lng, address, website_url, opening_hours, published_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET google_place_id = excluded.google_place_id, name = excluded.name, kiez = excluded.kiez, lat = excluded.lat, lng = excluded.lng,
              address = excluded.address, website_url = excluded.website_url, opening_hours = excluded.opening_hours, published_at = excluded.published_at, updated_at = excluded.updated_at`,
      params: [rid, placeId, r.name, r.kiez, r.lat, r.lng, address, r.website, hours ? JSON.stringify({ periods: hours.periods }) : null, pub, ms(r.created_at), ms(r.updated_at)],
    });
    const msid = stableUuid(`${r.id}|menu`);
    const kind = src.kind === 'website-pdf' ? 'website_pdf' : src.kind === 'website-image' ? 'website_image' : 'website_html';
    stmts.push({
      sql: `INSERT INTO menu_sources (id, restaurant_id, kind, url, content_sha256, fetched_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, url = excluded.url, content_sha256 = excluded.content_sha256, fetched_at = excluded.fetched_at`,
      params: [msid, rid, kind, src.url, src.content_hash, ms(src.fetched_at), ms(src.fetched_at)],
    });
    // Dishes that disappeared from a re-scanned menu are removed.
    stmts.push({ sql: 'DELETE FROM dishes WHERE menu_source_id = ? AND id NOT IN (SELECT value FROM json_each(?))', params: [msid, JSON.stringify(dishes.map((d) => stableUuid(d.id)))] });
    for (const { dish: d, columns } of classified) {
      const ings = (d.ingredients ? JSON.parse(d.ingredients) : []) as Ingredient[];
      const [kcal, kcalMin, kcalMax] = clampRange(d.kcal, d.kcal_min, d.kcal_max);
      const [p, pMin, pMax] = clampRange(d.protein_g, d.protein_min, d.protein_max);
      const [c, cMin, cMax] = clampRange(d.carbs_g, d.carbs_min, d.carbs_max);
      const [f, fMin, fMax] = clampRange(d.fat_g, d.fat_min, d.fat_max);
      stmts.push({
        sql: `INSERT INTO dishes (id, restaurant_id, menu_source_id, name, description, category, price_cents, kcal, kcal_min, kcal_max, protein_g, protein_g_min, protein_g_max,
                carbs_g, carbs_g_min, carbs_g_max, fat_g, fat_g_min, fat_g_max, nutrition_source, confidence, method_note, ingredients, estimated_at, health_score, ai_image_key, published_at, created_at, updated_at,
                course, dish_type, cuisine, is_vegan, is_vegetarian, is_gluten_free, is_full_meal, class_confidence, healthy, menu_item_source_url)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET menu_source_id = excluded.menu_source_id, name = excluded.name, description = excluded.description, category = excluded.category,
                price_cents = excluded.price_cents, kcal = excluded.kcal, kcal_min = excluded.kcal_min, kcal_max = excluded.kcal_max, protein_g = excluded.protein_g,
                protein_g_min = excluded.protein_g_min, protein_g_max = excluded.protein_g_max, carbs_g = excluded.carbs_g, carbs_g_min = excluded.carbs_g_min, carbs_g_max = excluded.carbs_g_max,
                fat_g = excluded.fat_g, fat_g_min = excluded.fat_g_min, fat_g_max = excluded.fat_g_max, nutrition_source = excluded.nutrition_source, confidence = excluded.confidence,
                method_note = excluded.method_note, ingredients = excluded.ingredients, estimated_at = excluded.estimated_at, health_score = excluded.health_score,
                ai_image_key = excluded.ai_image_key, published_at = excluded.published_at, updated_at = excluded.updated_at,
                course = excluded.course, dish_type = excluded.dish_type, cuisine = excluded.cuisine, is_vegan = excluded.is_vegan, is_vegetarian = excluded.is_vegetarian,
                is_gluten_free = excluded.is_gluten_free, is_full_meal = excluded.is_full_meal, class_confidence = excluded.class_confidence, healthy = excluded.healthy,
                menu_item_source_url = excluded.menu_item_source_url`,
        params: [stableUuid(d.id), rid, msid, d.name, d.description_de || d.description || null, d.section_de || d.section || null, d.price_eur != null ? Math.round(d.price_eur * 100) : null,
          kcal, kcalMin, kcalMax, p, pMin, pMax, c, cMin, cMax, f, fMin, fMax, d.nutrition_source, d.confidence, d.method_note,
          JSON.stringify(ings.map((i) => ({ name: foods.get(i.food)?.description ?? i.food, grams: i.grams, foodId: i.food }))),
          kcal === null ? null : ms(d.updated_at), d.health_score, d.image_ref, !d.hidden && columns[8] === 1 ? pub : null, ms(d.updated_at), ms(d.updated_at),
          ...columns, d.source_url],
      });
      dishCount++;
    }
    healthyCount += classified.filter(({ columns }) => columns[8] === 1).length;
  }
  const costs = await db.all<{ id: number; run_id: string; stage: string; kiez: string | null; restaurant_id: string | null; provider: string; model: string; usd: number; input_tokens: number | null; output_tokens: number | null; ts: string }>(
    'SELECT * FROM pipeline_cost WHERE usd > 0 ORDER BY id');
  const purpose: Record<string, string> = { find: 'places_search', menu: 'menu_extract', nutrition: 'nutrition', check: 'nutrition_check', image: 'image_generate' };
  for (const c of costs) {
    stmts.push({
      sql: `INSERT OR IGNORE INTO ai_usage (id, created_at, purpose, provider, route, model, status, input_tokens, output_tokens, units, cost_micros, kiez, restaurant_id)
            VALUES (?, ?, ?, ?, 'direct', ?, 200, ?, ?, ?, ?, ?, ?)`,
      params: [stableUuid(`cost|${c.run_id}|${c.id}`), ms(c.ts), purpose[c.stage] ?? c.stage, c.provider === 'google-places' ? 'google_places' : c.provider, c.model,
        c.input_tokens ?? 0, c.output_tokens ?? 0, c.provider === 'anthropic' ? 0 : 1, Math.round(c.usd * 1e6), c.kiez, c.restaurant_id ? stableUuid(c.restaurant_id) : null],
    });
  }
  return { stmts, restaurants: restaurantCount, dishes: dishCount, healthy: healthyCount, published };
}

const bit = (b: boolean) => (b ? 1 : 0);

/** dishes.course ... dishes.healthy (worker/migrations/0043_dish_class.sql); all NULL until the dish is classified. */
export function classColumns(c: DishClass | null, kcal: number | null, proteinG: number | null): (string | number | null)[] {
  if (!c) return [null, null, null, null, null, null, null, null, null];
  return [c.course, c.dishType, c.cuisine, bit(c.vegan), bit(c.vegetarian), bit(c.glutenFree), bit(c.isFullMeal), c.confidence,
    kcal === null || proteinG === null ? null : bit(isHealthy({ cls: c, kcal, proteinG }))];
}
