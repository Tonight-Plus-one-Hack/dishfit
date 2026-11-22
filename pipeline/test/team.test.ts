// Teammate features: OpenAI provider, provider selection, per-Kiez export with registry (dedupe, lock),
// German text backfill.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { type Ctx, DEFAULT_MODELS, DEFAULT_OPTIONS, llmProvider, modelsFor } from '../src/context.ts';
import { assertKiezOwner, exportKiez, readRegistry } from '../src/export/kiez.ts';
import { buildPublish } from '../src/export/publish.ts';
import { buildSeed } from '../src/export/seed.ts';
import { kiezBySlug } from '../src/kiez.ts';
import { CostLedger } from '../src/ledger.ts';
import { fakeAnswer } from '../src/llm/fake.ts';
import { FakeLlm, LlmError, OpenAiLlm } from '../src/llm/llm.ts';
import { runKiez } from '../src/orchestrator.ts';
import { FakeImages } from '../src/sources/images.ts';
import { FixtureOsm } from '../src/sources/osm.ts';
import { FixturePlaces } from '../src/sources/places.ts';
import { FixtureMenuFetcher, type MenuFetch } from '../src/sources/website.ts';
import { stageTranslate } from '../src/stages/translate.ts';
import { migrate } from '../src/store/migrate.ts';
import { SqliteDb } from '../src/store/sqlite.ts';
import { Limiter } from '../src/util/limiter.ts';

describe('provider selection', () => {
  it('uses Anthropic only when its key is set, OpenAI otherwise, env override wins', () => {
    assert.equal(llmProvider({ ANTHROPIC_API_KEY: 'x' }), 'anthropic');
    assert.equal(llmProvider({ OPENAI_API_KEY: 'y' }), 'openai');
    assert.equal(llmProvider({}), 'openai');
    assert.equal(llmProvider({ ANTHROPIC_API_KEY: 'x', PIPELINE_LLM_PROVIDER: 'openai' }), 'openai');
    assert.throws(() => llmProvider({ PIPELINE_LLM_PROVIDER: 'gemini' }));
    assert.equal(modelsFor('openai', {}).menu, 'gpt-6.2-sol');
    assert.equal(modelsFor('openai', { PIPELINE_MODEL_SECOND: 'gpt-6-luna' }).second, 'gpt-6-luna');
    assert.equal(modelsFor('anthropic', {}).translate, 'claude-haiku-5-5');
  });

  it('teammate defaults: 50 restaurants per Kiez, one KI-Bild per restaurant', () => {
    assert.equal(DEFAULT_OPTIONS.maxRestaurantsPerKiez, 50);
    assert.equal(DEFAULT_OPTIONS.aiImagesPerRestaurant, 1);
  });
});

async function setup(response: unknown, status = 200) {
  const db = new SqliteDb(':memory:');
  await migrate(db);
  const ledger = new CostLedger(db, 'r', null, null);
  const bodies: Record<string, unknown>[] = [];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(response), { status });
  }) as unknown as typeof fetch;
  return { db, llm: new OpenAiLlm('KEY', ledger, new Limiter('o', 1), fakeFetch), bodies };
}

describe('OpenAI provider', () => {
  const req = {
    stage: 'menu' as const, purpose: 'menu:x', model: 'gpt-6.2-sol', system: 'SYS', schema: { type: 'object' }, effort: 'low' as const,
    content: [{ type: 'text' as const, text: 'hello' }, { type: 'pdf' as const, data: 'UERG', title: 'm.pdf' }, { type: 'image' as const, mediaType: 'image/png' as const, data: 'SU1H' }],
    estimate: { inputTokens: 100, outputTokens: 100 },
  };

  it('sends strict JSON-schema output with text, PDF and image parts and logs the cost', async () => {
    const { db, llm, bodies } = await setup({
      status: 'completed', model: 'gpt-6.2-sol-2026-10-01',
      output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }],
      usage: { input_tokens: 1000, output_tokens: 500, input_tokens_details: { cached_tokens: 200 } },
    });
    const res = await llm.json<{ ok: boolean }>(req);
    assert.deepEqual(res.data, { ok: true });
    const b = bodies[0]!;
    assert.equal(b.instructions, 'SYS');
    assert.deepEqual(b.text, { format: { type: 'json_schema', name: 'result', strict: true, schema: { type: 'object' } } });
    assert.deepEqual(b.reasoning, { effort: 'low' });
    const parts = (b.input as { content: { type: string; file_data?: string; image_url?: string }[] }[])[0]!.content;
    assert.deepEqual(parts.map((p) => p.type), ['input_text', 'input_file', 'input_image']);
    assert.equal(parts[1]!.file_data, 'data:application/pdf;base64,UERG');
    assert.equal(parts[2]!.image_url, 'data:image/png;base64,SU1H');
    // (800 * 2 + 200 * 0.1 + 500 * 10) / 1e6
    assert.equal(res.usd, 0.00662);
    const row = await db.first<{ provider: string; usd: number }>('SELECT provider, usd FROM pipeline_cost');
    assert.deepEqual({ ...row }, { provider: 'openai', usd: 0.00662 });
  });

  it('raises on refusals and incomplete responses', async () => {
    const refused = await setup({ status: 'completed', model: 'gpt-6.2-sol', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }], usage: { input_tokens: 1, output_tokens: 1 } });
    await assert.rejects(refused.llm.json(req), LlmError);
    const cut = await setup({ status: 'incomplete', model: 'gpt-6.2-sol', incomplete_details: { reason: 'max_output_tokens' }, output: [], usage: { input_tokens: 1, output_tokens: 1 } });
    await assert.rejects(cut.llm.json(req), /max_output_tokens/);
  });
});

const KREUZBERG = kiezBySlug('kreuzberg');

async function scannedCtx() {
  const db = new SqliteDb(':memory:');
  await migrate(db);
  const dir = mkdtempSync(join(tmpdir(), 'kiez-'));
  const ledger = new CostLedger(db, 't', null, null);
  const osm = [1, 2].map((i) => ({ osmId: `node/${i}`, name: `Kiez Bowl ${i}`, lat: 52.499 + i * 0.001, lng: 13.418, street: 'Teststraße', housenumber: String(i), postcode: '10967', cuisine: ['vietnamese'], openingHours: null, website: `https://r${i}.example`, amenity: 'restaurant', dietVegan: null, dietVegetarian: null }));
  const places = osm.map((o, i) => ({ placeId: `place-${i + 1}`, name: o.name, location: { lat: o.lat, lng: o.lng }, rating: 4.6, userRatingCount: 9, websiteUri: null, businessStatus: 'OPERATIONAL' }));
  const menus = new Map<string, MenuFetch>(osm.map((o) => [`osm:${o.osmId}`, { docs: [{ kind: 'html', url: o.website, text: 'Pho Bo 13,90\nTofu Bowl 11,50\nLachs Salat 12,90' }], aggregatorLinks: [] }]));
  mkdirSync(join(dir, 'images', 'ai'), { recursive: true });
  const images = new FakeImages();
  const ctx: Ctx = { db, ledger, llm: new FakeLlm(fakeAnswer), images, osm: new FixtureOsm(osm), places: new FixturePlaces(places), menus: new FixtureMenuFetcher(menus), models: DEFAULT_MODELS, opts: { ...DEFAULT_OPTIONS }, dataDir: dir, log: () => {} };
  await runKiez(ctx, KREUZBERG);
  for (const c of images.calls) writeFileSync(join(dir, 'images', `${c.key.startsWith('ai/') ? c.key : `ai/${c.key}`}.webp`), 'webp');
  const paths = { webSeedDir: join(dir, 'web', 'kiez'), imagesDir: join(dir, 'web', 'images'), registryDir: join(dir, 'registry'), imagesSrcDir: join(dir, 'images') };
  return { ctx, paths };
}

describe('per-Kiez export and registry', () => {
  it('writes the Kiez seed, its images and a registry with counts and cost', async () => {
    const { ctx, paths } = await scannedCtx();
    const reg = await exportKiez(ctx.db, KREUZBERG, { ...paths, scannedBy: 'Kalvarez09', provider: 'openai', models: modelsFor('openai', {}) });
    assert.equal(reg.counts.restaurants, 2);
    // Both fixture restaurants serve the same top dish, so they share one KI-Bild.
    assert.equal(reg.counts.images, 1);
    assert.equal(reg.places.length, 2);
    assert.ok(existsSync(join(paths.webSeedDir, 'kreuzberg.json')));
    assert.equal(readdirSync(paths.imagesDir).length, 1);
    assert.equal(readRegistry(paths.registryDir, 'kreuzberg')!.scannedBy, 'Kalvarez09');
    const seed = JSON.parse(readFileSync(join(paths.webSeedDir, 'kreuzberg.json'), 'utf8'));
    assert.equal(seed.restaurants[0].kiez, 'Kreuzberg');
  });

  it('locks a Kiez to its scanner unless forced', async () => {
    const { ctx, paths } = await scannedCtx();
    await exportKiez(ctx.db, KREUZBERG, { ...paths, scannedBy: 'Kalvarez09', provider: 'openai', models: {} });
    assert.throws(() => assertKiezOwner(paths.registryDir, KREUZBERG, 'Malek1414', false), /already registered to Kalvarez09/);
    assert.doesNotThrow(() => assertKiezOwner(paths.registryDir, KREUZBERG, 'Kalvarez09', false));
    await assert.rejects(exportKiez(ctx.db, KREUZBERG, { ...paths, scannedBy: 'Malek1414', provider: 'openai', models: {} }));
    await exportKiez(ctx.db, KREUZBERG, { ...paths, scannedBy: 'Malek1414', provider: 'openai', models: {}, force: true });
  });

  it('skips places another Kiez already registered (dedupe by place id)', async () => {
    const { ctx, paths } = await scannedCtx();
    mkdirSync(paths.registryDir, { recursive: true });
    writeFileSync(join(paths.registryDir, 'mitte.json'), JSON.stringify({ kiez: 'mitte', name: 'Mitte', scannedBy: 'BatuCani', places: [{ id: 'x', placeId: 'place-1', osmId: null }] }));
    const reg = await exportKiez(ctx.db, KREUZBERG, { ...paths, scannedBy: 'Kalvarez09', provider: 'openai', models: {} });
    assert.equal(reg.counts.restaurants, 1);
    assert.equal(reg.counts.skippedDuplicates, 1);
    assert.deepEqual(reg.places.map((p) => p.placeId), ['place-2']);
  });

  it('exports only new places with verified photos when a photo check is supplied', async () => {
    const { ctx, paths } = await scannedCtx();
    const reg = await exportKiez(ctx.db, KREUZBERG, {
      ...paths, scannedBy: 'BatuCani', provider: 'openai', models: {},
      withGooglePhotos: async (ids) => {
        assert.deepEqual(ids.toSorted(), ['place-1', 'place-2']);
        return new Set(['place-2']);
      },
    });
    assert.deepEqual(reg.places.map((p) => p.placeId), ['place-2']);
    const seed = JSON.parse(readFileSync(join(paths.webSeedDir, 'kreuzberg.json'), 'utf8'));
    assert.deepEqual(seed.restaurants.map((r: { placeId: string }) => r.placeId), ['place-2']);
  });

  it('keeps a corrected place id over the scan queue id when the Kiez is exported again, also with --append', async () => {
    const { ctx, paths } = await scannedCtx();
    const seedPath = join(paths.webSeedDir, 'kreuzberg.json');
    await exportKiez(ctx.db, KREUZBERG, { ...paths, scannedBy: 'BatuCani', provider: 'openai', models: {} });
    const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as { restaurants: { id: string; placeId: string | null }[] };
    const target = seed.restaurants.find((r) => r.placeId === 'place-1');
    assert.ok(target);
    target.placeId = 'corrected';
    writeFileSync(seedPath, JSON.stringify(seed));
    for (const append of [false, true]) {
      const reg = await exportKiez(ctx.db, KREUZBERG, { ...paths, scannedBy: 'BatuCani', provider: 'openai', models: {}, append });
      assert.ok(reg.places.some((p) => p.placeId === 'corrected'));
      assert.ok(!reg.places.some((p) => p.placeId === 'place-1'));
      assert.ok((JSON.parse(readFileSync(seedPath, 'utf8')) as typeof seed).restaurants.some((r) => r.placeId === 'corrected'));
    }
  });

  it('refuses to publish a Kiez that is not in the app catalog', async () => {
    const { ctx, paths } = await scannedCtx();
    await assert.rejects(exportKiez(ctx.db, kiezBySlug('adlershof'), { ...paths, scannedBy: 'BatuCani', provider: 'openai', models: {} }), /not in the app's Kiez catalog/);
  });

  it('lets the committed place id win in the seed and publish exports', async () => {
    const { ctx } = await scannedCtx();
    const placeIds = new Map([['osm-node-1', 'corrected']]);
    const seed = await buildSeed(ctx.db, { minStatus: 'checked', kieze: ['kreuzberg'], placeIds });
    assert.deepEqual(seed.restaurants.map((r) => r.placeId).toSorted(), ['corrected', 'place-2']);
    const publish = await buildPublish(ctx.db, { minStatus: 'checked', releaseStatus: 'checked', kieze: ['kreuzberg'], placeIds });
    assert.ok(publish.stmts.some((s) => s.params?.includes('corrected')));
  });

  it('drops a delivery-platform restaurant from the committed seed when appending', async () => {
    const { ctx, paths } = await scannedCtx();
    await exportKiez(ctx.db, KREUZBERG, { ...paths, scannedBy: 'BatuCani', provider: 'openai', models: {} });
    const seedPath = join(paths.webSeedDir, 'kreuzberg.json');
    const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
    seed.restaurants.push({ ...seed.restaurants[0], id: 'osm-node-999', placeId: 'place-999', osmId: 'node/999', menu: { url: 'https://x.lieferbuddy.de/de/shop', fetchedAt: '', kind: 'website' } });
    writeFileSync(seedPath, JSON.stringify(seed));
    const reg = await exportKiez(ctx.db, KREUZBERG, { ...paths, scannedBy: 'BatuCani', provider: 'openai', models: {}, append: true });
    assert.ok(!reg.places.some((p) => p.placeId === 'place-999'));
  });

  it('does not export a restaurant whose saved menu source is a delivery platform', async () => {
    const { ctx, paths } = await scannedCtx();
    await ctx.db.run("UPDATE pipeline_menu_source SET url = 'https://hkbistro.lieferbuddy.de/de/shop' WHERE restaurant_id = 'osm:node/1'");
    const reg = await exportKiez(ctx.db, KREUZBERG, { ...paths, scannedBy: 'BatuCani', provider: 'openai', models: {} });
    assert.deepEqual(reg.places.map((p) => p.placeId), ['place-2']);
    const seed = await buildSeed(ctx.db, { minStatus: 'checked', kieze: ['kreuzberg'] });
    assert.deepEqual(seed.restaurants.map((r) => r.placeId), ['place-2']);
  });

  it('--append adds a later scan to the published Kiez once, also when exported again', async () => {
    const { ctx, paths } = await scannedCtx();
    // An earlier scan published one other restaurant in the Kiez.
    const first = await exportKiez(ctx.db, KREUZBERG, { ...paths, scannedBy: 'BatuCani', provider: 'anthropic', models: {} });
    const earlier = JSON.parse(readFileSync(join(paths.webSeedDir, 'kreuzberg.json'), 'utf8'));
    earlier.restaurants = [{ ...earlier.restaurants[0], id: 'osm-node-999', placeId: 'place-999', osmId: 'node/999' }];
    writeFileSync(join(paths.webSeedDir, 'kreuzberg.json'), JSON.stringify(earlier));
    writeFileSync(join(paths.registryDir, 'kreuzberg.json'), JSON.stringify({ ...first, counts: { ...first.counts, restaurants: 1, found: 10, menus: 1 }, costUsd: { total: 5, byStage: { menu: 5 }, byProvider: { anthropic: 5 } }, places: [{ id: 'osm-node-999', placeId: 'place-999', osmId: 'node/999' }] }));

    const opts = { ...paths, scannedBy: 'BatuCani', provider: 'openai' as const, models: {}, append: true };
    const a = await exportKiez(ctx.db, KREUZBERG, opts);
    const b = await exportKiez(ctx.db, KREUZBERG, opts);
    for (const reg of [a, b]) {
      assert.equal(reg.counts.restaurants, 3);
      assert.deepEqual(reg.places.map((p) => p.placeId), ['place-999', 'place-1', 'place-2']);
      assert.equal(reg.provider, 'mixed');
      assert.equal(reg.counts.found, 10 + first.counts.found);
      assert.equal(reg.costUsd.total, Math.round((5 + first.costUsd.total) * 100) / 100);
    }
    assert.equal(JSON.parse(readFileSync(join(paths.webSeedDir, 'kreuzberg.json'), 'utf8')).restaurants.length, 3);
  });
});

describe('German text', () => {
  it('backfills description_de and section_de where missing, once', async () => {
    const { ctx } = await scannedCtx();
    await ctx.db.run('UPDATE pipeline_dish SET description_de = NULL, section_de = NULL');
    const fake = new FakeLlm(fakeAnswer);
    const c: Ctx = { ...ctx, llm: fake };
    const first = await stageTranslate(c, KREUZBERG);
    assert.equal(first.dishes, 6);
    assert.equal((await ctx.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM pipeline_dish WHERE section_de IS NULL'))!.n, 0);
    const again = await stageTranslate(c, KREUZBERG);
    assert.equal(again.dishes, 0);
    assert.equal(fake.calls.length, 2);
  });
});
