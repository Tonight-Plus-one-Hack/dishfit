import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { backfillCommunityPhotoExpiry, productionBindings } from "../scripts/backfill-community-photo-expiry";

const NOW = Date.UTC(2026, 10, 22);
const DAY = 86_400_000;
const EXPIRES = Date.UTC(2027, 10, 12) / 1000;
const options = { accountId: "test-account", databaseId: "test-db", namespaceId: "test-kv", apiToken: "test-token" };
const ok = (result: unknown, cursor?: string) => Response.json({ success: true, result, result_info: { cursor } });
const uuid = () => crypto.randomUUID();

async function submission(key: string, createdAt: number) {
  await env.DB.prepare(
    `INSERT INTO submissions (id, restaurant_name, photo_key, photo_sha256, photo_type, photo_bytes, created_at)
     VALUES (?, 'X', ?, ?, 'image/jpeg', 1, ?)`,
  ).bind(uuid(), key, uuid(), createdAt).run();
}

async function scan(key: string) {
  await env.DB.prepare(
    `INSERT INTO scans (id, kind, status, device_id, mode, created_at, photo_key) VALUES (?, 'menu', 'done', 'dev', 'mock', ?, ?)`,
  ).bind(uuid(), NOW, key).run();
}

it.each([false, true])("plans or applies expirations and orphans against seeded D1 (apply=%s)", async (apply) => {
  const current = `photos/guest/${uuid()}`;
  const expired = `photos/guest/${uuid()}`;
  const missing = `photos/guest/${uuid()}`;
  const earlier = `photos/guest/${uuid()}`;
  const privateScan = `photos/guest/${uuid()}`;
  const orphan = `photos/guest/${uuid()}`;
  const ambiguous = "photos/legacy-name";
  await env.DB.exec("DELETE FROM submissions; DELETE FROM scans;");
  await submission(current, NOW - 10 * DAY);
  await submission(expired, NOW - 366 * DAY);
  await submission(earlier, NOW - 10 * DAY);
  await submission(missing, NOW - 10 * DAY);
  await scan(privateScan);
  const calls: string[] = [];
  const summary = await backfillCommunityPhotoExpiry({ ...options, apply, deleteOrphans: apply }, async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    expect(url.origin).toBe("https://api.cloudflare.com");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
    if (url.pathname.endsWith("/keys")) {
      expect(url.searchParams.get("prefix")).toBe("photos/");
      if (!url.searchParams.has("cursor")) {
        return ok([{ name: current, metadata: { contentType: "image/webp" } }, { name: privateScan }, { name: orphan }], "next");
      }
      expect(url.searchParams.get("cursor")).toBe("next");
      return ok([{ name: expired }, { name: earlier, expiration: EXPIRES - 1 }, { name: ambiguous }]);
    }
    if (url.pathname.endsWith("/query")) {
      expect(method).toBe("POST");
      const { sql, params } = JSON.parse(String(init?.body)) as { sql: string; params: unknown[] };
      // The D1 REST contract takes params as strings.
      expect(params.every((p) => typeof p === "string")).toBe(true);
      const result = await env.DB.prepare(sql).bind(...params).all();
      return ok([{ success: true, results: result.results }]);
    }
    const key = decodeURIComponent(url.pathname.split("/").at(-1)!);
    calls.push(`${method} ${key}`);
    if (method === "GET" && key === current) return new Response(new Uint8Array([9, 8, 7]));
    if (method === "PUT" && key === current && init?.body instanceof FormData) {
      expect(url.searchParams.get("expiration")).toBe(String(EXPIRES));
      expect(init.body.get("metadata")).toBe('{"contentType":"image/webp"}');
      return ok({});
    }
    if (method === "DELETE" && (key === expired || key === orphan)) return ok({});
    throw new Error(`Unexpected ${method} ${key}`);
  }, () => NOW);
  expect(summary).toEqual({
    mode: apply ? "apply" : "dry-run", expire: 1, delete: 1, unchanged: 1, missing: 1,
    protectedScan: 1, orphanDelete: 1, ambiguous: [ambiguous], failures: [],
  });
  expect(calls).toEqual(apply ? [`GET ${current}`, `PUT ${current}`, `DELETE ${expired}`, `DELETE ${orphan}`] : []);
});

it("deletes orphans only when asked, and reads the production pair from the Wrangler config", async () => {
  const orphan = `photos/guest/${uuid()}`;
  await env.DB.exec("DELETE FROM submissions; DELETE FROM scans;");
  const deletes: string[] = [];
  const send = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/keys")) return ok([{ name: orphan }]);
    if (url.pathname.endsWith("/query")) {
      const { sql, params } = JSON.parse(String(init?.body)) as { sql: string; params: string[] };
      return ok([{ success: true, results: (await env.DB.prepare(sql).bind(...params).all()).results }]);
    }
    deletes.push(`${init?.method} ${decodeURIComponent(url.pathname.split("/").at(-1)!)}`);
    return ok({});
  };
  const kept = await backfillCommunityPhotoExpiry({ ...options, apply: true }, send, () => NOW);
  expect([kept.orphanDelete, deletes]).toEqual([1, []]);
  await backfillCommunityPhotoExpiry({ ...options, apply: true, deleteOrphans: true }, send, () => NOW);
  expect(deletes).toEqual([`DELETE ${orphan}`]);

  const config = `{
    // comment
    "env": { "production": {
      "d1_databases": [{ "binding": "DB", "database_id": "d1-prod" }],
      "kv_namespaces": [{ "binding": "PHOTOS", "id": "kv-prod" }]
    } }
  }`;
  expect(productionBindings(config)).toEqual({ databaseId: "d1-prod", namespaceId: "kv-prod" });
});
