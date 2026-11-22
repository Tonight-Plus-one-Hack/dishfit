// End to end through all six stages with fixture sources, the deterministic fake LLM and fake images:
// statuses, idempotency, resume after a budget stop, review round trip and the seed contract.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { type Ctx, DEFAULT_MODELS, DEFAULT_OPTIONS } from '../src/context.ts';
import { buildSeed } from '../src/export/seed.ts';
import { kiezBySlug } from '../src/kiez.ts';
import { CostLedger } from '../src/ledger.ts';
import { fakeAnswer } from '../src/llm/fake.ts';
import { FakeLlm, type Llm, type LlmRequest } from '../src/llm/llm.ts';
import { runKiez } from '../src/orchestrator.ts';
import { FakeImages } from '../src/sources/images.ts';
import { FixtureOsm } from '../src/sources/osm.ts';
import { FixturePlaces } from '../src/sources/places.ts';
import { FixtureMenuFetcher, type MenuFetch } from '../src/sources/website.ts';
import { stageNutrition } from '../src/stages/nutrition.ts';
import { exportReview, importReview, parseCsv } from '../src/stages/review.ts';
import { migrate } from '../src/store/migrate.ts';
import { SqliteDb } from '../src/store/sqlite.ts';
import type { OsmRestaurant, PlacesCandidate } from '../src/types.ts';

const KREUZBERG = kiezBySlug('kreuzberg');

function osm(id: string, name: string, lat: number, lng: number, website: string | null): OsmRestaurant {
  return { osmId: `node/${id}`, name, lat, lng, street: 'Teststraße', housenumber: id, postcode: '10967', cuisine: ['vegan'], openingHours: 'Mo-Su 12:00-22:00', website, amenity: 'restaurant', dietVegan: null, dietVegetarian: null };
}
function place(id: string, name: string, lat: number, lng: number, rating: number): PlacesCandidate {
  return { placeId: `place-${id}`, name, location: { lat: lat + 0.00005, lng }, rating, userRatingCount: 50, websiteUri: null, businessStatus: 'OPERATIONAL' };
}

const MENU = `Bowls
Falafel Bowl mit Hummus 12,90
Chicken Teriyaki Bowl 13,50
Lachs Poke Bowl 14,90
Salate
Halloumi Salat 11,50`;

function fixture() {
  const restaurants = [
    osm('1', 'Grün Bowl', 52.4990, 13.4180, 'https://gruen.example'),
    osm('2', 'Kiez Kantine', 52.4960, 13.4100, 'https://kantine.example'),
    osm('3', 'Low Rated Imbiss', 52.4970, 13.4220, 'https://low.example'),
    osm('4', 'No Google Cafe', 52.4980, 13.4000, null),
    osm('5', 'JS Shell Sushi', 52.4950, 13.4150, 'https://js.example'),
  ];
  const places = [
    place('1', 'Grün Bowl', 52.4990, 13.4180, 4.6),
    place('2', 'Kiez Kantine Kreuzberg', 52.4960, 13.4100, 4.4),
    place('3', 'Low Rated Imbiss', 52.4970, 13.4220, 4.1),
    place('5', 'JS Shell Sushi', 52.4950, 13.4150, 4.8),
    place('x', 'Unrelated Burger', 52.4900, 13.4300, 4.9),
  ];
  const menus = new Map<string, MenuFetch>([
    ['osm:node/1', { docs: [{ kind: 'html', url: 'https://gruen.example/karte', text: MENU }], aggregatorLinks: [] }],
    ['osm:node/2', { docs: [{ kind: 'html', url: 'https://kantine.example/menu', text: 'Mittag\nRinder Pho 13,90\nTofu Curry 11,90\nGemüse Ramen 12,50' }], aggregatorLinks: [] }],
    ['osm:node/5', { skip: 'js_rendered', detail: 'shell', aggregatorLinks: [] }],
  ]);
  return { osm: new FixtureOsm(restaurants), places: new FixturePlaces(places), menus: new FixtureMenuFetcher(menus) };
}

async function makeCtx(llm?: Llm, budget: number | null = null) {
  const db = new SqliteDb(':memory:');
  await migrate(db);
  const dir = mkdtempSync(join(tmpdir(), 'pipe-'));
  const ledger = new CostLedger(db, 'test', join(dir, 'ledger.jsonl'), budget);
  const f = fixture();
  const fake = new FakeLlm(fakeAnswer, ledger);
  const images = new FakeImages();
  const ctx: Ctx = { db, ledger, llm: llm ?? fake, images, osm: f.osm, places: f.places, menus: f.menus, models: DEFAULT_MODELS, opts: { ...DEFAULT_OPTIONS, aiImagesPerRestaurant: 2, reviewRestaurants: 5, reviewDishes: 2 }, dataDir: dir, log: () => {} };
  return { ctx, fake, images, places: f.places, dir };
}

async function statusOf(ctx: Ctx) {
  return Object.fromEntries((await ctx.db.all<{ id: string; status: string; skip_reason: string | null }>('SELECT id, status, skip_reason FROM pipeline_restaurant ORDER BY id'))
    .map((r) => [r.id, r.skip_reason ? `${r.status}:${r.skip_reason}` : r.status]));
}

describe('pipeline end to end (fixtures + fake LLM)', () => {
  it('runs stages 1-5, parks what it cannot use, and is idempotent', async () => {
    const { ctx, fake, images, places } = await makeCtx();
    await runKiez(ctx, KREUZBERG);
    assert.deepEqual(await statusOf(ctx), {
      'osm:node/1': 'image',
      'osm:node/2': 'image',
      'osm:node/3': 'candidate:below_rating',
      'osm:node/4': 'candidate:no_places_match',
      'osm:node/5': 'found:js_rendered',
    });
    const placeIds = await ctx.db.all<{ google_place_id: string | null }>('SELECT google_place_id FROM pipeline_restaurant ORDER BY id');
    assert.deepEqual(placeIds.map((p) => p.google_place_id), ['place-1', 'place-2', 'place-3', null, 'place-5']);
    const dishes = await ctx.db.all<{ name: string; kcal: number; confidence: string; check_status: string; image_ref: string | null }>("SELECT name, kcal, confidence, check_status, image_ref FROM pipeline_dish WHERE restaurant_id = 'osm:node/1' ORDER BY position");
    assert.equal(dishes.length, 4);
    assert.ok(dishes.every((d) => d.kcal > 200 && d.check_status));
    assert.equal(dishes.filter((d) => d.image_ref).length, 2);
    assert.equal(images.calls.length, 4);

    // Second run: nothing left to do, no extra LLM, image or paid Places calls.
    const llmCalls = fake.calls.length;
    const fullSearches = places.calls.filter((c) => !c.idsOnly).length;
    await runKiez(ctx, KREUZBERG);
    assert.equal(fake.calls.length, llmCalls);
    assert.equal(images.calls.length, 4);
    assert.equal(places.calls.filter((c) => !c.idsOnly).length, fullSearches);
  });

  it('stops cleanly at the budget and resumes where it stopped', async () => {
    let calls = 0;
    const db0 = await makeCtx();
    // A paid fake: every call costs 0.01 USD, budget allows the first stage-2 call only.
    const paid: Llm = {
      provider: 'fake',
      async json<T>(req: LlmRequest) {
        const r = db0.ctx.ledger.reserve(0.01);
        try {
          calls++;
          await db0.ctx.ledger.record({ stage: req.stage, provider: 'anthropic', model: 'fake', usd: 0.01, purpose: req.purpose });
          return { data: fakeAnswer(req) as T, model: 'fake', usd: 0.01 };
        } finally { r.release(); }
      },
    };
    const budgeted = new CostLedger(db0.ctx.db, 'b', null, 0.015);
    const ctx: Ctx = { ...db0.ctx, llm: paid, ledger: budgeted };
    (db0.ctx as { ledger: CostLedger }).ledger = budgeted;
    const res = await runKiez(ctx, KREUZBERG);
    assert.match(res.stoppedBy ?? '', /budget reached/);
    const midway = await statusOf(ctx);
    assert.equal(Object.values(midway).filter((s) => s === 'menu').length, 1);

    // Resume with a fresh budget: finishes without redoing finished work.
    const resumed: Ctx = { ...ctx, ledger: new CostLedger(ctx.db, 'c', null, null), llm: new FakeLlm(fakeAnswer) };
    await runKiez(resumed, KREUZBERG);
    const done = await statusOf(resumed);
    assert.equal(done['osm:node/1'], 'image');
    assert.equal(done['osm:node/2'], 'image');
    assert.equal((resumed.llm as FakeLlm).calls.filter((c) => c.stage === 'menu').length, 1);
    assert.ok(calls >= 1);
  });

  it('resumes a large menu from the saved nutrition batches after an AI failure', async () => {
    const { ctx } = await makeCtx();
    await runKiez(ctx, KREUZBERG, ['find', 'menu']);
    const id = 'osm:node/1';
    await ctx.db.batch(Array.from({ length: 52 }, (_, i) => ({
      sql: `INSERT INTO pipeline_dish (id, restaurant_id, position, name, description, section, category)
            VALUES (?, ?, ?, 'Lachs Bowl', '', 'Bowls', 'bowl')`,
      params: [`extra-${i}`, id, i + 4],
    })));
    let calls = 0;
    const failsSecondBatch = new FakeLlm((request) => {
      if (request.restaurantId === id && ++calls === 2) throw new Error('test provider failure');
      return fakeAnswer(request);
    });
    const countEstimates = async () => (await ctx.db.first<{ n: number }>('SELECT COUNT(kcal) AS n FROM pipeline_dish WHERE restaurant_id = ?', [id]))!.n;
    await stageNutrition({ ...ctx, llm: failsSecondBatch }, KREUZBERG);
    assert.equal(await countEstimates(), 55);
    const resumed = await stageNutrition(ctx, KREUZBERG);
    assert.equal(resumed.dishes, 1);
    assert.equal(await countEstimates(), 56);
  });

  it('exports a review sample, imports verdicts and approves the Kiez', async () => {
    const { ctx, dir } = await makeCtx();
    await runKiez(ctx, KREUZBERG);
    const exp = await exportReview(ctx, KREUZBERG, join(dir, 'review'));
    assert.ok(exp && exp.rows === 4, `rows ${exp?.rows}`);
    assert.equal(await exportReview(ctx, KREUZBERG, join(dir, 'review')), null, 'second export has nothing new');
    const rows = parseCsv(readFileSync(exp!.file, 'utf8'));
    const header = rows[0]!;
    assert.equal(header[header.length - 2], 'verdict');
    // Reviewer marks everything "passt" except one dish of restaurant 2.
    const vi = header.indexOf('verdict');
    const ri = header.indexOf('restaurant');
    let failedOne = false;
    for (const r of rows.slice(1)) {
      if (r[ri] === 'Kiez Kantine' && !failedOne) { r[vi] = 'falsch'; failedOne = true; } else r[vi] = 'passt';
    }
    writeFileSync(exp!.file, rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n'));
    const result = await importReview(ctx, exp!.file);
    assert.equal(result.updated, 4);
    assert.equal(result.kieze[0]!.status, 'failed', '3 of 4 passt is below 80 %');
    // Teammate re-checks and accepts after the fix: all passt -> approved, failed restaurant stays out.
    for (const r of rows.slice(1)) r[vi] = 'passt';
    writeFileSync(exp!.file, rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n'));
    const again = await importReview(ctx, exp!.file);
    assert.equal(again.kieze[0]!.status, 'approved');
    const st = await statusOf(ctx);
    assert.equal(st['osm:node/1'], 'approved');
    assert.equal(st['osm:node/2'], 'image:review_failed');
  });

  it('exports seed JSON in the web contract shape with only the place id from Google', async () => {
    const { ctx } = await makeCtx();
    await runKiez(ctx, KREUZBERG);
    const seed = await buildSeed(ctx.db, { minStatus: 'image' });
    assert.equal(seed.restaurants.length, 2);
    const r = seed.restaurants.find((x) => x.name === 'Grün Bowl')!;
    assert.equal(r.kiez, 'Kreuzberg');
    assert.equal(r.placeId, 'place-1');
    assert.equal(r.baseSource, 'osm');
    assert.equal(r.address, 'Teststraße 1, 10967 Berlin');
    assert.equal(r.openingHours?.periods.length, 7);
    assert.ok(!('rating' in r) && !('priceLevel' in r) && !('photos' in r));
    const d = seed.dishes.find((x) => x.restaurantId === r.id && x.name.startsWith('Chicken'))!;
    assert.equal(d.price, 13.5);
    assert.equal(d.nutrition.source, 'ai');
    assert.ok(d.nutrition.kcal.min <= d.nutrition.kcal.value && d.nutrition.kcal.value <= d.nutrition.kcal.max);
    assert.equal(d.proteinPerEuro, Math.round((d.nutrition.protein.min / 13.5) * 10) / 10);
    assert.deepEqual(d.diet, []);
    assert.equal(d.menuSource.kind, 'website');
    assert.ok(seed.dishes.some((x) => x.image?.kind === 'ai' && x.image.alt.startsWith('KI-Bild')));
    assert.ok(seed.attribution.some((a) => a.includes('OpenStreetMap')));
  });
});

describe('publish to the Worker app tables', () => {
  it('renders idempotent SQL that loads into worker/migrations/0001_init.sql when present', async () => {
    const { existsSync, readFileSync: read } = await import('node:fs');
    const { buildPublish, stableUuid, toSqlScript } = await import('../src/export/publish.ts');
    const { ctx } = await makeCtx();
    await runKiez(ctx, KREUZBERG);
    const res = await buildPublish(ctx.db, { minStatus: 'image', releaseStatus: 'approved' });
    assert.equal(res.restaurants, 2);
    assert.equal(res.published, 0, 'nothing is approved yet, so nothing is released');
    assert.match(stableUuid('osm:node/1'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(stableUuid('x'), stableUuid('x'));
    const sql = toSqlScript(res.stmts);
    assert.ok(sql.includes("'Grün Bowl'"));
    const schema = new URL('../../worker/migrations/0001_init.sql', import.meta.url);
    if (!existsSync(schema)) return; // the Worker schema lands with the repo restructure PR
    const app = new SqliteDb(':memory:');
    await app.exec(read(schema, 'utf8'));
    await app.exec(read(new URL('../../worker/migrations/0043_dish_class.sql', import.meta.url), 'utf8'));
    await app.exec(read(new URL('../../worker/migrations/0049_menu_items.sql', import.meta.url), 'utf8'));
    await app.exec(sql);
    await app.exec(sql); // idempotent
    const classes = await app.all<{ course: string | null; healthy: number | null }>('SELECT course, healthy FROM dishes');
    assert.ok(classes.length && classes.every((d) => d.course !== null && d.healthy !== null), 'every published dish carries its class and healthy flag');
    assert.equal((await app.first<{ n: number }>('SELECT COUNT(*) AS n FROM restaurants'))!.n, 2);
    assert.ok((await app.first<{ n: number }>('SELECT COUNT(*) AS n FROM dishes'))!.n >= 5);
    const archived = await app.all<{ source_url: string; healthy: number; nutrition: string }>('SELECT source_url, healthy, nutrition FROM menu_items');
    assert.equal(archived.length, classes.length);
    assert.ok(archived.every((d) => d.source_url && JSON.parse(d.nutrition).kcal.length === 3));

    const pending = await ctx.db.first<{ id: string }>('SELECT id FROM pipeline_dish ORDER BY id LIMIT 1');
    await ctx.db.run('UPDATE pipeline_dish SET kcal = NULL, hidden = 1 WHERE id = ?', [pending!.id]);
    const refresh = await buildPublish(ctx.db, { minStatus: 'menu', releaseStatus: 'checked' });
    await app.exec(toSqlScript(refresh.stmts));
    const item = await app.first<{ nutrition: string | null; healthy: number | null }>('SELECT nutrition, healthy FROM menu_items WHERE id = ?', [stableUuid(pending!.id)]);
    assert.equal(item?.nutrition, null, 'a missing estimate must not drop the item');
    assert.equal(item?.healthy, 0, 'an unestimated item must not be treated as healthy');
  });
});

describe('stage 1 tiling', () => {
  it('splits a tile that hits the 60-result cap and finds every place', async () => {
    const { stageFind } = await import('../src/stages/find.ts');
    const restaurants: OsmRestaurant[] = [];
    const hits: PlacesCandidate[] = [];
    for (let i = 0; i < 75; i++) {
      const lat = 52.4990 + (i % 9) * 0.0004;
      const lng = 13.4150 + Math.floor(i / 9) * 0.0006;
      restaurants.push(osm(String(100 + i), `Dense Place ${i}`, lat, lng, null));
      hits.push(place(String(100 + i), `Dense Place ${i}`, lat, lng, 4.5));
    }
    const { ctx } = await makeCtx();
    const places = new FixturePlaces(hits);
    const c: Ctx = { ...ctx, osm: new FixtureOsm(restaurants), places, opts: { ...ctx.opts, tileMeters: 1500 } };
    const probe = await stageFind(c, KREUZBERG, { probeOnly: true });
    assert.equal(probe.found, 0, 'probing does not run paid matching');
    assert.equal((await c.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM pipeline_grid_place'))!.n, 75);
    const stats = await stageFind(c, KREUZBERG);
    assert.equal(stats.found, 75);
    assert.ok(probe.split >= 1, 'saturated tile was split during the probe');
    const deep = await c.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM pipeline_tile WHERE depth > 0 AND state = 'done'");
    assert.ok(deep!.n >= 4);
  });
});

describe('compact web seed', () => {
  it('nests dishes, packs ranges and tables strings without losing values', async () => {
    const { toWebSeed, webRestaurantId } = await import('../src/export/web.ts');
    const { ctx } = await makeCtx();
    await runKiez(ctx, KREUZBERG);
    const seed = await buildSeed(ctx.db, { minStatus: 'image' });
    const web = toWebSeed(seed);
    assert.equal(webRestaurantId('osm:node/1'), 'osm-node-1');
    assert.equal(web.restaurants.length, seed.restaurants.length);
    assert.ok(web.restaurants.every((r) => /^[a-zA-Z0-9_-]+$/.test(r.id)));
    const full = seed.dishes[0]!;
    const packed = web.restaurants.flatMap((r) => r.dishes).find((d) => d.id === full.id)!;
    assert.deepEqual(packed.n.slice(0, 3), [full.nutrition.kcal.value, full.nutrition.kcal.min, full.nutrition.kcal.max]);
    assert.equal(web.methods[packed.method], full.nutrition.method);
    assert.deepEqual(packed.ingredients.map(([i, g]) => [web.ingredientNames[i], g]), full.nutrition.ingredients!.map((i) => [i.name, i.amount]));
    assert.ok(web.methods.length < seed.dishes.length, 'methods are shared');
    assert.ok(seed.dishes.every((d) => d.nutrition.ingredients!.every((i) => !/[()]/.test(i.name))), 'German names without notes');
  });
});
