// Pipeline CLI. Keys come from the environment, pipeline/.env.local (see .env.example) or the team file pipeline/.env.team. Examples:
//   npm run scan -- --kiez charlottenburg --member kalvarez   (teammates: all stages + per-Kiez export, team keys)
//   npm run pipeline -- migrate
//   npm run pipeline -- run --kiez kreuzberg --budget 10
//   npm run pipeline -- run --wave 1 --budget 60 --max-restaurants 40
//   npm run pipeline -- run --wave 1 --fixture spike --fake-llm        (offline, no keys, no cost)
//   npm run pipeline -- status
//   npm run pipeline -- review export --wave 1 --out ./review
//   npm run pipeline -- review import ./review/review-mitte-Kalvarez09.csv
//   npm run pipeline -- seed --out ./seed/berlin.json --min-status image
//   npm run pipeline -- seed --format web --min-status checked --out ../apps/web/src/data/seed/pipeline/wave1.json
//   npm run pipeline -- publish --out ./publish.sql   (then: wrangler d1 execute <db> --file ./publish.sql)
//   npm run scan -- --kiez steglitz --healthy --probe-only   (healthy-term search: free probe, prints the paid pages it would fetch)
//   npm run scan -- --kiez mitte --healthy --append --min-healthy-dishes 2   (add healthy places to a published Kiez)
//   npm run pipeline -- photo-coverage --out <file.json>   (Google photo coverage of the published seed; free IDs-only Place Details)
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type Ctx, DEFAULT_MODELS, DEFAULT_OPTIONS, defaultDataDir, defaultLedgerPath, type LlmProvider, llmProvider, modelsFor, PIPELINE_ROOT } from './context.ts';
import { assertKiezOwner, committedPlaceIds, exportKiez, type ExportKiezOptions, type KiezPaths, readRegistries } from './export/kiez.ts';
import { buildPublish, toSqlScript } from './export/publish.ts';
import { buildSeed } from './export/seed.ts';
import { applyPlaceIdChanges, backfillPlaceIds, buildCoverage, coverageMarkdown, type PlacePhotoStatus, placePhotoLookup, publishedRestaurants, reconcileRegistryPlaceIds } from './coverage.ts';
import { copyImages, imageKeys, toWebSeed, webRestaurantId } from './export/web.ts';
import { loadSpikeFixture } from './fixtures/spike.ts';
import { assertPublishableKiez, KIEZE, type KiezDef, kiezBySlug, kiezeForWave } from './kiez.ts';
import { CostLedger, costSummary } from './ledger.ts';
import { fakeAnswer } from './llm/fake.ts';
import { AnthropicLlm, FakeLlm, OpenAiLlm } from './llm/llm.ts';
import { kiezCounts, runWave, STAGE_NAMES, type StageName } from './orchestrator.ts';
import { FakeImages, OpenAiImages } from './sources/images.ts';
import { FixtureOsm, osmElementToRestaurant, OverpassOsm } from './sources/osm.ts';
import { FixturePlaces, GooglePlaces } from './sources/places.ts';
import { PlacesQuota } from './sources/places-quota.ts';
import { WebsiteMenuFetcher } from './sources/website.ts';
import { exportReview, importReview } from './stages/review.ts';
import type { FindHealthyStats } from './stages/find-healthy.ts';
import { PLACES_SKUS } from './pricing.ts';
import { HEALTHY_RULES } from '../../packages/contract/src/dish-class.ts';
import { D1HttpDb } from './store/d1http.ts';
import { nowIso, type Db } from './store/db.ts';
import { migrate } from './store/migrate.ts';
import { SqliteDb } from './store/sqlite.ts';
import { STATUSES, type RestaurantStatus } from './types.ts';
import { loadPipelineKeys, requireEnv } from './util/env.ts';
import { Limiter, mapPool, withRetry } from './util/limiter.ts';

const log = (msg: string) => console.error(`${new Date().toISOString().slice(11, 19)} ${msg}`);

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    kiez: { type: 'string' },
    wave: { type: 'string' },
    stages: { type: 'string' },
    budget: { type: 'string' },
    'max-restaurants': { type: 'string' },
    'images-per-restaurant': { type: 'string' },
    fixture: { type: 'string' },
    'fake-llm': { type: 'boolean', default: false },
    'fake-images': { type: 'boolean', default: false },
    'env-dir': { type: 'string' },
    db: { type: 'string' },
    d1: { type: 'boolean', default: false },
    'data-dir': { type: 'string' },
    ledger: { type: 'string' },
    out: { type: 'string' },
    'min-status': { type: 'string' },
    'anthropic-concurrency': { type: 'string' },
    'serial': { type: 'boolean', default: false },
    'osm-snapshot': { type: 'string' },
    'from-catalog': { type: 'boolean', default: false },
    run: { type: 'string' },
    'release-status': { type: 'string' },
    'image-quality': { type: 'string' },
    format: { type: 'string' },
    'images-out': { type: 'string' },
    apply: { type: 'boolean', default: false },
    by: { type: 'string' },
    force: { type: 'boolean', default: false },
    provider: { type: 'string' },
    member: { type: 'string' },
    healthy: { type: 'boolean', default: false },
    'probe-only': { type: 'boolean', default: false },
    append: { type: 'boolean', default: false },
    'min-healthy-dishes': { type: 'string' },
    'places-daily-calls': { type: 'string' },
    backfill: { type: 'boolean', default: false },
    'require-google-photo': { type: 'boolean', default: false },
  },
});

function selectedKieze(): KiezDef[] {
  if (flags.kiez) return flags.kiez === 'all' ? KIEZE : flags.kiez.split(',').map((s) => kiezBySlug(s.trim()));
  if (flags.wave) return kiezeForWave(Number(flags.wave));
  return KIEZE.filter((k) => k.wave < 5);
}

async function openDb(dataDir: string): Promise<Db> {
  if (flags.d1) {
    return new D1HttpDb(requireEnv('CLOUDFLARE_ACCOUNT_ID'), requireEnv('PIPELINE_D1_DATABASE_ID'), requireEnv('CLOUDFLARE_API_TOKEN'));
  }
  return new SqliteDb(resolve(flags.db ?? join(dataDir, 'pipeline.sqlite')));
}

function provider(): LlmProvider {
  return flags.provider ? llmProvider({ PIPELINE_LLM_PROVIDER: flags.provider }) : llmProvider();
}

/** Who scanned: --by, PIPELINE_SCANNED_BY, or the git user name. */
function scannedBy(): string {
  if (flags.by) return flags.by;
  if (process.env.PIPELINE_SCANNED_BY) return process.env.PIPELINE_SCANNED_BY;
  try {
    return execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** --min-healthy-dishes (default 2 with --healthy) and --append for the per-Kiez export. */
function exportFlags(): Pick<ExportKiezOptions, 'minHealthyDishes' | 'append' | 'withGooglePhotos'> {
  const min = flags['min-healthy-dishes'] != null ? Number(flags['min-healthy-dishes']) : flags.healthy ? HEALTHY_RULES.minDishesPerRestaurant : null;
  const options: Pick<ExportKiezOptions, 'minHealthyDishes' | 'append' | 'withGooglePhotos'> = { minHealthyDishes: min, append: flags.append ?? false };
  if (flags['require-google-photo']) {
    const apiKey = requireEnv('GOOGLE_PLACES_API_KEY');
    const limiter = new Limiter('places', 4, 120);
    options.withGooglePhotos = async (ids) => {
      const status = await photoStatus(ids, apiKey, limiter);
      for (const [id, result] of status) {
        if (result.state === 'error') throw new Error(`Cannot verify photos for ${id}: ${result.message}`);
      }
      return new Set([...status].flatMap(([id, result]) => result.state === 'ok' && result.photos > 0 ? [id] : []));
    };
  }
  return options;
}

const REPO_ROOT = resolve(PIPELINE_ROOT, '..');
function kiezPaths(dataDir: string): KiezPaths {
  return {
    webSeedDir: join(REPO_ROOT, 'apps', 'web', 'src', 'data', 'seed', 'pipeline', 'kiez'),
    imagesDir: join(REPO_ROOT, 'apps', 'web', 'src', 'data', 'seed', 'pipeline', 'images'),
    registryDir: join(PIPELINE_ROOT, 'registry'),
    imagesSrcDir: join(dataDir, 'images'),
  };
}

async function buildCtx(db: Db, dataDir: string, defaultBudget: number | null = null): Promise<Ctx> {
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}-${randomUUID().slice(0, 6)}`;
  const budget = flags.budget != null ? Number(flags.budget) : defaultBudget;
  const ledger = new CostLedger(db, runId, flags.ledger ?? defaultLedgerPath(dataDir), budget);
  const modelConcurrency = flags.serial ? 2 : Number(flags['anthropic-concurrency'] ?? 12);
  const anthropic = new Limiter('anthropic', modelConcurrency);
  const openai = new Limiter('openai-images', flags.serial ? 2 : 4);
  const opts = { ...DEFAULT_OPTIONS };
  if (flags.serial) opts.restaurantConcurrency = 2;
  if (!flags.fixture) opts.usePlacesWebsite = false;
  if (flags['max-restaurants']) opts.maxRestaurantsPerKiez = Number(flags['max-restaurants']);
  if (flags['images-per-restaurant']) opts.aiImagesPerRestaurant = Number(flags['images-per-restaurant']);
  opts.healthySearch = flags.healthy ?? false;
  opts.placesProbeOnly = flags['probe-only'] ?? false;
  const fixture = flags.fixture === 'spike' ? loadSpikeFixture() : null;
  if (flags.fixture && !fixture) throw new Error(`unknown fixture ${flags.fixture}`);
  const llmName = provider();
  const models = modelsFor(llmName);
  const skipModels = flags['fake-llm'] || opts.placesProbeOnly;
  const llm = skipModels ? new FakeLlm(fakeAnswer, ledger)
    : llmName === 'openai' ? new OpenAiLlm(requireEnv('OPENAI_API_KEY'), ledger, new Limiter('openai-text', modelConcurrency))
    : new AnthropicLlm(requireEnv('ANTHROPIC_API_KEY'), ledger, anthropic);
  const imagesDir = join(dataDir, 'images');
  const images = flags['fake-images'] || skipModels || opts.aiImagesPerRestaurant === 0 ? new FakeImages() : new OpenAiImages(requireEnv('OPENAI_API_KEY'), imagesDir, ledger, openai, 'gpt-image-2.6-flare', (flags['image-quality'] ?? 'low') as 'low' | 'medium' | 'high');
  const osm = flags['osm-snapshot']
    ? new FixtureOsm((JSON.parse(readFileSync(flags['osm-snapshot'], 'utf8')).elements as Parameters<typeof osmElementToRestaurant>[0][])
      .map(osmElementToRestaurant).filter((restaurant) => restaurant !== null))
    : new OverpassOsm(undefined, opts.healthySearch ? ['restaurant', 'fast_food', 'cafe'] : undefined);
  const ctx: Ctx = {
    db, ledger, llm, images,
    osm: fixture?.osm ?? osm,
    places: fixture?.places ?? new FixturePlaces([]),
    menus: fixture?.menus ?? new WebsiteMenuFetcher(),
    models, opts, dataDir, log,
  };
  log(`run ${runId}: budget ${budget ?? 'none'} USD, ledger ${flags.ledger ?? defaultLedgerPath(dataDir)}, ${fixture ? 'spike fixture' : 'live sources'}, ${opts.placesProbeOnly ? 'discovery only' : skipModels ? 'fake LLM' : `${llmName} ${JSON.stringify(models)}`}`);
  return ctx;
}

async function enqueueCatalog(db: Db, seedDir: string, kieze: KiezDef[]): Promise<void> {
  const selected = new Set(kieze.map((kiez) => kiez.slug));
  const now = nowIso();
  const restaurants = publishedRestaurants(seedDir).filter(({ kiez, restaurant }) =>
    selected.has(kiez) && restaurant.osmId && restaurant.placeId && restaurant.website,
  );
  await db.batch(restaurants.map(({ kiez, restaurant: r }) => ({
    sql: `INSERT OR IGNORE INTO pipeline_restaurant
          (id, kiez, osm_id, name, lat, lng, cuisine, website, amenity, osm_fetched_at, google_place_id, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'restaurant', ?, ?, 'found')`,
    params: [`osm:${r.osmId}`, kiez, r.osmId, r.name, r.lat, r.lng, JSON.stringify(r.cuisine), r.website, now, r.placeId],
  })));
  log(`catalog: queued up to ${restaurants.length} restaurants with own websites and existing place IDs`);
}

async function main() {
  const [cmd, sub, arg] = positionals;
  if (flags['from-catalog'] && (cmd !== 'run' || flags.d1 || flags.fixture || flags['probe-only'])) {
    throw new Error('--from-catalog is for live website stages in a local run');
  }
  if (cmd === 'scan' && flags['probe-only'] && !flags.healthy) {
    throw new Error('Use run --stages find --probe-only for a grid probe');
  }
  loadPipelineKeys(PIPELINE_ROOT, { member: flags.member, envDir: flags['env-dir'] ?? process.env.PIPELINE_ENV_DIR });
  const placesOnlyCommand = cmd === 'photo-coverage' || (cmd === 'scan' && !flags.fixture);
  const placesOnlyFlag = ((cmd === 'run' || cmd === 'scan') && flags['probe-only'] && !flags.fixture)
    || ((cmd === 'scan' || cmd === 'export-kiez') && flags['require-google-photo']);
  if (placesOnlyCommand || placesOnlyFlag) {
    console.error('Google Places is off. Live scans, probes and Google photo checks are unavailable.');
    process.exitCode = 2;
    return;
  }
  const dataDir = resolve(flags['data-dir'] ?? defaultDataDir());
  mkdirSync(dataDir, { recursive: true });
  const db = await openDb(dataDir);
  try {
    const applied = await migrate(db);
    if (applied.length) log(`migrations applied: ${applied.join(', ')}`);
    switch (cmd) {
      case 'migrate':
        break;
      case 'run': {
        const defaults: readonly StageName[] = flags['from-catalog'] ? ['menu', 'nutrition', 'classify'] : flags['probe-only'] ? ['find'] : STAGE_NAMES;
        let stages: readonly StageName[] = flags.stages ? flags.stages.split(',') as StageName[] : defaults;
        if (flags['probe-only'] && stages.some((s) => s !== 'find')) throw new Error('--probe-only runs discovery only: use --stages find or omit --stages');
        if (flags['from-catalog'] && stages.includes('find')) throw new Error('--from-catalog uses existing place IDs and cannot run find');
        if (!flags.fixture && stages.includes('find')) {
          log('Google Places is off; skipping find. Other stages use the existing queue.');
          stages = stages.filter((stage) => stage !== 'find');
          if (!stages.length) break;
        }
        const kieze = selectedKieze();
        for (const k of kieze) assertKiezOwner(kiezPaths(dataDir).registryDir, k, scannedBy(), flags.force ?? false);
        const ctx = await buildCtx(db, dataDir);
        if (flags['from-catalog']) await enqueueCatalog(db, kiezPaths(dataDir).webSeedDir, kieze);
        log(`running ${stages.join(' > ')} for ${kieze.map((k) => k.slug).join(', ')}`);
        const results = await runWave(ctx, kieze, stages, { serial: flags.serial });
        for (const r of results) if (r.stoppedBy) log(`[${r.kiez}] ${r.stoppedBy}`);
        if (stages.includes('find') && !ctx.opts.healthySearch) {
          const count = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM pipeline_grid_place');
          log(`grid: ${count?.n ?? 0} distinct Google Place IDs collected in this queue`);
        }
        log(`run cost: ${ctx.ledger.spentUsd.toFixed(4)} USD by stage ${JSON.stringify(Object.fromEntries([...ctx.ledger.byStage].map(([k, v]) => [k, Math.round(v * 10000) / 10000])))}`);
        await printStatus(db, kieze.map((k) => k.slug));
        break;
      }
      case 'scan': {
        // Teammate entry point: all stages for the given Kieze, then the per-Kiez export and registry.
        if (!flags.kiez) throw new Error('usage: npm run scan -- --kiez <slug>[,<slug>]  (slugs: ' + KIEZE.map((k) => k.slug).join(', ') + ')');
        const kieze = selectedKieze();
        const by = scannedBy();
        const paths = kiezPaths(dataDir);
        for (const k of kieze) {
          assertKiezOwner(paths.registryDir, k, by, flags.force ?? false);
          if (!flags['probe-only']) assertPublishableKiez(k.slug);
        }
        const ctx = await buildCtx(db, dataDir, 12 * kieze.length);
        log(`scan by ${by}: ${kieze.map((k) => k.name).join(', ')}; max ${ctx.opts.maxRestaurantsPerKiez} restaurants per Kiez, ${ctx.opts.aiImagesPerRestaurant} KI-Bild per restaurant`);
        const results = await runWave(ctx, kieze, undefined, { serial: flags.serial });
        for (const r of results) if (r.stoppedBy) log(`[${r.kiez}] ${r.stoppedBy}`);
        if (ctx.opts.placesProbeOnly) {
          const probes = results.map((r) => r.stages.find as FindHealthyStats | undefined).filter((x): x is FindHealthyStats => !!x);
          for (const p of probes) log(`[${p.kiez}] probe: ${p.searches} free searches, ${p.newPlaces} new place ids, ${p.paidPages} paid pages, ${p.osmLookups} OSM lookups`);
          const pages = probes.reduce((a, p) => a + p.paidPages, 0);
          const lookups = probes.reduce((a, p) => a + p.osmLookups, 0);
          log(`probe total: ${pages} paid text-search-enterprise pages (${(pages * PLACES_SKUS['text-search-enterprise'].usd).toFixed(2)} USD at list price), ${lookups} rated Text Search lookups (${(lookups * PLACES_SKUS['text-search-enterprise'].usd).toFixed(2)} USD at list price), ${probes.reduce((a, p) => a + p.newPlaces, 0)} new place ids; quota ${PlacesQuota.fromLedger(flags.ledger ?? defaultLedgerPath(dataDir)).summary()}`);
          break;
        }
        const options = exportFlags();
        for (const k of kieze) {
          const reg = await exportKiez(db, k, { ...paths, scannedBy: by, provider: flags['fake-llm'] ? 'mixed' : provider(), models: ctx.models, force: flags.force ?? false, ...options });
          log(`[${k.slug}] export: ${reg.counts.restaurants} restaurants, ${reg.counts.dishes} dishes, ${reg.counts.images} KI-Bilder, ${reg.counts.skippedDuplicates} duplicates skipped; cost ${reg.costUsd.total} USD`);
        }
        log(`run cost: ${ctx.ledger.spentUsd.toFixed(2)} USD. Commit: apps/web/src/data/seed/pipeline/kiez/, apps/web/src/data/seed/pipeline/images/, pipeline/registry/`);
        break;
      }
      case 'export-kiez': {
        // Re-export finished Kieze (no API calls), e.g. after a run or to convert existing data.
        const paths = kiezPaths(dataDir);
        const by = scannedBy();
        const options = exportFlags();
        const llm = (flags.provider as LlmProvider | undefined) ?? 'anthropic';
        for (const k of selectedKieze()) {
          const reg = await exportKiez(db, k, { ...paths, scannedBy: by, provider: llm, models: modelsFor(llm), force: flags.force ?? false, ...options });
          log(`[${k.slug}] export: ${reg.counts.restaurants} restaurants, ${reg.counts.dishes} dishes, ${reg.counts.images} KI-Bilder, ${reg.counts.skippedDuplicates} duplicates skipped; cost ${reg.costUsd.total} USD`);
        }
        break;
      }
      case 'status':
        await printStatus(db, selectedKieze().map((k) => k.slug));
        break;
      case 'costs': {
        const rows = await costSummary(db, flags.run ? 'run_id = ?' : '1=1', flags.run ? [flags.run] : []);
        console.table(rows);
        break;
      }
      case 'review': {
        const ctx = await buildCtxForOffline(db, dataDir);
        if (sub === 'export') {
          const out = resolve(flags.out ?? join(dataDir, 'review'));
          for (const k of selectedKieze()) {
            const r = await exportReview(ctx, k, out);
            log(r ? `[${k.slug}] ${r.rows} rows -> ${r.file}` : `[${k.slug}] nothing new to review`);
          }
        } else if (sub === 'import') {
          if (!arg) throw new Error('usage: review import <file.csv>');
          console.log(JSON.stringify(await importReview(ctx, resolve(arg)), null, 2));
        } else throw new Error('usage: review export|import');
        break;
      }
      case 'seed': {
        const minStatus = (flags['min-status'] ?? 'approved') as RestaurantStatus;
        if (!STATUSES.includes(minStatus)) throw new Error(`--min-status must be one of ${STATUSES.join(', ')}`);
        const seed = await buildSeed(db, { minStatus, placeIds: committedPlaceIds(kiezPaths(dataDir).webSeedDir), ...(flags.kiez || flags.wave ? { kieze: selectedKieze().map((k) => k.slug) } : {}) });
        const out = resolve(flags.out ?? join(dataDir, 'seed.json'));
        mkdirSync(dirname(out), { recursive: true });
        if (flags.format === 'web') {
          // Compact bundle for apps/web/src/data/seed/pipeline.ts plus the referenced KI-Bild files.
          const web = toWebSeed(seed);
          writeFileSync(out, JSON.stringify(web) + '\n');
          const images = copyImages(imageKeys(web), join(dataDir, 'images'), resolve(flags['images-out'] ?? join(dirname(out), 'images')));
          log(`web seed: ${web.restaurants.length} restaurants, ${seed.dishes.length} dishes, ${images} images -> ${out}`);
        } else {
          writeFileSync(out, JSON.stringify(seed, null, 1) + '\n');
          log(`seed: ${seed.restaurants.length} restaurants, ${seed.dishes.length} dishes -> ${out}`);
        }
        break;
      }
      case 'publish': {
        // Upserts into the Worker's app tables (worker/migrations/0001_init.sql). Writes a SQL file for
        // `wrangler d1 execute <db> --file <file>`; with --d1 --apply it writes to that D1 database directly.
        const minStatus = (flags['min-status'] ?? 'image') as RestaurantStatus;
        const releaseStatus = (flags['release-status'] ?? 'approved') as RestaurantStatus;
        const res = await buildPublish(db, { minStatus, releaseStatus, placeIds: committedPlaceIds(kiezPaths(dataDir).webSeedDir), ...(flags.kiez || flags.wave ? { kieze: selectedKieze().map((k) => k.slug) } : {}) });
        if (flags.apply) {
          if (!flags.d1) throw new Error('--apply needs --d1 (the app tables live in the Worker database)');
          for (let i = 0; i < res.stmts.length; i += 50) await db.batch(res.stmts.slice(i, i + 50));
          log(`publish: applied ${res.stmts.length} statements to D1`);
        } else {
          const out = resolve(flags.out ?? join(dataDir, 'publish.sql'));
          mkdirSync(dirname(out), { recursive: true });
          writeFileSync(out, toSqlScript(res.stmts));
          log(`publish SQL -> ${out}`);
        }
        log(`publish: ${res.restaurants} menus (${res.published} restaurants released), ${res.dishes} dishes (${res.healthy} healthy)`);
        break;
      }
      case 'photo-coverage': {
        // Which published restaurants Google has photos for, and which visual each listed dish card gets.
        // --backfill then gives gone or missing place ids a new one (moved ones are only reported) (see coverage.ts) and measures again.
        const paths = kiezPaths(dataDir);
        const apiKey = requireEnv('GOOGLE_PLACES_API_KEY');
        const limiter = new Limiter('places', 4, 120);
        const measure = async () => {
          const published = publishedRestaurants(paths.webSeedDir);
          const status = await photoStatus(published.flatMap(({ restaurant }) => restaurant.placeId ? [restaurant.placeId] : []), apiKey, limiter);
          return { published, status, report: buildCoverage(published, status) };
        };
        let { published, status, report } = await measure();
        if (flags.backfill) {
          const ledgerPath = flags.ledger ?? defaultLedgerPath(dataDir);
          const ledger = new CostLedger(db, `place-ids-${Date.now()}`, ledgerPath, flags.budget != null ? Number(flags.budget) : 2, 'photo-coverage');
          const quota = PlacesQuota.fromLedger(ledgerPath, { dailyCalls: Number(flags['places-daily-calls'] ?? process.env.PIPELINE_PLACES_DAILY_CALLS ?? 400) });
          log(`Places quota: ${quota.summary()}`);
          const by = scannedBy();
          const owned = new Map<string, boolean>();
          const mayWrite = (slug: string): boolean => {
            if (!owned.has(slug)) {
              const def = KIEZE.find((k) => k.slug === slug);
              try {
                if (!def) throw new Error(`${slug} is not a known Kiez`);
                assertKiezOwner(paths.registryDir, def, by, flags.force ?? false);
                owned.set(slug, true);
              } catch (e) {
                log(`backfill skips ${slug}: ${e instanceof Error ? e.message : String(e)}`);
                owned.set(slug, false);
              }
            }
            return owned.get(slug)!;
          };
          const photos = placePhotoLookup(apiKey);
          reconcileRegistryPlaceIds(paths.webSeedDir, paths.registryDir, [...new Set(published.map((p) => p.kiez))].filter(mayWrite));
          const { changes, moved, unresolved, stoppedBy } = await backfillPlaceIds(published, status, new GooglePlaces(apiKey, ledger, limiter, fetch, quota), {
            photos: (id) => limiter.run(() => withRetry(() => photos(id))),
            writable: mayWrite,
            reserved: [
              ...readRegistries(paths.registryDir).flatMap((r) => r.places.flatMap((p) => (p.placeId ? [p.placeId] : []))),
              ...(await db.all<{ google_place_id: string }>('SELECT google_place_id FROM pipeline_restaurant WHERE google_place_id IS NOT NULL')).map((r) => r.google_place_id),
            ],
          });
          if (stoppedBy) log(`backfill stopped: ${stoppedBy}`);
          applyPlaceIdChanges(paths.webSeedDir, paths.registryDir, changes);
          for (const c of changes) {
            const rows = await db.all<{ id: string }>('SELECT id FROM pipeline_restaurant WHERE kiez = ?', [c.kiez]);
            for (const row of rows.filter((x) => webRestaurantId(x.id) === c.id)) await db.run('UPDATE pipeline_restaurant SET google_place_id = ? WHERE id = ?', [c.to, row.id]);
          }
          for (const c of changes) log(`[${c.kiez}] ${c.name}: place id ${c.from ?? '(none)'} -> ${c.to}`);
          for (const m of moved) log(`[${m.kiez}] ${m.name}: Google reports ${m.placeId} as moved to ${m.movedPlaceId}; not replaced, review it`);
          for (const u of unresolved) log(`[${u.kiez}] ${u.name}: no strict Places match, keeps the fallback`);
          log(`backfill: ${changes.length} place ids updated, ${unresolved.length} unresolved, ${ledger.spentUsd.toFixed(3)} USD at list price`);
          if (changes.length) ({ published, status, report } = await measure());
        }
        const out = resolve(flags.out ?? join(dataDir, 'photo-coverage.json'));
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
        console.log(coverageMarkdown(report));
        log(`photo coverage: ${report.restaurants.withGooglePhoto}/${report.restaurants.published} restaurants with a Google photo, ${report.attention.length} need attention -> ${out}`);
        break;
      }
      default:
        console.error('commands: scan | run | export-kiez | status | costs | review export|import | seed | publish | photo-coverage | migrate  (see src/cli.ts header)');
        process.exitCode = 2;
    }
  } finally {
    await db.close();
  }
}

/** Place Details (IDs only, free) for every published place id; 429 and 5xx are retried, other failures are reported per place. */
async function photoStatus(placeIds: string[], apiKey: string, limiter: Limiter): Promise<Map<string, PlacePhotoStatus>> {
  const lookup = placePhotoLookup(apiKey);
  const status = new Map<string, PlacePhotoStatus>();
  await mapPool([...new Set(placeIds)], 4, async (id) => {
    const s = await limiter.run(() => withRetry(() => lookup(id))).catch((e: unknown): PlacePhotoStatus => ({ state: 'error', message: e instanceof Error ? e.message : String(e) }));
    status.set(id, s);
  });
  return status;
}

/** Review commands need no API keys. */
async function buildCtxForOffline(db: Db, dataDir: string): Promise<Ctx> {
  const ledger = new CostLedger(db, 'review', null, 0);
  return { db, ledger, llm: new FakeLlm(fakeAnswer), images: new FakeImages(), osm: new OverpassOsm(), places: { searchTile: async () => ({ ids: [], candidates: [], nextPageToken: null }), lookupPlace: async () => [] }, menus: new WebsiteMenuFetcher(), models: DEFAULT_MODELS, opts: DEFAULT_OPTIONS, dataDir, log };
}

async function printStatus(db: Db, kieze: string[]) {
  const rows = (await kiezCounts({ db } as Ctx)).filter((r) => kieze.includes(r.kiez));
  const table: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const key = r.skip_reason ? `${r.status}:${r.skip_reason}` : r.status;
    (table[r.kiez] ??= {})[key] = r.n;
  }
  console.log(JSON.stringify(table, null, 1));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exitCode = 1;
});
