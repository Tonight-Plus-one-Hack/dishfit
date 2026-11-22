import { env, exports } from "cloudflare:workers";

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}-${crypto.randomUUID().slice(0, 8)}`;

/** Always open: one period from Sunday 00:00 without a close. */
export const ALWAYS_OPEN = { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] };
/** Never open in practice: one minute on Sunday at 03:00. */
export const RARELY_OPEN = { periods: [{ open: { day: 0, hour: 3, minute: 0 }, close: { day: 0, hour: 3, minute: 1 } }] };

export type SeedRestaurant = {
  id?: string;
  placeId?: string;
  name?: string;
  kiez?: string;
  lat?: number | null;
  lng?: number | null;
  openingHours?: object | null;
  published?: boolean;
};

export async function seedRestaurant(r: SeedRestaurant = {}): Promise<{ id: string; placeId: string }> {
  const id = r.id ?? nextId("r");
  const placeId = r.placeId ?? nextId("place");
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO restaurants (id, google_place_id, name, kiez, lat, lng, opening_hours, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      placeId,
      r.name ?? "Test restaurant",
      r.kiez ?? "mitte",
      r.lat === undefined ? 52.52 : r.lat,
      r.lng === undefined ? 13.405 : r.lng,
      r.openingHours === undefined ? JSON.stringify(ALWAYS_OPEN) : r.openingHours === null ? null : JSON.stringify(r.openingHours),
      r.published === false ? null : now,
      now,
      now,
    )
    .run();
  return { id, placeId };
}

export type SeedDish = {
  restaurantId: string;
  name?: string;
  priceCents?: number | null;
  kcal?: number;
  proteinG?: number;
  healthScore?: number | null;
  published?: boolean;
  aiImageKey?: string | null;
  withSource?: boolean;
};

export async function seedDish(d: SeedDish): Promise<string> {
  const id = nextId("d");
  const now = Date.now();
  let sourceId: string | null = null;
  if (d.withSource) {
    sourceId = nextId("m");
    await env.DB.prepare("INSERT INTO menu_sources (id, restaurant_id, kind, url, fetched_at, created_at) VALUES (?, ?, 'website_pdf', ?, ?, ?)")
      .bind(sourceId, d.restaurantId, "https://example.com/menu.pdf", Date.UTC(2026, 10, 21), now)
      .run();
  }
  const kcal = d.kcal ?? 600;
  const protein = d.proteinG ?? 30;
  await env.DB.prepare(
    `INSERT INTO dishes (id, restaurant_id, menu_source_id, name, price_cents,
       kcal, kcal_min, kcal_max, protein_g, protein_g_min, protein_g_max, carbs_g, carbs_g_min, carbs_g_max, fat_g, fat_g_min, fat_g_max,
       nutrition_source, confidence, method_note, estimated_at, health_score, ai_image_key, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 60, 50, 70, 20, 15, 25, 'ai', 'medium', 'Ingredients and grams estimated by AI, macros computed from USDA data.', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      d.restaurantId,
      sourceId,
      d.name ?? "Test bowl",
      d.priceCents === undefined ? 1190 : d.priceCents,
      kcal,
      kcal * 0.85,
      kcal * 1.15,
      protein,
      protein * 0.8,
      protein * 1.2,
      now,
      d.healthScore === undefined ? 70 : d.healthScore,
      d.aiImageKey ?? null,
      d.published === false ? null : now,
      now,
      now,
    )
    .run();
  return id;
}

export async function resetData(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM profile_badges"),
    env.DB.prepare("DELETE FROM dish_confirmations"),
    env.DB.prepare("DELETE FROM profiles"),
    env.DB.prepare("DELETE FROM submissions"),
    env.DB.prepare("DELETE FROM dishes"),
    env.DB.prepare("DELETE FROM menu_sources"),
    env.DB.prepare("DELETE FROM restaurants"),
    env.DB.prepare("DELETE FROM events"),
    env.DB.prepare("DELETE FROM numbers_excluded"),
    env.DB.prepare("DELETE FROM ai_usage"),
    env.DB.prepare("DELETE FROM storage_ops"),
  ]);
}

const ips = new Map<string, string>();
/** A stable client IP (CF-Connecting-IP) per name, so tests do not share rate limit buckets. */
export function ipOf(name: string): string {
  let ip = ips.get(name);
  if (!ip) {
    const n = ips.size + 1;
    ips.set(name, (ip = `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`));
  }
  return ip;
}

/** Calls the Worker like a browser would. */
export async function api(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; ip?: string } = {},
): Promise<{ status: number; headers: Headers; body: any }> {
  const headers: Record<string, string> = { "cf-connecting-ip": init.ip ?? ipOf("default"), ...init.headers };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const res = await exports.default.fetch(
    new Request(`https://app.test${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: "manual",
    }),
  );
  const type = res.headers.get("content-type") ?? "";
  if (type && !/^text\/|json/.test(type)) {
    return { status: res.status, headers: res.headers, body: new Uint8Array(await res.arrayBuffer()) };
  }
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  return { status: res.status, headers: res.headers, body };
}
