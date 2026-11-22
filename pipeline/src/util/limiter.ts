// Concurrency cap + request-rate limit per provider, shared by all Kieze running in one process.

export class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  private nextSlot = 0;
  readonly name: string;
  private readonly concurrency: number;
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  /** minIntervalMs: minimum milliseconds between request starts (0 = no rate limit). */
  constructor(
    name: string,
    concurrency: number,
    minIntervalMs = 0,
    now: () => number = Date.now,
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.name = name;
    this.concurrency = concurrency;
    this.minIntervalMs = minIntervalMs;
    this.now = now;
    this.sleep = sleep;
    if (concurrency < 1) throw new Error(`${name}: concurrency must be >= 1`);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      if (this.minIntervalMs > 0) {
        const t = this.now();
        const wait = Math.max(0, this.nextSlot - t);
        this.nextSlot = Math.max(t, this.nextSlot) + this.minIntervalMs;
        if (wait > 0) await this.sleep(wait);
      }
      return await fn();
    } finally {
      this.release();
    }
  }

  get inFlight(): number {
    return this.active;
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(() => { this.active++; resolve(); }));
  }

  private release(): void {
    this.active--;
    this.queue.shift()?.();
  }
}

/** Runs fn over items with at most `concurrency` in flight; collects per-item errors instead of failing fast. */
export async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<{ ok: R[]; errors: { item: T; error: unknown }[] }> {
  const ok: R[] = [];
  const errors: { item: T; error: unknown }[] = [];
  let next = 0;
  let budgetError: BudgetExceededError | undefined;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!budgetError && next < items.length) {
      const i = next++;
      try {
        ok.push(await fn(items[i]!, i));
      } catch (error) {
        if (error instanceof BudgetExceededError) budgetError ??= error;
        else errors.push({ item: items[i]!, error });
      }
    }
  });
  await Promise.all(workers);
  if (budgetError) throw budgetError;
  return { ok, errors };
}

export class BudgetExceededError extends Error {
  constructor(spent: number, budget: number) {
    super(`budget reached: ${spent.toFixed(4)} of ${budget.toFixed(2)} USD spent; stopping paid calls (rerun with a higher --budget to continue)`);
  }
}

/** Retries on transient failures (429, 5xx, network) with exponential backoff and jitter. */
export async function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; baseMs?: number; isRetryable?: (e: unknown) => boolean } = {}): Promise<T> {
  const retries = opts.retries ?? 4;
  const base = opts.baseMs ?? 500;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const retry = (opts.isRetryable ?? isTransient)(e);
      if (!retry || attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, base * 2 ** attempt * (0.75 + Math.random() * 0.5)));
    }
  }
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isTransient(e: unknown): boolean {
  if (e instanceof HttpError) return e.status === 429 || e.status >= 500;
  if (e instanceof TypeError) return true; // fetch network errors
  return false;
}
