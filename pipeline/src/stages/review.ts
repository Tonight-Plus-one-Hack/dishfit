// Stage 6 - Freigabe: a per-Kiez review sample as CSV for the assigned teammate (verdict passt/falsch),
// imported back to approve the Kiez. A Kiez passes when >= 80 % of its sampled dishes are "passt";
// then every restaurant in it without a "falsch" mark is approved.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Ctx } from '../context.ts';
import type { KiezDef } from '../kiez.ts';
import { nowIso, type Stmt } from '../store/db.ts';

export const PASS_RATE = 0.8;

const COLUMNS = ['review_id', 'kiez', 'reviewer', 'restaurant', 'website', 'menu_source', 'dish', 'description', 'price_eur', 'kcal', 'kcal_range', 'protein_g', 'protein_range', 'carbs_g', 'fat_g', 'confidence', 'source', 'ingredients', 'image', 'check_note', 'verdict', 'note'] as const;

export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

const rank = (id: string) => createHash('sha1').update(id).digest('hex');

export async function exportReview(ctx: Ctx, kiez: KiezDef, outDir: string): Promise<{ file: string; rows: number } | null> {
  const candidates = await ctx.db.all<{ id: string; name: string; website: string | null; check_verdict: string | null; check_note: string | null }>(
    `SELECT id, name, website, check_verdict, check_note FROM pipeline_restaurant r WHERE kiez = ? AND status = 'image' AND skip_reason IS NULL
       AND NOT EXISTS (SELECT 1 FROM pipeline_review v WHERE v.restaurant_id = r.id)`, [kiez.slug]);
  if (!candidates.length) return null;
  candidates.sort((a, b) => Number(b.check_verdict === 'needs_review') - Number(a.check_verdict === 'needs_review') || rank(a.id).localeCompare(rank(b.id)));
  const sample = candidates.slice(0, ctx.opts.reviewRestaurants);
  const lines: string[] = [COLUMNS.join(',')];
  const inserts: Stmt[] = [];
  const now = nowIso();
  for (const r of sample) {
    const src = await ctx.db.first<{ url: string | null }>('SELECT url FROM pipeline_menu_source WHERE restaurant_id = ?', [r.id]);
    const dishes = await ctx.db.all<{ id: string; name: string; description: string; price_eur: number | null; kcal: number; kcal_min: number; kcal_max: number; protein_g: number; protein_min: number; protein_max: number; carbs_g: number; fat_g: number; confidence: string; nutrition_source: string; ingredients: string; image_ref: string | null }>(
      'SELECT * FROM pipeline_dish WHERE restaurant_id = ? AND hidden = 0 AND kcal IS NOT NULL ORDER BY health_score DESC, position LIMIT ?', [r.id, ctx.opts.reviewDishes]);
    for (const d of dishes) {
      const id = `rv_${createHash('sha1').update(`${d.id}|${now}`).digest('hex').slice(0, 12)}`;
      const ings = (JSON.parse(d.ingredients ?? '[]') as { food: string; grams: number }[]).map((i) => `${i.food} ${i.grams} g`).join('; ');
      lines.push([id, kiez.slug, kiez.reviewer, r.name, r.website ?? '', src?.url ?? '', d.name, d.description, d.price_eur ?? '', d.kcal, `${d.kcal_min}-${d.kcal_max}`, d.protein_g, `${d.protein_min}-${d.protein_max}`, d.carbs_g, d.fat_g, d.confidence, d.nutrition_source, ings, d.image_ref ? `KI-Bild ${d.image_ref}` : '', r.check_note ?? '', '', ''].map(csvEscape).join(','));
      inserts.push({ sql: 'INSERT INTO pipeline_review (id, kiez, reviewer, restaurant_id, dish_id, exported_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, kiez.slug, kiez.reviewer, r.id, d.id, now] });
    }
  }
  await ctx.db.batch(inserts);
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `review-${kiez.slug}-${kiez.reviewer}.csv`);
  writeFileSync(file, lines.join('\n') + '\n');
  return { file, rows: inserts.length };
}

export interface ImportResult { updated: number; kieze: { kiez: string; decided: number; total: number; passRate: number | null; approved: number; failedRestaurants: number; status: 'approved' | 'failed' | 'incomplete' }[] }

export async function importReview(ctx: Ctx, csvPath: string): Promise<ImportResult> {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  const col = (name: string) => header.indexOf(name);
  if (col('review_id') < 0 || col('verdict') < 0) throw new Error('CSV needs review_id and verdict columns');
  const now = nowIso();
  const stmts: Stmt[] = [];
  const kieze = new Set<string>();
  for (const r of rows) {
    const id = r[col('review_id')]?.trim();
    const raw = (r[col('verdict')] ?? '').trim().toLowerCase();
    const verdict = ['passt', 'ok', 'correct', 'ja', 'yes', 'richtig'].includes(raw) ? 'passt' : ['falsch', 'wrong', 'nein', 'no'].includes(raw) ? 'falsch' : null;
    if (!id || !verdict) continue;
    stmts.push({ sql: 'UPDATE pipeline_review SET verdict = ?, note = ?, imported_at = ? WHERE id = ?', params: [verdict, (r[col('note')] ?? '').trim() || null, now, id] });
    if (col('kiez') >= 0 && r[col('kiez')]) kieze.add(r[col('kiez')]!.trim());
  }
  await ctx.db.batch(stmts);
  const result: ImportResult = { updated: stmts.length, kieze: [] };
  for (const kiez of kieze) result.kieze.push(await applyKiezReview(ctx, kiez));
  return result;
}

export async function applyKiezReview(ctx: Ctx, kiez: string): Promise<ImportResult['kieze'][number]> {
  const rows = await ctx.db.all<{ restaurant_id: string; dish_id: string; verdict: string | null }>('SELECT restaurant_id, dish_id, verdict FROM pipeline_review WHERE kiez = ?', [kiez]);
  const decided = rows.filter((r) => r.verdict);
  const base = { kiez, decided: decided.length, total: rows.length, approved: 0, failedRestaurants: 0 };
  if (!rows.length || decided.length < rows.length) return { ...base, passRate: null, status: 'incomplete' };
  const passRate = decided.filter((r) => r.verdict === 'passt').length / decided.length;
  const stmts: Stmt[] = [];
  const now = nowIso();
  for (const r of decided) stmts.push({ sql: `UPDATE pipeline_dish SET review_status = ?, hidden = CASE WHEN ? = 'wrong' THEN 1 ELSE hidden END, updated_at = ? WHERE id = ?`, params: [r.verdict === 'passt' ? 'correct' : 'wrong', r.verdict === 'passt' ? 'correct' : 'wrong', now, r.dish_id] });
  const failed = [...new Set(decided.filter((r) => r.verdict === 'falsch').map((r) => r.restaurant_id))];
  for (const id of failed) stmts.push({ sql: "UPDATE pipeline_restaurant SET skip_reason = 'review_failed', updated_at = ? WHERE id = ? AND status = 'image'", params: [now, id] });
  await ctx.db.batch(stmts);
  let approved = 0;
  if (passRate >= PASS_RATE) {
    const res = await ctx.db.run("UPDATE pipeline_restaurant SET status = 'approved', updated_at = ? WHERE kiez = ? AND status = 'image' AND skip_reason IS NULL", [now, kiez]);
    approved = res.changes;
  }
  return { ...base, passRate: Math.round(passRate * 100) / 100, approved, failedRestaurants: failed.length, status: passRate >= PASS_RATE ? 'approved' : 'failed' };
}
