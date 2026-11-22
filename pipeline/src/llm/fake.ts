// Deterministic offline answers for every pipeline prompt: lets the whole pipeline run end to end
// without API keys or cost (tests, dry runs, CI).
import type { LlmRequest } from './llm.ts';

const PRICE_LINE = /^(.{4,80}?)\s+(?:€\s?)?(\d{1,2}[.,]\d{1,2})\s?(?:€|eur)?\s*$/i;

function menuAnswer(req: LlmRequest) {
  const text = req.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  const dishes: unknown[] = [];
  let sourceIndex = 1;
  for (const line of text.split('\n')) {
    const document = /^Document (\d+): /.exec(line);
    if (document) sourceIndex = Number(document[1]);
    const m = PRICE_LINE.exec(line.trim());
    if (!m) continue;
    const name = m[1]!.replace(/[.\s-]+$/, '').trim();
    if (!/[a-zäöü]{3}/i.test(name)) continue;
    const lower = name.toLowerCase();
    const category = /bowl/.test(lower) ? 'bowl' : /salat|salad/.test(lower) ? 'salad' : /suppe|soup|pho|ramen/.test(lower) ? 'soup' : /burger/.test(lower) ? 'burger' : /wrap/.test(lower) ? 'wrap' : 'main';
    dishes.push({ name, description: '', section: 'Menu', description_de: '', section_de: 'Speisekarte', category, price_eur: Number(m[2]!.replace(',', '.')), printed_kcal: null, printed_protein_g: null, printed_carbs_g: null, printed_fat_g: null, source_index: sourceIndex });
  }
  const isMenu = dishes.length > 0;
  return { is_menu: isMenu, reason: isMenu ? 'price list with dishes' : 'no dishes with prices found', menu_language: 'de', notes: 'fake extraction', dishes };
}

function recipeAnswer(req: LlmRequest) {
  const text = req.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  const dishes = text.split('\n').map((l) => /^(\d+)\.\s+(.*)$/.exec(l)).filter((m): m is RegExpExecArray => !!m).map((m) => {
    const name = m[2]!.toLowerCase();
    const protein = /lachs|salmon/.test(name) ? 'salmon_cooked' : /rind|beef/.test(name) ? 'beef_steak_cooked' : /tofu/.test(name) ? 'tofu_firm' : /falafel/.test(name) ? 'falafel' : /halloumi/.test(name) ? 'cheese_halloumi' : 'chicken_breast_cooked';
    const base = /salat|salad/.test(name) ? 'lettuce_romaine' : /burger/.test(name) ? 'burger_bun' : /nudel|noodle|pasta|pho|ramen/.test(name) ? 'rice_noodles_cooked' : 'rice_white_cooked';
    return {
      index: Number(m[1]),
      ingredients: [
        { food: base, grams: base === 'burger_bun' ? 80 : 200, note: '' },
        { food: protein, grams: 120, note: '' },
        { food: 'bell_pepper', grams: 60, note: '' },
        { food: 'cucumber', grams: 50, note: '' },
        { food: 'vegetable_oil', grams: 10, note: 'cooking oil' },
        { food: 'mayonnaise', grams: 25, note: 'sauce' },
      ],
      recipe_confidence: 'medium',
      portion_note: 'fake standard portion',
    };
  });
  return { dishes };
}

function chiefAnswer(req: LlmRequest) {
  const text = req.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  const json = text.slice(text.indexOf('['));
  const list = JSON.parse(json) as { restaurant_id: string; flagged_count: number; dishes: number }[];
  return {
    restaurants: list.map((r) => ({
      restaurant_id: r.restaurant_id,
      verdict: r.flagged_count > r.dishes / 2 ? 'needs_review' : 'ok',
      confidence: r.flagged_count ? 'medium' : 'high',
      note: 'fake chief verdict',
    })),
  };
}

function translateAnswer(req: LlmRequest) {
  const text = req.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  const items = JSON.parse(text.slice(text.indexOf('['))) as { index: number; description: string; section: string }[];
  return { items: items.map((i) => ({ index: i.index, description_de: i.description, section_de: i.section ? `${i.section} (DE)` : '' })) };
}

/** Keyword classes: sides, drinks and desserts by name, everything else a whole main. */
export function classifyAnswer(req: LlmRequest) {
  const text = req.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  const items = JSON.parse(text.slice(text.indexOf('['))) as { index: number; name: string; section: string }[];
  return {
    items: items.map((i) => {
      const t = `${i.section} ${i.name}`.toLowerCase();
      const [course, dishType, isFullMeal] =
        /pommes|fries/.test(t) ? ['side', 'fried_snack', false]
        : /edamame|dip|hummus/.test(t) ? ['starter', 'dip_spread', false]
        : /limo|cola|drink/.test(t) ? ['drink', 'drink', false]
        : /kuchen|cake|dessert/.test(t) ? ['dessert', 'dessert', false]
        : /salat|salad/.test(t) ? ['salad', 'salad', true]
        : /suppe|soup|pho|ramen/.test(t) ? ['soup', 'ramen_noodles', true]
        : /burger/.test(t) ? ['main', 'burger', true]
        : /pizza/.test(t) ? ['main', 'pizza', true]
        : /wrap/.test(t) ? ['main', 'wrap', true]
        : ['main', 'bowl', true];
      const vegan = /vegan|tofu/.test(t);
      return {
        index: i.index, course, dishType, cuisine: 'international', vegan, vegetarian: vegan || /falafel|halloumi/.test(t), glutenFree: false,
        isFullMeal, fried: dishType === 'fried_snack', creamy: false, sugary: course === 'dessert', confidence: 'medium',
      };
    }),
  };
}

export function fakeAnswer(req: LlmRequest): unknown {
  if (req.purpose.startsWith('translate')) return translateAnswer(req);
  if (req.purpose.startsWith('classify')) return classifyAnswer(req);
  if (req.stage === 'menu') return menuAnswer(req);
  if (req.purpose.startsWith('kiez-chief')) return chiefAnswer(req);
  return recipeAnswer(req);
}
