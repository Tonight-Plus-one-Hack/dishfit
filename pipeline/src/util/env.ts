// Loads secrets from env files into process.env without ever printing them.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Parses KEY=VALUE lines (optional `export `, quotes, comments). Existing env vars win. */
export function loadEnvFile(path: string, keys?: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  if (!existsSync(path)) return [];
  const loaded: string[] = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    if (keys && !keys.includes(key)) continue;
    let value = m[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (env[key] === undefined || env[key] === '') {
      env[key] = value;
      loaded.push(key);
    }
  }
  return loaded;
}

/** Teammates with their own Google Places key in pipeline/.env.team (`--member`). */
export const TEAM_MEMBERS = ['kalvarez', 'malek'] as const;

/**
 * Pipeline keys; the first non-empty value wins: real environment, pipeline/.env.local, the optional
 * env dir (anthropic-event.env, openai-event.env, google-places.env), then the committed team file
 * pipeline/.env.team (temporary hackathon keys). A member is only validated; Google Places is
 * off, so no Google key is mapped.
 */
export function loadPipelineKeys(root: string, opts: { member?: string; envDir?: string } = {}, env: NodeJS.ProcessEnv = process.env): void {
  loadEnvFile(join(root, '.env.local'), undefined, env);
  if (opts.envDir) {
    for (const f of ['anthropic-event.env', 'openai-event.env', 'google-places.env']) loadEnvFile(join(opts.envDir, f), ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_PLACES_API_KEY'], env);
  }
  loadEnvFile(join(root, '.env.team'), undefined, env);
  if (opts.member === undefined) return;
  const member = opts.member.trim().toLowerCase();
  if (!(TEAM_MEMBERS as readonly string[]).includes(member)) throw new Error(`--member must be one of ${TEAM_MEMBERS.join(', ')}, got ${opts.member}`);
}

export function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set (set it in the environment or in the private env file; never commit it)`);
  return v;
}
