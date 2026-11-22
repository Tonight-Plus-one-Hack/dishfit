import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isHealthy, isPriorityCuisine, packDishClass, unpackDishClass } from '../../packages/contract/src/dish-class.ts';
import type { Ctx } from '../src/context.ts';
import { DEFAULT_MODELS, DEFAULT_OPTIONS } from '../src/context.ts';
import { dedupeDishes, type WebSeedDish } from '../src/export/web.ts';
import { CostLedger } from '../src/ledger.ts';
import { classifyAnswer } from '../src/llm/fake.ts';
import { FakeLlm } from '../src/llm/llm.ts';
import { classifyDishes, type ClassifyItem, dishHash, MemoryClassCache, stageClassify } from '../src/stages/classify.ts';
import { scanPriority } from '../src/stages/menu.ts';
import { migrate } from '../src/store/migrate.ts';
import { SqliteDb } from '../src/store/sqlite.ts';

const priorityOf = (cuisine: string[]) => scanPriority({ cuisine: JSON.stringify(cuisine), diet_vegan: null, website: 'x' });
const seedDish = (name: string, extra: Partial<WebSeedDish> = {}): WebSeedDish => ({
  id: name, name, description: '', price: 5, category: 'Tapas', n: [], confidence: 'low', source: 'ai', method: 0, model: null, ingredients: [],
  healthScore: 50, proteinPerEuro: null, diet: [], image: null, ...extra,
});
const item = (name: string, restaurant = 'King King', section = ''): ClassifyItem => ({ name, description: '', section, restaurant, restaurantCuisine: ['asian'] });

describe('classify', () => {
  it('classifies in batches, caches by dish hash and never pays twice', async () => {
    const llm = new FakeLlm(classifyAnswer);
    const cache = new MemoryClassCache();
    const items = [item('Edamame', 'King King', 'Tapas'), item('Pho Bo'), item('Teriyaki Bowl'), item('Pommes', 'Other')];
    const first = await classifyDishes(llm, items, { model: 'claude-haiku-5-5', cache });
    assert.equal(llm.calls.length, 1, 'small menus share one call');
    assert.equal(llm.calls[0]!.stage, 'classify');
    assert.deepEqual(first.map((c) => c?.course), ['starter', 'soup', 'main', 'side']);
    assert.equal(first[0]!.isFullMeal, false);
    const again = await classifyDishes(llm, items, { model: 'claude-haiku-5-5', cache });
    assert.equal(llm.calls.length, 1, 'second run is served from the cache');
    assert.deepEqual(again, first);
    assert.notEqual(dishHash(items[0]!), dishHash({ ...items[0]!, description: 'mit Salz' }));
  });

  it('drops answers outside the enums instead of storing them', async () => {
    const llm = new FakeLlm(() => ({ items: [{ index: 0, course: 'entree', dishType: 'bowl', cuisine: 'thai', vegan: false, vegetarian: false, glutenFree: false, isFullMeal: true, fried: false, creamy: false, sugary: false, confidence: 'high' }] }));
    const [c] = await classifyDishes(llm, [item('Mystery')], { model: 'm', cache: new MemoryClassCache() });
    assert.equal(c, null);
  });

  it('stage writes the class and hash, and re-runs only changed dishes', async () => {
    const db = new SqliteDb(':memory:');
    await migrate(db);
    await db.run("INSERT INTO pipeline_restaurant (id, kiez, osm_id, name, lat, lng, cuisine, amenity, osm_fetched_at) VALUES ('r1', 'kreuzberg', 'node/1', 'King King', 52.5, 13.4, '[\"asian\"]', 'restaurant', 'now')");
    await db.run("INSERT INTO pipeline_dish (id, restaurant_id, position, name, section, category) VALUES ('d1', 'r1', 0, 'Edamame', 'Tapas', 'starter'), ('d2', 'r1', 1, 'Teriyaki Bowl', 'Bowls', 'bowl')");
    const llm = new FakeLlm(classifyAnswer);
    const ctx = { db, llm, ledger: new CostLedger(db, 't', null, null), models: DEFAULT_MODELS, opts: DEFAULT_OPTIONS, log: () => {} } as unknown as Ctx;
    const kiez = { slug: 'kreuzberg', name: 'Kreuzberg' } as never;
    assert.equal((await stageClassify(ctx, kiez)).dishes, 2);
    const rows = await db.all<{ id: string; dish_class: string }>('SELECT id, dish_class FROM pipeline_dish ORDER BY id');
    assert.equal(JSON.parse(rows[0]!.dish_class).course, 'starter');
    assert.equal(JSON.parse(rows[1]!.dish_class).dishType, 'bowl');
    assert.deepEqual(await stageClassify(ctx, kiez), { kiez: 'kreuzberg', dishes: 0, cached: 2 });
    assert.equal(llm.calls.length, 1);
  });
});

describe('healthy rule', () => {
  const main = unpackDishClass(['main', 'bowl', 'japanese', 8, 'high']);
  it('keeps a lean protein main and hides fast food, sweets and calorie bombs', () => {
    assert.ok(isHealthy({ cls: main, kcal: 620, proteinG: 38 }));
    assert.ok(!isHealthy({ cls: main, kcal: 980, proteinG: 45 }), 'over 750 kcal');
    assert.ok(!isHealthy({ cls: main, kcal: 600, proteinG: 15 }), 'under 20 g protein');
    assert.ok(!isHealthy({ cls: { ...main, dishType: 'pizza' }, kcal: 600, proteinG: 30 }));
    assert.ok(!isHealthy({ cls: { ...main, creamy: true }, kcal: 600, proteinG: 30 }));
    assert.ok(!isHealthy({ cls: null, kcal: 600, proteinG: 30 }), 'unclassified stays hidden');
  });

  it('packs the class into the compact seed tuple and back', () => {
    const c = { ...main, vegan: true, vegetarian: true, glutenFree: true };
    assert.deepEqual(unpackDishClass(packDishClass(c)), c);
  });

  it('scans healthy cuisines first and fast food last', () => {
    assert.ok(isPriorityCuisine(['poke']));
    assert.ok(priorityOf(['vietnamese']) > priorityOf(['german']));
    assert.ok(priorityOf(['german']) > priorityOf(['pizza']));
  });
});

describe('dedupe', () => {
  it('keeps one dish per normalised name, the best-sourced copy, at the first position', () => {
    const out = dedupeDishes([seedDish('Edamame'), seedDish('Pho'), seedDish('EDAMAME ', { id: 'better', confidence: 'high' })]);
    assert.deepEqual(out.map((x) => x.id), ['better', 'Pho']);
  });
});
