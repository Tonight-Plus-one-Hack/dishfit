// Minimal D1-shaped database interface. Two adapters: local SQLite (node:sqlite, the same engine and
// SQL dialect as D1, used for local runs and tests) and Cloudflare D1 over its REST API.

export type SqlValue = string | number | null;
export interface Stmt { sql: string; params?: SqlValue[] }

export interface Db {
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T | null>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  /** Runs statements as one unit (a transaction locally; one D1 batch request remotely). */
  batch(stmts: Stmt[]): Promise<void>;
  /** Runs a multi-statement SQL script (migrations). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export const nowIso = () => new Date().toISOString();
