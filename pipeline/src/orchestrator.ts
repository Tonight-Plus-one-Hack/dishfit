// "Kiez-Chef": runs stages 1-5 for one Kiez in order; a wave runs its Kieze in parallel, sharing
// provider limiters and the run budget. Every stage is idempotent and resumable from the D1 queue.
import type { Ctx } from './context.ts';
import { type KiezDef } from './kiez.ts';
import { stageCheck } from './stages/check.ts';
import { stageClassify } from './stages/classify.ts';
import { stageFind } from './stages/find.ts';
import { stageFindHealthy } from './stages/find-healthy.ts';
import { stageImage } from './stages/image.ts';
import { stageMenu } from './stages/menu.ts';
import { stageNutrition } from './stages/nutrition.ts';
import { stageTranslate } from './stages/translate.ts';
import { BudgetExceededError } from './util/limiter.ts';

export const STAGE_NAMES = ['find', 'menu', 'translate', 'nutrition', 'classify', 'check', 'image'] as const;
export type StageName = (typeof STAGE_NAMES)[number];

export interface KiezRunResult { kiez: string; stages: Partial<Record<StageName, unknown>>; stoppedBy?: string }

export async function runKiez(ctx: Ctx, kiez: KiezDef, stages: readonly StageName[] = STAGE_NAMES): Promise<KiezRunResult> {
  const result: KiezRunResult = { kiez: kiez.slug, stages: {} };
  try {
    for (const s of STAGE_NAMES) {
      if (!stages.includes(s)) continue;
      if (s === 'find') {
        const options = { probeOnly: ctx.opts.placesProbeOnly };
        result.stages.find = ctx.opts.healthySearch ? await stageFindHealthy(ctx, kiez, options) : await stageFind(ctx, kiez, options);
        if (ctx.opts.placesProbeOnly) break;
      }
      if (s === 'menu') result.stages.menu = await stageMenu(ctx, kiez);
      if (s === 'translate') result.stages.translate = await stageTranslate(ctx, kiez);
      if (s === 'nutrition') result.stages.nutrition = await stageNutrition(ctx, kiez);
      if (s === 'classify') result.stages.classify = await stageClassify(ctx, kiez);
      if (s === 'check') result.stages.check = await stageCheck(ctx, kiez);
      if (s === 'image') result.stages.image = await stageImage(ctx, kiez);
    }
  } catch (e) {
    if (!(e instanceof BudgetExceededError)) throw e;
    result.stoppedBy = e.message;
    ctx.log(`[${kiez.slug}] stopped: ${e.message}`);
  }
  return result;
}

export async function runWave(ctx: Ctx, kieze: KiezDef[], stages: readonly StageName[] = STAGE_NAMES, opts: { serial?: boolean } = {}): Promise<KiezRunResult[]> {
  const run = async (kiez: KiezDef): Promise<KiezRunResult> => {
    try {
      return await runKiez(ctx, kiez, stages);
    } catch (error) {
      return { kiez: kiez.slug, stages: {}, stoppedBy: `error: ${String(error).slice(0, 300)}` };
    }
  };
  if (!opts.serial) return Promise.all(kieze.map(run));
  const results: KiezRunResult[] = [];
  for (const kiez of kieze) results.push(await run(kiez));
  return results;
}

export async function kiezCounts(ctx: Ctx, kiez?: string) {
  return ctx.db.all<{ kiez: string; status: string; skip_reason: string | null; n: number }>(
    `SELECT kiez, status, skip_reason, COUNT(*) AS n FROM pipeline_restaurant ${kiez ? 'WHERE kiez = ?' : ''} GROUP BY kiez, status, skip_reason ORDER BY kiez, status, skip_reason`,
    kiez ? [kiez] : []);
}
