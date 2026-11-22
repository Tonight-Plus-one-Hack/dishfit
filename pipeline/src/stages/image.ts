// Stage 5 - Bilder: AI dish images ("KI-Bild") for each restaurant's top dishes. No restaurant,
// website, Instagram or Places photos are copied; real photos appear only live via the Places UI Kit.
import { createHash } from 'node:crypto';
import type { Ctx } from '../context.ts';
import type { KiezDef } from '../kiez.ts';
import { nowIso } from '../store/db.ts';
import { mapPool } from '../util/limiter.ts';

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function imageKey(name: string, description: string): string {
  const slug = norm(name).slice(0, 48) || 'dish';
  const h = createHash('sha1').update(`${norm(name)}|${norm(description).slice(0, 80)}`).digest('hex').slice(0, 8);
  return `${slug}-${h}`;
}

export function imagePrompt(name: string, description: string): string {
  return `Appetizing, realistic overhead food photograph of one restaurant portion of "${name}"${description ? ` (${description})` : ''}. ` +
    'Served on a plain off-white ceramic plate or bowl, centered, on a soft pale periwinkle backdrop with a gentle hazy glow (brand tint #8391f7 to #9c90fe), ' +
    'soft diffused daylight, minimal contemporary styling, generous negative space, square composition. ' +
    'No text, no logos, no hands, no people, no cutlery clutter. Do not imitate any real restaurant photograph.';
}

export interface ImageStats { kiez: string; restaurants: number; generated: number; reused: number; errors: number }

export async function stageImage(ctx: Ctx, kiez: KiezDef): Promise<ImageStats> {
  const queue = await ctx.db.all<{ id: string; name: string }>(
    "SELECT id, name FROM pipeline_restaurant WHERE kiez = ? AND status = 'checked' AND skip_reason IS NULL ORDER BY id", [kiez.slug]);
  const stats: ImageStats = { kiez: kiez.slug, restaurants: 0, generated: 0, reused: 0, errors: 0 };
  const inFlight = new Map<string, Promise<string>>();
  const { errors } = await mapPool(queue, ctx.opts.restaurantConcurrency, async (r) => {
    const top = await ctx.db.all<{ id: string; name: string; description: string }>(
      `SELECT id, name, description FROM pipeline_dish WHERE restaurant_id = ? AND hidden = 0 AND kcal IS NOT NULL
         AND category NOT IN ('side', 'dessert', 'snack')
       ORDER BY category = 'starter', health_score DESC, protein_g DESC, position LIMIT ?`,
      [r.id, ctx.opts.aiImagesPerRestaurant]);
    for (const d of top) {
      const key = imageKey(d.name, d.description);
      let ref = (await ctx.db.first<{ ref: string }>('SELECT ref FROM pipeline_image WHERE key = ?', [key]))?.ref;
      if (ref) stats.reused++;
      else {
        let p = inFlight.get(key);
        if (!p) {
          const prompt = imagePrompt(d.name, d.description);
          p = ctx.images.generate({ key, prompt, kiez: kiez.slug, restaurantId: r.id }).then(async (res) => {
            await ctx.db.run('INSERT OR IGNORE INTO pipeline_image (key, ref, model, prompt) VALUES (?, ?, ?, ?)', [key, res.ref, res.model, prompt]);
            stats.generated++;
            return res.ref;
          });
          inFlight.set(key, p);
        } else stats.reused++;
        ref = await p;
      }
      await ctx.db.run("UPDATE pipeline_dish SET image_kind = 'ai', image_ref = ?, updated_at = ? WHERE id = ?", [ref, nowIso(), d.id]);
    }
    await ctx.db.run("UPDATE pipeline_restaurant SET status = 'image', updated_at = ? WHERE id = ?", [nowIso(), r.id]);
    stats.restaurants++;
  });
  for (const e of errors) {
    stats.errors++;
    ctx.log(`[${kiez.slug}] image error ${e.item.name}: ${String(e.error).slice(0, 200)}`);
  }
  ctx.log(`[${kiez.slug}] image: ${stats.restaurants} restaurants, ${stats.generated} generated, ${stats.reused} reused, errors ${stats.errors}`);
  return stats;
}
