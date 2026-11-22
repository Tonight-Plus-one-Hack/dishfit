// Backfill: classifies every dish of the committed web seeds (apps/web/src/data/seed/pipeline/kiez/*.json)
// with the classify stage's classifier, writes the compact class tuple `c` into each dish and drops
// duplicate dishes (same normalised name in one restaurant, best-sourced copy kept).
//   node scripts/classify-seed.ts [--env-dir <dir>] [--cache <file>] [--budget 8] [--model claude-haiku-5-5] [--dry]
// Results are cached by dish hash (--cache), so a re-run only pays for new or changed dishes.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { packDishClass } from '../../packages/contract/src/dish-class.ts';
import { defaultLedgerPath, PIPELINE_ROOT } from '../src/context.ts';
import { dedupeDishes, type WebSeed } from '../src/export/web.ts';
import { CostLedger } from '../src/ledger.ts';
import { AnthropicLlm } from '../src/llm/llm.ts';
import { classifyDishes, type ClassifyItem, FileClassCache } from '../src/stages/classify.ts';
import { migrate } from '../src/store/migrate.ts';
import { SqliteDb } from '../src/store/sqlite.ts';
import { loadPipelineKeys } from '../src/util/env.ts';
import { Limiter } from '../src/util/limiter.ts';

const { values: flags } = parseArgs({
  options: {
    'env-dir': { type: 'string' },
    cache: { type: 'string', default: join(PIPELINE_ROOT, '.data', 'dish-class-cache.json') },
    budget: { type: 'string', default: '8' },
    model: { type: 'string', default: 'claude-haiku-5-5' },
    seeds: { type: 'string', default: join(PIPELINE_ROOT, '..', 'apps', 'web', 'src', 'data', 'seed', 'pipeline', 'kiez') },
    dry: { type: 'boolean', default: false },
  },
});

loadPipelineKeys(PIPELINE_ROOT, flags['env-dir'] ? { envDir: flags['env-dir'] } : {});
const db = new SqliteDb(':memory:');
await migrate(db);
const ledger = new CostLedger(db, `classify-${Date.now()}`, defaultLedgerPath(join(PIPELINE_ROOT, '.data')), Number(flags.budget), 'dish-db-backfill');
const cache = new FileClassCache(flags.cache!);
const files = readdirSync(flags.seeds!).filter((f) => f.endsWith('.json')).toSorted();

let total = 0;
let dropped = 0;
for (const f of files) {
  const path = join(flags.seeds!, f);
  const seed = JSON.parse(readFileSync(path, 'utf8')) as WebSeed;
  for (const r of seed.restaurants) {
    const before = r.dishes.length;
    r.dishes = dedupeDishes(r.dishes);
    dropped += before - r.dishes.length;
  }
  const flat = seed.restaurants.flatMap((r) => r.dishes.map((d) => ({ r, d })));
  const items: ClassifyItem[] = flat.map(({ r, d }) => ({
    name: d.name, description: d.description, section: d.category, restaurant: r.name, restaurantCuisine: r.cuisine, kcal: d.n[0] ?? null,
  }));
  console.log(`${f}: ${items.length} dishes`);
  if (flags.dry) continue;
  const llm = new AnthropicLlm(process.env.ANTHROPIC_API_KEY ?? '', ledger, new Limiter('anthropic', 8));
  const classes = await classifyDishes(llm, items, {
    model: flags.model!, cache, concurrency: 8, kiez: f.replace(/\.json$/, ''),
    onBatch: (done, n) => { if (done === n || done % 200 < 40) console.log(`  ${done}/${n} classified, ${ledger.spentUsd.toFixed(4)} USD so far`); },
  }).finally(() => cache.save());
  flat.forEach(({ d }, i) => {
    const c = classes[i];
    if (c) d.c = packDishClass(c);
  });
  total += items.length;
  writeFileSync(path, JSON.stringify(seed) + '\n');
}
cache.save();
console.log(`classified ${total} dishes, dropped ${dropped} duplicates, cost ${ledger.spentUsd.toFixed(4)} USD, cache ${cache.size}`);
