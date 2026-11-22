// Google photo coverage of the published restaurants: how many restaurants Google has a photo for (Place Details
// metadata, not what a browser renders).
// The published set follows worker/scripts/build-seed.ts (the D1 seed): Kiez files in name order, a place in two
// files kept once from the first, published only with >= HEALTHY_RULES.minDishesPerRestaurant healthy dishes.
// Photo availability comes from Place Details (New) with the IDs-only field mask (id, photos, movedPlaceId), which
// is free; only the count is kept, never a photo name or attribution (EEA Places terms).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HEALTHY_RULES, isHealthy, unpackDishClass } from '../../packages/contract/src/dish-class.ts';
import type { KiezRegistry } from './export/kiez.ts';
import type { WebSeed, WebSeedDish, WebSeedRestaurant } from './export/web.ts';
import { strictPlaceMatch } from './match.ts';
import { LOOKUP_RADIUS_M, type PlacesClient } from './sources/places.ts';
import { BudgetExceededError, HttpError } from './util/limiter.ts';

export interface PublishedRestaurant {
  kiez: string;
  restaurant: WebSeedRestaurant;
  /** Healthy dishes the app lists (unhealthy ones are stored but hidden). */
  healthyDishes: WebSeedDish[];
}

const isHealthyDish = (d: WebSeedDish) => isHealthy({ cls: d.c ? unpackDishClass(d.c) : null, kcal: d.n[0] ?? 0, proteinG: d.n[3] ?? 0 });

/** The restaurants the D1 seed publishes, with their listed dishes (same merge and dedupe rules as build-seed.ts). */
export function publishedRestaurants(seedDir: string): PublishedRestaurant[] {
  const seen = new Set<string>();
  const dishIds = new Set<string>();
  const out: PublishedRestaurant[] = [];
  for (const file of readdirSync(seedDir).filter((f) => f.endsWith('.json')).toSorted()) {
    const seed = JSON.parse(readFileSync(join(seedDir, file), 'utf8')) as WebSeed;
    for (const r of seed.restaurants) {
      const keys = [`id:${r.id}`, r.placeId ? `place:${r.placeId}` : '', r.osmId ? `osm:${r.osmId}` : ''].filter(Boolean);
      if (keys.some((k) => seen.has(k))) continue;
      keys.forEach((k) => seen.add(k));
      const healthy = r.dishes.filter(isHealthyDish);
      const listed = r.dishes.filter((d) => {
        if (dishIds.has(d.id)) return false;
        dishIds.add(d.id);
        return isHealthyDish(d);
      });
      if (healthy.length >= HEALTHY_RULES.minDishesPerRestaurant) {
        out.push({ kiez: file.replace(/\.json$/, ''), restaurant: r, healthyDishes: listed });
      }
    }
  }
  return out;
}

/** What Place Details (IDs only) says about one place id. */
export type PlacePhotoStatus =
  | { state: 'ok'; photos: number }
  | { state: 'moved'; photos: number; movedPlaceId: string }
  | { state: 'not_found' }
  | { state: 'error'; message: string };

export interface PhotoLookup { (placeId: string): Promise<PlacePhotoStatus> }

/** Place Details (New), IDs-only field mask: free and unlimited; returns the photo count, never the photos. Throws HttpError on 429 and 5xx. */
export function placePhotoLookup(apiKey: string, fetchImpl: typeof fetch = fetch): PhotoLookup {
  return async (placeId) => {
    const res = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'id,photos,movedPlaceId' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return { state: 'not_found' };
    // Transient failures throw, so withRetry retries them; anything else is reported for that place.
    if (res.status === 429 || res.status >= 500) throw new HttpError(res.status, `Places details ${res.status}`);
    if (!res.ok) return { state: 'error', message: `HTTP ${res.status}` };
    const body = (await res.json()) as { photos?: unknown[]; movedPlaceId?: string };
    const photos = body.photos?.length ?? 0;
    return body.movedPlaceId ? { state: 'moved', photos, movedPlaceId: body.movedPlaceId } : { state: 'ok', photos };
  };
}

export interface CoverageReport {
  measuredAt: string;
  restaurants: {
    published: number;
    withPlaceId: number;
    /** Place id resolves (not moved, not gone). */
    placeIdValid: number;
    moved: number;
    notFound: number;
    errors: number;
    /** Google reports at least one photo for the place id (metadata only; whether a browser shows it is not measured here). */
    withGooglePhoto: number;
  };
  /** Healthy dishes the app lists. */
  dishes: { listed: number };
  byKiez: Record<string, { restaurants: number; withGooglePhoto: number; dishes: number }>;
  /** Place ids that need attention (moved, gone, without photos), for the backfill. */
  attention: { kiez: string; id: string; name: string; placeId: string | null; status: PlacePhotoStatus | { state: 'no_place_id' } }[];
}

export function buildCoverage(published: PublishedRestaurant[], status: Map<string, PlacePhotoStatus>, measuredAt = new Date().toISOString()): CoverageReport {
  const report: CoverageReport = {
    measuredAt,
    restaurants: { published: published.length, withPlaceId: 0, placeIdValid: 0, moved: 0, notFound: 0, errors: 0, withGooglePhoto: 0 },
    dishes: { listed: 0 },
    byKiez: {},
    attention: [],
  };
  for (const { kiez, restaurant: r, healthyDishes } of published) {
    const k = (report.byKiez[kiez] ??= { restaurants: 0, withGooglePhoto: 0, dishes: 0 });
    k.restaurants++;
    const s = r.placeId ? status.get(r.placeId) : undefined;
    if (r.placeId) report.restaurants.withPlaceId++;
    if (s?.state === 'ok') report.restaurants.placeIdValid++;
    if (s?.state === 'moved') report.restaurants.moved++;
    if (s?.state === 'not_found') report.restaurants.notFound++;
    if (s?.state === 'error') report.restaurants.errors++;
    // Count only photos returned for the measured ID. A move still needs review.
    const hasPhoto = (s?.state === 'ok' || s?.state === 'moved') && s.photos > 0;
    if (hasPhoto) {
      report.restaurants.withGooglePhoto++;
      k.withGooglePhoto++;
    }
    if (!r.placeId || !s || s.state !== 'ok' || !hasPhoto) {
      report.attention.push({ kiez, id: r.id, name: r.name, placeId: r.placeId, status: r.placeId ? (s ?? { state: 'error', message: 'not checked' }) : { state: 'no_place_id' } });
    }
    report.dishes.listed += healthyDishes.length;
    k.dishes += healthyDishes.length;
  }
  return report;
}

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10} %` : '-');

/** Markdown tables for docs/data/photo-coverage.md. */
export function coverageMarkdown(r: CoverageReport): string {
  const R = r.restaurants;
  const D = r.dishes;
  const lines = [
    `Measured ${r.measuredAt.slice(0, 16).replace('T', ' ')} UTC over the published D1 seed.`,
    '',
    '| Restaurants | Count | Share |',
    '|---|---:|---:|',
    `| Published | ${R.published} | 100 % |`,
    `| With place_id | ${R.withPlaceId} | ${pct(R.withPlaceId, R.published)} |`,
    `| place_id valid (not moved, not gone) | ${R.placeIdValid} | ${pct(R.placeIdValid, R.published)} |`,
    `| place_id moved / not found / lookup error | ${R.moved} / ${R.notFound} / ${R.errors} | ${pct(R.moved + R.notFound + R.errors, R.published)} |`,
    `| **With at least one Google photo** | **${R.withGooglePhoto}** | **${pct(R.withGooglePhoto, R.published)}** |`,
    '',
    `Healthy dishes listed: ${D.listed}.`,
    '',
    '| Kiez | Restaurants | With Google photo | Healthy dishes |',
    '|---|---:|---:|---:|',
    ...Object.entries(r.byKiez).toSorted(([a], [b]) => a.localeCompare(b)).map(([kiez, k]) =>
      `| ${kiez} | ${k.restaurants} | ${k.withGooglePhoto} | ${k.dishes} |`),
  ];
  return `${lines.join('\n')}\n`;
}

export interface PlaceIdChange { kiez: string; id: string; name: string; from: string | null; to: string }

/** A place id Google reports as moved: its pin and address are not touched, so a person reviews it. */
export interface MovedPlaceId { kiez: string; id: string; name: string; placeId: string; movedPlaceId: string }

export interface BackfillOptions {
  /** Place Details (IDs only, free): a replacement is only taken when Google has a photo for it. */
  photos: PhotoLookup;
  /** Kieze this caller may write; the others are only read. All Kieze stay reserved. */
  writable?: (kiez: string) => boolean;
  /** Further place ids that are taken (e.g. every registry). */
  reserved?: Iterable<string>;
}

/**
 * Assign missing and obsolete (gone) IDs with one strict Text Search Pro lookup (name similarity >= 0.6,
 * distance under 150 m) among unreserved, operational hits that have a photo. There is no rating floor because the
 * restaurant passed it when published. Moved IDs are never replaced; they are returned for review.
 */
export async function backfillPlaceIds(published: PublishedRestaurant[], status: Map<string, PlacePhotoStatus>, places: Pick<PlacesClient, 'lookupPlace'>, options: BackfillOptions): Promise<{ changes: PlaceIdChange[]; moved: MovedPlaceId[]; unresolved: { kiez: string; id: string; name: string }[]; stoppedBy?: string }> {
  const changes: PlaceIdChange[] = [];
  const moved: MovedPlaceId[] = [];
  const unresolved: { kiez: string; id: string; name: string }[] = [];
  const used = new Set([...published.map((p) => p.restaurant.placeId).filter((x): x is string => !!x), ...(options.reserved ?? [])]);
  for (const { kiez, restaurant: r } of published) {
    const s = r.placeId ? status.get(r.placeId) : undefined;
    if (r.placeId && s?.state === 'moved') {
      moved.push({ kiez, id: r.id, name: r.name, placeId: r.placeId, movedPlaceId: s.movedPlaceId });
      continue;
    }
    if (r.placeId && s?.state !== 'not_found') continue;
    if (options.writable && !options.writable(kiez)) continue;
    let hits;
    try {
      hits = await places.lookupPlace({ name: r.name, address: r.address, location: { lat: r.lat, lng: r.lng }, kiez, stage: 'review' });
    } catch (error) {
      if (error instanceof BudgetExceededError) return { changes, moved, unresolved, stoppedBy: error.message };
      throw error;
    }
    const open = hits.filter((h) => !used.has(h.placeId) && (!h.businessStatus || h.businessStatus === 'OPERATIONAL'));
    const withPhoto = [];
    for (const h of open) {
      const photo = await options.photos(h.placeId).catch((): PlacePhotoStatus => ({ state: 'error', message: 'photo check failed' }));
      if (photo.state === 'ok' && photo.photos > 0) withPhoto.push(h);
    }
    const hit = strictPlaceMatch(withPhoto, r, LOOKUP_RADIUS_M);
    if (!hit) {
      unresolved.push({ kiez, id: r.id, name: r.name });
      continue;
    }
    used.add(hit.placeId);
    changes.push({ kiez, id: r.id, name: r.name, from: r.placeId, to: hit.placeId });
  }
  return { changes, moved, unresolved };
}

/** Writes the new place ids into the Kiez seeds and registries (only the place id changes). */
export function applyPlaceIdChanges(seedDir: string, registryDir: string, changes: PlaceIdChange[]): void {
  for (const kiez of new Set(changes.map((c) => c.kiez))) {
    const mine = new Map(changes.filter((c) => c.kiez === kiez).map((c) => [c.id, c.to]));
    const seedPath = join(seedDir, `${kiez}.json`);
    const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as WebSeed;
    for (const r of seed.restaurants) if (mine.has(r.id)) r.placeId = mine.get(r.id)!;
    writeFileSync(seedPath, JSON.stringify(seed) + '\n');
    const regPath = join(registryDir, `${kiez}.json`);
    if (!existsSync(regPath)) continue;
    const reg = JSON.parse(readFileSync(regPath, 'utf8')) as KiezRegistry;
    for (const p of reg.places) if (mine.has(p.id)) p.placeId = mine.get(p.id)!;
    writeFileSync(regPath, JSON.stringify(reg, null, 1) + '\n');
  }
}

/** Copies the Kiez seed's place ids into the registry (the seed is authoritative), so a backfill interrupted between its two writes is completed by the next run. */
export function reconcileRegistryPlaceIds(seedDir: string, registryDir: string, kieze: string[]): void {
  for (const kiez of kieze) {
    const seedPath = join(seedDir, `${kiez}.json`);
    const regPath = join(registryDir, `${kiez}.json`);
    if (!existsSync(seedPath) || !existsSync(regPath)) continue;
    const ids = new Map((JSON.parse(readFileSync(seedPath, 'utf8')) as WebSeed).restaurants.flatMap((r) => (r.placeId ? [[r.id, r.placeId] as const] : [])));
    const reg = JSON.parse(readFileSync(regPath, 'utf8')) as KiezRegistry;
    let changed = false;
    for (const p of reg.places) {
      if (ids.has(p.id) && p.placeId !== ids.get(p.id)) {
        p.placeId = ids.get(p.id)!;
        changed = true;
      }
    }
    if (changed) writeFileSync(regPath, JSON.stringify(reg, null, 1) + '\n');
  }
}
