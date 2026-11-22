// Healthy-term search (stage 1 variant), the Places free-tier guard and the healthy / append export.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { packDishClass, type DishClass } from '../../packages/contract/src/dish-class.ts';
import { type Ctx, DEFAULT_MODELS, DEFAULT_OPTIONS } from '../src/context.ts';
import { healthyDishCount, healthyRestaurantsOnly, mergeWebSeeds, type WebSeed, type WebSeedDish } from '../src/export/web.ts';
import { kiezBySlug } from '../src/kiez.ts';
import { CostLedger } from '../src/ledger.ts';
import { fakeAnswer } from '../src/llm/fake.ts';
import { FakeLlm } from '../src/llm/llm.ts';
import { FakeImages } from '../src/sources/images.ts';
import { FixtureOsm } from '../src/sources/osm.ts';
import { FixturePlaces, GooglePlaces } from '../src/sources/places.ts';
import { PlacesQuota, PlacesQuotaError } from '../src/sources/places-quota.ts';
import { FixtureMenuFetcher } from '../src/sources/website.ts';
import { HEALTHY_TERMS, stageFindHealthy } from '../src/stages/find-healthy.ts';
import { migrate } from '../src/store/migrate.ts';
import { SqliteDb } from '../src/store/sqlite.ts';
import type { OsmRestaurant, PlacesCandidate } from '../src/types.ts';
import { Limiter } from '../src/util/limiter.ts';

const KREUZBERG = kiezBySlug('kreuzberg');

function osm(id: string, name: string, lat: number, lng: number): OsmRestaurant {
  return { osmId: `node/${id}`, name, lat, lng, street: 'Teststraße', housenumber: id, postcode: '10967', cuisine: [], openingHours: null, website: `https://${id}.example`, amenity: 'restaurant', dietVegan: null, dietVegetarian: null };
}
function place(id: string, name: string, lat: number, lng: number, rating = 4.6): PlacesCandidate {
  return { placeId: `place-${id}`, name, location: { lat: lat + 0.00005, lng }, rating, userRatingCount: 80, websiteUri: null, businessStatus: 'OPERATIONAL' };
}

const ts = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const line = (model: string, iso: string) => JSON.stringify({ provider: 'google-places', model, usd: 0.035, ts: ts(iso) });

describe('Places free-tier guard', () => {
  it('counts this month and today from the ledger and stops at 80 % of the free calls or the daily budget', () => {
    const dir = mkdtempSync(join(tmpdir(), 'quota-'));
    const path = join(dir, 'ledger.jsonl');
    const now = new Date('2026-11-21T12:00:00Z');
    writeFileSync(path, [
      ...Array.from({ length: 795 }, () => line('text-search-enterprise', '2026-11-03T10:00:00Z')),
      line('text-search-enterprise', '2026-10-30T10:00:00Z'), // last month
      line('place-details-enterprise', '2026-11-21T09:00:00Z'),
      JSON.stringify({ provider: 'openai', model: 'gpt-6.2-sol', usd: 1, ts: ts('2026-11-21T09:00:00Z') }),
      'not json',
    ].join('\n'));
    const q = PlacesQuota.fromLedger(path, { dailyCalls: 400 }, now);
    assert.equal(q.remaining('text-search-enterprise'), 5);
    assert.equal(q.remaining('place-details-enterprise'), 399);
    assert.equal(q.remaining('text-search-ids-only'), Infinity);
    for (let i = 0; i < 5; i++) q.take('text-search-enterprise');
    assert.throws(() => q.take('text-search-enterprise'), PlacesQuotaError);
    q.take('text-search-ids-only'); // free, never limited

    const daily = new PlacesQuota({ month: {}, day: { 'place-details-enterprise': 2 } }, { dailyCalls: 3 });
    daily.take('place-details-enterprise');
    assert.throws(() => daily.take('place-details-enterprise'), /daily budget of 3/);
  });

  it('refuses a paid search before any request once the quota is used up, sends the search term', async () => {
    const db = new SqliteDb(':memory:');
    await migrate(db);
    const ledger = new CostLedger(db, 'r', null, null);
    const bodies: Record<string, unknown>[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ places: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const quota = new PlacesQuota({ month: { 'text-search-enterprise': 800 }, day: {} });
    const places = new GooglePlaces('KEY', ledger, new Limiter('p', 1), fakeFetch, quota);
    const bbox = { south: 52.49, west: 13.4, north: 52.5, east: 13.42 };
    await places.searchTile({ bbox, idsOnly: true, textQuery: 'poke' });
    assert.equal(bodies[0]!.textQuery, 'poke');
    await assert.rejects(places.searchTile({ bbox, idsOnly: false, textQuery: 'poke' }), PlacesQuotaError);
    assert.equal(bodies.length, 1);
  });
});

async function healthyCtx(registry: { placeId: string; osmId: string }[]) {
  const db = new SqliteDb(':memory:');
  await migrate(db);
  const dir = mkdtempSync(join(tmpdir(), 'healthy-'));
  const registryDir = join(dir, 'registry');
  mkdirSync(registryDir);
  writeFileSync(join(registryDir, 'mitte.json'), JSON.stringify({ kiez: 'mitte', scannedBy: 'x', places: registry.map((p) => ({ id: p.osmId, ...p })) }));
  const ledger = new CostLedger(db, 'test', null, null);
  const restaurants = [
    osm('1', 'Grün Poke', 52.4990, 13.4180),
    osm('2', 'Salad Garden', 52.4960, 13.4100),
    osm('3', 'Old Bowl Bar', 52.4970, 13.4220),
    osm('4', 'Döner Eck', 52.4980, 13.4000),
  ];
  const places = new FixturePlaces([
    place('1', 'Grün Poke Bowl', 52.4990, 13.4180),
    place('2', 'Salad Garden', 52.4960, 13.4100),
    place('3', 'Old Bowl Bar', 52.4970, 13.4220),
    place('4', 'Döner Eck', 52.4980, 13.4000),
    place('9', 'Vegan Salad Low', 52.4975, 13.4120, 4.1),
  ]);
  const ctx: Ctx = {
    db, ledger, llm: new FakeLlm(fakeAnswer, ledger), images: new FakeImages(), osm: new FixtureOsm(restaurants), places, menus: new FixtureMenuFetcher(new Map()),
    models: DEFAULT_MODELS, opts: { ...DEFAULT_OPTIONS, healthySearch: true }, dataDir: dir, log: () => {},
  };
  return { ctx, places, registryDir };
}

describe('healthy-term search', () => {
  it('probe-only runs only free IDs-only searches and plans the paid pages', async () => {
    const { ctx, places, registryDir } = await healthyCtx([{ placeId: 'place-3', osmId: 'node/3' }]);
    const stats = await stageFindHealthy(ctx, KREUZBERG, { probeOnly: true, registryDir });
    assert.equal(places.calls.filter((c) => !c.idsOnly).length, 0);
    assert.equal(stats.searches, HEALTHY_TERMS.length);
    // poke: 1; salad: 2 and the low-rated 9; bowl: only 1 again (3 is published, 1 already planned) -> 2 terms with new places.
    assert.equal(stats.newPlaces, 3);
    assert.equal(stats.paidPages, 2);
    const pending = await ctx.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM pipeline_tile WHERE state = 'pending'");
    assert.equal(pending?.n, HEALTHY_TERMS.length);
  });

  it('pays only for terms with unpublished places, matches them to OSM and keeps published places out', async () => {
    const { ctx, places, registryDir } = await healthyCtx([{ placeId: 'place-3', osmId: 'node/3' }]);
    const stats = await stageFindHealthy(ctx, KREUZBERG, { registryDir });
    const paid = places.calls.filter((c) => !c.idsOnly).map((c) => c.textQuery).toSorted();
    assert.deepEqual(paid, ['bowl', 'salad']);
    const rows = Object.fromEntries((await ctx.db.all<{ id: string; status: string; skip_reason: string | null; google_place_id: string | null }>(
      'SELECT id, status, skip_reason, google_place_id FROM pipeline_restaurant ORDER BY id')).map((r) => [r.id, `${r.status}:${r.skip_reason ?? ''}:${r.google_place_id ?? ''}`]));
    assert.equal(rows['osm:node/1'], 'found::place-1');
    assert.equal(rows['osm:node/2'], 'found::place-2');
    assert.equal(rows['osm:node/3'], 'candidate::'); // published elsewhere: never paid for, never matched
    assert.equal(rows['osm:node/4'], 'candidate::'); // no healthy term hits it
    assert.equal(stats.found, 2);

    // A rerun resumes: every search is done, nothing is paid again.
    const before = places.calls.length;
    await stageFindHealthy(ctx, KREUZBERG, { registryDir });
    assert.equal(places.calls.length, before);
  });

  it('marks a match whose OSM element another scan published as already_published', async () => {
    const { ctx, registryDir } = await healthyCtx([{ placeId: 'other-id-for-2', osmId: 'node/2' }]);
    const stats = await stageFindHealthy(ctx, KREUZBERG, { registryDir });
    const r = await ctx.db.first<{ status: string; skip_reason: string }>("SELECT status, skip_reason FROM pipeline_restaurant WHERE id = 'osm:node/2'");
    assert.deepEqual({ ...r }, { status: 'candidate', skip_reason: 'already_published' });
    assert.equal(stats.alreadyPublished, 1);
  });
});

const cls = (over: Partial<DishClass> = {}): DishClass => ({ course: 'main', dishType: 'bowl', cuisine: 'japanese', vegan: false, vegetarian: false, glutenFree: false, isFullMeal: true, fried: false, creamy: false, sugary: false, confidence: 'high', ...over });
function dish(id: string, kcal: number, protein: number, c: DishClass | null, method: number, ingredients: [number, number][]): WebSeedDish {
  return {
    id, name: id, description: '', price: 12, category: 'bowl', n: [kcal, kcal * 0.85, kcal * 1.15, protein, protein * 0.85, protein * 1.15, 50, 40, 60, 15, 12, 18],
    confidence: 'high', source: 'ai', method, model: null, ingredients, healthScore: 70, proteinPerEuro: 2, diet: [], image: null, ...(c ? { c: packDishClass(c) } : {}),
  };
}
function seed(methods: string[], names: string[], restaurants: WebSeed['restaurants']): WebSeed {
  return { v: 1, generatedAt: '2026-11-21T00:00:00Z', attribution: ['OSM'], methods, ingredientNames: names, restaurants };
}
function rest(id: string, placeId: string, dishes: WebSeedDish[]): WebSeed['restaurants'][number] {
  return { id, placeId, osmId: id, name: id, kiez: 'mitte', address: '', lat: 52.5, lng: 13.4, cuisine: [], openingHours: null, website: null, menu: { url: 'https://x', fetchedAt: '', kind: 'website' }, dishes };
}

describe('healthy and append export', () => {
  it('keeps only restaurants with at least two healthy dishes', () => {
    const two = rest('a', 'pa', [dish('d1', 600, 35, cls(), 0, []), dish('d2', 400, 25, cls({ course: 'salad', dishType: 'salad' }), 0, []), dish('d3', 900, 30, cls(), 0, [])]);
    const one = rest('b', 'pb', [dish('d4', 600, 35, cls(), 0, []), dish('d5', 600, 35, cls({ dishType: 'pizza' }), 0, []), dish('d6', 600, 35, null, 0, [])]);
    assert.equal(healthyDishCount(two), 2);
    assert.equal(healthyDishCount(one), 1);
    assert.deepEqual(healthyRestaurantsOnly(seed([], [], [two, one])).restaurants.map((r) => r.id), ['a']);
  });

  it('appends a later scan, remapping method and ingredient indices, and skips places the Kiez already has', () => {
    const base = seed(['m-old'], ['rice', 'salmon'], [rest('a', 'pa', [dish('d1', 600, 35, cls(), 0, [[0, 150], [1, 120]])])]);
    const add = seed(['m-new', 'm-old'], ['tofu', 'rice'], [
      rest('b', 'pb', [dish('d2', 500, 30, cls(), 0, [[0, 100], [1, 150]]), dish('d3', 500, 30, cls(), 1, [])]),
      rest('a2', 'pa', [dish('d4', 500, 30, cls(), 0, [])]),
    ]);
    const merged = mergeWebSeeds(base, add);
    assert.deepEqual(merged.restaurants.map((r) => r.id), ['a', 'b']);
    assert.deepEqual(merged.methods, ['m-old', 'm-new']);
    assert.deepEqual(merged.ingredientNames, ['rice', 'salmon', 'tofu']);
    const b = merged.restaurants[1]!;
    assert.equal(merged.methods[b.dishes[0]!.method], 'm-new');
    assert.equal(merged.methods[b.dishes[1]!.method], 'm-old');
    assert.deepEqual(b.dishes[0]!.ingredients.map(([i, g]) => [merged.ingredientNames[i], g]), [['tofu', 100], ['rice', 150]]);
    assert.deepEqual(merged.restaurants[0], base.restaurants[0]);
  });
});
