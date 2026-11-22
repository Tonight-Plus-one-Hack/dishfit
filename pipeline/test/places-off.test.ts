import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { migrate } from '../src/store/migrate.ts';
import { SqliteDb } from '../src/store/sqlite.ts';

const cli = new URL('../src/cli.ts', import.meta.url);

test('the live CLI keeps Places off even with GOOGLE_PLACES=on and an existing key', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'places-off-'));
  const filename = join(dataDir, 'pipeline.sqlite');
  const fetchLog = join(dataDir, 'fetch.log');
  const mockFetch = `import { appendFileSync } from 'node:fs';
    globalThis.fetch = async (url) => {
      appendFileSync(${JSON.stringify(fetchLog)}, String(url) + '\\n');
      throw new Error('Unexpected fetch');
    };`;
  const run = (...args: string[]) => spawnSync(process.execPath, [
    '--import', `data:text/javascript,${encodeURIComponent(mockFetch)}`, cli.pathname, ...args, '--data-dir', dataDir,
  ], { encoding: 'utf8', env: { ...process.env, GOOGLE_PLACES: 'on', GOOGLE_PLACES_API_KEY: 'test-places-key' } });

  const db = new SqliteDb(filename);
  t.after(async () => {
    await db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  await migrate(db);
  await db.run(`INSERT INTO pipeline_restaurant (id, kiez, osm_id, name, lat, lng, amenity, osm_fetched_at, google_place_id, status)
                VALUES ('osm:test', 'mitte', 'test', 'Test Cafe', 52.52, 13.4, 'cafe', '2026-11-22', 'matched-id', 'found')`);

  const result = run('run', '--kiez', 'mitte', '--stages', 'find,menu', '--fake-llm', '--force');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /skipping find/);
  assert.match(result.stderr, /menu: 0\/0 menus/);
  assert.equal((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM pipeline_tile'))?.n, 0);
  const row = await db.first<Record<string, unknown>>('SELECT status, skip_reason, attempts FROM pipeline_restaurant WHERE id = ?', ['osm:test']);
  assert.deepEqual({ ...row }, {
    status: 'found', skip_reason: null, attempts: 0,
  });

  for (const args of [
    ['run', '--probe-only'], ['scan', '--kiez', 'mitte'], ['photo-coverage', '--backfill'],
    ['export-kiez', '--require-google-photo'],
  ]) {
    const blocked = run(...args);
    assert.equal(blocked.status, 2, blocked.stderr);
    assert.match(blocked.stderr, /Google Places is off/);
  }
  assert.equal(existsSync(fetchLog), false);
});
