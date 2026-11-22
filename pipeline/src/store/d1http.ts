// Cloudflare D1 over the REST API, for running the pipeline against a remote D1 database.
// It never creates databases: account id, database id and an API token with D1 edit rights must be
// given (CLOUDFLARE_ACCOUNT_ID, PIPELINE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN).
import type { Db, SqlValue, Stmt } from './db.ts';

interface D1Result<T> { results: T[]; success: boolean; meta?: { changes?: number } }
interface D1Response<T> { success: boolean; errors: { message: string }[]; result: D1Result<T>[] }

export class D1HttpDb implements Db {
  private readonly url: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(accountId: string, databaseId: string, token: string, fetchImpl: typeof fetch = fetch) {
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  }

  private async query<T>(body: unknown): Promise<D1Result<T>[]> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as D1Response<T>;
    if (!res.ok || !json.success) throw new Error(`D1 query failed (${res.status}): ${json.errors?.map((e) => e.message).join('; ')}`);
    return json.result;
  }

  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const [r] = await this.query<T>({ sql, params });
    return r?.results ?? [];
  }

  async first<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    return (await this.all<T>(sql, params))[0] ?? null;
  }

  async run(sql: string, params: SqlValue[] = []): Promise<{ changes: number }> {
    const [r] = await this.query({ sql, params });
    return { changes: r?.meta?.changes ?? 0 };
  }

  async batch(stmts: Stmt[]): Promise<void> {
    if (!stmts.length) return;
    // D1 runs a batch as one implicit transaction.
    await this.query({ batch: stmts.map((s) => ({ sql: s.sql, params: s.params ?? [] })) });
  }

  async exec(sql: string): Promise<void> {
    await this.query({ sql });
  }

  async close(): Promise<void> {}
}
