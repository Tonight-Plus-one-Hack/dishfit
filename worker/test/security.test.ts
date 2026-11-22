import { createExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { newDeviceCookieHeader } from "../src/lib/device";
import { ipOf } from "./fixtures";

const loadQueue = () => exports.default.fetch(new Request("https://app.test/api/admin/queue"));

describe("Worker transport and headers", () => {
  it.each(["/", "/d/a-dish", "/api/health", "/assets/app.js"])("redirects cleartext %s before dispatching", async (path) => {
    const response = await worker.fetch(new Request(`http://app.test${path}?lang=de`), { ...env, APP_ENV: "production" }, createExecutionContext());
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`https://app.test${path}?lang=de`);
    expect(response.headers.has("strict-transport-security")).toBe(false);
  });

  it.each([["POST", "/api/scans"], ["PATCH", "/api/me"], ["DELETE", "/api/scans/id"]])(
    "rejects insecure %s %s without sending it to the insecure route",
    async (method, path) => {
      const response = await worker.fetch(new Request(`http://app.test${path}`, { method }), { ...env, APP_ENV: "production" }, createExecutionContext());
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: { code: "forbidden", message: "HTTPS is required." } });
      expect(response.headers.has("location")).toBe(false);
    },
  );

  it("sets the production headers on static HTML and leaves camera and geolocation available to the app", async () => {
    const assets = { fetch: async () => new Response("<!DOCTYPE html><title>DishFit</title>", {
      headers: { "content-type": "text/html; charset=utf-8", etag: '"asset-version"' },
    }) } as unknown as Fetcher;
    const response = await worker.fetch(new Request("https://app.test/map"), { ...env, ASSETS: assets }, createExecutionContext());
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>DishFit</title>");
    expect(response.headers.get("etag")).toBe('"asset-version"');
    expect(response.headers.get("strict-transport-security")).toBe("max-age=15552000");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toContain("camera=(self), geolocation=(self), microphone=()");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("content-security-policy-report-only")).toContain("https://tiles.openfreemap.org");
  });

  it("adds HSTS and preserves error handling on HTTPS API responses", async () => {
    const response = await exports.default.fetch(new Request("https://app.test/api/unknown"));
    expect(response.status).toBe(404);
    expect(response.headers.get("strict-transport-security")).toBe("max-age=15552000");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("requires Secure on signed and legacy production cookies and allows local HTTP development", async () => {
    const local = new URL("http://localhost");
    const signed = await newDeviceCookieHeader({ APP_ENV: "production", DEVICE_COOKIE_SECRET: "test-secret" }, "sample-device", local);
    expect(signed).toMatch(/^wohin_device=sample-device\.[\w-]{43};.*; Secure$/);
    const legacy = await newDeviceCookieHeader({ APP_ENV: "production" }, "sample-device", local);
    expect(legacy).toMatch(/^wohin_device=sample-device;.*; Secure$/);
    expect(await newDeviceCookieHeader({ APP_ENV: "dev" }, "sample-device", local)).not.toContain("Secure");
    expect((await exports.default.fetch(new Request("http://localhost/api/health"))).status).toBe(200);
  });

  it("serves the queue with a per-response script nonce and keeps the moderation API protected", async () => {
    const first = await loadQueue();
    const nonce = /script-src 'nonce-([^']+)'/.exec(first.headers.get("content-security-policy") ?? "")?.[1];
    expect(nonce).toMatch(/^[\w+/]{22}==$/);
    expect(await first.text()).toContain(`<script type="module" nonce="${nonce}">`);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect((await loadQueue()).headers.get("content-security-policy")).not.toContain(nonce);
    const privateQueue = await exports.default.fetch(new Request("https://app.test/api/admin/submissions"));
    expect(privateQueue.status).toBe(403);
  });
});

describe("upload body limit", () => {
  it.each([
    ["/api/scans", null],
    ["/api/submissions", "10"],
  ])("caps streamed multipart bytes on %s with Content-Length %s", async (path, declared) => {
    const size = 5 * 1024 * 1024 + 64 * 1024;
    const chunk = new Uint8Array(64 * 1024);
    let supplied = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (supplied >= size + 3 * chunk.length) return controller.close();
        supplied += chunk.length;
        controller.enqueue(chunk);
      },
    });
    const headers = new Headers({
      "content-type": "multipart/form-data; boundary=test",
      "cf-connecting-ip": ipOf(`stream-cap-${path}`),
    });
    if (declared !== null) headers.set("content-length", declared);
    const response = await exports.default.fetch(new Request(`https://app.test${path}`, { method: "POST", body, headers }));
    expect(response.status).toBe(413);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("payload_too_large");
    expect(supplied).toBeLessThan(size + 3 * chunk.length);
  });
});
