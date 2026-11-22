// Cost ledger: every paid call appends {"provider","model","usd",...} to the JSONL ledger and to the
// pipeline_cost table, and the budget guard stops paid calls once a run reaches its budget.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Db } from './store/db.ts';
import { BudgetExceededError } from './util/limiter.ts';

export type Stage = 'find' | 'menu' | 'classify' | 'nutrition' | 'check' | 'image' | 'review';

export interface CostEntry {
  stage: Stage;
  provider: 'anthropic' | 'openai' | 'google-places';
  model: string;
  usd: number;
  kiez?: string | null;
  restaurantId?: string | null;
  estimated?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  purpose?: string;
}

export class CostLedger {
  private spent = 0;
  private reserved = 0;
  readonly byStage = new Map<string, number>();

  private readonly db: Db;
  readonly runId: string;
  private readonly ledgerPath: string | null;
  readonly budgetUsd: number | null;
  private readonly task: string;

  constructor(db: Db, runId: string, ledgerPath: string | null, budgetUsd: number | null, task = 'pipeline') {
    this.db = db;
    this.runId = runId;
    this.ledgerPath = ledgerPath;
    this.budgetUsd = budgetUsd;
    this.task = task;
    if (ledgerPath) mkdirSync(dirname(ledgerPath), { recursive: true });
  }

  get spentUsd(): number {
    return this.spent;
  }

  /** Reserves an estimate before a paid call; throws when the run budget would be exceeded. */
  reserve(estimateUsd: number): { release: () => void } {
    if (this.budgetUsd != null && this.spent + this.reserved + estimateUsd > this.budgetUsd) {
      throw new BudgetExceededError(this.spent, this.budgetUsd);
    }
    this.reserved += estimateUsd;
    let released = false;
    return { release: () => { if (!released) { released = true; this.reserved -= estimateUsd; } } };
  }

  async record(e: CostEntry): Promise<void> {
    this.spent += e.usd;
    this.byStage.set(e.stage, (this.byStage.get(e.stage) ?? 0) + e.usd);
    if (this.ledgerPath) {
      const line = {
        provider: e.provider, model: e.model, usd: e.usd, task: this.task, stage: e.stage, kiez: e.kiez ?? null,
        purpose: e.purpose ?? null, input_tokens: e.inputTokens ?? null, output_tokens: e.outputTokens ?? null,
        estimated: e.estimated ?? false, run: this.runId, ts: Math.floor(Date.now() / 1000),
      };
      appendFileSync(this.ledgerPath, JSON.stringify(line) + '\n');
    }
    await this.db.run(
      `INSERT INTO pipeline_cost (run_id, stage, kiez, restaurant_id, provider, model, usd, estimated, input_tokens, output_tokens, purpose)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [this.runId, e.stage, e.kiez ?? null, e.restaurantId ?? null, e.provider, e.model, e.usd, e.estimated ? 1 : 0, e.inputTokens ?? null, e.outputTokens ?? null, e.purpose ?? null],
    );
  }
}

export async function costSummary(db: Db, where = '1=1', params: (string | number)[] = []) {
  return db.all<{ stage: string; kiez: string | null; provider: string; calls: number; usd: number }>(
    `SELECT stage, kiez, provider, COUNT(*) AS calls, ROUND(SUM(usd), 4) AS usd FROM pipeline_cost WHERE ${where}
     GROUP BY stage, kiez, provider ORDER BY stage, kiez, provider`, params);
}
