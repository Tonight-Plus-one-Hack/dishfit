// Google photo coverage, the place id backfill and the Berlin-wide healthy OSM lookups (Text Search Pro).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { packDishClass, type DishClass } from '../../packages/contract/src/dish-class.ts';
import { type Ctx, DEFAULT_MODELS, DEFAULT_OPTIONS } from '../src/context.ts';
import { applyPlaceIdChanges, backfillPlaceIds, buildCoverage, coverageMarkdown, type PlacePhotoStatus, placePhotoLookup, publishedRestaurants, reconcileRegistryPlaceIds } from '../src/coverage.ts';
import type { WebSeed, WebSeedDish, WebSeedRestaurant } from '../src/export/web.ts';
import { kiezBySlug } from '../src/kiez.ts';
import { CostLedger } from '../src/ledger.ts';
import { fakeAnswer } from '../src/llm/fake.ts';
import { FakeLlm } from '../src/llm/llm.ts';
import { strictPlaceMatch } from '../src/match.ts';
import { FakeImages } from '../src/sources/images.ts';
import { FixtureOsm } from '../src/sources/osm.ts';
import { FixturePlaces, GooglePlaces } from '../src/sources/places.ts';
import { PlacesQuota, PlacesQuotaError } from '../src/sources/places-quota.ts';
import { FixtureMenuFetcher } from '../src/sources/website.ts';
import { isHealthyOsm, stageFindHealthy } from '../src/stages/find-healthy.ts';
import { migrate } from '../src/store/migrate.ts';
import { SqliteDb } from '../src/store/sqlite.ts';
import type { OsmRestaurant, PlacesCandidate } from '../src/types.ts';
import { Limiter } from '../src/util/limiter.ts';

const cls = (over: Partial<DishClass> = {}): DishClass => ({ course: 'main', dishType: 'bowl', cuisine: 'japanese', vegan: false, vegetarian: false, glutenFree: false, isFullMeal: true, fried: false, creamy: false, sugary: false, confidence: 'high', ...over });
function dish(id: string, image: string | null, healthy = true): WebSeedDish {
  return {
    id, name: id, description: '', price: 12, category: 'bowl', n: [600, 510, 690, 35, 30, 40, 50, 40, 60, 15, 12, 18],
    confidence: 'high', source: 'ai', method: 0, model: null, ingredients: [], healthScore: 70, proteinPerEuro: 2, diet: [], image,
    c: packDishClass(healthy ? cls() : cls({ dishType: 'pizza' })),
  };
}
function rest(id: string, placeId: string | null, dishes: WebSeedDish[], at = { lat: 52.5, lng: 13.4 }): WebSeedRestaurant {
  return { id, placeId, osmId: `node/${id}`, name: `Restaurant ${id}`, kiez: 'mitte', address: 'Teststraße 1, 10117 Berlin', ...at, cuisine: [], openingHours: null, website: null, menu: { url: 'https://x', fetchedAt: '', kind: 'website' }, dishes };
}
const seed = (restaurants: WebSeedRestaurant[]): WebSeed => ({ v: 1, generatedAt: '2026-11-21T00:00:00Z', attribution: [], methods: ['m'], ingredientNames: [], restaurants });

function seedDirs(files: Record<string, WebSeedRestaurant[]>) {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-'));
  const seeds = join(dir, 'kiez');
  const images = join(dir, 'images');
  const registry = join(dir, 'registry');
  for (const d of [seeds, images, registry]) mkdirSync(d);
  for (const [kiez, rs] of Object.entries(files)) {
    writeFileSync(join(seeds, `${kiez}.json`), JSON.stringify(seed(rs)));
    writeFileSync(join(registry, `${kiez}.json`), JSON.stringify({ kiez, places: rs.map((r) => ({ id: r.id, placeId: r.placeId, osmId: r.osmId })) }));
  }
  writeFileSync(join(images, 'ki-a.webp'), '');
  return { seeds, images, registry };
}

const near = (lat: number, lng: number) => ({ lat: lat + 0.0003, lng }); // ~33 m
const candidate = (placeId: string, name: string, dLatM: number): PlacesCandidate => ({ placeId, name, location: { lat: 52.5 + dLatM / 110540, lng: 13.4 }, rating: null, userRatingCount: null, websiteUri: null, businessStatus: 'OPERATIONAL' });
function osm(id: string, name: string, lat: number, over: Partial<OsmRestaurant> = {}): OsmRestaurant {
  return { osmId: `node/${id}`, name, lat, lng: 13.41, street: 'Teststraße', housenumber: id, postcode: '10967', cuisine: [], openingHours: null, website: `https://${id}.example`, amenity: 'restaurant', dietVegan: null, dietVegetarian: null, ...over };
}
const place = (id: string, name: string, lat: number, rating: number): PlacesCandidate =>
  ({ placeId: `place-${id}`, name, location: { lat: lat + 0.0002, lng: 13.41 }, rating, userRatingCount: 50, websiteUri: null, businessStatus: 'OPERATIONAL' });
const backfillHit = (placeId: string, name: string): PlacesCandidate =>
  ({ placeId, name, location: near(52.5, 13.4), rating: null, userRatingCount: null, websiteUri: null, businessStatus: 'OPERATIONAL' });

describe('photo coverage', () => {
  it('counts published restaurants with a Google photo and the listed healthy dishes', () => {
    const dirs = seedDirs({
      kreuzberg: [
        rest('a', 'pa', [dish('a1', 'ki-a'), dish('a2', null), dish('a3', null, false)]),
        rest('b', 'pb', [dish('b1', null), dish('b2', 'ki-missing')]),
        rest('c', 'pc', [dish('c1', null)]), // one healthy dish: not published
      ],
      mitte: [
        rest('a-again', 'pa', [dish('x1', null), dish('x2', null)]), // same place id as kreuzberg's a: kept once
        rest('d', null, [dish('d1', null), dish('d2', null)]),
        rest('e', 'pe', [dish('e1', null), dish('e2', null)]),
      ],
    });
    const published = publishedRestaurants(dirs.seeds);
    assert.deepEqual(published.map((p) => p.restaurant.id), ['a', 'b', 'd', 'e']);
    const status = new Map<string, PlacePhotoStatus>([
      ['pa', { state: 'ok', photos: 10 }],
      ['pb', { state: 'ok', photos: 0 }],
      ['pe', { state: 'moved', photos: 3, movedPlaceId: 'pe2' }],
    ]);
    const r = buildCoverage(published, status, '2026-11-22T00:00:00Z');
    assert.deepEqual(r.restaurants, { published: 4, withPlaceId: 3, placeIdValid: 2, moved: 1, notFound: 0, errors: 0, withGooglePhoto: 2 });
    assert.deepEqual(r.dishes, { listed: 8 });
    assert.deepEqual(r.attention.map((x) => [x.id, x.status.state]), [['b', 'ok'], ['d', 'no_place_id'], ['e', 'moved']]);
    assert.deepEqual(r.byKiez.mitte, { restaurants: 2, withGooglePhoto: 1, dishes: 4 });
    assert.match(coverageMarkdown(r), /\*\*With at least one Google photo\*\* \| \*\*2\*\* \| \*\*50 %\*\*/);
  });

  it('asks Place Details for the IDs-only fields and keeps only the photo count', async () => {
    const seen: { url: string; mask: string }[] = [];
    const answers: Response[] = [
      new Response(JSON.stringify({ id: 'p1', photos: [{ name: 'places/p1/photos/x' }, { name: 'places/p1/photos/y' }] })),
      new Response(JSON.stringify({ id: 'p2', movedPlaceId: 'p3' })),
      new Response('{}', { status: 404 }),
      new Response('{}', { status: 403 }),
      new Response('{}', { status: 503 }),
    ];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, mask: (init.headers as Record<string, string>)['X-Goog-FieldMask']! });
      return answers.shift()!;
    }) as unknown as typeof fetch;
    const lookup = placePhotoLookup('KEY', fakeFetch);
    assert.deepEqual(await lookup('p1'), { state: 'ok', photos: 2 });
    assert.deepEqual(await lookup('p2'), { state: 'moved', photos: 0, movedPlaceId: 'p3' });
    assert.deepEqual(await lookup('gone'), { state: 'not_found' });
    assert.deepEqual(await lookup('denied'), { state: 'error', message: 'HTTP 403' });
    await assert.rejects(lookup('busy'), /503/); // transient: thrown so withRetry retries it
    assert.equal(seen[0]!.url, 'https://places.googleapis.com/v1/places/p1');
    assert.equal(seen[0]!.mask, 'id,photos,movedPlaceId');
  });
});

describe('place id backfill', () => {
  it('reports a moved id for review, looks up gone and missing ids strictly, and rewrites seeds and registries', async () => {
    const dirs = seedDirs({
      mitte: [
        rest('a', 'pa', [dish('a1', null), dish('a2', null)]),
        rest('b', 'old-b', [dish('b1', null), dish('b2', null)], { lat: 52.51, lng: 13.41 }),
        rest('c', null, [dish('c1', null), dish('c2', null)], { lat: 52.52, lng: 13.42 }),
        rest('d', null, [dish('d1', null), dish('d2', null)], { lat: 52.53, lng: 13.43 }),
      ],
    });
    const published = publishedRestaurants(dirs.seeds);
    const status = new Map<string, PlacePhotoStatus>([['pa', { state: 'moved', photos: 4, movedPlaceId: 'pa2' }], ['old-b', { state: 'not_found' }]]);
    const places = new FixturePlaces([
      { placeId: 'pa2', name: 'Restaurant a', location: near(52.5, 13.4), rating: 3.9, userRatingCount: 10, websiteUri: null, businessStatus: 'OPERATIONAL' },
      { placeId: 'new-b', name: 'Restaurant b', location: near(52.51, 13.41), rating: 3.9, userRatingCount: 10, websiteUri: null, businessStatus: 'OPERATIONAL' },
      { placeId: 'new-c', name: 'Restaurant c Berlin', location: near(52.52, 13.42), rating: 4.4, userRatingCount: 10, websiteUri: null, businessStatus: 'OPERATIONAL' },
      { placeId: 'other-d', name: 'Ganz Anders', location: near(52.53, 13.43), rating: 4.8, userRatingCount: 10, websiteUri: null, businessStatus: 'OPERATIONAL' },
    ]);
    const withPhoto = new Set(['new-b', 'new-c']);
    const photos = async (id: string): Promise<PlacePhotoStatus> => ({ state: 'ok', photos: withPhoto.has(id) ? 3 : 0 });
    const { changes, moved, unresolved } = await backfillPlaceIds(published, status, places, { photos });
    assert.deepEqual(changes.map((c) => [c.id, c.from, c.to]), [['b', 'old-b', 'new-b'], ['c', null, 'new-c']]);
    assert.deepEqual(moved.map((m) => [m.id, m.placeId, m.movedPlaceId]), [['a', 'pa', 'pa2']]);
    assert.deepEqual(unresolved.map((u) => u.id), ['d']); // only a differently named place nearby: keeps the fallback
    assert.equal(places.lookups.length, 3);
    assert.ok(places.lookups.every((l) => l.minRating == null)); // already published: no rating floor
    applyPlaceIdChanges(dirs.seeds, dirs.registry, changes);
    const written = JSON.parse(readFileSync(join(dirs.seeds, 'mitte.json'), 'utf8')) as WebSeed;
    assert.deepEqual(written.restaurants.map((r) => r.placeId), ['pa', 'new-b', 'new-c', null]);
    const reg = JSON.parse(readFileSync(join(dirs.registry, 'mitte.json'), 'utf8')) as { places: { placeId: string | null }[] };
    assert.deepEqual(reg.places.map((p) => p.placeId), ['pa', 'new-b', 'new-c', null]);
  });
});

describe('place id backfill guards', () => {
  it('skips a replacement without a photo for an eligible one with a photo, and never takes an id another Kiez holds', async () => {
    const dirs = seedDirs({
      mitte: [rest('a', 'old-a', [dish('a1', null), dish('a2', null)])],
      wedding: [rest('w', 'taken-id', [dish('w1', null), dish('w2', null)], { lat: 52.6, lng: 13.5 })],
    });
    const published = publishedRestaurants(dirs.seeds);
    const status = new Map<string, PlacePhotoStatus>([['old-a', { state: 'not_found' }]]);
    const places = new FixturePlaces([backfillHit('taken-id', 'Restaurant a'), backfillHit('no-photo', 'Restaurant a'), backfillHit('with-photo', 'Restaurant a Berlin')]);
    const { changes } = await backfillPlaceIds(published, status, places, {
      photos: async (id) => ({ state: 'ok', photos: id === 'with-photo' ? 1 : 0 }),
    });
    assert.deepEqual(changes.map((c) => [c.id, c.to]), [['a', 'with-photo']]);
  });

  it('reserves ids of other Kieze but only writes the ones the caller may', async () => {
    const dirs = seedDirs({
      mitte: [rest('a', null, [dish('a1', null), dish('a2', null)])],
      wedding: [rest('w', null, [dish('w1', null), dish('w2', null)])],
    });
    const published = publishedRestaurants(dirs.seeds);
    const places = new FixturePlaces([backfillHit('reserved', 'Restaurant a'), backfillHit('free', 'Restaurant a Berlin')]);
    const { changes } = await backfillPlaceIds(published, new Map(), places, {
      photos: async () => ({ state: 'ok', photos: 2 }),
      writable: (kiez) => kiez === 'mitte',
      reserved: ['reserved'],
    });
    assert.deepEqual(changes.map((c) => [c.kiez, c.to]), [['mitte', 'free']]);
    assert.equal(places.lookups.length, 1);
  });
});

describe('registry reconcile', () => {
  it('makes the seed place id authoritative over a stale registry id', () => {
    const dirs = seedDirs({ mitte: [rest('a', 'new-a', [dish('a1', null), dish('a2', null)])] });
    const regPath = join(dirs.registry, 'mitte.json');
    writeFileSync(regPath, JSON.stringify({ kiez: 'mitte', places: [{ id: 'a', placeId: 'old-a', osmId: null }] }));
    reconcileRegistryPlaceIds(dirs.seeds, dirs.registry, ['mitte']);
    assert.equal((JSON.parse(readFileSync(regPath, 'utf8')) as { places: { placeId: string }[] }).places[0]!.placeId, 'new-a');
  });

  it('fills a registry place id that the seed already has and keeps the others', () => {
    const dirs = seedDirs({ mitte: [rest('a', 'pa', [dish('a1', null), dish('a2', null)]), rest('b', null, [dish('b1', null), dish('b2', null)])] });
    const regPath = join(dirs.registry, 'mitte.json');
    const reg = JSON.parse(readFileSync(regPath, 'utf8')) as { places: { id: string; placeId: string | null }[] };
    for (const p of reg.places) p.placeId = null;
    writeFileSync(regPath, JSON.stringify(reg));
    reconcileRegistryPlaceIds(dirs.seeds, dirs.registry, ['mitte']);
    const after = JSON.parse(readFileSync(regPath, 'utf8')) as { places: { id: string; placeId: string | null }[] };
    assert.deepEqual(after.places.map((p) => [p.id, p.placeId]), [['a', 'pa'], ['b', null]]);
  });
});

describe('strict place match', () => {
  it('needs a similar name under 150 m and prefers the better name, then the nearer place', () => {
    const at = { name: 'Grünes Glück', lat: 52.5, lng: 13.4 };
    assert.equal(strictPlaceMatch([candidate('far', 'Grünes Glück', 160)], at), null);
    assert.equal(strictPlaceMatch([candidate('other', 'Pizza Roma', 5)], at), null);
    assert.equal(strictPlaceMatch([candidate('long', 'Ganz Anders Bar', 5)], { name: 'Restaurant D', lat: 52.5, lng: 13.4 }), null); // "d" is inside "ganzanders"
    assert.equal(strictPlaceMatch([candidate('short', 'Bo', 5)], { name: 'Bo', lat: 52.5, lng: 13.4 })?.placeId, 'short');
    assert.equal(strictPlaceMatch([candidate('b', 'Grünes Glück Zwei', 20), candidate('a', 'Grünes Glück', 100)], at)?.placeId, 'a');
    assert.equal(strictPlaceMatch([candidate('far', 'Grünes Glück', 120), candidate('near', 'Grünes Glück', 10)], at)?.placeId, 'near');
  });
});

describe('Text Search lookup', () => {
  it('sends name and address with a 150 m bias; Pro fields without a floor, Enterprise fields with the rating when a floor is set; logs each SKU and respects the quota', async () => {
    const db = new SqliteDb(':memory:');
    await migrate(db);
    const dir = mkdtempSync(join(tmpdir(), 'pro-'));
    const ledgerPath = join(dir, 'ledger.jsonl');
    const ledger = new CostLedger(db, 'r', ledgerPath, null);
    const calls: { body: Record<string, unknown>; mask: string }[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      calls.push({ body: JSON.parse(String(init.body)), mask: (init.headers as Record<string, string>)['X-Goog-FieldMask']! });
      return new Response(JSON.stringify({ places: [{ id: 'p1', displayName: { text: 'Grünes Glück' }, location: { latitude: 52.5, longitude: 13.4 }, businessStatus: 'OPERATIONAL', rating: 4.4, userRatingCount: 12 }] }));
    }) as unknown as typeof fetch;
    const quota = new PlacesQuota({ month: { 'text-search-pro': 3999 }, day: {} });
    const places = new GooglePlaces('KEY', ledger, new Limiter('p', 1), fakeFetch, quota);
    const where = { name: 'Grünes Glück', address: 'Teststraße 1, 10967 Berlin', location: { lat: 52.5, lng: 13.4 }, kiez: 'kreuzberg' };
    const pro = await places.lookupPlace(where);
    assert.deepEqual(pro.map((h) => [h.placeId, h.name, h.rating]), [['p1', 'Grünes Glück', null]]);
    assert.equal(calls[0]!.mask, 'places.id,places.displayName,places.location,places.businessStatus');
    assert.equal(calls[0]!.body.textQuery, 'Grünes Glück, Teststraße 1, 10967 Berlin');
    assert.equal(calls[0]!.body.minRating, undefined);
    assert.deepEqual(calls[0]!.body.locationBias, { circle: { center: { latitude: 52.5, longitude: 13.4 }, radius: 150 } });
    const rated = await places.lookupPlace({ ...where, minRating: 4 });
    assert.deepEqual(rated.map((h) => h.rating), [4.4]);
    assert.equal(calls[1]!.mask, 'places.id,places.displayName,places.location,places.businessStatus,places.rating');
    assert.equal(calls[1]!.body.minRating, 4);
    const entries = readFileSync(ledgerPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { provider: string; model: string });
    assert.deepEqual(entries.map((e) => [e.provider, e.model]), [['google-places', 'text-search-pro'], ['google-places', 'text-search-enterprise']]);
    await assert.rejects(places.lookupPlace({ name: 'x', address: '', location: { lat: 52.5, lng: 13.4 } }), PlacesQuotaError); // 4000 = 80 % of 5000
    assert.equal(calls.length, 2);
  });
});

describe('healthy OSM candidates (Berlin-wide wave)', () => {
  it('uses priority cuisines and explicit vegan or vegetarian options as candidate signals', () => {
    assert.equal(isHealthyOsm({ cuisine: '["vietnamese"]', diet_vegan: null, diet_vegetarian: null }), true);
    assert.equal(isHealthyOsm({ cuisine: '["pizza"]', diet_vegan: 'yes', diet_vegetarian: null }), true);
    assert.equal(isHealthyOsm({ cuisine: '["pizza"]', diet_vegan: 'no', diet_vegetarian: null }), false);
    assert.equal(isHealthyOsm({ cuisine: '[]', diet_vegan: 'only', diet_vegetarian: null }), true);
    assert.equal(isHealthyOsm({ cuisine: '[]', diet_vegan: null, diet_vegetarian: 'only' }), true);
  });

  it('looks up healthy OSM places no search hit, keeps strict matches at the 4.3 rating rule, skips published ones and never asks twice', async () => {
    const db = new SqliteDb(':memory:');
    await migrate(db);
    const dir = mkdtempSync(join(tmpdir(), 'osm-healthy-'));
    const registryDir = join(dir, 'registry');
    mkdirSync(registryDir);
    writeFileSync(join(registryDir, 'mitte.json'), JSON.stringify({ kiez: 'mitte', places: [{ id: 'x', placeId: 'place-6', osmId: 'node/6' }] }));
    const ledger = new CostLedger(db, 'test', null, null);
    const places = new FixturePlaces([
      place('1', 'Grünes Glück', 52.497, 4.7),
      place('2', 'Pho Viet', 52.498, 4.4), // above the 4.3 rule
      place('5', 'Ganz Okay', 52.4975, 4.2), // below the 4.3 rule
      place('3', 'Linsen Liebe', 52.4995 + 0.003, 4.8), // ~330 m away: no strict match
      place('4', 'Pizza Napoli', 52.4985, 4.9), // not tagged healthy: never looked up
    ]);
    const restaurants = [
      osm('1', 'Grünes Glück', 52.497, { cuisine: ['vegetarian'] }),
      osm('2', 'Pho Viet', 52.498, { cuisine: ['vietnamese'] }),
      osm('3', 'Linsen Liebe', 52.4995, { dietVegan: 'only' }),
      osm('5', 'Ganz Okay', 52.4975, { cuisine: ['salad'] }),
      osm('4', 'Pizza Napoli', 52.4985, { cuisine: ['pizza'] }),
      osm('6', 'Schon Da', 52.4965, { cuisine: ['salad'] }), // OSM element published by another Kiez
    ];
    const ctx: Ctx = {
      db, ledger, llm: new FakeLlm(fakeAnswer, ledger), images: new FakeImages(), osm: new FixtureOsm(restaurants), places, menus: new FixtureMenuFetcher(new Map()),
      models: DEFAULT_MODELS, opts: { ...DEFAULT_OPTIONS, healthySearch: true }, dataDir: dir, log: () => {},
    };
    const kreuzberg = kiezBySlug('kreuzberg');
    const probe = await stageFindHealthy(ctx, kreuzberg, { probeOnly: true, registryDir });
    assert.equal(probe.osmLookups, 4);
    assert.equal(places.lookups.length, 0); // probe: planned, not paid

    const stats = await stageFindHealthy(ctx, kreuzberg, { registryDir });
    assert.deepEqual(places.lookups.map((l) => l.name).toSorted(), ['Ganz Okay', 'Grünes Glück', 'Linsen Liebe', 'Pho Viet']);
    assert.ok(places.lookups.every((l) => l.minRating === 4 && l.address.endsWith(', 10967 Berlin')));
    assert.deepEqual([stats.osmLookups, stats.osmMatched, stats.found], [4, 2, 2]);
    const rows = Object.fromEntries((await db.all<{ id: string; status: string; google_place_id: string | null; checked: number }>(
      'SELECT id, status, google_place_id, places_checked_at IS NOT NULL AS checked FROM pipeline_restaurant ORDER BY id')).map((r) => [r.id, `${r.status}:${r.google_place_id ?? ''}:${r.checked}`]));
    assert.equal(rows['osm:node/1'], 'found:place-1:1');
    assert.equal(rows['osm:node/2'], 'found:place-2:1');
    assert.equal(rows['osm:node/5'], 'candidate::1');
    assert.equal(rows['osm:node/3'], 'candidate::1');
    assert.equal(rows['osm:node/4'], 'candidate::0');
    assert.equal(rows['osm:node/6'], 'candidate::0');

    await stageFindHealthy(ctx, kreuzberg, { registryDir });
    assert.equal(places.lookups.length, 4); // resumed: nobody is looked up again
  });

  it('looks up once a venue that an earlier tile scan marked no_places_match', async () => {
    const db = new SqliteDb(':memory:');
    await migrate(db);
    const dir = mkdtempSync(join(tmpdir(), 'osm-miss-'));
    const registryDir = join(dir, 'registry');
    mkdirSync(registryDir);
    const ledger = new CostLedger(db, 'test', null, null);
    const places = new FixturePlaces([place('1', 'Grünes Glück', 52.497, 4.4)]);
    const ctx: Ctx = {
      db, ledger, llm: new FakeLlm(fakeAnswer, ledger), images: new FakeImages(), osm: new FixtureOsm([osm('1', 'Grünes Glück', 52.497, { cuisine: ['vegetarian'] })]), places, menus: new FixtureMenuFetcher(new Map()),
      models: DEFAULT_MODELS, opts: { ...DEFAULT_OPTIONS, healthySearch: true }, dataDir: dir, log: () => {},
    };
    const kreuzberg = kiezBySlug('kreuzberg');
    await stageFindHealthy(ctx, kreuzberg, { probeOnly: true, registryDir });
    await db.run("UPDATE pipeline_restaurant SET skip_reason = 'no_places_match', places_checked_at = '2026-11-01T00:00:00Z'");
    await stageFindHealthy(ctx, kreuzberg, { registryDir });
    const row = await db.first<{ status: string; google_place_id: string | null; skip_reason: string | null }>("SELECT status, google_place_id, skip_reason FROM pipeline_restaurant WHERE id = 'osm:node/1'");
    assert.deepEqual([row?.status, row?.google_place_id, row?.skip_reason], ['found', 'place-1', null]);
    await db.run("UPDATE pipeline_restaurant SET status = 'candidate', google_place_id = NULL, skip_reason = 'no_places_match'");
    await stageFindHealthy(ctx, kreuzberg, { registryDir });
    assert.equal(places.lookups.length, 1);
  });

  it('ranks only operational, unassigned hits, so a closed exact-name hit does not hide the open branch', async () => {
    const db = new SqliteDb(':memory:');
    await migrate(db);
    const dir = mkdtempSync(join(tmpdir(), 'osm-open-'));
    const registryDir = join(dir, 'registry');
    mkdirSync(registryDir);
    const ledger = new CostLedger(db, 'test', null, null);
    const places = new FixturePlaces([
      { ...place('closed', 'Grünes Glück', 52.497, 4.9), businessStatus: 'CLOSED_PERMANENTLY' },
      { ...place('open', 'Grünes Glück Kreuzberg', 52.497, 4.9), businessStatus: 'OPERATIONAL' },
    ]);
    const ctx: Ctx = {
      db, ledger, llm: new FakeLlm(fakeAnswer, ledger), images: new FakeImages(), osm: new FixtureOsm([osm('1', 'Grünes Glück', 52.497, { cuisine: ['vegetarian'] })]), places, menus: new FixtureMenuFetcher(new Map()),
      models: DEFAULT_MODELS, opts: { ...DEFAULT_OPTIONS, healthySearch: true }, dataDir: dir, log: () => {},
    };
    await stageFindHealthy(ctx, kiezBySlug('kreuzberg'), { registryDir });
    const row = await db.first<{ status: string; google_place_id: string | null }>("SELECT status, google_place_id FROM pipeline_restaurant WHERE id = 'osm:node/1'");
    assert.deepEqual([row?.status, row?.google_place_id], ['found', 'place-open']);
  });
});
