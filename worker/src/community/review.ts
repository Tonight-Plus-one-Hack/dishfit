/**
 * The review agent for one community submission. It reuses the pipeline's stages instead of
 * re-implementing them:
 * - menu extraction: MENU_SYSTEM and MENU_SCHEMA from pipeline/src/stages/menu.ts (vision on the photo),
 *   extended with the moderation fields the rules need (faces, inappropriate content, printed name),
 * - nutrition: recipeSystem/recipeSchema/recipePrompt/cleanIngredients from stages/nutrition.ts and
 *   computeNutrition (ingredients + grams -> USDA values) from nutrition/calc.ts,
 * - checks: dishFlags from stages/check.ts,
 * then decides with ./rules.ts and publishes, queues or rejects.
 */
import { DISH_CATEGORIES, type Ingredient, type NutritionResult } from "../../../pipeline/src/types.ts";
import { MENU_SCHEMA, MENU_SYSTEM } from "../../../pipeline/src/stages/menu.ts";
import { cleanIngredients, recipePrompt, recipeSchema, recipeSystem, type DishRow as PipelineDishRow } from "../../../pipeline/src/stages/nutrition.ts";
import { dishFlags } from "../../../pipeline/src/stages/check.ts";
import { computeNutrition } from "../../../pipeline/src/nutrition/calc.ts";
import { useFoodTable, type FoodTable } from "../../../pipeline/src/nutrition/foods.ts";
import { kiezAt, distanceMeters, useKiezShapes, type KiezFeatureCollection } from "../../../pipeline/src/kiez.ts";
import foods from "../../../pipeline/data/foods.json";
import kiezeGeoText from "../../../pipeline/data/kieze.geojson";
import { budgetExhausted, dailyBudgetUsd, recordUsage, costMicros, startOfUtcDay, type UsageRecord } from "../lib/ai-usage";
import { photoStore } from "../lib/photo-store";
import { AnthropicModel, MockModel, ModelError, OpenAiModel, type ModelUsage, type ReviewModel } from "./model";
import { decide, nameSimilarity, type Decision, type MenuReading } from "./rules";
import { isKiezSlug, type KiezSlug } from "@wohin/contract";

useFoodTable(foods as unknown as FoodTable);
useKiezShapes(JSON.parse(kiezeGeoText) as KiezFeatureCollection);

/** At most this many dishes go into the recipe call (cost cap per submission). */
export const MAX_REVIEW_DISHES = 25;

const COMMUNITY_SYSTEM = `${MENU_SYSTEM}

This photo was taken by a guest of the app, not published by the restaurant. Also report:
restaurant_name_on_menu: the restaurant name printed on the menu, or null when none is visible.
cuisine: the cuisine the menu suggests as one lowercase OpenStreetMap cuisine value (e.g. vietnamese, italian, burger), or null when unclear.
faces: true when a human face or an identifiable person is visible anywhere in the photo.
inappropriate: true for sexual, violent, hateful or otherwise inappropriate content, or text that is not a menu but an attack or advertisement.
legibility: high when names and prices are clearly readable, medium when some are uncertain, low when much is guessed.`;

const READING_SCHEMA = {
  ...MENU_SCHEMA,
  required: [...MENU_SCHEMA.required, "restaurant_name_on_menu", "cuisine", "faces", "inappropriate", "legibility"],
  properties: {
    ...MENU_SCHEMA.properties,
    restaurant_name_on_menu: { type: ["string", "null"] },
    cuisine: { type: ["string", "null"] },
    faces: { type: "boolean" },
    inappropriate: { type: "boolean" },
    legibility: { type: "string", enum: ["high", "medium", "low"] },
  },
};

type ReadingOut = {
  is_menu: boolean;
  reason: string;
  restaurant_name_on_menu: string | null;
  cuisine: string | null;
  faces: boolean;
  inappropriate: boolean;
  legibility: "high" | "medium" | "low";
  dishes: {
    name: string;
    description: string;
    section: string;
    description_de: string;
    section_de: string;
    category: string;
    price_eur: number | null;
    printed_kcal: number | null;
    printed_protein_g: number | null;
    printed_carbs_g: number | null;
    printed_fat_g: number | null;
  }[];
};

type RecipesOut = { dishes: { index: number; ingredients: Ingredient[]; recipe_confidence: "high" | "medium" | "low" }[] };

/** One dish ready to publish, kept in submissions.review so the team can publish it later. */
export type PreparedDish = {
  name: string;
  description: string | null;
  category: string;
  priceCents: number | null;
  ingredients: Ingredient[];
  nutrition: NutritionResult;
  flags: string[];
};

export type ReviewRecord = {
  mode: ReviewMode;
  reading: { isMenu: boolean; reason: string; nameOnMenu: string | null; cuisine: string | null; legibility: string } | null;
  decision: Decision;
  dishes: PreparedDish[];
  error?: string;
};

export type ReviewMode = "mock" | "anthropic" | "openai" | "none";

type ReviewEnv = Pick<Env, "DB" | "PHOTOS" | "APP_ENV" | "AI_DAILY_BUDGET_USD" | "COMMUNITY_REVIEW_MODE" | "COMMUNITY_DAILY_BUDGET_USD"> & {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
};

/** The model for this environment: mock, a real provider with its key, or none (team queue only). */
export function reviewModel(env: ReviewEnv, fetchImpl?: typeof fetch): ReviewModel | null {
  const mode = (env.COMMUNITY_REVIEW_MODE ?? "mock").trim();
  if (mode === "mock") return new MockModel();
  if (mode === "off") return null;
  if (env.ANTHROPIC_API_KEY?.trim()) return new AnthropicModel(env.ANTHROPIC_API_KEY.trim(), fetchImpl);
  if (env.OPENAI_API_KEY?.trim()) return new OpenAiModel(env.OPENAI_API_KEY.trim(), fetchImpl);
  return null;
}

/** Today's AI spend on community reviews in USD. */
export async function communitySpentTodayUsd(db: D1Database, now = Date.now()): Promise<number> {
  const row = await db
    .prepare("SELECT coalesce(sum(cost_micros), 0) AS micros FROM ai_usage WHERE created_at >= ? AND purpose LIKE 'community_%'")
    .bind(startOfUtcDay(now))
    .first<{ micros: number }>();
  return (row?.micros ?? 0) / 1e6;
}

type SubmissionRow = {
  id: string;
  status: string;
  restaurant_id: string | null;
  restaurant_ref: string | null;
  restaurant_name: string;
  is_new_restaurant: number;
  new_lat: number | null;
  new_lng: number | null;
  new_address: string | null;
  photo_key: string;
  photo_sha256: string;
  photo_type: string;
};

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The app Kiez of a point; the boundaries cover every Berlin Ortsteil, the app lists only the Kieze with restaurants. */
function appKiezAt(point: { lat: number; lng: number }): KiezSlug | null {
  const slug = kiezAt(point);
  return slug && isKiezSlug(slug) ? slug : null;
}

async function restaurantFacts(db: D1Database, sub: SubmissionRow) {
  if (sub.is_new_restaurant) {
    const point = { lat: sub.new_lat!, lng: sub.new_lng! };
    const kiez = appKiezAt(point);
    const { results } = await db
      .prepare("SELECT name, lat, lng FROM restaurants WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?")
      .bind(point.lat - 0.002, point.lat + 0.002, point.lng - 0.003, point.lng + 0.003)
      .all<{ name: string; lat: number; lng: number }>();
    const near = results.find((r) => distanceMeters(point, r) <= 150 && nameSimilarity(r.name, sub.restaurant_name) >= 0.5);
    return { name: sub.restaurant_name, known: false, isNew: true, cuisines: [] as string[], kiez, nearbySameName: near?.name ?? null };
  }
  const row = sub.restaurant_id
    ? await db
        .prepare(
          `SELECT r.name, p.cuisine FROM restaurants r LEFT JOIN pipeline_restaurant p ON p.google_place_id = r.google_place_id AND r.google_place_id IS NOT NULL
            WHERE r.id = ?`,
        )
        .bind(sub.restaurant_id)
        .first<{ name: string; cuisine: string | null }>()
    : null;
  let cuisines: string[] = [];
  try {
    cuisines = row?.cuisine ? (JSON.parse(row.cuisine) as string[]) : [];
  } catch {
    cuisines = [];
  }
  return { name: row?.name ?? sub.restaurant_name, known: row !== null, isNew: false, cuisines, kiez: null, nearbySameName: null };
}

async function history(db: D1Database, sub: SubmissionRow, dishNames: string[]) {
  const same = await db
    .prepare("SELECT 1 FROM submissions WHERE photo_sha256 = ? AND id != ? AND status != 'rejected' LIMIT 1")
    .bind(sub.photo_sha256, sub.id)
    .first();
  let overlapShare = 0;
  if (sub.restaurant_id && dishNames.length > 0) {
    const { results } = await db
      .prepare("SELECT name FROM dishes WHERE restaurant_id = ? AND published_at IS NOT NULL")
      .bind(sub.restaurant_id)
      .all<{ name: string }>();
    const online = new Set(results.map((r) => r.name.trim().toLowerCase()));
    overlapShare = dishNames.filter((n) => online.has(n.trim().toLowerCase())).length / dishNames.length;
  }
  return { samePhoto: same !== null, overlapShare };
}

function toCheckDish(d: PreparedDish) {
  const n = d.nutrition;
  return {
    id: "",
    restaurant_id: "",
    name: d.name,
    description: d.description ?? "",
    section: "",
    category: d.category,
    price_eur: d.priceCents === null ? null : d.priceCents / 100,
    printed: null,
    ingredients: JSON.stringify(d.ingredients),
    recipe_confidence: n.confidence,
    kcal: n.totals.kcal,
    protein_g: n.totals.protein,
    carbs_g: n.totals.carbs,
    fat_g: n.totals.fat,
    kcal_min: n.range.kcal.min,
    kcal_max: n.range.kcal.max,
    protein_min: n.range.protein.min,
    protein_max: n.range.protein.max,
    carbs_min: n.range.carbs.min,
    carbs_max: n.range.carbs.max,
    fat_min: n.range.fat.min,
    fat_max: n.range.fat.max,
    confidence: n.confidence,
    nutrition_source: n.source,
  };
}

const CATEGORIES: ReadonlySet<string> = new Set(DISH_CATEGORIES);

/**
 * Runs the review for a pending submission and stores the outcome. Never throws.
 * deps.photo: the photo bytes the upload just stored; KV is eventually consistent, so a read right after
 * the write could miss it. Without it (team re-runs, tests) the photo is read from the store.
 */
export async function reviewSubmission(
  env: ReviewEnv,
  id: string,
  deps: { fetch?: typeof fetch; now?: () => number; photo?: Uint8Array } = {},
): Promise<void> {
  const now = deps.now ?? Date.now;
  const db = env.DB;
  const sub = await db.prepare("SELECT * FROM submissions WHERE id = ? AND status = 'pending'").bind(id).first<SubmissionRow>();
  if (!sub) return;
  const usage: UsageRecord[] = [];
  const track = (purpose: string, provider: ReviewMode, u: ModelUsage | null) => {
    if (!u || (provider !== "anthropic" && provider !== "openai")) return;
    const record: UsageRecord = {
      purpose,
      provider,
      model: u.model,
      status: u.status,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cacheReadTokens: u.cacheReadTokens,
      restaurantId: sub.restaurant_id,
      submissionId: sub.id,
    };
    usage.push(record);
    // Local ledger line per AI call; D1 ai_usage gets the same record below.
    if (env.APP_ENV === "dev") console.log(`[ledger] ${JSON.stringify({ ...record, usd: (costMicros(record) ?? 0) / 1e6 })}`);
  };

  const model = reviewModel(env, deps.fetch);
  const mode: ReviewMode = model?.provider ?? "none";
  let record: ReviewRecord;
  try {
    const overBudget =
      mode !== "mock" &&
      mode !== "none" &&
      ((await communitySpentTodayUsd(db, now())) >= dailyBudgetUsd(env.COMMUNITY_DAILY_BUDGET_USD) ||
        (await budgetExhausted(db, dailyBudgetUsd(env.AI_DAILY_BUDGET_USD), now())));
    if (!model || overBudget) {
      record = {
        mode: "none",
        reading: null,
        dishes: [],
        decision: { outcome: "review", confidence: "low", reason: null, notes: [overBudget ? "KI-Prüfung pausiert: Tagesbudget erreicht" : "Keine KI-Prüfung konfiguriert"] },
      };
    } else {
      record = await runReview(env, sub, model, track, deps.photo);
    }
  } catch (error) {
    if (error instanceof ModelError) track("community_error", mode, error.usage);
    const message = error instanceof Error ? error.message : "error";
    console.warn("[community] review failed", id, message);
    record = { mode, reading: null, dishes: [], error: message, decision: { outcome: "review", confidence: "low", reason: null, notes: ["KI-Prüfung fehlgeschlagen"] } };
  }

  await recordUsage(db, usage, now());
  const cost = usage.reduce((sum, r) => sum + (costMicros(r) ?? 0), 0);
  await applyOutcome(db, sub, record, "agent", now(), cost);
}

async function runReview(
  env: ReviewEnv,
  sub: SubmissionRow,
  model: ReviewModel,
  track: (purpose: string, provider: ReviewMode, u: ModelUsage | null) => void,
  uploaded?: Uint8Array,
): Promise<ReviewRecord> {
  const facts = await restaurantFacts(env.DB, sub);
  const photo = uploaded ?? (await photoStore(env)?.get(sub.photo_key).then((o) => (o ? new Uint8Array(o.bytes) : null)));
  if (!photo) throw new Error("photo missing");

  const read = await model.json<ReadingOut>({
    purpose: "community_menu",
    system: COMMUNITY_SYSTEM,
    text: `Restaurant: ${facts.name}\nThe guest says this photo shows this restaurant's menu.`,
    image: { mediaType: sub.photo_type, base64: toBase64(photo) },
    schema: READING_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 8000,
  });
  track("community_menu", model.provider, read.usage);
  const r = read.data;
  const extracted = r.dishes.slice(0, MAX_REVIEW_DISHES);
  const reading: MenuReading = {
    isMenu: r.is_menu,
    nameOnMenu: r.restaurant_name_on_menu?.trim() || null,
    cuisine: r.cuisine?.trim() || null,
    faces: r.faces,
    inappropriate: r.inappropriate,
    legibility: r.legibility,
    dishes: extracted.map((d) => ({ name: d.name, priceEur: d.price_eur })),
  };
  const readingSummary = { isMenu: r.is_menu, reason: r.reason, nameOnMenu: reading.nameOnMenu, cuisine: reading.cuisine, legibility: r.legibility };
  const hist = await history(env.DB, sub, extracted.map((d) => d.name));

  // Reject early without paying for the recipe call when the photo cannot be published anyway.
  const early = decide(reading, facts, hist, { flaggedShare: 0 });
  if (early.outcome === "reject") return { mode: model.provider, reading: readingSummary, decision: early, dishes: [] };

  const rows: PipelineDishRow[] = extracted.map((d, i) => ({
    id: String(i),
    restaurant_id: sub.id,
    name: d.name,
    description: d.description,
    section: d.section,
    category: d.category,
    price_eur: d.price_eur,
    printed: null,
  }));
  const recipes = await model.json<RecipesOut>({
    purpose: "community_recipes",
    system: recipeSystem(),
    text: recipePrompt(facts.name, reading.cuisine ?? "", rows),
    schema: recipeSchema(),
    maxTokens: 16000,
  });
  track("community_recipes", model.provider, recipes.usage);

  const byIndex = new Map(recipes.data.dishes.map((d) => [d.index, d]));
  const dishes: PreparedDish[] = [];
  extracted.forEach((d, i) => {
    const recipe = byIndex.get(i);
    if (!recipe || recipe.ingredients.length === 0) return;
    const ingredients = cleanIngredients(recipe.ingredients);
    const printed = d.printed_kcal ? { kcal: d.printed_kcal, protein: d.printed_protein_g, carbs: d.printed_carbs_g, fat: d.printed_fat_g } : null;
    const nutrition = computeNutrition({ ingredients, recipeConfidence: recipe.recipe_confidence, priceEur: d.price_eur, printed });
    const prepared: PreparedDish = {
      name: d.name.trim().slice(0, 120),
      description: (d.description_de || d.description).trim().slice(0, 300) || null,
      category: CATEGORIES.has(d.category) ? d.category : "main",
      priceCents: d.price_eur === null ? null : Math.round(d.price_eur * 100),
      ingredients,
      nutrition,
      flags: [],
    };
    prepared.flags = dishFlags(toCheckDish(prepared), null);
    dishes.push(prepared);
  });
  const flaggedShare = dishes.length ? dishes.filter((d) => d.flags.length > 0).length / dishes.length : 1;
  const decision = decide(reading, facts, hist, { flaggedShare });
  return { mode: model.provider, reading: readingSummary, decision, dishes };
}

const clampRange = (v: number, min: number, max: number) => [Math.min(min, v), Math.max(max, v)] as const;

/** Publishes the prepared dishes (and a new restaurant) or stores the queue/reject outcome. */
export async function applyOutcome(db: D1Database, sub: SubmissionRow, record: ReviewRecord, by: "agent" | "team", now: number, costMicrosAdded = 0): Promise<void> {
  const { decision } = record;
  const stmts: D1PreparedStatement[] = [];
  let restaurantId = sub.restaurant_id;
  let published = 0;

  if (decision.outcome === "publish") {
    if (sub.is_new_restaurant && !restaurantId) {
      restaurantId = crypto.randomUUID();
      const kiez = appKiezAt({ lat: sub.new_lat!, lng: sub.new_lng! }) ?? "mitte";
      stmts.push(
        db
          .prepare(
            `INSERT INTO restaurants (id, google_place_id, name, kiez, lat, lng, address, website_url, opening_hours, published_at, created_at, updated_at, community_submission_id)
             VALUES (?, NULL, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
          )
          .bind(restaurantId, sub.restaurant_name, kiez, sub.new_lat, sub.new_lng, sub.new_address, now, now, now, sub.id),
      );
    }
    if (restaurantId) {
      for (const d of record.dishes) {
        const n = d.nutrition;
        const [kMin, kMax] = clampRange(n.totals.kcal, n.range.kcal.min, n.range.kcal.max);
        const [pMin, pMax] = clampRange(n.totals.protein, n.range.protein.min, n.range.protein.max);
        const [cMin, cMax] = clampRange(n.totals.carbs, n.range.carbs.min, n.range.carbs.max);
        const [fMin, fMax] = clampRange(n.totals.fat, n.range.fat.min, n.range.fat.max);
        stmts.push(
          db
            .prepare(
              `INSERT INTO dishes (id, restaurant_id, menu_source_id, name, description, category, price_cents,
                 kcal, kcal_min, kcal_max, protein_g, protein_g_min, protein_g_max, carbs_g, carbs_g_min, carbs_g_max, fat_g, fat_g_min, fat_g_max,
                 nutrition_source, confidence, method_note, ingredients, estimated_at, health_score, published_at, created_at, updated_at,
                 community_submission_id, community_added_at)
               VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              restaurantId,
              d.name,
              d.description,
              d.category,
              d.priceCents,
              n.totals.kcal,
              kMin,
              kMax,
              n.totals.protein,
              pMin,
              pMax,
              n.totals.carbs,
              cMin,
              cMax,
              n.totals.fat,
              fMin,
              fMax,
              n.source,
              n.confidence,
              `${n.methodNote} Speisekarte aus einem Foto der Community.`,
              JSON.stringify(d.ingredients.map((i) => ({ name: i.food, grams: i.grams, foodId: i.food }))),
              now,
              n.healthScore,
              now,
              now,
              now,
              sub.id,
              now,
            ),
        );
        published++;
      }
    }
  }

  const status = decision.outcome === "publish" ? (published > 0 ? "published" : "review") : decision.outcome === "reject" ? "rejected" : "review";
  const notes = status === "review" && decision.outcome === "publish" ? ["Keine Gerichte zum Veröffentlichen"] : decision.notes;
  stmts.push(
    db
      .prepare(
        `UPDATE submissions SET status = ?, restaurant_id = ?, review_mode = ?, review = ?, confidence = ?, reason = ?, team_note = ?,
           dish_count = ?, cost_micros = cost_micros + ?, decided_by = ?, reviewed_at = coalesce(reviewed_at, ?),
           decided_at = CASE WHEN ? IN ('published', 'rejected') THEN ? ELSE decided_at END
         WHERE id = ?`,
      )
      .bind(
        status,
        restaurantId,
        record.mode,
        JSON.stringify(record),
        decision.confidence,
        decision.reason,
        notes.length ? notes.join("; ") : null,
        published,
        costMicrosAdded,
        status === "review" ? null : by,
        now,
        status,
        now,
        sub.id,
      ),
  );
  await db.batch(stmts);
}
