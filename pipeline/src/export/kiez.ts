// Per-Kiez output so teammates can scan different Kieze on their own machines and their PRs merge
// cleanly: each Kiez writes only its own files.
//   apps/web/src/data/seed/pipeline/kiez/<slug>.json   compact web seed (read by seed/pipeline.ts)
//   apps/web/src/data/seed/pipeline/images/<key>.webp  KI-Bild files (shared folder, unique names)
//   pipeline/registry/<slug>.json                      who scanned it, counts, cost, and the place ids
// The registry is the cross-Kiez dedupe list (a place already published by another Kiez is skipped)
// and the lock: a Kiez registered by someone else is not overwritten without --force.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LlmProvider, Models } from '../context.ts';
import { assertPublishableKiez, type KiezDef } from '../kiez.ts';
import { isDeliveryPlatform } from '../sources/delivery.ts';
import type { Db } from '../store/db.ts';
import type { RestaurantStatus } from '../types.ts';
import { buildSeed } from './seed.ts';
import { copyImages, healthyRestaurantsOnly, imageKeys, mergeWebSeeds, removeUnreferenced, toWebSeed, type WebSeed, webRestaurantId } from './web.ts';

export interface RegistryPlace { id: string; placeId: string | null; osmId: string | null }

export interface KiezRegistry {
  kiez: string;
  name: string;
  scannedBy: string;
  updatedAt: string;
  provider: LlmProvider | 'mixed';
  models: Partial<Models>;
  counts: { found: number; menus: number; restaurants: number; dishes: number; images: number; skippedDuplicates: number };
  costUsd: { total: number; byStage: Record<string, number>; byProvider: Record<string, number> };
  seedFile: string;
  places: RegistryPlace[];
  /**
   * What the Kiez held before the first --append export (another scan's provider, counts and cost), so
   * re-exporting the same local queue with --append adds this scan once instead of again.
   */
  appendBase?: { provider: LlmProvider | 'mixed'; counts: KiezRegistry['counts']; costUsd: KiezRegistry['costUsd'] } | null;
}

export interface KiezPaths { webSeedDir: string; imagesDir: string; registryDir: string; imagesSrcDir: string }

/** Place ids of the committed Kiez seeds by web restaurant id: the authority over a scan queue's (possibly stale) id. */
export function committedPlaceIds(webSeedDir: string): Map<string, string> {
  const ids = new Map<string, string>();
  if (!existsSync(webSeedDir)) return ids;
  for (const f of readdirSync(webSeedDir).filter((x) => x.endsWith('.json')).toSorted()) {
    for (const r of (JSON.parse(readFileSync(join(webSeedDir, f), 'utf8')) as WebSeed).restaurants) if (r.placeId && !ids.has(r.id)) ids.set(r.id, r.placeId);
  }
  return ids;
}

export function readRegistries(dir: string): KiezRegistry[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).toSorted().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as KiezRegistry);
}

export function readRegistry(dir: string, slug: string): KiezRegistry | null {
  const f = join(dir, `${slug}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as KiezRegistry) : null;
}

/** Throws when the Kiez is registered to someone else (the lock). */
export function assertKiezOwner(dir: string, kiez: KiezDef, scannedBy: string, force: boolean): void {
  const reg = readRegistry(dir, kiez.slug);
  if (reg && reg.scannedBy !== scannedBy && !force) {
    throw new Error(`${kiez.name} is already registered to ${reg.scannedBy} (pipeline/registry/${kiez.slug}.json). Pick your own Kiez, or pass --force if you take it over by agreement.`);
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ExportKiezOptions {
  scannedBy: string;
  provider: LlmProvider | 'mixed';
  models: Partial<Models>;
  minStatus?: RestaurantStatus;
  force?: boolean;
  seedFileLabel?: string;
  /** Publish only restaurants with at least this many healthy dishes (HEALTHY_RULES); null keeps all. */
  minHealthyDishes?: number | null;
  /** Optional live photo check for restaurants in this export. */
  withGooglePhotos?: (placeIds: string[]) => Promise<Set<string>>;
  /**
   * Add this scan's restaurants to the Kiez's committed seed and registry instead of replacing them
   * (a later scan of an already published Kiez, e.g. the healthy-term search over a wave-1 Kiez).
   */
  append?: boolean;
}

export async function exportKiez(db: Db, kiez: KiezDef, opts: KiezPaths & ExportKiezOptions): Promise<KiezRegistry> {
  assertPublishableKiez(kiez.slug);
  assertKiezOwner(opts.registryDir, kiez, opts.scannedBy, opts.force ?? false);
  const seedPath = join(opts.webSeedDir, `${kiez.slug}.json`);
  const previousSeed = existsSync(seedPath) ? (JSON.parse(readFileSync(seedPath, 'utf8')) as WebSeed) : null;
  const seed = await buildSeed(db, { minStatus: opts.minStatus ?? 'checked', kieze: [kiez.slug] });
  let web = toWebSeed(seed);
  if (opts.minHealthyDishes != null) web = healthyRestaurantsOnly(web, opts.minHealthyDishes);
  // The committed seed's place id is authoritative: photo-coverage --backfill corrects it after the scan.
  const assigned = new Map(previousSeed?.restaurants.flatMap((r) => (r.placeId ? [[r.id, r.placeId] as const] : [])));
  web.restaurants = web.restaurants.map((r) => (assigned.has(r.id) ? { ...r, placeId: assigned.get(r.id)! } : r));
  // Cross-Kiez dedupe by place id (and OSM id): the first registered Kiez keeps a place.
  const others = readRegistries(opts.registryDir).filter((r) => r.kiez !== kiez.slug);
  const takenPlace = new Set(others.flatMap((r) => r.places.map((p) => p.placeId)).filter(Boolean));
  const takenOsm = new Set(others.flatMap((r) => r.places.map((p) => p.osmId)).filter(Boolean));
  const before = web.restaurants.length;
  web.restaurants = web.restaurants.filter((r) => !(r.placeId && takenPlace.has(r.placeId)) && !(r.osmId && takenOsm.has(r.osmId)));
  let skippedDuplicates = before - web.restaurants.length;
  if (opts.withGooglePhotos) {
    const published = new Set(opts.append ? previousSeed?.restaurants.map((r) => r.id) : []);
    const newPlaceIds = web.restaurants.flatMap((r) => r.placeId && !published.has(r.id) ? [r.placeId] : []);
    const confirmed = await opts.withGooglePhotos(newPlaceIds);
    web.restaurants = web.restaurants.filter((r) => published.has(r.id) || (r.placeId && confirmed.has(r.placeId)));
  }

  mkdirSync(opts.webSeedDir, { recursive: true });
  const previous = previousSeed ? imageKeys(previousSeed) : new Set<string>();
  const previousReg = opts.append ? readRegistry(opts.registryDir, kiez.slug) : null;
  // The other scan's share: the base recorded at the first append, else the registry as it stands.
  const base = !opts.append ? null
    : previousReg?.appendBase !== undefined ? previousReg.appendBase
    : previousReg ? { provider: previousReg.provider, counts: previousReg.counts, costUsd: previousReg.costUsd } : null;
  if (opts.append && previousSeed) {
    // Restaurants this queue read a menu for are re-exported from it, so an earlier export of them is replaced.
    const ours = new Set((await db.all<{ id: string }>("SELECT id FROM pipeline_restaurant WHERE kiez = ? AND status NOT IN ('candidate', 'found')", [kiez.slug])).map((r) => webRestaurantId(r.id)));
    const kept = { ...previousSeed, restaurants: previousSeed.restaurants.filter((r) => !ours.has(r.id) && !(r.menu && isDeliveryPlatform(r.menu.url))) };
    const n = web.restaurants.length;
    web = mergeWebSeeds(kept, web);
    skippedDuplicates += n - (web.restaurants.length - kept.restaurants.length);
  }
  writeFileSync(seedPath, JSON.stringify(web) + '\n');
  const keys = imageKeys(web);
  const images = copyImages(keys, opts.imagesSrcDir, opts.imagesDir);
  // Drop this Kiez's old images that nothing references any more.
  const used = new Set<string>(keys);
  for (const f of readdirSync(opts.webSeedDir).filter((x) => x.endsWith('.json') && x !== `${kiez.slug}.json`)) {
    for (const k of imageKeys(JSON.parse(readFileSync(join(opts.webSeedDir, f), 'utf8')) as WebSeed)) used.add(k);
  }
  removeUnreferenced(previous, used, opts.imagesDir);

  const found = await db.first<{ n: number }>("SELECT COUNT(*) AS n FROM pipeline_restaurant WHERE kiez = ? AND status != 'candidate'", [kiez.slug]);
  const menus = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM pipeline_menu_source m JOIN pipeline_restaurant r ON r.id = m.restaurant_id WHERE r.kiez = ?', [kiez.slug]);
  const costs = await db.all<{ stage: string; provider: string; usd: number }>('SELECT stage, provider, SUM(usd) AS usd FROM pipeline_cost WHERE kiez = ? GROUP BY stage, provider', [kiez.slug]);
  const byStage: Record<string, number> = { ...base?.costUsd.byStage };
  const byProvider: Record<string, number> = { ...base?.costUsd.byProvider };
  for (const c of costs) {
    byStage[c.stage] = round2((byStage[c.stage] ?? 0) + c.usd);
    byProvider[c.provider] = round2((byProvider[c.provider] ?? 0) + c.usd);
  }
  const prev = base?.counts;
  const registry: KiezRegistry = {
    kiez: kiez.slug,
    name: kiez.name,
    scannedBy: opts.scannedBy,
    updatedAt: new Date().toISOString(),
    provider: base && base.provider !== opts.provider ? 'mixed' : opts.provider,
    models: base && base.provider !== opts.provider ? {} : opts.models,
    counts: {
      found: (prev?.found ?? 0) + (found?.n ?? 0), menus: (prev?.menus ?? 0) + (menus?.n ?? 0),
      restaurants: web.restaurants.length, dishes: web.restaurants.reduce((a, r) => a + r.dishes.length, 0), images,
      skippedDuplicates: (prev?.skippedDuplicates ?? 0) + skippedDuplicates,
    },
    costUsd: { total: round2((base?.costUsd.total ?? 0) + costs.reduce((a, c) => a + c.usd, 0)), byStage, byProvider },
    seedFile: opts.seedFileLabel ?? `apps/web/src/data/seed/pipeline/kiez/${kiez.slug}.json`,
    places: web.restaurants.map((r) => ({ id: r.id, placeId: r.placeId, osmId: r.osmId })),
    ...(opts.append ? { appendBase: base } : {}),
  };
  mkdirSync(opts.registryDir, { recursive: true });
  writeFileSync(join(opts.registryDir, `${kiez.slug}.json`), JSON.stringify(registry, null, 1) + '\n');
  return registry;
}
