import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseOsmHours } from '../src/export/hours.ts';
import { CostLedger } from '../src/ledger.ts';
import { GooglePlaces } from '../src/sources/places.ts';
import { countPrices, extractLinks, htmlToText, logoLinks, robotsAllows, WebsiteMenuFetcher } from '../src/sources/website.ts';
import { isHostedDeliveryPage } from '../src/sources/delivery.ts';
import { D1HttpDb } from '../src/store/d1http.ts';
import { migrate } from '../src/store/migrate.ts';
import { SqliteDb } from '../src/store/sqlite.ts';
import { loadEnvFile, loadPipelineKeys } from '../src/util/env.ts';
import { BudgetExceededError, Limiter, mapPool } from '../src/util/limiter.ts';

describe('store', () => {
  it('applies the pipeline migrations once and tracks them like wrangler', async () => {
    const db = new SqliteDb(':memory:');
    const first = await migrate(db);
    assert.deepEqual(first, ['0010_pipeline_queue.sql', '0011_pipeline_german_text.sql', '0012_pipeline_dish_class.sql', '0013_pipeline_item_source.sql', '0014_pipeline_grid_places.sql']);
    assert.deepEqual(await migrate(db), []);
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'pipeline_%' ORDER BY name")).map((t) => t.name);
    assert.deepEqual(tables, ['pipeline_cost', 'pipeline_dish', 'pipeline_grid_place', 'pipeline_image', 'pipeline_menu_source', 'pipeline_restaurant', 'pipeline_review', 'pipeline_tile']);
  });

  it('stores no Google content besides the place id (EEA Places terms)', async () => {
    const db = new SqliteDb(':memory:');
    await migrate(db);
    const cols = (await db.all<{ name: string }>("SELECT name FROM pragma_table_info('pipeline_restaurant')")).map((c) => c.name);
    assert.ok(cols.includes('google_place_id'));
    for (const banned of ['rating', 'user_rating_count', 'price_level', 'photos', 'photo_name', 'google_name', 'google_address']) assert.ok(!cols.includes(banned), banned);
  });

  it('rolls back a failed batch', async () => {
    const db = new SqliteDb(':memory:');
    await migrate(db);
    await assert.rejects(db.batch([
      { sql: "INSERT INTO pipeline_image (key, ref, model, prompt) VALUES ('a', 'r', 'm', 'p')" },
      { sql: "INSERT INTO pipeline_image (key, ref, model, prompt) VALUES ('a', 'r', 'm', 'p')" },
    ]));
    assert.equal((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM pipeline_image'))!.n, 0);
  });

  it('D1 REST adapter sends sql, params and batches', async () => {
    const bodies: unknown[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ success: true, errors: [], result: [{ success: true, results: [{ n: 1 }], meta: { changes: 1 } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const db = new D1HttpDb('acc', 'dbid', 'token', fakeFetch);
    assert.deepEqual(await db.first('SELECT ? AS n', [1]), { n: 1 });
    await db.batch([{ sql: 'UPDATE x SET y = ?', params: [2] }]);
    assert.deepEqual(bodies, [{ sql: 'SELECT ? AS n', params: [1] }, { batch: [{ sql: 'UPDATE x SET y = ?', params: [2] }] }]);
  });
});

describe('cost ledger', () => {
  it('appends provider/model/usd JSON lines and enforces the budget', async () => {
    const db = new SqliteDb(':memory:');
    await migrate(db);
    const path = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.jsonl');
    const ledger = new CostLedger(db, 'run-1', path, 0.1);
    await ledger.record({ stage: 'menu', provider: 'anthropic', model: 'claude-opus-5-5', usd: 0.06, kiez: 'mitte', inputTokens: 1000, outputTokens: 500, purpose: 'menu:x' });
    const line = JSON.parse(readFileSync(path, 'utf8').trim());
    assert.equal(line.provider, 'anthropic');
    assert.equal(line.model, 'claude-opus-5-5');
    assert.equal(line.usd, 0.06);
    assert.equal(line.stage, 'menu');
    assert.equal((await db.first<{ usd: number }>('SELECT SUM(usd) AS usd FROM pipeline_cost'))!.usd, 0.06);
    const r = ledger.reserve(0.03);
    assert.throws(() => ledger.reserve(0.02), BudgetExceededError);
    r.release();
    ledger.reserve(0.02).release();
  });
});

describe('limiter', () => {
  it('caps concurrency', async () => {
    const lim = new Limiter('t', 2);
    let active = 0;
    let peak = 0;
    await Promise.all(Array.from({ length: 8 }, () => lim.run(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    })));
    assert.equal(peak, 2);
  });

  it('spaces request starts for rate limiting', async () => {
    let t = 0;
    const slept: number[] = [];
    const lim = new Limiter('t', 5, 100, () => t, async (ms) => { slept.push(ms); t += ms; });
    await Promise.all([1, 2, 3].map(() => lim.run(async () => undefined)));
    // Starts are scheduled at 0, 100 and 200 ms: the second waits 100 ms, the third another 100 ms.
    assert.deepEqual(slept, [100, 100]);
    assert.equal(t, 200);
  });

  it('mapPool collects errors but rethrows budget stops', async () => {
    const { ok, errors } = await mapPool([1, 2, 3], 2, async (x) => { if (x === 2) throw new Error('boom'); return x * 2; });
    assert.deepEqual(ok.toSorted(), [2, 6]);
    assert.equal(errors.length, 1);
    await assert.rejects(mapPool([1], 1, async () => { throw new BudgetExceededError(1, 1); }), BudgetExceededError);
  });
});

describe('Google Places adapter', () => {
  it('uses minimal field masks, logs only paid calls and follows page tokens', async () => {
    const db = new SqliteDb(':memory:');
    await migrate(db);
    const ledger = new CostLedger(db, 'r', null, null);
    const seen: { mask: string; body: { pageToken?: string; minRating: number; includedType: string } }[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      seen.push({ mask: headers['X-Goog-FieldMask']!, body: JSON.parse(String(init.body)) });
      const full = headers['X-Goog-FieldMask']!.includes('rating');
      return new Response(JSON.stringify({
        places: [{ id: 'p1', ...(full ? { displayName: { text: 'A' }, location: { latitude: 52.5, longitude: 13.4 }, rating: 4.6, websiteUri: 'https://a.de', businessStatus: 'OPERATIONAL' } : {}) }],
        nextPageToken: seen.length === 1 ? 'tok' : undefined,
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const places = new GooglePlaces('KEY', ledger, new Limiter('p', 1), fakeFetch);
    const bbox = { south: 52.49, west: 13.39, north: 52.5, east: 13.41 };
    const probe = await places.searchTile({ bbox, idsOnly: true });
    assert.equal(probe.nextPageToken, 'tok');
    assert.deepEqual(probe.candidates, []);
    const full = await places.searchTile({ bbox, idsOnly: false, pageToken: 'tok' });
    assert.equal(full.candidates[0]!.rating, 4.6);
    assert.equal(seen[0]!.mask, 'places.id,nextPageToken');
    assert.ok(seen[1]!.mask.includes('places.rating') && !seen[1]!.mask.includes('photos') && !seen[1]!.mask.includes('reviews'));
    assert.equal(seen[1]!.body.pageToken, 'tok');
    assert.equal(seen[1]!.body.minRating, 4);
    assert.equal(seen[1]!.body.includedType, 'restaurant');
    const costs = await db.all<{ model: string; usd: number }>('SELECT model, usd FROM pipeline_cost');
    assert.deepEqual(costs.map((c) => ({ ...c })), [{ model: 'text-search-enterprise', usd: 0.035 }]);
  });
});

describe('website helpers', () => {
  it('turns HTML into readable text and counts prices', () => {
    const html = '<html><head><style>x{}</style><script>var a=1</script></head><body><h2>Bowls</h2><p>Falafel Bowl&nbsp;12,90&nbsp;&euro;</p><li>Pho Bo 13.5</li><li>Tofu Salat 9,-</li></body></html>';
    const text = htmlToText(html);
    assert.ok(text.includes('Falafel Bowl 12,90 €'));
    assert.ok(!text.includes('var a'));
    assert.equal(countPrices(text), 2);
  });

  it('resolves links relative to the page', () => {
    const links = extractLinks('<a href="/speisekarte">Speisekarte</a><a href="menu.pdf">PDF</a><a href="mailto:x@y.de">mail</a>', 'https://r.de/home/');
    assert.deepEqual(links.map((l) => l.href), ['https://r.de/speisekarte', 'https://r.de/home/menu.pdf']);
  });

  it('finds declared own-site logos and distinguishes a hosted delivery template from a delivery link', () => {
    const html = `<header><img alt="Restaurant Logo" src="/brand.png"></header>
      <link href='/touch.png' rel='apple-touch-icon'>
      <link rel="icon" href="/wp-includes/images/wordpress.png">
      <meta property="og:image" content="/front-door.jpg">`;
    assert.deepEqual(logoLinks(html, 'https://restaurant.example/'), [
      'https://restaurant.example/brand.png', 'https://restaurant.example/touch.png', 'https://restaurant.example/favicon.ico',
    ]);
    assert.equal(isHostedDeliveryPage('<a href="https://www.lieferando.de/">Bestellen</a>'), false);
    assert.equal(isHostedDeliveryPage('<script src="/tpl/template1/default.js"></script>Hosted by Lieferando'), true);
  });

  it('honours robots.txt for our agent and the * group', () => {
    const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/menu\n\nUser-agent: BadBot\nDisallow: /';
    assert.equal(robotsAllows(robots, '/speisekarte'), true);
    assert.equal(robotsAllows(robots, '/private/x'), false);
    assert.equal(robotsAllows(robots, '/private/menu.pdf'), true);
    assert.equal(robotsAllows('User-agent: MenuPipelineBot\nDisallow: /', '/'), false);
    assert.equal(robotsAllows('', '/'), true);
  });

  it('reads the restaurant menu, follows a linked PDF on another host and skips redirect targets blocked by robots.txt or on a delivery site', async (t) => {
    const host = 'https://restaurant.example';
    const pages = new Map([
      [`${host}/robots.txt`, new Response('User-agent: *\nDisallow: /private')],
      [`${host}/`, new Response('<a href="/menu">Menu</a><a href="/speisekarte">Speisekarte</a><a href="/lunch">Lunch</a><a href="https://outside.example/menu.pdf">PDF-Menü</a>')],
      [`${host}/menu`, new Response(null, { status: 302, headers: { location: 'https://www.wolt.com/de/menu' } })],
      [`${host}/speisekarte`, new Response(null, { status: 302, headers: { location: '/private/menu' } })],
      [`${host}/lunch`, new Response('<p>Falafel Bowl 12,90 €</p>'.repeat(6), { headers: { 'content-type': 'text/html' } })],
      ['https://outside.example/robots.txt', new Response('')],
      ['https://outside.example/menu.pdf', new Response(`%PDF-1.4${' '.repeat(600)}`)],
    ]);
    const get = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      assert.equal(init.redirect, 'manual');
      const response = pages.get(url);
      assert.ok(response, `unexpected request to ${url}`);
      return response;
    });
    const result = await new WebsiteMenuFetcher().fetchMenu({ id: 'r', name: 'Restaurant', website: `${host}/` });
    assert.ok('docs' in result);
    assert.deepEqual(result.docs.map((d) => d.url), [`${host}/lunch`, 'https://outside.example/menu.pdf']);
    assert.deepEqual(get.mock.calls.map((call) => call.arguments[0]), [...pages.keys()]);
  });
});

describe('opening hours', () => {
  it('parses the common OSM subset into periods', () => {
    const h = parseOsmHours('Mo-Fr 11:00-21:30; Sa,Su 12:30-02:00')!;
    assert.equal(h.periods.length, 7);
    assert.deepEqual(h.periods[0], { open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 21, minute: 30 } });
    const sat = h.periods.find((p) => p.open.day === 6)!;
    assert.deepEqual(sat.close, { day: 0, hour: 2, minute: 0 });
    assert.equal(parseOsmHours('Mo-Su 12:00-22:00')!.periods.length, 7);
    assert.equal(parseOsmHours('nach Vereinbarung'), null);
    assert.equal(parseOsmHours(null), null);
  });
});

// Fake values only; the loader writes into the passed env object, never process.env.
const TEAM = 'GOOGLE_PLACES_API_KEY_KALVAREZ=fake-g-kalvarez\nGOOGLE_PLACES_API_KEY_MALEK=fake-g-malek\nOPENAI_API_KEY=fake-oa-team\n';
function pipelineRoot(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'keys-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

describe('env loading', () => {
  it('loads only requested keys and never overrides set values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-'));
    const f = join(dir, 'x.env');
    writeFileSync(f, '# c\nexport PIPELINE_TEST_A="1"\nPIPELINE_TEST_B=2\nOTHER=3\n');
    process.env.PIPELINE_TEST_B = 'kept';
    const loaded = loadEnvFile(f, ['PIPELINE_TEST_A', 'PIPELINE_TEST_B']);
    assert.deepEqual(loaded, ['PIPELINE_TEST_A']);
    assert.equal(process.env.PIPELINE_TEST_A, '1');
    assert.equal(process.env.PIPELINE_TEST_B, 'kept');
    assert.equal(process.env.OTHER, undefined);
  });

  it('falls back to .env.team and never maps --member to a Google key', () => {
    const root = pipelineRoot({ '.env.team': TEAM });
    const env: NodeJS.ProcessEnv = {};
    loadPipelineKeys(root, { member: 'malek' }, env);
    assert.equal(env.GOOGLE_PLACES_API_KEY, undefined);
    assert.equal(env.OPENAI_API_KEY, 'fake-oa-team');
    const env2: NodeJS.ProcessEnv = { GOOGLE_PLACES: 'on' };
    loadPipelineKeys(root, { member: 'Kalvarez' }, env2);
    assert.equal(env2.GOOGLE_PLACES_API_KEY, undefined);
  });

  it('prefers .env.local and the environment over .env.team, per key', () => {
    const root = pipelineRoot({ '.env.team': TEAM, '.env.local': 'OPENAI_API_KEY=fake-oa-local\nGOOGLE_PLACES_API_KEY_MALEK=\n' });
    const env: NodeJS.ProcessEnv = { PIPELINE_SCANNED_BY: 'x' };
    loadPipelineKeys(root, { member: 'malek' }, env);
    assert.equal(env.OPENAI_API_KEY, 'fake-oa-local');
    assert.equal(env.GOOGLE_PLACES_API_KEY, undefined);
    const env2: NodeJS.ProcessEnv = { OPENAI_API_KEY: 'fake-oa-shell' };
    loadPipelineKeys(root, {}, env2);
    assert.equal(env2.OPENAI_API_KEY, 'fake-oa-shell');
    assert.equal(env2.GOOGLE_PLACES_API_KEY, undefined); // no member, no plain key
  });

  it('lets an env dir win over .env.team', () => {
    const envDir = pipelineRoot({ 'openai-event.env': 'OPENAI_API_KEY=fake-oa-dir\n' });
    const root = pipelineRoot({ '.env.team': TEAM });
    const env: NodeJS.ProcessEnv = {};
    loadPipelineKeys(root, { envDir }, env);
    assert.equal(env.OPENAI_API_KEY, 'fake-oa-dir');
  });

  it('rejects an unknown member', () => {
    const root = pipelineRoot({ '.env.local': 'OPENAI_API_KEY=fake\n' });
    assert.throws(() => loadPipelineKeys(root, { member: 'batu' }, {}), /--member must be one of kalvarez, malek/);
  });

  it('lets members run with no Google key', () => {
    const root = pipelineRoot({ '.env.local': 'OPENAI_API_KEY=fake\n' });
    const env: NodeJS.ProcessEnv = {};
    loadPipelineKeys(root, { member: 'kalvarez' }, env);
    assert.equal(env.GOOGLE_PLACES_API_KEY, undefined);
    assert.equal(env.OPENAI_API_KEY, 'fake');
  });
});
