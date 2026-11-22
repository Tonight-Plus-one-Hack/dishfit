// Stage 1 - Finden: OSM restaurant base per Kiez + Google Places tile search (rating filter, place_id).
import type { Ctx } from '../context.ts';
import { type KiezDef, kiezShapes, pointInShape, splitTile, tileGrid, tileId } from '../kiez.ts';
import { matchCandidates, type OsmRow } from '../match.ts';
import { MAX_RESULTS_PER_QUERY } from '../sources/places.ts';
import { nowIso } from '../store/db.ts';
import type { BBox, PlacesCandidate } from '../types.ts';

export interface FindStats { kiez: string; osm: number; tiles: number; split: number; matched: number; found: number; belowRating: number; unmatched: number }

const MARGIN_DEG = 0.0015; // ~150 m: OSM rows near a tile edge can match hits from the neighbouring tile

export async function upsertOsm(ctx: Ctx, kiez: KiezDef): Promise<number> {
  const shape = kiezShapes().get(kiez.slug);
  if (!shape) throw new Error(`no boundary for ${kiez.slug}; run scripts/build-kieze.ts`);
  const rows = (await ctx.osm.restaurantsIn(shape.bbox)).filter((r) => pointInShape(r, shape));
  const now = nowIso();
  await ctx.db.batch(rows.map((r) => ({
    sql: `INSERT INTO pipeline_restaurant (id, kiez, osm_id, name, lat, lng, street, housenumber, postcode, cuisine, opening_hours, website, amenity, diet_vegan, diet_vegetarian, osm_fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET name = excluded.name, lat = excluded.lat, lng = excluded.lng, street = excluded.street,
            housenumber = excluded.housenumber, postcode = excluded.postcode, cuisine = excluded.cuisine, opening_hours = excluded.opening_hours,
            website = excluded.website, amenity = excluded.amenity, diet_vegan = excluded.diet_vegan, diet_vegetarian = excluded.diet_vegetarian,
            osm_fetched_at = excluded.osm_fetched_at, updated_at = excluded.osm_fetched_at`,
    params: [`osm:${r.osmId}`, kiez.slug, r.osmId, r.name, r.lat, r.lng, r.street, r.housenumber, r.postcode, JSON.stringify(r.cuisine), r.openingHours, r.website, r.amenity, r.dietVegan, r.dietVegetarian, now],
  })));
  return rows.length;
}

async function pagesFor(ctx: Ctx, kiez: string, bbox: BBox, idsOnly: boolean): Promise<{ ids: string[]; candidates: PlacesCandidate[] }> {
  let token: string | undefined;
  const ids: string[] = [];
  const candidates: PlacesCandidate[] = [];
  for (let page = 0; page < MAX_RESULTS_PER_QUERY / 20; page++) {
    const res = await ctx.places.searchTile({ bbox, idsOnly, kiez, ...(token ? { pageToken: token } : {}) });
    ids.push(...res.ids);
    candidates.push(...res.candidates);
    // The API returns at most 60 results and no page token after them, so a full 60 means "maybe more".
    if (!res.nextPageToken) break;
    token = res.nextPageToken;
  }
  return { ids, candidates };
}

export async function stageFind(ctx: Ctx, kiez: KiezDef, opts: { refreshOsm?: boolean; probeOnly?: boolean } = {}): Promise<FindStats> {
  const shape = kiezShapes().get(kiez.slug)!;
  const known = await ctx.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM pipeline_restaurant WHERE kiez = ?', [kiez.slug]);
  let osm = known?.n ?? 0;
  if (!osm || opts.refreshOsm) {
    osm = await upsertOsm(ctx, kiez);
    ctx.log(`[${kiez.slug}] find: ${osm} OSM restaurants inside the Kiez`);
  }
  // Tiles of the healthy-term search (stages/find-healthy.ts) carry a "q:" prefix and are not this scan's.
  const tilesExist = await ctx.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM pipeline_tile WHERE kiez = ? AND tile_id NOT LIKE 'q:%'", [kiez.slug]);
  if (!tilesExist?.n) {
    const grid = tileGrid(shape, ctx.opts.tileMeters);
    await ctx.db.batch(grid.map((t) => ({ sql: 'INSERT OR IGNORE INTO pipeline_tile (kiez, tile_id, south, west, north, east, depth) VALUES (?, ?, ?, ?, ?, ?, 0)', params: [kiez.slug, tileId(t), t.south, t.west, t.north, t.east] })));
  }
  let split = 0;
  for (;;) {
    const tiles = await ctx.db.all<{ tile_id: string; south: number; west: number; north: number; east: number; depth: number; hits: number | null }>(
      `SELECT tile_id, south, west, north, east, depth, hits FROM pipeline_tile WHERE kiez = ? AND state = 'pending' AND tile_id NOT LIKE 'q:%'
       ${opts.probeOnly ? 'AND hits IS NULL' : ''} ORDER BY depth, tile_id`, [kiez.slug]);
    if (!tiles.length) break;
    for (const t of tiles) {
      const bbox: BBox = { south: t.south, west: t.west, north: t.north, east: t.east };
      let hits = t.hits;
      if (hits === null) {
        const probe = await pagesFor(ctx, kiez.slug, bbox, true);
        hits = probe.ids.length;
        await ctx.db.run('INSERT OR IGNORE INTO pipeline_grid_place (place_id) SELECT value FROM json_each(?)', [JSON.stringify(probe.ids)]);
      }
      if (hits >= MAX_RESULTS_PER_QUERY && t.depth < ctx.opts.maxTileDepth) {
        const kids = splitTile(bbox);
        await ctx.db.batch([
          ...kids.map((k) => ({ sql: 'INSERT OR IGNORE INTO pipeline_tile (kiez, tile_id, south, west, north, east, depth) VALUES (?, ?, ?, ?, ?, ?, ?)', params: [kiez.slug, tileId(k), k.south, k.west, k.north, k.east, t.depth + 1] })),
          { sql: "UPDATE pipeline_tile SET state = 'split', hits = ?, updated_at = ? WHERE kiez = ? AND tile_id = ?", params: [hits, nowIso(), kiez.slug, t.tile_id] },
        ]);
        split++;
        continue;
      }
      if (t.hits === null) {
        await ctx.db.run('UPDATE pipeline_tile SET hits = ?, updated_at = ? WHERE kiez = ? AND tile_id = ?', [hits, nowIso(), kiez.slug, t.tile_id]);
      }
      if (opts.probeOnly) continue;
      const matched = hits ? await matchTile(ctx, kiez.slug, bbox, (await pagesFor(ctx, kiez.slug, bbox, false)).candidates) : 0;
      await ctx.db.run("UPDATE pipeline_tile SET state = 'done', matched = ?, updated_at = ? WHERE kiez = ? AND tile_id = ?", [matched, nowIso(), kiez.slug, t.tile_id]);
    }
  }
  // Every tile is searched: OSM rows that never matched a Places hit (>= 4.0) stay candidates.
  if (!opts.probeOnly) await ctx.db.run(
    "UPDATE pipeline_restaurant SET skip_reason = 'no_places_match', places_checked_at = ?, updated_at = ? WHERE kiez = ? AND status = 'candidate' AND google_place_id IS NULL AND skip_reason IS NULL",
    [nowIso(), nowIso(), kiez.slug]);
  const counts = await ctx.db.all<{ k: string; n: number }>(
    `SELECT CASE WHEN status != 'candidate' THEN 'found' ELSE COALESCE(skip_reason, 'pending') END AS k, COUNT(*) AS n FROM pipeline_restaurant WHERE kiez = ? GROUP BY k`, [kiez.slug]);
  const c = Object.fromEntries(counts.map((x) => [x.k, x.n]));
  const tilesDone = await ctx.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM pipeline_tile WHERE kiez = ? AND state = 'done' AND tile_id NOT LIKE 'q:%'", [kiez.slug]);
  const stats: FindStats = {
    kiez: kiez.slug, osm, tiles: tilesDone?.n ?? 0, split,
    matched: (c.found ?? 0) + (c.below_rating ?? 0) + (c.not_operational ?? 0),
    found: c.found ?? 0, belowRating: c.below_rating ?? 0, unmatched: c.no_places_match ?? 0,
  };
  if (!opts.probeOnly) ctx.log(`[${kiez.slug}] find: ${stats.found} found (rating >= ${ctx.opts.minRating}), ${stats.belowRating} below rating, ${stats.unmatched} without Places match, ${stats.tiles} tiles`);
  return stats;
}

export async function matchTile(ctx: Ctx, kiez: string, b: BBox, candidates: PlacesCandidate[]): Promise<number> {
  if (!candidates.length) return 0;
  const osm = await ctx.db.all<OsmRow>(
    `SELECT id, name, lat, lng, website FROM pipeline_restaurant WHERE kiez = ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
       AND (google_place_id IS NULL OR google_place_id IN (${candidates.map(() => '?').join(',')}))`,
    [kiez, b.south - MARGIN_DEG, b.north + MARGIN_DEG, b.west - MARGIN_DEG * 1.6, b.east + MARGIN_DEG * 1.6, ...candidates.map((c) => c.placeId)]);
  const taken = new Set((await ctx.db.all<{ google_place_id: string }>(
    `SELECT google_place_id FROM pipeline_restaurant WHERE google_place_id IN (${candidates.map(() => '?').join(',')}) AND kiez != ?`, [...candidates.map((c) => c.placeId), kiez])).map((r) => r.google_place_id));
  const matches = matchCandidates(candidates.filter((c) => !taken.has(c.placeId)), osm);
  const byId = new Map(candidates.map((c) => [c.placeId, c]));
  const now = nowIso();
  await ctx.db.batch(matches.map((m) => {
    const c = byId.get(m.placeId)!;
    // Rating and status are read here and dropped; only the place_id and the outcome are stored.
    const skip = c.businessStatus && c.businessStatus !== 'OPERATIONAL' ? 'not_operational' : (c.rating ?? 0) < ctx.opts.minRating ? 'below_rating' : null;
    return {
      sql: `UPDATE pipeline_restaurant SET google_place_id = ?, places_checked_at = ?, updated_at = ?,
              status = CASE WHEN status = 'candidate' AND ? IS NULL THEN 'found' ELSE status END,
              skip_reason = CASE WHEN status = 'candidate' THEN ? ELSE skip_reason END
            WHERE id = ?`,
      params: [m.placeId, now, now, skip, skip, m.osmId],
    };
  }));
  return matches.length;
}
