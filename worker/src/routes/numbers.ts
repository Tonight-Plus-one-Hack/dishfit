import { ANON_ID_PATTERN, type NumbersResponse } from "@wohin/contract";
import { isAdmin } from "../lib/admin";
import { apiError, badRequest, json, readJson, type RouteContext } from "../lib/http";

type Counts = Pick<NumbersResponse, "engaged" | "decided" | "shared" | "visitors">;

const CACHE_MS = 30_000;
let cached: { at: number; body: NumbersResponse } | undefined;

export function resetNumbersCache(): void {
  cached = undefined;
}

export async function getNumbers({ env }: RouteContext): Promise<Response> {
  if (cached && Date.now() - cached.at < CACHE_MS) return json(cached.body);
  const generatedAt = new Date();
  const configured = (env as { NUMBERS_SINCE?: string }).NUMBERS_SINCE;
  const counts = await env.DB.prepare(`
    WITH bounds AS (
      SELECT COALESCE(?, (SELECT MIN(created_at) FROM events), ?) AS since
    )
    SELECT
      (SELECT since FROM bounds) AS since,
      COUNT(DISTINCT CASE WHEN name IN ('dish_view', 'restaurant_view', 'filter_change') THEN anon_id END) AS engaged,
      COUNT(DISTINCT CASE WHEN name IN ('directions_tap', 'menu_tap') THEN anon_id END) AS decided,
      COUNT(DISTINCT CASE WHEN name = 'share_tap' THEN anon_id END) AS shared,
      COUNT(DISTINCT CASE WHEN name = 'app_open' THEN anon_id END) AS visitors
    FROM events
    WHERE name IN ('dish_view', 'restaurant_view', 'filter_change', 'directions_tap', 'menu_tap', 'share_tap', 'app_open')
      AND created_at BETWEEN (SELECT since FROM bounds) AND ?
      AND anon_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM numbers_excluded WHERE numbers_excluded.anon_id = events.anon_id)
  `).bind(configured ? Date.parse(configured) : null, generatedAt.getTime(), generatedAt.getTime())
    .first<Counts & { since: number }>();
  const { since, ...rest } = counts!;
  const body: NumbersResponse = {
    ...rest,
    since: new Date(since).toISOString(),
    generatedAt: generatedAt.toISOString(),
  };
  cached = { at: generatedAt.getTime(), body };
  return json(body);
}

export async function excludeDevice({ env, request }: RouteContext): Promise<Response> {
  if (!await isAdmin(request, env)) return apiError("forbidden", "Admin token required", 403);
  const { anonId } = (await readJson(request, 1024) ?? {}) as { anonId?: unknown };
  if (typeof anonId !== "string" || !ANON_ID_PATTERN.test(anonId)) return badRequest("Invalid anonymous device ID");
  await env.DB.prepare(`
    INSERT INTO numbers_excluded (anon_id, created_at) VALUES (?, ?)
    ON CONFLICT(anon_id) DO NOTHING
  `).bind(anonId, Date.now()).run();
  return json({ ok: true });
}
