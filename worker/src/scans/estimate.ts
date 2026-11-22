/**
 * Private camera scans: what the model reads from a menu photo or a plate photo, as ranges.
 * The provider calls go through the community review's model wrapper (worker/src/community/model.ts,
 * shared with PR #33); the mock here answers offline so local dev and tests never spend money.
 */
import { stripMenuNumber } from "@wohin/contract";
import { AnthropicModel, OpenAiModel, type ModelRequest, type ModelUsage, type ReviewModel } from "../community/model";

export type ScanKind = "menu" | "plate";

/** A nutrient estimate: the middle of the range and the range itself. */
export type Range = { value: number; low: number; high: number };
export type Nutrients = { kcal: Range; protein: Range; carbs: Range; fat: Range };
export type Confidence = "low" | "medium" | "high";

export type PlateReading = { name: string; items: string[]; nutrients: Nutrients; confidence: Confidence; note: string | null };
export type MenuDish = { name: string; description: string | null; priceEur: number | null; nutrients: Nutrients };
export type MenuReading = { restaurantName: string | null; dishes: MenuDish[] };

export type ScanReading = { kind: "plate"; plate: PlateReading } | { kind: "menu"; menu: MenuReading };

/** The photo shows no food (plate) or no menu (menu); the guest sees the reason. */
export class NotRecognizedError extends Error {
  constructor(
    message: string,
    readonly usage: ModelUsage | null,
  ) {
    super(message);
  }
}

export type ScanEnv = {
  APP_ENV?: string;
  /** mock | auto (Anthropic first, else OpenAI) | openai (OpenAI only) | off. Default: mock in dev, auto elsewhere. */
  SCAN_AI_MODE?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
};

export const MAX_MENU_DISHES = 40;

/** The model for this environment, or null when scans are off or no key is set. */
export function scanModel(env: ScanEnv, fetchImpl?: typeof fetch): ReviewModel | null {
  const mode = env.SCAN_AI_MODE?.trim().toLowerCase() || (env.APP_ENV === "dev" ? "mock" : "auto");
  const openai = env.OPENAI_API_KEY?.trim();
  if (mode === "mock") return new MockScanModel();
  if (mode === "openai") return openai ? new OpenAiModel(openai, fetchImpl) : null;
  if (mode !== "auto") return null;
  const anthropic = env.ANTHROPIC_API_KEY?.trim();
  if (anthropic) return new AnthropicModel(anthropic, fetchImpl);
  if (openai) return new OpenAiModel(openai, fetchImpl);
  return null;
}

// ---------------------------------------------------------------------------
// Prompts and schemas
// ---------------------------------------------------------------------------

const RANGE_FIELDS = ["kcal_low", "kcal_high", "protein_low", "protein_high", "carbs_low", "carbs_high", "fat_low", "fat_high"] as const;
type RangeFields = Record<(typeof RANGE_FIELDS)[number], number>;
const rangeProps = Object.fromEntries(RANGE_FIELDS.map((f) => [f, { type: "number" }]));

const PLATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_food", "reason", "name", "items", "confidence", "note", ...RANGE_FIELDS],
  properties: {
    is_food: { type: "boolean" },
    reason: { type: "string" },
    name: { type: "string" },
    items: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    note: { type: "string" },
    ...rangeProps,
  },
};

const MENU_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_menu", "reason", "restaurant_name", "dishes"],
  properties: {
    is_menu: { type: "boolean" },
    reason: { type: "string" },
    restaurant_name: { type: ["string", "null"] },
    dishes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "price_eur", ...RANGE_FIELDS],
        properties: { name: { type: "string" }, description: { type: ["string", "null"] }, price_eur: { type: ["number", "null"] }, ...rangeProps },
      },
    },
  },
};

const PLATE_SYSTEM = `You estimate the nutrition of the meal in a photo for a German nutrition app.
Identify the food and its visible portion size (plate size, cutlery and hands are scale hints).
Give honest ranges per serving shown: kcal, protein, carbs and fat in grams. Wider ranges when oil, sauces or hidden ingredients are uncertain.
Answer in German for name, items and note. items: the main components with estimated grams, e.g. "Reis (ca. 180 g)".
If the photo shows no food, set is_food false, give a short German reason and zeros.`;

const MENU_SYSTEM = `You read restaurant menus from photos for a German nutrition app.
List every dish you can read (at most ${MAX_MENU_DISHES}, skip drinks), with the printed name, a short description if printed, and the price in EUR if printed.
For each dish estimate one typical restaurant serving: ranges for kcal, protein, carbs and fat in grams. Use printed values when the menu has them.
Keep names as printed; descriptions in German.
If the photo is not a menu, set is_menu false, give a short German reason and no dishes.`;

// ---------------------------------------------------------------------------
// Normalising the model's answer
// ---------------------------------------------------------------------------

const clamp = (n: unknown, max: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.min(max, Math.max(0, v));
};

function range(lowRaw: unknown, highRaw: unknown, max: number): Range {
  let low = Math.round(clamp(lowRaw, max));
  let high = Math.round(clamp(highRaw, max));
  if (low > high) [low, high] = [high, low];
  return { value: Math.round((low + high) / 2), low, high };
}

export function nutrientsOf(r: Partial<RangeFields>): Nutrients {
  return {
    kcal: range(r.kcal_low, r.kcal_high, 5000),
    protein: range(r.protein_low, r.protein_high, 400),
    carbs: range(r.carbs_low, r.carbs_high, 800),
    fat: range(r.fat_low, r.fat_high, 400),
  };
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

type PlateOut = RangeFields & { is_food: boolean; reason: string; name: string; items: string[]; confidence: string; note: string };
type MenuOut = { is_menu: boolean; reason: string; restaurant_name: string | null; dishes: Array<RangeFields & { name: string; description: string | null; price_eur: number | null }> };

export function plateFrom(out: PlateOut): PlateReading {
  return {
    name: text(out.name, 120) || "Mahlzeit",
    items: (Array.isArray(out.items) ? out.items : []).map((i) => text(i, 80)).filter(Boolean).slice(0, 12),
    nutrients: nutrientsOf(out),
    confidence: out.confidence === "high" || out.confidence === "low" ? out.confidence : "medium",
    note: text(out.note, 300) || null,
  };
}

export function menuFrom(out: MenuOut): MenuReading {
  const dishes = (Array.isArray(out.dishes) ? out.dishes : [])
    .map((d) => {
      const price = typeof d.price_eur === "number" && Number.isFinite(d.price_eur) && d.price_eur > 0 && d.price_eur < 500 ? Math.round(d.price_eur * 100) / 100 : null;
      return { name: stripMenuNumber(text(d.name, 120)), description: text(d.description, 300) || null, priceEur: price, nutrients: nutrientsOf(d) };
    })
    .filter((d) => d.name.length > 0)
    .slice(0, MAX_MENU_DISHES);
  return { restaurantName: text(out.restaurant_name, 120) || null, dishes };
}

/** Reads one photo. Throws NotRecognizedError for a photo without food or menu, ModelError for provider failures. */
export async function readScan(
  model: ReviewModel,
  kind: ScanKind,
  image: { mediaType: string; base64: string },
): Promise<{ reading: ScanReading; usage: ModelUsage | null }> {
  // The shared wrapper's purpose only steers the community mock; scans bring their own mock.
  const base: Omit<ModelRequest, "schema" | "system" | "text" | "maxTokens"> = { purpose: "community_menu", image };
  if (kind === "plate") {
    const { data, usage } = await model.json<PlateOut>({ ...base, system: PLATE_SYSTEM, text: "Schätze diese Mahlzeit.", schema: PLATE_SCHEMA, maxTokens: 1200 });
    if (!data.is_food) throw new NotRecognizedError(text(data.reason, 200) || "Auf dem Foto ist kein Essen zu erkennen.", usage);
    return { reading: { kind, plate: plateFrom(data) }, usage };
  }
  const { data, usage } = await model.json<MenuOut>({ ...base, system: MENU_SYSTEM, text: "Lies diese Speisekarte.", schema: MENU_SCHEMA, maxTokens: 6000 });
  const menu = menuFrom(data);
  if (!data.is_menu || menu.dishes.length === 0) throw new NotRecognizedError(text(data.reason, 200) || "Auf dem Foto ist keine Speisekarte zu erkennen.", usage);
  return { reading: { kind, menu }, usage };
}

const r = (kcal: [number, number], p: [number, number], c: [number, number], f: [number, number]): RangeFields => ({
  kcal_low: kcal[0],
  kcal_high: kcal[1],
  protein_low: p[0],
  protein_high: p[1],
  carbs_low: c[0],
  carbs_high: c[1],
  fat_low: f[0],
  fat_high: f[1],
});

/** Offline answers: every plate is the same bowl, every menu the same four dishes. */
export class MockScanModel implements ReviewModel {
  readonly provider = "mock" as const;

  async json<T>(req: ModelRequest): Promise<{ data: T; usage: null }> {
    if (req.schema === PLATE_SCHEMA) {
      const data: PlateOut = {
        is_food: true,
        reason: "",
        name: "Hähnchen-Reis-Bowl",
        items: ["Reis (ca. 180 g)", "Hähnchenbrust (ca. 120 g)", "Brokkoli (ca. 80 g)", "Sesam-Dressing (ca. 15 g)"],
        confidence: "medium",
        note: "Demo-Schätzung ohne KI (Mock-Modus).",
        ...r([560, 700], [40, 50], [65, 85], [12, 20]),
      };
      return { data: data as T, usage: null };
    }
    const data: MenuOut = {
      is_menu: true,
      reason: "",
      restaurant_name: "Demo-Karte",
      dishes: [
        { name: "Hähnchen-Bowl", description: "Reis, gegrilltes Hähnchen, Edamame, Gurke, Sesam", price_eur: 11.9, ...r([580, 720], [38, 48], [70, 88], [14, 22]) },
        { name: "Falafel-Teller", description: "Falafel, Hummus, Salat, Pita", price_eur: 9.5, ...r([650, 820], [20, 28], [80, 100], [25, 36]) },
        { name: "Rote Linsensuppe", description: "Linsen, Karotte, Zitrone", price_eur: 6.5, ...r([300, 400], [16, 22], [42, 55], [6, 11]) },
        { name: "Lachs-Poke", description: "Sushi-Reis, Lachs, Avocado, Mango", price_eur: 13.9, ...r([620, 760], [30, 38], [70, 85], [20, 30]) },
      ],
    };
    return { data: data as T, usage: null };
  }
}
