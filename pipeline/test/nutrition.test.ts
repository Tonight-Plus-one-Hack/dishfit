import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeNutrition, healthScore, proteinPerEuro, RANGE_MARGIN, relDiff, sumIngredients } from '../src/nutrition/calc.ts';
import { foodIndex, loadFoods, resolveFood } from '../src/nutrition/foods.ts';

describe('food table', () => {
  const table = loadFoods();

  it('has unique keys and complete per-100 g macros', () => {
    const keys = new Set<string>();
    for (const f of table.foods) {
      assert.ok(!keys.has(f.key), `duplicate ${f.key}`);
      keys.add(f.key);
      for (const v of Object.values(f.per100g)) assert.ok(Number.isFinite(v) && v >= 0, `${f.key} has a bad value`);
      assert.ok(f.source === 'composite-usda' || (f.fdcId ?? 0) > 0, `${f.key} has no FDC id`);
    }
    assert.ok(table.foods.length >= 150);
  });

  it('energy is consistent with Atwater factors (4/4/9) within tolerance', () => {
    for (const f of table.foods) {
      const { kcal, protein, carbs, fat } = f.per100g;
      if (kcal < 40 || f.per100g.fiber > 15) continue; // herbs, broth, spices: rounding and fibre dominate
      const atwater = protein * 4 + carbs * 4 + fat * 9;
      assert.ok(Math.abs(atwater - kcal) / kcal < 0.25, `${f.key}: ${kcal} kcal vs ${atwater.toFixed(0)} from macros`);
    }
  });

  it('resolves keys, German aliases and descriptive names', () => {
    assert.equal(resolveFood('chicken_breast_cooked')?.key, 'chicken_breast_cooked');
    assert.equal(resolveFood('Kichererbsen')?.key, 'chickpeas_cooked');
    assert.equal(resolveFood('Hähnchenbrust')?.key, 'chicken_breast_cooked');
    assert.equal(resolveFood('grilled chicken breast')?.key, 'chicken_breast_cooked');
    assert.equal(resolveFood('unicorn steak'), null);
  });
});

describe('computeNutrition', () => {
  const bowl = [
    { food: 'rice_white_cooked', grams: 200 },
    { food: 'chicken_breast_cooked', grams: 120 },
    { food: 'broccoli_cooked', grams: 80 },
    { food: 'olive_oil', grams: 10 },
  ];

  it('sums ingredient grams against the USDA rows', () => {
    const idx = foodIndex();
    const expected = bowl.reduce((a, i) => a + (idx.get(i.food)!.per100g.kcal * i.grams) / 100, 0);
    const n = computeNutrition({ ingredients: bowl, recipeConfidence: 'medium', priceEur: 12 });
    assert.equal(n.totals.kcal, Math.round(expected));
    assert.equal(n.source, 'ai');
    assert.equal(n.confidence, 'medium');
    assert.equal(n.totalGrams, 410);
    // 200 g rice (2.69 g/100 g) + 120 g chicken (31.02 g/100 g) + broccoli + oil
    assert.ok(n.totals.protein > 42 && n.totals.protein < 45, `protein ${n.totals.protein}`);
  });

  it('builds the range from the confidence margin', () => {
    const n = computeNutrition({ ingredients: bowl, recipeConfidence: 'medium', priceEur: null });
    const m = RANGE_MARGIN.medium;
    assert.ok(Math.abs(n.range.kcal.min - n.totals.kcal * (1 - m)) <= 10);
    assert.ok(Math.abs(n.range.kcal.max - n.totals.kcal * (1 + m)) <= 10);
    assert.equal(n.proteinPerEuro, null);
  });

  it('computes protein per euro from the lower end of the protein range', () => {
    const n = computeNutrition({ ingredients: bowl, recipeConfidence: 'high', priceEur: 10 });
    assert.equal(n.proteinPerEuro, Math.round((n.range.protein.min / 10) * 10) / 10);
    assert.equal(proteinPerEuro(30, 0), null);
  });

  it('official values replace the estimate with a narrow range and high confidence', () => {
    const n = computeNutrition({ ingredients: bowl, recipeConfidence: 'low', priceEur: 11, printed: { kcal: 806, protein: 27, carbs: 70, fat: 46 } });
    assert.equal(n.source, 'official');
    assert.equal(n.confidence, 'high');
    assert.equal(n.totals.kcal, 806);
    assert.equal(n.totals.fat, 46);
    assert.ok(n.range.kcal.max - n.range.kcal.min <= 90);
  });

  it('lowers confidence for unmatched ingredients and tiny portions', () => {
    const someUnknown = computeNutrition({ ingredients: [...bowl, { food: 'mystery_sauce', grams: 60 }], recipeConfidence: 'high', priceEur: null });
    assert.equal(someUnknown.confidence, 'medium');
    assert.deepEqual(someUnknown.unmatched, ['mystery_sauce']);
    const mostlyUnknown = computeNutrition({ ingredients: [{ food: 'mystery', grams: 300 }, { food: 'rice_white_cooked', grams: 100 }], recipeConfidence: 'high', priceEur: null });
    assert.equal(mostlyUnknown.confidence, 'low');
    const tiny = computeNutrition({ ingredients: [{ food: 'hummus', grams: 80 }], recipeConfidence: 'high', priceEur: null });
    assert.equal(tiny.confidence, 'low');
  });

  it('tracks vegetable share by weight', () => {
    const s = sumIngredients([{ food: 'lettuce_romaine', grams: 100 }, { food: 'chickpeas_cooked', grams: 100 }, { food: 'feta', grams: 0 }, { food: 'pasta_cooked', grams: 200 }]);
    assert.equal(s.totalGrams, 400);
    const n = computeNutrition({ ingredients: [{ food: 'lettuce_romaine', grams: 100 }, { food: 'chickpeas_cooked', grams: 100 }, { food: 'pasta_cooked', grams: 200 }], recipeConfidence: 'medium', priceEur: null });
    assert.equal(n.vegShare, 0.5);
  });
});

describe('healthScore', () => {
  it('rewards a lean, vegetable-heavy bowl over fries with mayo', () => {
    const bowl = computeNutrition({ ingredients: [{ food: 'quinoa_cooked', grams: 150 }, { food: 'chicken_breast_cooked', grams: 120 }, { food: 'kale', grams: 80 }, { food: 'chickpeas_cooked', grams: 80 }, { food: 'olive_oil', grams: 8 }], recipeConfidence: 'medium', priceEur: 12 });
    const fries = computeNutrition({ ingredients: [{ food: 'fries', grams: 250 }, { food: 'mayonnaise', grams: 50 }, { food: 'sausage_pork_cooked', grams: 150 }], recipeConfidence: 'medium', priceEur: 8 });
    assert.ok(bowl.healthScore > fries.healthScore + 30, `${bowl.healthScore} vs ${fries.healthScore}`);
    assert.ok(bowl.healthScore <= 100 && fries.healthScore >= 0);
  });

  it('is 0 for an empty dish', () => {
    assert.equal(healthScore({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, satFat: 0, sodiumMg: 0 }, 0, 0), 0);
  });

  it('relDiff is symmetric and bounded', () => {
    assert.equal(relDiff(100, 80), relDiff(80, 100));
    assert.equal(relDiff(0, 0), 0);
    assert.equal(relDiff(100, 80), 0.2);
  });
});
