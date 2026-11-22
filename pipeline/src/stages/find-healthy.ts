// Stage 1, healthy variant: instead of every restaurant in a tile grid ("restaurant"), Places Text Search
// runs once per healthy term over the Kiez (healthy, bowl, poke, salad, ...). Each (term, area) is probed
// with the free IDs-only field mask first; a saturated area (60 hits) is split once into quadrants; paid
// Enterprise pages are fetched only up to the last page that holds a place nobody has published yet.
// Hits are matched to the OSM base like the tile scan (stages/find.ts), so OSM stays the data source and
// only the place_id is stored. Then the OSM places tagged with a healthy cuisine (HEALTHY_RULES.priorityCuisines,
// or diet:vegan / diet:vegetarian = yes or only) that no search hit get their place id from one Text Search lookup
// each (Enterprise fields for the rating, name and address, strict name and distance match, the same 4.3 rating rule).
// The OSM rows are refreshed on every run, so cafés and other venues added later join an existing queue.
// Places already published by any Kiez (pipeline/registry) never enter the menu stage.
// Progress lives in pipeline_tile (tile_id "q:<term>:<bbox>") and places_checked_at, so a stopped run resumes.
import { join } from 'node:path';
import { isPriorityCuisine } from '../../../packages/contract/src/dish-class.ts';
import { type Ctx, PIPELINE_ROOT } from '../context.ts';
import { readRegistries } from '../export/kiez.ts';
import { bboxIntersectsShape, type KiezDef, kiezShapes, splitTile, tileId } from '../kiez.ts';
import { strictPlaceMatch } from '../match.ts';
import { LOOKUP_RADIUS_M, MAX_RESULTS_PER_QUERY, MIN_RATING_REQUEST } from '../sources/places.ts';
import { nowIso } from '../store/db.ts';
import type { BBox, PlacesCandidate } from '../types.ts';
import { matchTile, upsertOsm } from './find.ts';

/** Search terms for healthy places, including the cuisines and meal types used in the Berlin expansion. */
export const HEALTHY_TERMS = [
  'healthy food', 'bowl', 'poke', 'salad', 'protein', 'vegan', 'vegetarisch', 'mediterranean',
  'levantinisch falafel-teller', 'sushi', 'vietnamesisch pho', 'koreanisch bibimbap', 'acai',
  'smoothie gesundes frühstück', 'meal prep',
] as const;

/** A saturated Kiez-wide search is split into quadrants this many times at most. */
const MAX_SPLIT_DEPTH = 1;

export interface FindHealthyStats {
  kiez: string;
  osm: number;
  searches: number;
  /** Paid pages fetched, Enterprise (or, with probeOnly, that a real run would fetch). */
  paidPages: number;
  newPlaces: number;
  /** OSM places with a healthy cuisine tag looked up by name and address (Text Search Pro; planned calls with probeOnly). */
  osmLookups: number;
  /** Of those, matched to a place id at or above the rating floor. */
  osmMatched: number;
  found: number;
  alreadyPublished: number;
}


/** OSM tags that make a place a healthy candidate: a priority cuisine or explicit vegan or vegetarian options. */
export function isHealthyOsm(r: { cuisine: string; diet_vegan: string | null; diet_vegetarian: string | null }): boolean {
  return isPriorityCuisine(JSON.parse(r.cuisine || '[]') as string[])
    || r.diet_vegan === 'yes' || r.diet_vegan === 'only'
    || r.diet_vegetarian === 'yes' || r.diet_vegetarian === 'only';
}

interface OsmCandidateRow { id: string; osm_id: string; name: string; lat: number; lng: number; street: string | null; housenumber: string | null; postcode: string | null; cuisine: string; diet_vegan: string | null; diet_vegetarian: string | null }

/** Looks up a place id once for every healthy-tagged OSM place of the Kiez that no search or tile scan matched and nobody published (a `q:osm:` tile marks the attempt). */
async function matchHealthyOsm(ctx: Ctx, kiez: string, published: { placeIds: Set<string>; osmIds: Set<string> }, probeOnly: boolean): Promise<{ lookups: number; matched: number }> {
  const rows = (await ctx.db.all<OsmCandidateRow>(
    `SELECT id, osm_id, name, lat, lng, street, housenumber, postcode, cuisine, diet_vegan, diet_vegetarian FROM pipeline_restaurant
       WHERE kiez = ? AND status = 'candidate' AND google_place_id IS NULL
         AND ((skip_reason IS NULL AND places_checked_at IS NULL) OR skip_reason = 'no_places_match')
         AND NOT EXISTS (SELECT 1 FROM pipeline_tile t WHERE t.kiez = pipeline_restaurant.kiez AND t.tile_id = 'q:osm:' || pipeline_restaurant.osm_id)
       ORDER BY id`, [kiez]))
    .filter((r) => isHealthyOsm(r) && !published.osmIds.has(r.osm_id));
  if (probeOnly) return { lookups: rows.length, matched: 0 };
  let matched = 0;
  for (const r of rows) {
    const address = [[r.street, r.housenumber].filter(Boolean).join(' '), [r.postcode, 'Berlin'].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const hits = await ctx.places.lookupPlace({ name: r.name, address, location: { lat: r.lat, lng: r.lng }, kiez, minRating: MIN_RATING_REQUEST });
    const taken = hits.length ? new Set((await ctx.db.all<{ google_place_id: string }>(
      `SELECT google_place_id FROM pipeline_restaurant WHERE google_place_id IN (${hits.map(() => '?').join(',')}) AND id != ?`, [...hits.map((h) => h.placeId), r.id])).map((x) => x.google_place_id)) : new Set<string>();
    const hit = strictPlaceMatch(hits.filter((h) => (h.rating ?? 0) >= ctx.opts.minRating && !published.placeIds.has(h.placeId) && !taken.has(h.placeId)
      && (!h.businessStatus || h.businessStatus === 'OPERATIONAL')), r, LOOKUP_RADIUS_M);
    const now = nowIso();
    const markLookup = {
      sql: "INSERT OR IGNORE INTO pipeline_tile (kiez, tile_id, south, west, north, east, depth, state) VALUES (?, ?, ?, ?, ?, ?, 0, 'done')",
      params: [kiez, `q:osm:${r.osm_id}`, r.lat, r.lng, r.lat, r.lng],
    };
    if (hit) {
      const saved = await ctx.db.run(
        `UPDATE pipeline_restaurant SET google_place_id = ?, places_checked_at = ?, updated_at = ?, status = 'found', skip_reason = NULL
         WHERE id = ? AND NOT EXISTS (SELECT 1 FROM pipeline_restaurant WHERE google_place_id = ? AND id != ?)`,
        [hit.placeId, now, now, r.id, hit.placeId, r.id]);
      if (saved.changes) {
        await ctx.db.run(markLookup.sql, markLookup.params);
        matched++;
        continue;
      }
    }
    // Check once even if no candidate matched or the place ID already belongs to another venue.
    await ctx.db.batch([
      { sql: 'UPDATE pipeline_restaurant SET places_checked_at = ?, updated_at = ? WHERE id = ?', params: [now, now, r.id] },
      markLookup,
    ]);
  }
  return { lookups: rows.length, matched };
}

const tileKey = (term: string, b: BBox) => `q:${term}:${tileId(b)}`;

/** Place ids and OSM ids every Kiez has already published. */
export function publishedIds(registryDir = join(PIPELINE_ROOT, 'registry')): { placeIds: Set<string>; osmIds: Set<string> } {
  const regs = readRegistries(registryDir);
  return {
    placeIds: new Set(regs.flatMap((r) => r.places.map((p) => p.placeId)).filter((x): x is string => !!x)),
    osmIds: new Set(regs.flatMap((r) => r.places.map((p) => p.osmId)).filter((x): x is string => !!x)),
  };
}

/** All IDs-only pages of one search (free); ids per page. */
async function probe(ctx: Ctx, kiez: string, term: string, bbox: BBox): Promise<string[][]> {
  const pages: string[][] = [];
  let token: string | undefined;
  for (let page = 0; page < MAX_RESULTS_PER_QUERY / 20; page++) {
    const res = await ctx.places.searchTile({ bbox, idsOnly: true, kiez, textQuery: term, ...(token ? { pageToken: token } : {}) });
    pages.push(res.ids);
    if (!res.nextPageToken) break;
    token = res.nextPageToken;
  }
  return pages;
}

export async function stageFindHealthy(ctx: Ctx, kiez: KiezDef, opts: { probeOnly?: boolean; registryDir?: string } = {}): Promise<FindHealthyStats> {
  const shape = kiezShapes().get(kiez.slug);
  if (!shape) throw new Error(`no boundary for ${kiez.slug}; run scripts/build-kieze.ts`);
  const known = await ctx.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM pipeline_restaurant WHERE kiez = ?', [kiez.slug]);
  const osm = await upsertOsm(ctx, kiez);
  ctx.log(`[${kiez.slug}] find-healthy: ${osm} OSM restaurants, cafés and fast-food venues inside the Kiez${known?.n ? ` (${known.n} already in the queue, their check status is kept)` : ''}`);
  const published = publishedIds(opts.registryDir);
  const seen = async (ids: string[]): Promise<Set<string>> => {
    if (!ids.length) return new Set();
    const rows = await ctx.db.all<{ google_place_id: string }>(
      `SELECT google_place_id FROM pipeline_restaurant WHERE google_place_id IN (${ids.map(() => '?').join(',')})`, ids);
    return new Set([...rows.map((r) => r.google_place_id), ...ids.filter((id) => published.placeIds.has(id))]);
  };

  await ctx.db.batch(HEALTHY_TERMS.map((term) => ({
    sql: 'INSERT OR IGNORE INTO pipeline_tile (kiez, tile_id, south, west, north, east, depth) VALUES (?, ?, ?, ?, ?, ?, 0)',
    params: [kiez.slug, tileKey(term, shape.bbox), shape.bbox.south, shape.bbox.west, shape.bbox.north, shape.bbox.east],
  })));

  const stats: FindHealthyStats = { kiez: kiez.slug, osm, searches: 0, paidPages: 0, newPlaces: 0, osmLookups: 0, osmMatched: 0, found: 0, alreadyPublished: 0 };
  const planned = new Set<string>();
  // Places this run already paid for (or planned to) in an earlier term: no OSM match is stored for them.
  const fetched = new Set<string>();
  for (;;) {
    const tiles = (await ctx.db.all<{ tile_id: string; south: number; west: number; north: number; east: number; depth: number }>(
      "SELECT tile_id, south, west, north, east, depth FROM pipeline_tile WHERE kiez = ? AND state = 'pending' AND tile_id LIKE 'q:%' ORDER BY depth, tile_id", [kiez.slug]))
      .filter((t) => !planned.has(t.tile_id));
    if (!tiles.length) break;
    for (const t of tiles) {
      const term = t.tile_id.split(':')[1]!;
      const bbox: BBox = { south: t.south, west: t.west, north: t.north, east: t.east };
      const pages = await probe(ctx, kiez.slug, term, bbox);
      stats.searches++;
      const ids = pages.flat();
      if (ids.length >= MAX_RESULTS_PER_QUERY && t.depth < MAX_SPLIT_DEPTH) {
        const kids = splitTile(bbox).filter((k) => bboxIntersectsShape(k, shape));
        await ctx.db.batch([
          ...kids.map((k) => ({ sql: 'INSERT OR IGNORE INTO pipeline_tile (kiez, tile_id, south, west, north, east, depth) VALUES (?, ?, ?, ?, ?, ?, ?)', params: [kiez.slug, tileKey(term, k), k.south, k.west, k.north, k.east, t.depth + 1] })),
          { sql: "UPDATE pipeline_tile SET state = 'split', hits = ?, updated_at = ? WHERE kiez = ? AND tile_id = ?", params: [ids.length, nowIso(), kiez.slug, t.tile_id] },
        ]);
        continue;
      }
      const old = await seen(ids);
      const fresh = new Set(ids.filter((id) => !old.has(id) && !fetched.has(id)));
      for (const id of fresh) fetched.add(id);
      // Paid pages run in order (page tokens chain), so fetch up to the last page holding a new place.
      const lastPage = pages.reduce((last, p, i) => (p.some((id) => fresh.has(id)) ? i : last), -1);
      stats.paidPages += lastPage + 1;
      stats.newPlaces += fresh.size;
      if (opts.probeOnly) {
        planned.add(t.tile_id);
        continue;
      }
      const candidates: PlacesCandidate[] = [];
      let token: string | undefined;
      for (let page = 0; page <= lastPage; page++) {
        const res = await ctx.places.searchTile({ bbox, idsOnly: false, kiez: kiez.slug, textQuery: term, ...(token ? { pageToken: token } : {}) });
        candidates.push(...res.candidates);
        if (!res.nextPageToken) break;
        token = res.nextPageToken;
      }
      const matched = await matchTile(ctx, kiez.slug, bbox, candidates.filter((c) => fresh.has(c.placeId)));
      await ctx.db.run("UPDATE pipeline_tile SET state = 'done', hits = ?, matched = ?, updated_at = ? WHERE kiez = ? AND tile_id = ?", [ids.length, matched, nowIso(), kiez.slug, t.tile_id]);
    }
  }
  const osmMatch = await matchHealthyOsm(ctx, kiez.slug, published, opts.probeOnly ?? false);
  stats.osmLookups = osmMatch.lookups;
  stats.osmMatched = osmMatch.matched;
  if (opts.probeOnly) {
    ctx.log(`[${kiez.slug}] find-healthy probe: ${stats.searches} free searches, ${stats.newPlaces} new place ids, ${stats.paidPages} paid pages planned, ${stats.osmLookups} OSM lookups planned`);
    return stats;
  }
  // A place another Kiez (or an earlier wave of this Kiez) already published never enters the menu stage.
  const rows = await ctx.db.all<{ id: string; osm_id: string; google_place_id: string | null }>(
    "SELECT id, osm_id, google_place_id FROM pipeline_restaurant WHERE kiez = ? AND status = 'found' AND skip_reason IS NULL", [kiez.slug]);
  const dupes = rows.filter((r) => published.osmIds.has(r.osm_id) || (r.google_place_id && published.placeIds.has(r.google_place_id)));
  await ctx.db.batch(dupes.map((r) => ({ sql: "UPDATE pipeline_restaurant SET status = 'candidate', skip_reason = 'already_published', updated_at = ? WHERE id = ?", params: [nowIso(), r.id] })));
  const c = await ctx.db.all<{ k: string; n: number }>(
    `SELECT CASE WHEN status != 'candidate' THEN 'found' ELSE COALESCE(skip_reason, 'pending') END AS k, COUNT(*) AS n FROM pipeline_restaurant WHERE kiez = ? GROUP BY k`, [kiez.slug]);
  const counts = Object.fromEntries(c.map((x) => [x.k, x.n]));
  stats.found = counts.found ?? 0;
  stats.alreadyPublished = counts.already_published ?? 0;
  ctx.log(`[${kiez.slug}] find-healthy: ${stats.found} found (rating >= ${ctx.opts.minRating}), ${stats.alreadyPublished} already published, ${stats.searches} searches, ${stats.paidPages} paid pages, ${stats.osmMatched}/${stats.osmLookups} healthy OSM places matched`);
  return stats;
}
