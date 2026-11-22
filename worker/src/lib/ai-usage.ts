import type { AiUsageResponse, UsageModelTotal } from "@wohin/contract";

/**
 * Cost accounting for every paid call (AI models, image generation, Google
 * Places): one row per attempt in D1 `ai_usage`, with the cost in micro-USD
 * fixed at write time. Token-billed calls are priced from AI_PRICES; per-request
 * SKUs (Places, images) pass their cost directly.
 *
 * Ported from fm/lane2-chat-safety (apps/api/src/safety/ai-usage.ts) and made
 * product-neutral: any purpose, per-request SKUs, cost per Kiez.
 */

export type AiPrice = {
  /** USD per million tokens. */
  input: number;
  output: number;
  cacheRead: number;
  /** 5-minute cache writes. */
  cacheWrite: number;
};

/**
 * List prices (USD per million tokens), as checked on 2026-11-21 for the
 * lane 2 port. Re-check before relying on them for budgets.
 */
export const AI_PRICES: Readonly<Record<string, AiPrice>> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "gpt-6.2-sol": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 0 },
};

export const USAGE_PROVIDERS = ["anthropic", "openai", "google_places", "cloudflare"] as const;
export type UsageProvider = (typeof USAGE_PROVIDERS)[number];

export type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** One billed attempt. Give tokens for token-billed models, or usd (and units) for per-request SKUs. */
export type UsageRecord = Partial<TokenCounts> & {
  purpose: string;
  provider: UsageProvider;
  route?: "ai-gateway" | "direct";
  /** Model id or API SKU. */
  model: string;
  /** HTTP status; 0 when there was no response. */
  status: number;
  units?: number;
  /** Known cost in USD; when absent it is computed from tokens and AI_PRICES. */
  usd?: number;
  kiez?: string | null;
  restaurantId?: string | null;
  /** Community submission this call reviewed (cost per submission). */
  submissionId?: string | null;
};

/** The price for a model id, also for dated snapshots such as claude-sonnet-5-5-20261101 or gpt-6.2-sol-2026-10-14. */
export function priceFor(model: string): AiPrice | null {
  if (Object.hasOwn(AI_PRICES, model)) return AI_PRICES[model]!;
  const base = Object.keys(AI_PRICES)
    .filter((id) => model.startsWith(`${id}-`) && /^(\d{8}|\d{4}-\d{2}-\d{2})$/.test(model.slice(id.length + 1)))
    .toSorted((a, b) => b.length - a.length)[0];
  return base ? AI_PRICES[base]! : null;
}

/** USD cost of token counts at a price, rounded to 1e-9 USD. */
export function costUsd(tokens: TokenCounts, price: AiPrice): number {
  const micro =
    tokens.inputTokens * price.input +
    tokens.outputTokens * price.output +
    tokens.cacheReadTokens * price.cacheRead +
    tokens.cacheWriteTokens * price.cacheWrite;
  return Math.round(micro * 1000) / 1e9;
}

const tokensOf = (r: Partial<TokenCounts>): TokenCounts => ({
  inputTokens: r.inputTokens ?? 0,
  outputTokens: r.outputTokens ?? 0,
  cacheReadTokens: r.cacheReadTokens ?? 0,
  cacheWriteTokens: r.cacheWriteTokens ?? 0,
});

/** Cost of one record in micro-USD; null without a known price. */
export function costMicros(record: UsageRecord): number | null {
  if (record.usd !== undefined) return Number.isFinite(record.usd) && record.usd >= 0 ? Math.round(record.usd * 1e6) : null;
  const price = priceFor(record.model);
  return price ? Math.round(costUsd(tokensOf(record), price) * 1e6) : null;
}

/** Stores billed attempts. Never throws: losing a ledger row must not fail the user's request. */
export async function recordUsage(db: D1Database, records: UsageRecord[], now = Date.now()): Promise<void> {
  if (records.length === 0) return;
  try {
    await db.batch(
      records.map((r) => {
        const t = tokensOf(r);
        return db
          .prepare(
            `INSERT INTO ai_usage (id, created_at, purpose, provider, route, model, status,
               input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, units, cost_micros, kiez, restaurant_id, submission_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            now,
            r.purpose,
            r.provider,
            r.route ?? "direct",
            r.model,
            r.status,
            t.inputTokens,
            t.outputTokens,
            t.cacheReadTokens,
            t.cacheWriteTokens,
            r.units ?? 0,
            costMicros(r),
            r.kiez ?? null,
            r.restaurantId ?? null,
            r.submissionId ?? null,
          );
      }),
    );
    addToBudgetCache(records, now);
  } catch (error) {
    console.warn("[usage] not recorded", error instanceof Error ? error.name : "error");
  }
}

// ---------------------------------------------------------------------------
// Daily budget: over it, callers skip optional paid calls until 00:00 UTC.
// ---------------------------------------------------------------------------

export const DEFAULT_AI_DAILY_BUDGET_USD = 5;
/** How long one isolate trusts its last reading of today's spend. */
export const BUDGET_CACHE_MS = 30_000;

/** AI_DAILY_BUDGET_USD as a number; empty or invalid means the default, 0 turns paid calls off. */
export function dailyBudgetUsd(value: string | undefined): number {
  const trimmed = value?.trim();
  const parsed = trimmed ? Number(trimmed) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_AI_DAILY_BUDGET_USD;
}

export function startOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** The highest listed rate per token kind: unpriced calls count at it, so the budget errs on the safe side. */
const HIGHEST_PRICE: AiPrice = Object.values(AI_PRICES).reduce(
  (max, p) => ({
    input: Math.max(max.input, p.input),
    output: Math.max(max.output, p.output),
    cacheRead: Math.max(max.cacheRead, p.cacheRead),
    cacheWrite: Math.max(max.cacheWrite, p.cacheWrite),
  }),
  { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
);

const roundUsd = (usd: number) => Math.round(usd * 1e6) / 1e6;

type BudgetSums = TokenCounts & { knownMicros: number };

/** Known costs plus unpriced tokens at the highest listed rates. */
export function budgetCostUsd(sums: BudgetSums): number {
  return roundUsd(sums.knownMicros / 1e6 + costUsd(sums, HIGHEST_PRICE));
}

const BUDGET_SQL = `SELECT coalesce(sum(cost_micros), 0) AS known_micros,
    coalesce(sum(CASE WHEN cost_micros IS NULL THEN input_tokens END), 0) AS input_tokens,
    coalesce(sum(CASE WHEN cost_micros IS NULL THEN output_tokens END), 0) AS output_tokens,
    coalesce(sum(CASE WHEN cost_micros IS NULL THEN cache_read_tokens END), 0) AS cache_read_tokens,
    coalesce(sum(CASE WHEN cost_micros IS NULL THEN cache_write_tokens END), 0) AS cache_write_tokens
  FROM ai_usage WHERE created_at >= ?`;

type BudgetRow = { known_micros: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number };

const budgetSums = (row: BudgetRow | null): BudgetSums => ({
  knownMicros: row?.known_micros ?? 0,
  inputTokens: row?.input_tokens ?? 0,
  outputTokens: row?.output_tokens ?? 0,
  cacheReadTokens: row?.cache_read_tokens ?? 0,
  cacheWriteTokens: row?.cache_write_tokens ?? 0,
});

export async function spentSinceUsd(db: D1Database, since: number): Promise<number> {
  return budgetCostUsd(budgetSums(await db.prepare(BUDGET_SQL).bind(since).first<BudgetRow>()));
}

let budgetCache: { day: number; checkedAt: number; spentUsd: number } | null = null;

/** For tests: forget the cached spend. */
export function resetBudgetCache(): void {
  budgetCache = null;
}

/** True when today's spend reached the budget. A database error does not block (fail open). */
export async function budgetExhausted(db: D1Database, budgetUsd: number, now = Date.now()): Promise<boolean> {
  if (budgetUsd <= 0) return true;
  const day = startOfUtcDay(now);
  if (!budgetCache || budgetCache.day !== day || now - budgetCache.checkedAt > BUDGET_CACHE_MS) {
    try {
      budgetCache = { day, checkedAt: now, spentUsd: await spentSinceUsd(db, day) };
    } catch {
      return false;
    }
  }
  return budgetCache.spentUsd >= budgetUsd;
}

function addToBudgetCache(records: UsageRecord[], now: number): void {
  if (budgetCache && budgetCache.day === startOfUtcDay(now)) {
    for (const r of records) {
      const micros = costMicros(r);
      budgetCache.spentUsd += micros === null ? costUsd(tokensOf(r), HIGHEST_PRICE) : micros / 1e6;
    }
  }
}

// ---------------------------------------------------------------------------
// Admin summary
// ---------------------------------------------------------------------------

/** Share of failed attempts in the last hour from which the summary warns. */
export const HEALTH_WARNING_SHARE = 0.2;
const HOUR_MS = 60 * 60 * 1000;

type ModelRow = {
  provider: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  units: number;
  micros: number;
  unpriced: number;
};

export async function usageSummary(db: D1Database, budgetUsd: number, now = Date.now()): Promise<AiUsageResponse> {
  const day = startOfUtcDay(now);
  const [models, kieze, today, health] = await db.batch<Record<string, unknown>>([
    db.prepare(
      `SELECT provider, model, count(*) AS calls, sum(input_tokens) AS input_tokens, sum(output_tokens) AS output_tokens,
              sum(units) AS units, coalesce(sum(cost_micros), 0) AS micros, sum(cost_micros IS NULL) AS unpriced
         FROM ai_usage GROUP BY provider, model`,
    ),
    db.prepare("SELECT kiez, count(*) AS calls, coalesce(sum(cost_micros), 0) AS micros FROM ai_usage GROUP BY kiez ORDER BY micros DESC"),
    db.prepare(BUDGET_SQL).bind(day),
    db
      .prepare(`SELECT count(*) AS calls, coalesce(sum(CASE WHEN status < 200 OR status >= 300 THEN 1 ELSE 0 END), 0) AS failed FROM ai_usage WHERE created_at >= ?`)
      .bind(now - HOUR_MS),
  ]);
  const byModel: UsageModelTotal[] = (models!.results as unknown as ModelRow[])
    .map((r) => ({
      provider: r.provider,
      model: r.model,
      calls: r.calls,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      units: r.units,
      usd: roundUsd(r.micros / 1e6),
      priced: r.unpriced === 0,
    }))
    .toSorted((a, b) => b.usd - a.usd || a.model.localeCompare(b.model));
  const todayUsd = budgetCostUsd(budgetSums((today!.results[0] as BudgetRow | undefined) ?? null));
  const h = (health!.results[0] ?? { calls: 0, failed: 0 }) as { calls: number; failed: number };
  const failedShare = h.calls > 0 ? Math.round((h.failed / h.calls) * 1000) / 1000 : 0;
  return {
    generatedAt: new Date(now).toISOString(),
    totalUsd: roundUsd(byModel.reduce((sum, m) => sum + m.usd, 0)),
    calls: byModel.reduce((sum, m) => sum + m.calls, 0),
    byModel,
    byKiez: (kieze!.results as unknown as Array<{ kiez: string | null; calls: number; micros: number }>).map((r) => ({
      kiez: r.kiez,
      calls: r.calls,
      usd: roundUsd(r.micros / 1e6),
    })),
    today: { since: new Date(day).toISOString(), usd: todayUsd, budgetUsd, exhausted: budgetUsd <= 0 || todayUsd >= budgetUsd },
    lastHour: { calls: h.calls, failed: h.failed, failedShare, warning: h.calls > 0 && failedShare >= HEALTH_WARNING_SHARE },
  };
}
