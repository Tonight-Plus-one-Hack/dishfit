import { readFile } from "node:fs/promises";
import { pathToFileURL, URL } from "node:url";
import { COMMUNITY_PHOTO_TTL_SECONDS } from "../src/lib/community-photo-retention.ts";

type Result<T> = { success: boolean; result: T; result_info?: { cursor?: string } };
type Submission = { key: string; createdAt: number };
type Key = { name: string; expiration?: number; metadata?: unknown };
type Options = {
  accountId: string;
  databaseId: string;
  namespaceId: string;
  apiToken: string;
  apply: boolean;
  deleteOrphans?: boolean;
};

export function productionBindings(wranglerConfig: string): { databaseId: string; namespaceId: string } {
  const production = JSON.parse(wranglerConfig.replace(/^\s*\/\/.*$/gm, "")).env?.production;
  const databaseId = production?.d1_databases?.find((d: { binding: string }) => d.binding === "DB")?.database_id;
  const namespaceId = production?.kv_namespaces?.find((k: { binding: string }) => k.binding === "PHOTOS")?.id;
  if (typeof databaseId !== "string" || typeof namespaceId !== "string") throw new Error("The production DB and PHOTOS bindings are not configured.");
  return { databaseId, namespaceId };
}

const PAGE_SIZE = 500;
const COMMUNITY_PHOTO_KEY = /^photos\/[A-Za-z0-9-]{1,64}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Keep a small margin above KV's 60-second minimum for a remote request.
const MIN_EXPIRY_LEAD_SECONDS = 65;

async function apiResult<T>(response: Response): Promise<Result<T>> {
  if (!response.ok) throw new Error(`Cloudflare API returned HTTP ${response.status}`);
  const body = await response.json() as Result<T>;
  if (!body.success) throw new Error("Cloudflare API reported a failed operation");
  return body;
}

export async function backfillCommunityPhotoExpiry(
  { accountId, databaseId, namespaceId, apiToken, apply, deleteOrphans = false }: Options,
  send = fetch,
  now = Date.now,
) {
  const account = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  const kv = `${account}/storage/kv/namespaces/${namespaceId}`;
  const d1 = `${account}/d1/database/${databaseId}/query`;
  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${apiToken}`);
    return send(url, { ...init, headers, redirect: "error", signal: AbortSignal.timeout(30_000) });
  }
  // Snapshot only this namespace's guest-photo keys. D1 identifies community
  // photos among them, since private scan photos use the same prefix.
  const keys = new Map<string, Key>();
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ prefix: "photos/", limit: String(PAGE_SIZE) });
    if (cursor) params.set("cursor", cursor);
    const page = await apiResult<Key[]>(await request(`${kv}/keys?${params}`));
    for (const key of page.result) keys.set(key.name, key);
    cursor = page.result_info?.cursor;
  } while (cursor);

  async function query<T>(sql: string, after: string): Promise<T[]> {
    const page = await apiResult<{ success: boolean; results: T[] }[]>(await request(d1, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql, params: [after] }),
    }));
    const rows = page.result[0];
    if (!rows?.success) throw new Error("Cloudflare D1 query failed");
    return rows.results;
  }
  // Private scan photos share the photos/ prefix. Every scan write carries a 30-day TTL, so a scan
  // reference is never a candidate here, whatever its KV state.
  const scanKeys = new Set<string>();
  for (let after = "", rows: { key: string }[]; ; after = rows.at(-1)!.key) {
    rows = await query<{ key: string }>(
      `SELECT photo_key AS key FROM scans WHERE photo_key IS NOT NULL AND photo_key > ? ORDER BY photo_key LIMIT ${PAGE_SIZE}`,
      after,
    );
    for (const { key } of rows) scanKeys.add(key);
    if (rows.length < PAGE_SIZE) break;
  }

  const summary = { mode: apply ? "apply" : "dry-run", expire: 0, delete: 0, unchanged: 0, missing: 0, protectedScan: 0, orphanDelete: 0, ambiguous: [] as string[] };
  const failures: { key: string; error: string }[] = [];
  const submissionKeys = new Set<string>();
  let after = "";
  for (;;) {
    const results = await query<Submission>(
      `SELECT photo_key AS key, MIN(created_at) AS createdAt FROM submissions WHERE photo_key > ? GROUP BY photo_key ORDER BY photo_key LIMIT ${PAGE_SIZE}`,
      after,
    );
    for (const { key, createdAt } of results) {
      submissionKeys.add(key);
      if (scanKeys.has(key)) {
        summary.protectedScan++;
        continue;
      }
      const existing = keys.get(key);
      if (!existing) {
        summary.missing++;
        continue;
      }
      const expiration = Math.floor(createdAt / 1000) + COMMUNITY_PHOTO_TTL_SECONDS;
      if (existing.expiration !== undefined && existing.expiration <= expiration) {
        summary.unchanged++;
        continue;
      }
      const valueUrl = `${kv}/values/${encodeURIComponent(key)}`;
      try {
        const remove = expiration <= Math.floor(now() / 1000) + MIN_EXPIRY_LEAD_SECONDS;
        if (apply && remove) {
          await apiResult(await request(valueUrl, { method: "DELETE" }));
        } else if (apply) {
          const value = await request(valueUrl);
          if (value.status === 404) {
            summary.missing++;
            continue;
          }
          if (!value.ok) throw new Error(`Reading KV value returned HTTP ${value.status}`);
          const body = new FormData();
          body.set("value", await value.blob());
          if (existing.metadata != null) body.set("metadata", JSON.stringify(existing.metadata));
          await apiResult(await request(`${valueUrl}?expiration=${expiration}`, { method: "PUT", body }));
        }
        summary[remove ? "delete" : "expire"]++;
      } catch (error) {
        failures.push({ key, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (results.length < PAGE_SIZE) break;
    after = results.at(-1)!.key;
  }

  // A community upload wrote KV before its D1 row, with no expiry. A non-expiring key that no
  // submission or scan references is a failed upload whose timestamp is unknown, and nobody can read it.
  for (const [key, existing] of keys) {
    if (existing.expiration !== undefined || submissionKeys.has(key)) continue;
    if (scanKeys.has(key)) {
      summary.protectedScan++;
      continue;
    }
    if (!COMMUNITY_PHOTO_KEY.test(key)) {
      summary.ambiguous.push(key);
      continue;
    }
    try {
      if (apply && deleteOrphans) await apiResult(await request(`${kv}/values/${encodeURIComponent(key)}`, { method: "DELETE" }));
      summary.orphanDelete++;
    } catch (error) {
      failures.push({ key, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ...summary, failures };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: node worker/scripts/backfill-community-photo-expiry.ts [--apply [--delete-orphans]]");
    console.log("Set CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, PHOTOS_KV_NAMESPACE_ID and CLOUDFLARE_API_TOKEN.");
    console.log("Default mode reads D1 and KV and prints counts. --apply writes expirations and deletes expired photos.");
    console.log("--delete-orphans (with --apply) also deletes unreferenced community orphans; use it only once the expiry-enabled Worker is deployed and pre-rollout uploads have drained.");
    console.log("Operator-run, separate from deployment. Private scan keys are never changed; ambiguous keys are listed, not deleted.");
    return;
  }
  const apply = args.includes("--apply");
  const deleteOrphans = args.includes("--delete-orphans");
  if (args.some((a) => a !== "--apply" && a !== "--delete-orphans") || (deleteOrphans && !apply)) throw new Error("Use --help for usage.");
  const { CLOUDFLARE_ACCOUNT_ID: accountId, D1_DATABASE_ID: databaseId, PHOTOS_KV_NAMESPACE_ID: namespaceId, CLOUDFLARE_API_TOKEN: apiToken } = process.env;
  if (!accountId || !/^[0-9a-f]{32}$/i.test(accountId) ||
      !databaseId || !/^[0-9a-f-]{36}$/i.test(databaseId) ||
      !namespaceId || !/^[0-9a-f]{32}$/i.test(namespaceId) || !apiToken) {
    throw new Error("Set the Cloudflare account ID, D1 database ID, KV namespace ID and API token. Use --help for details.");
  }
  const configured = productionBindings(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  if (databaseId !== configured.databaseId || namespaceId !== configured.namespaceId) {
    throw new Error("D1_DATABASE_ID and PHOTOS_KV_NAMESPACE_ID must be the production pair from worker/wrangler.jsonc.");
  }
  const summary = await backfillCommunityPhotoExpiry({ accountId, databaseId, namespaceId, apiToken, apply, deleteOrphans });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failures.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
