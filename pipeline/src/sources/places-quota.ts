// Google Places free-tier guard. Paid Places SKUs have a monthly free cap (pricing.ts PLACES_SKUS);
// this guard counts the calls already logged this month and today (the JSONL cost ledger) and stops
// paid calls at a share of the monthly free cap (default 80 %) or at a daily call budget, whichever
// comes first, so a scan never leaves the free tier by accident.
import { existsSync, readFileSync } from 'node:fs';
import { PLACES_SKUS, type PlacesSku } from '../pricing.ts';
import { BudgetExceededError } from '../util/limiter.ts';

export const PLACES_QUOTA_DEFAULTS = {
  /** Stop at this share of each SKU's monthly free calls. */
  monthlyStopShare: 0.8,
  /** Paid calls per SKU and UTC day. */
  dailyCalls: 400,
};

export class PlacesQuotaError extends BudgetExceededError {
  constructor(message: string) {
    super(0, 0);
    this.message = message;
  }
}

type Counts = Partial<Record<PlacesSku, number>>;

export class PlacesQuota {
  private readonly month: Counts;
  private readonly day: Counts;
  readonly monthlyStopShare: number;
  readonly dailyCalls: number;

  constructor(used: { month: Counts; day: Counts }, opts: Partial<typeof PLACES_QUOTA_DEFAULTS> = {}) {
    this.month = { ...used.month };
    this.day = { ...used.day };
    this.monthlyStopShare = opts.monthlyStopShare ?? PLACES_QUOTA_DEFAULTS.monthlyStopShare;
    this.dailyCalls = opts.dailyCalls ?? PLACES_QUOTA_DEFAULTS.dailyCalls;
  }

  /** Counts paid Places calls in a JSONL ledger for the current UTC month and day. */
  static fromLedger(path: string | null, opts: Partial<typeof PLACES_QUOTA_DEFAULTS> = {}, now = new Date()): PlacesQuota {
    const month: Counts = {};
    const day: Counts = {};
    if (path && existsSync(path)) {
      const monthKey = now.toISOString().slice(0, 7);
      const dayKey = now.toISOString().slice(0, 10);
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.includes('google-places')) continue;
        let e: { provider?: string; model?: string; ts?: number };
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        if (e.provider !== 'google-places' || !e.model || !(e.model in PLACES_SKUS) || typeof e.ts !== 'number') continue;
        const iso = new Date(e.ts * 1000).toISOString();
        const sku = e.model as PlacesSku;
        if (iso.startsWith(monthKey)) month[sku] = (month[sku] ?? 0) + 1;
        if (iso.startsWith(dayKey)) day[sku] = (day[sku] ?? 0) + 1;
      }
    }
    return new PlacesQuota({ month, day }, opts);
  }

  /** Paid calls of a SKU still allowed this month and today. */
  remaining(sku: PlacesSku): number {
    const free = PLACES_SKUS[sku].freePerMonth;
    if (!Number.isFinite(free)) return Infinity;
    const monthLeft = Math.floor(free * this.monthlyStopShare) - (this.month[sku] ?? 0);
    const dayLeft = this.dailyCalls - (this.day[sku] ?? 0);
    return Math.max(0, Math.min(monthLeft, dayLeft));
  }

  /** Takes one paid call; throws (stopping the run cleanly) once the monthly stop or the daily budget is reached. */
  take(sku: PlacesSku): void {
    const free = PLACES_SKUS[sku].freePerMonth;
    if (!Number.isFinite(free)) return;
    const stopAt = Math.floor(free * this.monthlyStopShare);
    if ((this.month[sku] ?? 0) >= stopAt) {
      throw new PlacesQuotaError(`Places quota: ${sku} reached ${this.month[sku]} calls this month, the stop at ${Math.round(this.monthlyStopShare * 100)} % of the ${free} free calls; stopping paid Places calls`);
    }
    if ((this.day[sku] ?? 0) >= this.dailyCalls) {
      throw new PlacesQuotaError(`Places quota: ${sku} reached the daily budget of ${this.dailyCalls} calls; stopping paid Places calls (resume tomorrow)`);
    }
    this.month[sku] = (this.month[sku] ?? 0) + 1;
    this.day[sku] = (this.day[sku] ?? 0) + 1;
  }

  summary(): string {
    return (Object.keys(PLACES_SKUS) as PlacesSku[])
      .filter((s) => Number.isFinite(PLACES_SKUS[s].freePerMonth))
      .map((s) => `${s} ${this.month[s] ?? 0}/${PLACES_SKUS[s].freePerMonth} this month (stop ${Math.floor(PLACES_SKUS[s].freePerMonth * this.monthlyStopShare)}), ${this.day[s] ?? 0}/${this.dailyCalls} today`)
      .join('; ');
  }
}
