// Applies the pipeline's D1 migrations (worker/migrations/0010-0029) and records them in the same
// d1_migrations table wrangler uses, so a database prepared here is consistent with `wrangler d1
// migrations apply` (wrangler then applies only the migrations it has not seen).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.ts';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../worker/migrations/', import.meta.url));
const OWNED = /^00(1\d|2\d)_.*\.sql$/; // 0010-0029

export function pipelineMigrations(dir = MIGRATIONS_DIR): { name: string; sql: string }[] {
  return readdirSync(dir).filter((f) => OWNED.test(f)).toSorted().map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
}

export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );`);
  const done = new Set((await db.all<{ name: string }>('SELECT name FROM d1_migrations')).map((r) => r.name));
  const applied: string[] = [];
  for (const m of pipelineMigrations(dir)) {
    if (done.has(m.name)) continue;
    await db.exec(m.sql);
    await db.run('INSERT INTO d1_migrations (name) VALUES (?)', [m.name]);
    applied.push(m.name);
  }
  return applied;
}
