/**
 * Soft daily guard for KV writes. Workers KV on the Free plan allows 1,000 writes (and 1,000 deletes) per
 * UTC day for the whole account; past that, writes fail until 00:00 UTC. The Worker counts its own writes in
 * D1 (storage_ops) and stops at PHOTO_DAILY_WRITE_LIMIT (default 900), so a guest gets a friendly message
 * instead of an error and some writes stay free for releases and the team. Reads (100,000/day) are not counted.
 */
import { startOfUtcDay } from "./ai-usage";

export const DEFAULT_DAILY_WRITE_LIMIT = 900;

export type StorageBudgetEnv = { DB: D1Database; PHOTO_DAILY_WRITE_LIMIT?: string };

export function dailyWriteLimit(value: string | undefined): number {
  const parsed = value?.trim() ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_WRITE_LIMIT;
}

const utcDay = (now: number) => new Date(startOfUtcDay(now)).toISOString().slice(0, 10);

/** Takes one write of today's budget; false when it is used up. Atomic, so parallel uploads cannot overshoot. */
export async function reserveWrite(env: StorageBudgetEnv, now = Date.now()): Promise<boolean> {
  const limit = dailyWriteLimit(env.PHOTO_DAILY_WRITE_LIMIT);
  if (limit <= 0) return false;
  const row = await env.DB.prepare(
    `INSERT INTO storage_ops (day, op, count) VALUES (?1, 'write', 1)
     ON CONFLICT (day, op) DO UPDATE SET count = count + 1 WHERE count < ?2
     RETURNING count`,
  )
    .bind(utcDay(now), limit)
    .first<{ count: number }>();
  return row !== null;
}

/** Gives back a reserved write that did not happen. */
export async function releaseWrite(env: StorageBudgetEnv, now = Date.now()): Promise<void> {
  await env.DB.prepare("UPDATE storage_ops SET count = count - 1 WHERE day = ? AND op = 'write' AND count > 0").bind(utcDay(now)).run();
}

export async function countDelete(env: StorageBudgetEnv, now = Date.now()): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO storage_ops (day, op, count) VALUES (?, 'delete', 1) ON CONFLICT (day, op) DO UPDATE SET count = count + 1",
  )
    .bind(utcDay(now))
    .run();
}

/** Writes left today under the soft limit. */
export async function writesLeft(env: StorageBudgetEnv, now = Date.now()): Promise<number> {
  const limit = dailyWriteLimit(env.PHOTO_DAILY_WRITE_LIMIT);
  const used = await env.DB.prepare("SELECT count FROM storage_ops WHERE day = ? AND op = 'write'").bind(utcDay(now)).first<number>("count");
  return Math.max(0, limit - (used ?? 0));
}

/** Today's KV operations, for the admin usage view. */
export async function storageUsage(env: StorageBudgetEnv, now = Date.now()): Promise<{ day: string; writes: number; deletes: number; writeLimit: number }> {
  const { results } = await env.DB.prepare("SELECT op, count FROM storage_ops WHERE day = ?").bind(utcDay(now)).all<{ op: string; count: number }>();
  const count = (op: string) => results.find((r) => r.op === op)?.count ?? 0;
  return { day: utcDay(now), writes: count("write"), deletes: count("delete"), writeLimit: dailyWriteLimit(env.PHOTO_DAILY_WRITE_LIMIT) };
}
