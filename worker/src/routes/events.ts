import { ANON_ID_PATTERN, EVENT_NAMES, MAX_EVENT_PROPS_BYTES, MAX_EVENTS_PER_REQUEST, type EventsResponse } from "@wohin/contract";
import { badRequest, json, readJson, type RouteContext } from "../lib/http";

const NAMES: ReadonlySet<string> = new Set(EVENT_NAMES);
const MAX_BODY_BYTES = 32 * 1024;
const DAY_MS = 86_400_000;
const encoder = new TextEncoder();

type Row = { name: string; anonId: string | null; clientAt: number | null; props: string };

/** One event from the client, or null when it does not follow the contract. */
export function validEvent(input: unknown): Row | null {
  if (typeof input !== "object" || input === null) return null;
  const e = input as Record<string, unknown>;
  if (typeof e.name !== "string" || !NAMES.has(e.name)) return null;
  if (e.anonId !== undefined && (typeof e.anonId !== "string" || !ANON_ID_PATTERN.test(e.anonId))) return null;
  let clientAt: number | null = null;
  if (e.at !== undefined) {
    clientAt = typeof e.at === "string" ? Date.parse(e.at) : Number.NaN;
    if (!Number.isFinite(clientAt)) return null;
  }
  const props = e.props ?? {};
  if (typeof props !== "object" || props === null || Array.isArray(props)) return null;
  const flat = Object.values(props).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v));
  const text = JSON.stringify(props);
  if (!flat || encoder.encode(text).length > MAX_EVENT_PROPS_BYTES) return null;
  return { name: e.name, anonId: (e.anonId as string | undefined) ?? null, clientAt, props: text };
}

/** POST /api/events: product analytics. Invalid events are dropped; the count of valid ones comes back, whatever deduplication or exclusion stored. */
export async function postEvents({ env, request }: RouteContext): Promise<Response> {
  const body = await readJson(request, MAX_BODY_BYTES);
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTS_PER_REQUEST) {
    return badRequest(`Send {"events": [...]} with 1 to ${MAX_EVENTS_PER_REQUEST} events`);
  }
  const rows = events.map(validEvent).filter((row): row is Row => row !== null);
  if (rows.length === 0) return badRequest("No valid events");
  const now = Date.now();
  const configured = (env as { NUMBERS_SINCE?: string }).NUMBERS_SINCE;
  const since = configured ? Date.parse(configured) : 0;
  const dayStart = now - now % DAY_MS;
  const cutoff = since > dayStart && since < dayStart + DAY_MS ? since : null;
  const windowStart = cutoff !== null && now >= cutoff ? cutoff : dayStart;
  const windowEnd = cutoff !== null && now < cutoff ? cutoff : dayStart + DAY_MS;
  // Check and insert in one statement so concurrent tabs and retries cannot create extra rows.
  const insert = env.DB.prepare(`
    INSERT INTO events (id, name, anon_id, client_at, props, created_at)
    SELECT ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM numbers_excluded WHERE anon_id = ?)
      AND NOT EXISTS (
        SELECT 1 FROM events
        WHERE name = ? AND anon_id = ? AND created_at >= ? AND created_at < ?
      )
  `);
  await env.DB.batch(
    rows.map((r) =>
      insert.bind(crypto.randomUUID(), r.name, r.anonId, r.clientAt, r.props, now, r.anonId, r.name, r.anonId, windowStart, windowEnd),
    ),
  );
  return json({ accepted: rows.length } satisfies EventsResponse, 202);
}
