import type { AiUsageResponse } from "@wohin/contract";
import { isAdmin } from "../lib/admin";
import { dailyBudgetUsd, usageSummary } from "../lib/ai-usage";
import { apiError, json, type RouteContext } from "../lib/http";
import { storageUsage } from "../lib/storage-budget";

/** GET /api/admin/ai-usage: running cost of every paid call, per model and per Kiez (admin token). */
export async function getAiUsage({ request, env }: RouteContext): Promise<Response> {
  if (!(await isAdmin(request, env))) return apiError("forbidden", "Admin token required.", 403);
  return json((await usageSummary(env.DB, dailyBudgetUsd(env.AI_DAILY_BUDGET_USD))) satisfies AiUsageResponse);
}

/** GET /api/admin/storage-usage: today's KV writes and deletes against the soft daily limit (admin token). */
export async function getStorageUsage({ request, env }: RouteContext): Promise<Response> {
  if (!(await isAdmin(request, env))) return apiError("forbidden", "Admin token required.", 403);
  return json(await storageUsage(env));
}
